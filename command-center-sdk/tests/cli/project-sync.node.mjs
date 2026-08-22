import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createProjectSyncApi,
  ProjectSyncApiError,
} from "../../cli/project-sync-api.mjs";
import {
  createProjectSyncLocalOps,
  repositorySshKeyIdentity,
  repositorySshKeyName,
  sanitizeCommitMessage,
} from "../../cli/project-sync-local-ops.mjs";
import { ProjectSyncError, syncProject } from "../../cli/project-sync.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json" : null },
    async json() {
      return payload;
    },
  };
}

function emptyResponse(status = 204) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
  };
}

function projectHarness({
  gitBranch = "main",
  renderedTag = "v1.2.4",
  branchError,
  keyCreated = true,
  registrationError,
  verificationErrors = [],
} = {}) {
  const events = [];
  const projectDir = "/project";
  let verificationAttempt = 0;
  const localOps = {
    async resolveProjectDir(value) {
      events.push(["resolve-project-directory", value]);
      return projectDir;
    },
    async readProjectUid(value) {
      events.push(["read-project-uid", value]);
      return "project-uid-123";
    },
    async inspectProject(value) {
      events.push(["inspect-project", value]);
      return {
        currentVersion: "1.2.3",
        gitBranch,
        origin: "git@github.com:organization/project.git",
      };
    },
    async ensureRepositoryKey(origin) {
      events.push(["ensure-key", origin]);
      return {
        created: keyCreated,
        keyPath: "/keys/project",
        keyTitle: "developer-workstation",
        publicKey: "ssh-ed25519 AAAATEST command-center",
      };
    },
    gitEnvironment(keyPath) {
      events.push(["git-environment", keyPath]);
      return { GIT_SSH_COMMAND: `ssh -i ${keyPath}` };
    },
    verifyGitPush(value, branch, env) {
      events.push(["verify-git-push", value, branch, env.GIT_SSH_COMMAND]);
      const error = verificationErrors[verificationAttempt];
      verificationAttempt += 1;
      if (error) throw error;
    },
    async readPackageVersion(value) {
      events.push(["read-version", value]);
      return "1.2.4";
    },
    validateGitTag(value, tagName) {
      events.push(["validate-tag", value, tagName]);
    },
    runCommand(command, args, options) {
      events.push(["command", command, args, options.cwd]);
    },
  };
  const api = {
    async resolveProjectBranch(projectUid, branch) {
      events.push(["resolve-project-branch", projectUid, branch]);
      if (branchError) throw new ProjectSyncApiError(branchError);
      return { gitBranch: branch, projectBranchUid: "project-branch-uid-123" };
    },
    async addProjectDeployKey(projectUid, key) {
      events.push(["add-project-deploy-key", projectUid, key]);
      if (registrationError) throw registrationError;
    },
    async renderDefaultRedeploymentTag(projectBranchUid, version) {
      events.push(["render-tag", projectBranchUid, version]);
      return renderedTag;
    },
  };
  return { api, events, localOps, projectDir };
}

test("normalizes commit messages like the Python project sync command", () => {
  assert.equal(sanitizeCommitMessage('  Deploy\n"dashboard"  '), "Deploy 'dashboard'");
  assert.throws(() => sanitizeCommitMessage("\n\r"), /Commit message is required/u);
});

test("derives the cross-CLI Repository SSH Key Identity v1 vectors", () => {
  for (const [origin, identity, usesSsh, keyName] of [
    [
      "git@github.com:org-a/app.git",
      "github.com/org-a/app",
      true,
      "mainsequence-app-30cab1d6d9237dda",
    ],
    [
      "ssh://git@github.com/org-a/app.git",
      "github.com/org-a/app",
      true,
      "mainsequence-app-30cab1d6d9237dda",
    ],
    [
      "https://github.com/org-a/app.git?token=ignored#fragment",
      "github.com/org-a/app",
      false,
      "mainsequence-app-30cab1d6d9237dda",
    ],
    [
      "git@github.com:org-b/app.git",
      "github.com/org-b/app",
      true,
      "mainsequence-app-8a36e97017a59942",
    ],
  ]) {
    assert.deepEqual(repositorySshKeyIdentity(origin), { identity, usesSsh });
    assert.equal(repositorySshKeyName(origin), keyName);
  }
});

