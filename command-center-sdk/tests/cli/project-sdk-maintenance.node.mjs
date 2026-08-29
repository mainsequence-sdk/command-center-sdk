import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMMAND_CENTER_SDK_PACKAGE,
  createProjectSdkMaintenanceLocalOps,
  inspectProjectSdk,
  ProjectSdkMaintenanceError,
  updateProjectSdk,
} from "../../cli/project-sdk-maintenance.mjs";

const projectRoot = "/project";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");

function createHarness({ localStates, registryStates }) {
  const updates = [];
  let localIndex = 0;
  let registryIndex = 0;
  return {
    updates,
    localOps: {
      async resolveProjectRoot() {
        return projectRoot;
      },
      async readLocalState() {
        const state = localStates[Math.min(localIndex, localStates.length - 1)];
        localIndex += 1;
        return state;
      },
      readRegistryState() {
        const state = registryStates[Math.min(registryIndex, registryStates.length - 1)];
        registryIndex += 1;
        return state;
      },
      updateSdk(value, options) {
        updates.push({ value, options });
      },
    },
  };
}

function dependencyState({
  declared = "^0.1.11",
  locked = "0.1.11",
  installed = "0.1.11",
  section = "dependencies",
} = {}) {
  return {
    declaration: declared === null ? null : { section, value: declared },
    locked,
    installed,
  };
}

test("SDK status separates declared, locked, installed, wanted, and latest versions", async () => {
  const harness = createHarness({
    localStates: [dependencyState()],
    registryStates: [{ current: "0.1.11", wanted: "0.1.12", latest: "0.1.12" }],
  });

  const result = await inspectProjectSdk({ projectDir: projectRoot, localOps: harness.localOps });

  assert.deepEqual(
    {
      declared: result.declared,
      locked: result.locked,
      installed: result.installed,
      wanted: result.wanted,
      latest: result.latest,
      status: result.status,
      updateAvailable: result.updateAvailable,
      updateSupported: result.updateSupported,
    },
    {
      declared: "^0.1.11",
      locked: "0.1.11",
      installed: "0.1.11",
      wanted: "0.1.12",
      latest: "0.1.12",
      status: "update_available",
      updateAvailable: true,
      updateSupported: true,
    },
  );
});

test("SDK status distinguishes a newer registry release blocked by the declared range", async () => {
  const harness = createHarness({
    localStates: [dependencyState({ declared: "0.1.11" })],
    registryStates: [{ current: "0.1.11", wanted: "0.1.11", latest: "0.2.0" }],
  });

  const result = await inspectProjectSdk({ projectDir: projectRoot, localOps: harness.localOps });

  assert.equal(result.status, "constraint_blocked");
  assert.equal(result.updateAvailable, false);
  assert.match(result.hint, /does not allow the registry latest version/u);
});

test("SDK status distinguishes missing, drifted, and unsupported project states", async () => {
  const cases = [
    [dependencyState({ locked: null }), "lock_missing", true],
    [dependencyState({ installed: null }), "install_required", true],
    [dependencyState({ installed: "0.1.10" }), "installed_drift", true],
    [dependencyState({ declared: null, locked: null, installed: null }), "not_declared", false],
    [dependencyState({ section: "peerDependencies" }), "unsupported_dependency_type", false],
    [dependencyState({ declared: "file:../command-center-sdk" }), "unsupported_source", false],
  ];

  for (const [localState, status, updateSupported] of cases) {
    const harness = createHarness({
      localStates: [localState],
      registryStates: [{ current: null, wanted: null, latest: "0.1.12" }],
    });
    const result = await inspectProjectSdk({
      projectDir: projectRoot,
      localOps: harness.localOps,
    });
    assert.equal(result.status, status);
    assert.equal(result.updateSupported, updateSupported);
  }
});

test("update SDK dry-run reports the exact npm command without mutation", async () => {
  const harness = createHarness({
    localStates: [dependencyState()],
    registryStates: [{ current: "0.1.11", wanted: "0.1.12", latest: "0.1.12" }],
  });

  const result = await updateProjectSdk({
    projectDir: projectRoot,
    dryRun: true,
    localOps: harness.localOps,
  });

  assert.equal(result.updated, false);
  assert.equal(result.after, null);
  assert.deepEqual(result.commands, [
    "npm update @dev-mainsequence/command-center-sdk --save",
  ]);
  assert.deepEqual(harness.updates, []);
});

test("update SDK targets only the SDK and verifies the resulting state", async () => {
  const harness = createHarness({
    localStates: [
      dependencyState(),
      dependencyState({ declared: "^0.1.12", locked: "0.1.12", installed: "0.1.12" }),
    ],
    registryStates: [
      { current: "0.1.11", wanted: "0.1.12", latest: "0.1.12" },
      { current: null, wanted: null, latest: "0.1.12" },
    ],
  });

  const result = await updateProjectSdk({
    projectDir: projectRoot,
    quiet: true,
    localOps: harness.localOps,
  });

  assert.equal(result.updated, true);
  assert.equal(result.after.status, "current");
  assert.deepEqual(harness.updates, [{ value: projectRoot, options: { quiet: true } }]);
});

