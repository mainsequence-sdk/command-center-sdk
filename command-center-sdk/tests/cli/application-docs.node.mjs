import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DOCUMENTATION_DEV_DEPENDENCIES,
  DOCUMENTATION_SCRIPTS,
  initializeApplicationDocumentation,
  ApplicationDocsInitError,
} from "../../cli/application-docs.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");
const nodeMajor = Number(process.versions.node.split(".")[0]);

async function fixture(label, { engineMajor = nodeMajor, nodePin = nodeMajor } = {}) {
  const applicationRoot = await mkdtemp(join(tmpdir(), `command-center-sdk-docs-${label}-`));
  const manifest = {
    name: `documentation-${label}`,
    version: "1.0.0",
    private: true,
    type: "module",
    engines: { node: `${engineMajor}.x` },
    scripts: { build: "vite build" },
  };
  await writeFile(join(applicationRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    join(applicationRoot, "package-lock.json"),
    `${JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: manifest.name, version: manifest.version } },
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(applicationRoot, ".node-version"), `${nodePin}\n`, "utf8");
  return realpath(applicationRoot);
}

function runNode(applicationRoot, script, args = []) {
  return spawnSync(process.execPath, [join(applicationRoot, script), ...args], {
    cwd: applicationRoot,
    encoding: "utf8",
  });
}

test("initializes, validates, generates, and re-runs the documentation scaffold", async () => {
  const applicationRoot = await fixture("complete");
  try {
    const result = await initializeApplicationDocumentation({ applicationDir: applicationRoot, install: false });
    assert.equal(result.docsBaseUrl, "/docs/");
    assert.equal(result.installed, false);
    assert.equal(result.created.includes("documentation/docusaurus.config.mjs"), true);
    assert.equal(result.created.includes("scripts/validate-docs.mjs"), true);
    assert.match(
      await readFile(join(applicationRoot, "docs", "surfaces", "index.md"), "utf8"),
      /slug: \/$/mu,
    );
    assert.equal(
      JSON.parse(await readFile(join(applicationRoot, "documentation", "package.json"), "utf8")).type,
      undefined,
    );
    assert.match(
      await readFile(join(applicationRoot, "documentation", "docusaurus.config.mjs"), "utf8"),
      /type: "html"[\s\S]*href="\/"/u,
    );

    const manifest = JSON.parse(await readFile(join(applicationRoot, "package.json"), "utf8"));
    assert.equal(manifest.scripts.build, "npm run build:app && npm run build:docs");
    assert.equal(manifest.scripts["build:app"], "vite build");
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(DOCUMENTATION_SCRIPTS).map((name) => [name, manifest.scripts[name]]),
      ),
      DOCUMENTATION_SCRIPTS,
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(DOCUMENTATION_DEV_DEPENDENCIES).map((name) => [
          name,
          manifest.devDependencies[name],
        ]),
      ),
      DOCUMENTATION_DEV_DEPENDENCIES,
    );

    for (const [script, args] of [
      ["scripts/check-docs-toolchain.mjs", []],
      ["scripts/sync-docs-navigation.mjs", ["--check"]],
      ["scripts/validate-docs.mjs", []],
    ]) {
      const validation = runNode(applicationRoot, script, args);
      assert.equal(validation.status, 0, validation.stderr);
    }

    const navigationPath = join(applicationRoot, "documentation", "navigation.json");
    const navigation = JSON.parse(await readFile(navigationPath, "utf8"));
    navigation.sections[0].items.push({
      label: "Services",
      doc: "surfaces/services",
      items: [],
    });
    await writeFile(navigationPath, `${JSON.stringify(navigation, null, 2)}\n`, "utf8");
    await writeFile(join(applicationRoot, "docs", "surfaces", "services.md"), "# Services\n", "utf8");
    const sync = runNode(applicationRoot, "scripts/sync-docs-navigation.mjs");
    assert.equal(sync.status, 0, sync.stderr);
    assert.match(await readFile(join(applicationRoot, "docs", "SUMMARY.md"), "utf8"), /surfaces\/services\.md/u);
    assert.match(
      await readFile(join(applicationRoot, "documentation", "sidebars.mjs"), "utf8"),
      /surfaces\/services/u,
    );
    const validation = runNode(applicationRoot, "scripts/validate-docs.mjs");
    assert.equal(validation.status, 0, validation.stderr);

    const second = await initializeApplicationDocumentation({ applicationDir: applicationRoot, install: false });
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.updated, []);
    assert.equal(second.unchanged.length > 0, true);
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
  }
});

test("dry-run reports the scaffold without writing", async () => {
  const applicationRoot = await fixture("dry-run");
  try {
    const originalManifest = await readFile(join(applicationRoot, "package.json"), "utf8");
    const result = await initializeApplicationDocumentation({ applicationDir: applicationRoot, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.created.includes("docs/surfaces/index.md"), true);
    assert.deepEqual(result.commands, ["npm install"]);
    assert.equal(await readFile(join(applicationRoot, "package.json"), "utf8"), originalManifest);
    await assert.rejects(readFile(join(applicationRoot, "documentation", "navigation.json"), "utf8"), {
      code: "ENOENT",
    });
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
  }
});

test("conflicting files and package-manager state fail before mutation", async () => {
  const applicationRoot = await fixture("conflict");
  try {
    await mkdir(join(applicationRoot, "documentation"), { recursive: true });
    await writeFile(
      join(applicationRoot, "documentation", "docusaurus.config.mjs"),
      "export default { title: 'consumer-owned' };\n",
      "utf8",
    );
    const originalManifest = await readFile(join(applicationRoot, "package.json"), "utf8");
    await assert.rejects(
      initializeApplicationDocumentation({ applicationDir: applicationRoot, install: false }),
      (error) => error instanceof ApplicationDocsInitError && error.stage === "template-conflict",
    );
    assert.equal(await readFile(join(applicationRoot, "package.json"), "utf8"), originalManifest);

    await writeFile(join(applicationRoot, "yarn.lock"), "", "utf8");
    await assert.rejects(
      initializeApplicationDocumentation({ applicationDir: applicationRoot, install: false }),
      /conflicting root package-manager lockfile/u,
    );
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
  }
});

test("refuses to write documentation through a symbolic-link directory", async () => {
  const applicationRoot = await fixture("symlink");
  const externalRoot = await mkdtemp(join(tmpdir(), "command-center-sdk-docs-external-"));
  try {
    await symlink(externalRoot, join(applicationRoot, "docs"), "dir");
    await assert.rejects(
      initializeApplicationDocumentation({ applicationDir: applicationRoot, install: false }),
      /Refusing to use a symbolic link/u,
    );
    await assert.rejects(readFile(join(externalRoot, "SUMMARY.md"), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
    await rm(externalRoot, { recursive: true, force: true });
  }
});

test("rejects Node runtime drift", async () => {
  const incompatibleMajor = nodeMajor === 1 ? 2 : nodeMajor - 1;
  const applicationRoot = await fixture("node-drift", {
    engineMajor: incompatibleMajor,
    nodePin: incompatibleMajor,
  });
  try {
    await assert.rejects(
      initializeApplicationDocumentation({ applicationDir: applicationRoot, install: false }),
      (error) => error instanceof ApplicationDocsInitError && error.stage === "toolchain-preflight",
    );
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
  }
});

test("toolchain validation rejects a pure-ESM Docusaurus boundary", async () => {
  const applicationRoot = await fixture("docusaurus-module-mode");
  try {
    await initializeApplicationDocumentation({ applicationDir: applicationRoot, install: false });
    await writeFile(
      join(applicationRoot, "documentation", "package.json"),
      `${JSON.stringify({ name: "documentation", private: true, type: "module" }, null, 2)}\n`,
      "utf8",
    );
    const result = runNode(applicationRoot, "scripts/check-docs-toolchain.mjs");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must not set type=module/u);
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
  }
});

test("dependency installation is injectable and disables the MCP postinstall lane", async () => {
  const applicationRoot = await fixture("install");
  const calls = [];
  try {
    const result = await initializeApplicationDocumentation({
      applicationDir: applicationRoot,
      spawnSyncImpl(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0 };
      },
    });
    assert.equal(result.installed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "npm");
    assert.deepEqual(calls[0].args, ["install"]);
    assert.equal(calls[0].options.cwd, applicationRoot);
    assert.equal(calls[0].options.env.COMMAND_CENTER_SDK_MCP_POSTINSTALL, "0");
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
  }
});

test("CLI initializes documentation with JSON evidence", async () => {
  const applicationRoot = await fixture("cli");
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "application", "docs", "init", "--path", applicationRoot, "--skip-install", "--json"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.applicationRoot, applicationRoot);
    assert.equal("projectRoot" in payload, false);
    assert.equal(payload.installed, false);
    assert.equal(payload.created.includes("documentation/navigation.json"), true);
    assert.match(await readFile(join(applicationRoot, "documentation", "docusaurus.config.mjs"), "utf8"), /baseUrl: "\/docs\/"/u);
  } finally {
    await rm(applicationRoot, { recursive: true, force: true });
  }
});