test("repository SSH key identity preserves path case and non-default ports", () => {
  assert.deepEqual(repositorySshKeyIdentity("ssh://git@Example.COM:2222/Org/App.git"), {
    identity: "example.com:2222/Org/App",
    usesSsh: true,
  });
});

test("reads MAIN_SEQUENCE_PROJECT_UID from a project .env", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "command-center-project-sync-env-"));
  try {
    await writeFile(
      join(projectDir, ".env"),
      "IGNORED=value\nexport MAIN_SEQUENCE_PROJECT_UID='project-uid-123'\n",
      "utf8",
    );
    const localOps = createProjectSyncLocalOps();
    assert.equal(await localOps.readProjectUid(projectDir), "project-uid-123");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

for (const [gitBranch, renderedTag] of [
  ["main", "v1.2.4"],
  ["dev", "v1.2.4-dev.1"],
  ["feature/foo", "v1.2.4-feature-foo-12345678.1"],
]) {
  test(`uses the backend-owned ${gitBranch} tag unchanged`, async () => {
    const harness = projectHarness({ gitBranch, renderedTag });
    const result = await syncProject({
      message: "Update application",
      projectDir: harness.projectDir,
      localOps: harness.localOps,
      api: harness.api,
      quiet: true,
    });

    assert.equal(result.gitBranch, gitBranch);
    assert.equal(result.tagName, renderedTag);
    assert.deepEqual(
      harness.events.filter(([type]) => type === "command").map(([, command, args]) => [command, args]),
      [
        ["npm", ["version", "patch", "--no-git-tag-version"]],
        ["npm", ["install", "--package-lock-only"]],
        ["npm", ["ci"]],
        ["git", ["add", "-A"]],
        ["git", ["commit", "-m", "Update application"]],
        ["git", ["tag", "-a", renderedTag, "-m", renderedTag]],
        [
          "git",
          [
            "push",
            "--follow-tags",
            "origin",
            `HEAD:refs/heads/${gitBranch}`,
            `refs/tags/${renderedTag}:refs/tags/${renderedTag}`,
          ],
        ],
      ],
    );
    assert.deepEqual(
      harness.events.find(([type]) => type === "render-tag"),
      ["render-tag", "project-branch-uid-123", "1.2.4"],
    );
    assert.equal(
      harness.events
        .filter(([type]) => type === "command")
        .every((event) => event[3] === harness.projectDir),
      true,
    );
  });
}

test("registers a new repository key and verifies push access before mutation", async () => {
  const harness = projectHarness();
  await syncProject({
    message: "Update application",
    projectDir: harness.projectDir,
    localOps: harness.localOps,
    api: harness.api,
    quiet: true,
  });

  assert.deepEqual(
    harness.events.find(([type]) => type === "add-project-deploy-key"),
    [
      "add-project-deploy-key",
      "project-uid-123",
      {
        keyTitle: "developer-workstation",
        publicKey: "ssh-ed25519 AAAATEST command-center",
      },
    ],
  );
  const eventTypes = harness.events.map(([type]) => type);
  assert.ok(eventTypes.indexOf("add-project-deploy-key") < eventTypes.indexOf("verify-git-push"));
  assert.ok(eventTypes.indexOf("verify-git-push") < eventTypes.indexOf("command"));
});

test("does not re-register a reusable repository key that passes Git preflight", async () => {
  const harness = projectHarness({ keyCreated: false });
  await syncProject({
    message: "Update application",
    projectDir: harness.projectDir,
    localOps: harness.localOps,
    api: harness.api,
    quiet: true,
  });

  assert.equal(harness.events.filter(([type]) => type === "verify-git-push").length, 1);
  assert.equal(harness.events.some(([type]) => type === "add-project-deploy-key"), false);
});

test("registers and retries an existing repository key that fails Git preflight", async () => {
  const harness = projectHarness({
    keyCreated: false,
    verificationErrors: [new Error("Permission denied"), null],
  });
  await syncProject({
    message: "Update application",
    projectDir: harness.projectDir,
    localOps: harness.localOps,
    api: harness.api,
    quiet: true,
  });

  assert.equal(harness.events.filter(([type]) => type === "verify-git-push").length, 2);
  assert.equal(harness.events.filter(([type]) => type === "add-project-deploy-key").length, 1);
});

test("deploy-key registration failure stops before project mutation", async () => {
  const harness = projectHarness({ registrationError: new Error("Deploy key rejected") });
  await assert.rejects(
    syncProject({
      message: "Update application",
      projectDir: harness.projectDir,
      localOps: harness.localOps,
      api: harness.api,
      quiet: true,
    }),
    (caught) => {
      assert.equal(caught.stage, "register-project-deploy-key");
      assert.match(caught.message, /Deploy key rejected/u);
      return true;
    },
  );
  assert.equal(harness.events.some(([type]) => type === "command"), false);
});

test("Git push preflight failure stops before project mutation", async () => {
  const harness = projectHarness({ verificationErrors: [new Error("Permission denied")] });
  await assert.rejects(
    syncProject({
      message: "Update application",
      projectDir: harness.projectDir,
      localOps: harness.localOps,
      api: harness.api,
      quiet: true,
    }),
    (caught) => {
      assert.equal(caught.stage, "verify-git-push-access");
      assert.match(caught.message, /Permission denied/u);
      return true;
    },
  );
  assert.equal(harness.events.some(([type]) => type === "command"), false);
});

test("dry-run resolves the backend ProjectBranch but performs no local mutation", async () => {
  const harness = projectHarness({ gitBranch: "dev", renderedTag: "v1.2.4-dev.1" });
  const result = await syncProject({
    message: "Preview deployment",
    projectDir: harness.projectDir,
    localOps: harness.localOps,
    api: harness.api,
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.gitBranch, "dev");
  assert.equal(result.version, null);
  assert.equal(result.tagName, null);
  assert.equal(harness.events.some(([type]) => type === "resolve-project-branch"), true);
  for (const mutation of ["ensure-key", "git-environment", "add-project-deploy-key", "verify-git-push", "read-version", "render-tag", "validate-tag", "command"]) {
    assert.equal(harness.events.some(([type]) => type === mutation), false, mutation);
  }
});

test("an unregistered Git branch stops before every local mutation", async () => {
  const error = 'Git branch "feature/missing" is not registered as a ProjectBranch for this Project.';
  const harness = projectHarness({ gitBranch: "feature/missing", branchError: error });

  await assert.rejects(
    syncProject({
      message: "Deploy missing branch",
      projectDir: harness.projectDir,
      localOps: harness.localOps,
      api: harness.api,
    }),
    (caught) => {
      assert.equal(caught instanceof ProjectSyncError, true);
      assert.equal(caught.stage, "resolve-project-branch");
      assert.match(caught.message, /is not registered as a ProjectBranch/u);
      return true;
    },
  );

  for (const mutation of ["ensure-key", "git-environment", "add-project-deploy-key", "verify-git-push", "read-version", "render-tag", "validate-tag", "command"]) {
    assert.equal(harness.events.some(([type]) => type === mutation), false, mutation);
  }
});

test("a detached Git checkout stops before the backend or local mutation", async () => {
  const harness = projectHarness();
  harness.localOps.inspectProject = async () => {
    throw new Error("Current Git checkout is detached or has no named branch.");
  };

  await assert.rejects(
    syncProject({
      message: "Deploy detached checkout",
      projectDir: harness.projectDir,
      localOps: harness.localOps,
      api: harness.api,
    }),
    /detached or has no named branch/u,
  );
  assert.equal(harness.events.some(([type]) => type === "resolve-project-branch"), false);
  assert.equal(harness.events.some(([type]) => type === "command"), false);
});

test("backend API resolves the exact ProjectBranch and requests its deployment tag", async () => {
  const calls = [];
  const responses = [
    jsonResponse({
      uid: "project-uid-123",
      branches: [
        { uid: "main-uid", repository_branch: "main" },
        { uid: "dev-uid", repository_branch: "dev" },
      ],
    }),
    jsonResponse({ uid: "dev-uid", repository_branch: "dev" }),
    emptyResponse(),
    jsonResponse({ version: "1.2.4", tag_name: "v1.2.4-dev.1" }),
  ];
  const api = createProjectSyncApi({
    backendUrl: "https://platform.example/",
    accessToken: "secret-access-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    },
  });

  const branch = await api.resolveProjectBranch("project-uid-123", "dev");
  await api.addProjectDeployKey("project-uid-123", {
    keyTitle: "developer-workstation",
    publicKey: "ssh-ed25519 AAAATEST command-center",
  });
  const tag = await api.renderDefaultRedeploymentTag(branch.projectBranchUid, "1.2.4");

  assert.deepEqual(branch, { gitBranch: "dev", projectBranchUid: "dev-uid" });
  assert.equal(tag, "v1.2.4-dev.1");
  assert.deepEqual(calls.map(({ url, options }) => [options.method, url]), [
    ["GET", "https://platform.example/api/v1/projects/project-uid-123/"],
    ["GET", "https://platform.example/api/v1/project-branches/dev-uid/"],
    ["POST", "https://platform.example/api/v1/projects/project-uid-123/add-deploy-key/"],
    ["POST", "https://platform.example/api/v1/project-branches/dev-uid/default-redeployment-tag/"],
  ]);
  assert.equal(
    calls[2].options.body,
    JSON.stringify({
      key_title: "developer-workstation",
      public_key: "ssh-ed25519 AAAATEST command-center",
    }),
  );
  assert.equal(calls[3].options.body, JSON.stringify({ version: "1.2.4" }));
  assert.equal(calls.every(({ options }) => options.headers.Authorization === "Bearer secret-access-token"), true);
});

test("backend API rejects an unregistered branch before requesting a tag", async () => {
  const calls = [];
  const api = createProjectSyncApi({
    backendUrl: "https://platform.example",
    accessToken: "secret-access-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        uid: "project-uid-123",
        branches: [{ uid: "main-uid", repository_branch: "main" }],
      });
    },
  });

  await assert.rejects(
    api.resolveProjectBranch("project-uid-123", "feature/missing"),
    /is not registered as a ProjectBranch/u,
  );
  assert.equal(calls.length, 1);
});