test("update SDK leaves a constraint-blocked project unchanged", async () => {
  const harness = createHarness({
    localStates: [dependencyState({ declared: "0.1.11" })],
    registryStates: [{ current: "0.1.11", wanted: "0.1.11", latest: "0.2.0" }],
  });

  const result = await updateProjectSdk({
    projectDir: projectRoot,
    localOps: harness.localOps,
  });

  assert.equal(result.updated, false);
  assert.equal(result.after.status, "constraint_blocked");
  assert.deepEqual(result.commands, []);
  assert.deepEqual(harness.updates, []);
});

test("update SDK refuses linked and workspace dependency sources", async () => {
  for (const declared of ["file:../command-center-sdk", "workspace:*"]) {
    const harness = createHarness({
      localStates: [dependencyState({ declared })],
      registryStates: [{ current: null, wanted: null, latest: "0.1.12" }],
    });
    await assert.rejects(
      updateProjectSdk({ projectDir: projectRoot, localOps: harness.localOps }),
      (error) => {
        assert.equal(error instanceof ProjectSdkMaintenanceError, true);
        assert.equal(error.stage, "update-sdk-preflight");
        assert.match(error.message, /are not replaced/u);
        return true;
      },
    );
  }
});

test("local SDK inspection reads npm project state and registry status", async () => {
  const root = await mkdtemp(join(tmpdir(), "command-center-sdk-status-"));
  try {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: { [COMMAND_CENTER_SDK_PACKAGE]: "^0.1.11" },
      }),
      "utf8",
    );
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          ["node_modules/" + COMMAND_CENTER_SDK_PACKAGE]: { version: "0.1.11" },
        },
      }),
      "utf8",
    );
    const installedRoot = join(
      root,
      "node_modules",
      "@dev-mainsequence",
      "command-center-sdk",
    );
    await mkdir(installedRoot, { recursive: true });
    await writeFile(
      join(installedRoot, "package.json"),
      JSON.stringify({ name: COMMAND_CENTER_SDK_PACKAGE, version: "0.1.11" }),
      "utf8",
    );
    const initialized = spawnSync("git", ["init", "-b", "main"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, initialized.stderr);

    const localOps = createProjectSdkMaintenanceLocalOps({
      spawnSyncImpl(command, args, options) {
        if (command === "git") return spawnSync(command, args, options);
        if (args[0] === "view") {
          return { status: 0, stdout: JSON.stringify("0.1.12"), stderr: "" };
        }
        assert.deepEqual(args, [
          "outdated",
          COMMAND_CENTER_SDK_PACKAGE,
          "--json",
          "--long",
        ]);
        return {
          status: 1,
          stdout: JSON.stringify({
            [COMMAND_CENTER_SDK_PACKAGE]: {
              current: "0.1.11",
              wanted: "0.1.12",
              latest: "0.1.12",
            },
          }),
          stderr: "",
        };
      },
    });

    const result = await inspectProjectSdk({ projectDir: root, localOps });
    assert.equal(result.projectRoot, root);
    assert.equal(result.status, "update_available");
    assert.equal(result.dependencyType, "dependencies");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SDK maintenance rejects a nested Vite project before querying npm", async () => {
  const root = await mkdtemp(join(tmpdir(), "command-center-sdk-status-root-"));
  const nested = join(root, "frontend");
  try {
    await mkdir(nested, { recursive: true });
    const initialized = spawnSync("git", ["init", "-b", "main"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, initialized.stderr);
    const localOps = createProjectSdkMaintenanceLocalOps();
    await assert.rejects(
      inspectProjectSdk({ projectDir: nested, localOps }),
      /require the Vite application at the Git repository root/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("npm update disables authenticated MCP postinstall and preserves JSON output isolation", () => {
  const calls = [];
  const localOps = createProjectSdkMaintenanceLocalOps({
    processEnv: { EXISTING: "value", MAINSEQUENCE_ACCESS_TOKEN: "secret" },
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: "", stderr: "" };
    },
  });

  localOps.updateSdk(projectRoot, { quiet: true });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "npm");
  assert.deepEqual(calls[0].args, [
    "update",
    COMMAND_CENTER_SDK_PACKAGE,
    "--save",
  ]);
  assert.equal(calls[0].options.cwd, projectRoot);
  assert.equal(calls[0].options.stdio, "pipe");
  assert.equal(calls[0].options.env.COMMAND_CENTER_SDK_MCP_POSTINSTALL, "0");
  assert.equal(calls[0].options.env.MAINSEQUENCE_ACCESS_TOKEN, "secret");
});

test("CLI routes SDK maintenance commands and rejects unsupported options as JSON", () => {
  const statusResult = spawnSync(
    process.execPath,
    [cliPath, "application", "sdk-status", "--dry-run", "--json"],
    { encoding: "utf8" },
  );
  assert.equal(statusResult.status, 1);
  assert.deepEqual(JSON.parse(statusResult.stderr), {
    error: "--dry-run is available only for application update-sdk.",
  });

  const updateResult = spawnSync(
    process.execPath,
    [cliPath, "application", "update-sdk", "unexpected", "--json"],
    { encoding: "utf8" },
  );
  assert.equal(updateResult.status, 1);
  assert.deepEqual(JSON.parse(updateResult.stderr), {
    error: "Unknown argument: unexpected",
  });
});