test("backend API rejects a Project with no ProjectBranches", async () => {
  const api = createProjectSyncApi({
    backendUrl: "https://platform.example",
    accessToken: "secret-access-token",
    fetchImpl: async () => jsonResponse({ uid: "project-uid-123", branches: [] }),
  });

  await assert.rejects(
    api.resolveProjectBranch("project-uid-123", "main"),
    /Project has no ProjectBranches/u,
  );
});

test("backend API rejects a tag response for another version", async () => {
  const api = createProjectSyncApi({
    backendUrl: "https://platform.example",
    accessToken: "secret-access-token",
    fetchImpl: async () => jsonResponse({ version: "9.9.9", tag_name: "v9.9.9" }),
  });
  await assert.rejects(
    api.renderDefaultRedeploymentTag("branch-uid", "1.2.4"),
    /returned another version/u,
  );
});

test("CLI rejects duplicate commit-message forms as JSON", () => {
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "project",
      "sync",
      "Positional message",
      "--message",
      "Option message",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), {
    error: "Pass the commit message either positionally or with --message, not both.",
  });
});

test("local preflight rejects missing package-lock.json", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "command-center-project-sync-lock-"));
  try {
    await mkdir(join(projectDir, ".git"), { recursive: true });
    await writeFile(join(projectDir, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
    const localOps = createProjectSyncLocalOps();
    await assert.rejects(localOps.inspectProject(projectDir), /requires .*package-lock\.json/u);
    assert.equal(JSON.parse(await readFile(join(projectDir, "package.json"), "utf8")).version, "1.2.3");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("local preflight accepts a repository-root Vite application", async () => {
  const projectDir = await mkdtemp(join(tmpdir(), "command-center-project-sync-root-"));
  try {
    await writeFile(join(projectDir, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
    await writeFile(join(projectDir, "package-lock.json"), "{}\n", "utf8");
    const initialized = spawnSync("git", ["init", "-b", "main"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, initialized.stderr);
    const remote = spawnSync(
      "git",
      ["remote", "add", "origin", "git@github.com:organization/project.git"],
      { cwd: projectDir, encoding: "utf8" },
    );
    assert.equal(remote.status, 0, remote.stderr);

    const localOps = createProjectSyncLocalOps();
    assert.deepEqual(await localOps.inspectProject(projectDir), {
      currentVersion: "1.2.3",
      gitBranch: "main",
      origin: "git@github.com:organization/project.git",
    });
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test("local preflight rejects a Vite application below the Git repository root", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "command-center-project-sync-root-"));
  const projectDir = join(repositoryRoot, "frontend");
  try {
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
    await writeFile(join(projectDir, "package-lock.json"), "{}\n", "utf8");
    const initialized = spawnSync("git", ["init"], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);

    const localOps = createProjectSyncLocalOps();
    await assert.rejects(
      localOps.inspectProject(projectDir),
      /requires the Vite application at the Git repository root/u,
    );
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("repository-key preflight never overwrites an existing private key", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "command-center-project-sync-key-"));
  const sshDirectory = join(homeDirectory, ".ssh");
  const keyName = "mainsequence-project-0b359d1a1ee13a62";
  try {
    await mkdir(sshDirectory, { recursive: true });
    await writeFile(join(sshDirectory, keyName), "existing private key", "utf8");
    const localOps = createProjectSyncLocalOps({
      homeDirectory,
      spawnSyncImpl() {
        assert.fail("ssh-keygen must not overwrite an existing private key");
      },
    });
    await assert.rejects(
      localOps.ensureRepositoryKey("git@github.com:organization/project.git"),
      /SSH public key is missing/u,
    );
    assert.equal(await readFile(join(sshDirectory, keyName), "utf8"), "existing private key");
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("repository-key preflight returns registration metadata for a newly generated key", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "command-center-project-sync-key-"));
  try {
    const localOps = createProjectSyncLocalOps({
      homeDirectory,
      hostName: "developer-workstation",
      spawnSyncImpl(command, args) {
        assert.equal(command, "ssh-keygen");
        const keyPath = args[args.indexOf("-f") + 1];
        writeFileSync(keyPath, "generated private key", "utf8");
        writeFileSync(`${keyPath}.pub`, "ssh-ed25519 AAAATEST generated\n", "utf8");
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.deepEqual(
      await localOps.ensureRepositoryKey("git@github.com:organization/project.git"),
      {
        created: true,
        keyPath: join(
          homeDirectory,
          ".ssh",
          "mainsequence-project-0b359d1a1ee13a62",
        ),
        keyTitle: "developer-workstation",
        publicKey: "ssh-ed25519 AAAATEST generated",
      },
    );
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("same-basename repositories generate distinct keys without touching the legacy basename", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "command-center-project-sync-key-"));
  const generatedPaths = [];
  const sshDirectory = join(homeDirectory, ".ssh");
  try {
    await mkdir(sshDirectory, { recursive: true });
    await writeFile(join(sshDirectory, "app"), "unrelated legacy key", "utf8");
    const localOps = createProjectSyncLocalOps({
      homeDirectory,
      spawnSyncImpl(command, args) {
        assert.equal(command, "ssh-keygen");
        const keyPath = args[args.indexOf("-f") + 1];
        generatedPaths.push(keyPath);
        writeFileSync(keyPath, "generated private key", "utf8");
        writeFileSync(`${keyPath}.pub`, "ssh-ed25519 AAAATEST generated\n", "utf8");
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    const first = await localOps.ensureRepositoryKey("git@github.com:org-a/app.git");
    const second = await localOps.ensureRepositoryKey("git@github.com:org-b/app.git");

    assert.equal(first.keyPath, join(sshDirectory, "mainsequence-app-30cab1d6d9237dda"));
    assert.equal(second.keyPath, join(sshDirectory, "mainsequence-app-8a36e97017a59942"));
    assert.notEqual(first.keyPath, second.keyPath);
    assert.deepEqual(generatedPaths, [first.keyPath, second.keyPath]);
    assert.equal(await readFile(join(sshDirectory, "app"), "utf8"), "unrelated legacy key");
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("repository-key preflight rejects non-SSH origins", async () => {
  const localOps = createProjectSyncLocalOps();
  await assert.rejects(
    localOps.ensureRepositoryKey("https://github.com/organization/project.git"),
    /must use SSH/u,
  );
});

test("Git push preflight uses the forced identity without mutating the remote", () => {
  const calls = [];
  const localOps = createProjectSyncLocalOps({
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  const env = { GIT_SSH_COMMAND: 'ssh -i "/keys/project" -o IdentitiesOnly=yes' };
  localOps.verifyGitPush("/project", "feature/dashboard", env);
  assert.deepEqual(calls, [
    {
      command: "git",
      args: [
        "push",
        "--dry-run",
        "--follow-tags",
        "origin",
        "HEAD:refs/heads/feature/dashboard",
      ],
      options: {
        cwd: "/project",
        env,
        encoding: "utf8",
        stdio: "pipe",
      },
    },
  ]);
});
