import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createCodeRepositorySyncApi,
  CodeRepositorySyncApiError,
} from "../../cli/code-repository-sync-api.mjs";
import {
  createCodeRepositorySyncLocalOps,
  nextNpmPatchVersion,
  repositorySshKeyIdentity,
  repositorySshKeyName,
  sanitizeCommitMessage,
} from "../../cli/code-repository-sync-local-ops.mjs";
import { CodeRepositorySyncError, syncCodeRepository } from "../../cli/code-repository-sync.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");
const TEST_COMMIT_SHA = "a".repeat(40);
const TEST_REPOSITORY_IDENTITY = "github.com/organization/project";

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

function codeRepositoryHarness({
  gitBranch = "main",
  renderedTag = "v1.2.4",
  branchError,
  keyCreated = true,
  registrationError,
  remoteTagError,
  actualVersion = "1.2.4",
  verificationErrors = [],
} = {}) {
  const events = [];
  const codeRepositoryDir = "/project";
  let verificationAttempt = 0;
  const localOps = {
    async resolveCodeRepositoryDir(value) {
      events.push(["resolve-code-repository-directory", value]);
      return codeRepositoryDir;
    },
    async inspectCodeRepository(value) {
      events.push(["inspect-code-repository", value]);
      return {
        currentVersion: "1.2.3",
        canonicalRepositoryIdentity: TEST_REPOSITORY_IDENTITY,
        gitBranch,
        repositoryRef: `refs/heads/${gitBranch}`,
        commitSha: TEST_COMMIT_SHA,
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
      return actualVersion;
    },
    validateGitTag(value, tagName) {
      events.push(["validate-tag", value, tagName]);
    },
    validateRemoteGitTag(value, tagName, env) {
      events.push(["validate-remote-tag", value, tagName, env.GIT_SSH_COMMAND]);
      if (remoteTagError) throw remoteTagError;
    },
    runCommand(command, args, options) {
      events.push(["command", command, args, options.cwd]);
    },
  };
  const api = {
    async resolveGitContext(context) {
      events.push(["resolve-git-context", context]);
      if (branchError) throw new CodeRepositorySyncApiError(branchError);
      return {
        canonicalRepositoryIdentity: context.repositoryIdentity,
        gitBranch: context.repositoryBranch,
        repositoryRef: `refs/heads/${context.repositoryBranch}`,
        commitSha: context.commitSha,
        codeRepositoryUid: "code-repository-uid-123",
        codeRepositoryBranchUid: "code-repository-branch-uid-123",
      };
    },
    async addCodeRepositoryDeployKey(codeRepositoryUid, key) {
      events.push(["add-code-repository-deploy-key", codeRepositoryUid, key]);
      if (registrationError) throw registrationError;
    },
    async renderDefaultRedeploymentTag(codeRepositoryBranchUid, version) {
      events.push(["render-tag", codeRepositoryBranchUid, version]);
      return renderedTag;
    },
  };
  return { api, events, localOps, codeRepositoryDir };
}

test("normalizes commit messages like the Python code-repository sync command", () => {
  assert.equal(sanitizeCommitMessage('  Deploy\n"dashboard"  '), "Deploy 'dashboard'");
  assert.throws(() => sanitizeCommitMessage("\n\r"), /Commit message is required/u);
});

test("calculates npm patch versions without mutating the repository", () => {
  assert.equal(nextNpmPatchVersion("1.2.3"), "1.2.4");
  assert.equal(nextNpmPatchVersion("1.2.3-rc.2"), "1.2.3");
  assert.equal(nextNpmPatchVersion("1.2.3+build.7"), "1.2.4");
  assert.equal(nextNpmPatchVersion("1.2.3-rc.2+build.7"), "1.2.3");
  assert.throws(() => nextNpmPatchVersion("1.2"), /Cannot calculate npm patch version/u);
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

test("resolves CodeRepository identity exclusively from Git context", async () => {
  const harness = codeRepositoryHarness();
  const result = await syncCodeRepository({
    message: "Preview application",
    codeRepositoryDir: harness.codeRepositoryDir,
    localOps: harness.localOps,
    api: harness.api,
    dryRun: true,
  });

  assert.equal(result.codeRepositoryUid, "code-repository-uid-123");
  assert.equal(result.canonicalRepositoryIdentity, TEST_REPOSITORY_IDENTITY);
  assert.equal(result.repositoryRef, "refs/heads/main");
  assert.equal(result.commitSha, TEST_COMMIT_SHA);
  assert.deepEqual(
    harness.events.find(([type]) => type === "resolve-git-context"),
    [
      "resolve-git-context",
      {
        repositoryIdentity: TEST_REPOSITORY_IDENTITY,
        repositoryBranch: "main",
        commitSha: TEST_COMMIT_SHA,
      },
    ],
  );
});

test("treats a supplied CodeRepository UID only as an assertion", async () => {
  const matching = codeRepositoryHarness();
  const result = await syncCodeRepository({
    message: "Preview application",
    codeRepositoryUid: "code-repository-uid-123",
    codeRepositoryDir: matching.codeRepositoryDir,
    localOps: matching.localOps,
    api: matching.api,
    dryRun: true,
  });
  assert.equal(result.codeRepositoryUid, "code-repository-uid-123");

  const mismatched = codeRepositoryHarness();
  await assert.rejects(
    syncCodeRepository({
      message: "Preview another code repository",
      codeRepositoryUid: "another-code-repository-uid",
      codeRepositoryDir: mismatched.codeRepositoryDir,
      localOps: mismatched.localOps,
      api: mismatched.api,
      dryRun: true,
    }),
    (caught) => {
      assert.equal(caught.stage, "assert-code-repository-uid");
      assert.match(caught.message, /does not match Git-resolved CodeRepository/u);
      assert.equal(caught.state.codeRepositoryUid, "code-repository-uid-123");
      return true;
    },
  );
  assert.equal(mismatched.events.some(([type]) => type === "render-tag"), false);
  assert.equal(mismatched.events.some(([type]) => type === "ensure-key"), false);
});

for (const [gitBranch, renderedTag] of [
  ["main", "v1.2.4"],
  ["dev", "v1.2.4-dev.1"],
  ["feature/foo", "v1.2.4-feature-foo-12345678.1"],
]) {
  test(`uses the backend-owned ${gitBranch} tag unchanged`, async () => {
    const harness = codeRepositoryHarness({ gitBranch, renderedTag });
    const result = await syncCodeRepository({
      message: "Update application",
      codeRepositoryDir: harness.codeRepositoryDir,
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
            "--atomic",
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
      ["render-tag", "code-repository-branch-uid-123", "1.2.4"],
    );
    const eventTypes = harness.events.map(([type]) => type);
    assert.ok(eventTypes.indexOf("validate-tag") < eventTypes.indexOf("ensure-key"));
    assert.ok(eventTypes.indexOf("validate-remote-tag") < eventTypes.indexOf("command"));
    assert.equal(
      harness.events
        .filter(([type]) => type === "command")
        .every((event) => event[3] === harness.codeRepositoryDir),
      true,
    );
  });
}

test("registers a new repository key and verifies push access before mutation", async () => {
  const harness = codeRepositoryHarness();
  await syncCodeRepository({
    message: "Update application",
    codeRepositoryDir: harness.codeRepositoryDir,
    localOps: harness.localOps,
    api: harness.api,
    quiet: true,
  });

  assert.deepEqual(
    harness.events.find(([type]) => type === "add-code-repository-deploy-key"),
    [
      "add-code-repository-deploy-key",
      "code-repository-uid-123",
      {
        keyTitle: "developer-workstation",
        publicKey: "ssh-ed25519 AAAATEST command-center",
      },
    ],
  );
  const eventTypes = harness.events.map(([type]) => type);
  assert.ok(eventTypes.indexOf("add-code-repository-deploy-key") < eventTypes.indexOf("verify-git-push"));
  assert.ok(eventTypes.indexOf("verify-git-push") < eventTypes.indexOf("command"));
});

test("does not re-register a reusable repository key that passes Git preflight", async () => {
  const harness = codeRepositoryHarness({ keyCreated: false });
  await syncCodeRepository({
    message: "Update application",
    codeRepositoryDir: harness.codeRepositoryDir,
    localOps: harness.localOps,
    api: harness.api,
    quiet: true,
  });

  assert.equal(harness.events.filter(([type]) => type === "verify-git-push").length, 1);
  assert.equal(harness.events.some(([type]) => type === "add-code-repository-deploy-key"), false);
});

test("registers and retries an existing repository key that fails Git preflight", async () => {
  const harness = codeRepositoryHarness({
    keyCreated: false,
    verificationErrors: [new Error("Permission denied"), null],
  });
  await syncCodeRepository({
    message: "Update application",
    codeRepositoryDir: harness.codeRepositoryDir,
    localOps: harness.localOps,
    api: harness.api,
    quiet: true,
  });

  assert.equal(harness.events.filter(([type]) => type === "verify-git-push").length, 2);
  assert.equal(harness.events.filter(([type]) => type === "add-code-repository-deploy-key").length, 1);
});

test("deploy-key registration failure stops before code repository mutation", async () => {
  const harness = codeRepositoryHarness({ registrationError: new Error("Deploy key rejected") });
  await assert.rejects(
    syncCodeRepository({
      message: "Update application",
      codeRepositoryDir: harness.codeRepositoryDir,
      localOps: harness.localOps,
      api: harness.api,
      quiet: true,
    }),
    (caught) => {
      assert.equal(caught.stage, "register-code-repository-deploy-key");
      assert.match(caught.message, /Deploy key rejected/u);
      return true;
    },
  );
  assert.equal(harness.events.some(([type]) => type === "command"), false);
});

test("Git push preflight failure stops before code repository mutation", async () => {
  const harness = codeRepositoryHarness({ verificationErrors: [new Error("Permission denied")] });
  await assert.rejects(
    syncCodeRepository({
      message: "Update application",
      codeRepositoryDir: harness.codeRepositoryDir,
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

test("remote tag collision stops before version or repository mutation", async () => {
  const harness = codeRepositoryHarness({ remoteTagError: new Error("Git tag already exists remotely: v1.2.4") });
  await assert.rejects(
    syncCodeRepository({
      message: "Update application",
      codeRepositoryDir: harness.codeRepositoryDir,
      localOps: harness.localOps,
      api: harness.api,
      quiet: true,
    }),
    (caught) => {
      assert.equal(caught.stage, "validate-remote-branch-tag");
      assert.match(caught.message, /already exists remotely/u);
      return true;
    },
  );
  assert.equal(harness.events.some(([type]) => type === "command"), false);
});

test("unexpected npm version stops before lockfile or Git mutation", async () => {
  const harness = codeRepositoryHarness({ actualVersion: "1.2.5" });
  await assert.rejects(
    syncCodeRepository({
      message: "Update application",
      codeRepositoryDir: harness.codeRepositoryDir,
      localOps: harness.localOps,
      api: harness.api,
      quiet: true,
    }),
    (caught) => {
      assert.equal(caught.stage, "verify-version-bump");
      assert.match(caught.message, /preflight expected 1\.2\.4/u);
      return true;
    },
  );
  assert.deepEqual(
    harness.events.filter(([type]) => type === "command").map(([, command, args]) => [command, args]),
    [["npm", ["version", "patch", "--no-git-tag-version"]]],
  );
});

test("dry-run resolves the backend CodeRepositoryBranch but performs no local mutation", async () => {
  const harness = codeRepositoryHarness({ gitBranch: "dev", renderedTag: "v1.2.4-dev.1" });
  const result = await syncCodeRepository({
    message: "Preview deployment",
    codeRepositoryDir: harness.codeRepositoryDir,
    localOps: harness.localOps,
    api: harness.api,
    dryRun: true,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.gitBranch, "dev");
  assert.equal(result.nextVersion, "1.2.4");
  assert.equal(result.version, "1.2.4");
  assert.equal(result.tagName, "v1.2.4-dev.1");
  assert.equal(harness.events.some(([type]) => type === "resolve-git-context"), true);
  assert.equal(harness.events.some(([type]) => type === "render-tag"), true);
  assert.equal(harness.events.some(([type]) => type === "validate-tag"), true);
  for (const mutation of ["ensure-key", "git-environment", "add-code-repository-deploy-key", "verify-git-push", "validate-remote-tag", "read-version", "command"]) {
    assert.equal(harness.events.some(([type]) => type === mutation), false, mutation);
  }
});

test("an unregistered Git branch stops before every local mutation", async () => {
  const error = "No visible CodeRepositoryBranch matches the Git source context.";
  const harness = codeRepositoryHarness({ gitBranch: "feature/missing", branchError: error });

  await assert.rejects(
    syncCodeRepository({
      message: "Deploy missing branch",
      codeRepositoryDir: harness.codeRepositoryDir,
      localOps: harness.localOps,
      api: harness.api,
    }),
    (caught) => {
      assert.equal(caught instanceof CodeRepositorySyncError, true);
      assert.equal(caught.stage, "resolve-git-context");
      assert.match(caught.message, /No visible CodeRepositoryBranch/u);
      return true;
    },
  );

  for (const mutation of ["ensure-key", "git-environment", "add-code-repository-deploy-key", "verify-git-push", "read-version", "render-tag", "validate-tag", "command"]) {
    assert.equal(harness.events.some(([type]) => type === mutation), false, mutation);
  }
});

test("a detached Git checkout stops before the backend or local mutation", async () => {
  const harness = codeRepositoryHarness();
  harness.localOps.inspectCodeRepository = async () => {
    throw new Error("Current Git checkout is detached or has no named branch.");
  };

  await assert.rejects(
    syncCodeRepository({
      message: "Deploy detached checkout",
      codeRepositoryDir: harness.codeRepositoryDir,
      localOps: harness.localOps,
      api: harness.api,
    }),
    /detached or has no named branch/u,
  );
  assert.equal(harness.events.some(([type]) => type === "resolve-git-context"), false);
  assert.equal(harness.events.some(([type]) => type === "command"), false);
});

test("backend API resolves the exact CodeRepositoryBranch and requests its deployment tag", async () => {
  const calls = [];
  const responses = [
    jsonResponse({
      canonical_repository_identity: TEST_REPOSITORY_IDENTITY,
      repository_branch: "dev",
      repository_ref: "refs/heads/dev",
      commit_sha: TEST_COMMIT_SHA,
      code_repository_branch: {
        uid: "dev-uid",
        code_repository_uid: "code-repository-uid-123",
        repository_branch: "dev",
      },
    }),
    emptyResponse(),
    jsonResponse({ version: "1.2.4", tag_name: "v1.2.4-dev.1" }),
  ];
  const api = createCodeRepositorySyncApi({
    backendUrl: "https://platform.example/",
    accessToken: "secret-access-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    },
  });

  const branch = await api.resolveGitContext({
    repositoryIdentity: TEST_REPOSITORY_IDENTITY,
    repositoryBranch: "dev",
    commitSha: TEST_COMMIT_SHA,
  });
  await api.addCodeRepositoryDeployKey("code-repository-uid-123", {
    keyTitle: "developer-workstation",
    publicKey: "ssh-ed25519 AAAATEST command-center",
  });
  const tag = await api.renderDefaultRedeploymentTag(branch.codeRepositoryBranchUid, "1.2.4");

  assert.deepEqual(branch, {
    canonicalRepositoryIdentity: TEST_REPOSITORY_IDENTITY,
    gitBranch: "dev",
    repositoryRef: "refs/heads/dev",
    commitSha: TEST_COMMIT_SHA,
    codeRepositoryUid: "code-repository-uid-123",
    codeRepositoryBranchUid: "dev-uid",
  });
  assert.equal(tag, "v1.2.4-dev.1");
  assert.deepEqual(calls.map(({ url, options }) => [options.method, url]), [
    ["POST", "https://platform.example/api/v1/code-repository-branches/resolve-git-context/"],
    ["POST", "https://platform.example/api/v1/code-repositories/code-repository-uid-123/add-deploy-key/"],
    ["POST", "https://platform.example/api/v1/code-repository-branches/dev-uid/default-redeployment-tag/"],
  ]);
  assert.equal(
    calls[0].options.body,
    JSON.stringify({
      repository_identity: TEST_REPOSITORY_IDENTITY,
      repository_branch: "dev",
      commit_sha: TEST_COMMIT_SHA,
    }),
  );
  assert.equal(
    calls[1].options.body,
    JSON.stringify({
      key_title: "developer-workstation",
      public_key: "ssh-ed25519 AAAATEST command-center",
    }),
  );
  assert.equal(calls[2].options.body, JSON.stringify({ version: "1.2.4" }));
  assert.equal(calls.every(({ options }) => options.headers.Authorization === "Bearer secret-access-token"), true);
});

test("backend API rejects an unregistered branch before requesting a tag", async () => {
  const calls = [];
  const api = createCodeRepositorySyncApi({
    backendUrl: "https://platform.example",
    accessToken: "secret-access-token",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(
        { detail: "No visible CodeRepositoryBranch matches the Git source context." },
        404,
      );
    },
  });

  await assert.rejects(
    api.resolveGitContext({
      repositoryIdentity: TEST_REPOSITORY_IDENTITY,
      repositoryBranch: "feature/missing",
      commitSha: TEST_COMMIT_SHA,
    }),
    /failed \(404\).*No visible CodeRepositoryBranch/u,
  );
  assert.equal(calls.length, 1);
});

test("backend API rejects a malformed Git-context response", async () => {
  const api = createCodeRepositorySyncApi({
    backendUrl: "https://platform.example",
    accessToken: "secret-access-token",
    fetchImpl: async () =>
      jsonResponse({
        canonical_repository_identity: TEST_REPOSITORY_IDENTITY,
        repository_branch: "main",
        repository_ref: "refs/heads/main",
        commit_sha: TEST_COMMIT_SHA,
      }),
  });

  await assert.rejects(
    api.resolveGitContext({
      repositoryIdentity: TEST_REPOSITORY_IDENTITY,
      repositoryBranch: "main",
      commitSha: TEST_COMMIT_SHA,
    }),
    /Resolved CodeRepositoryBranch must be an object/u,
  );
});

test("backend API rejects a Git-context response for another commit", async () => {
  const api = createCodeRepositorySyncApi({
    backendUrl: "https://platform.example",
    accessToken: "secret-access-token",
    fetchImpl: async () =>
      jsonResponse({
        canonical_repository_identity: TEST_REPOSITORY_IDENTITY,
        repository_branch: "main",
        repository_ref: "refs/heads/main",
        commit_sha: "b".repeat(40),
        code_repository_branch: {
          uid: "main-uid",
          code_repository_uid: "code-repository-uid-123",
          repository_branch: "main",
        },
      }),
  });

  await assert.rejects(
    api.resolveGitContext({
      repositoryIdentity: TEST_REPOSITORY_IDENTITY,
      repositoryBranch: "main",
      commitSha: TEST_COMMIT_SHA,
    }),
    /returned another Git commit/u,
  );
});

test("backend API rejects a tag response for another version", async () => {
  const api = createCodeRepositorySyncApi({
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
      "code-repository",
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

test("CLI forwards --path to CodeRepository preflight", () => {
  const missingCodeRepository = join(
    tmpdir(),
    `command-center-sdk-missing-code-repository-${process.pid}`,
  );
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "code-repository",
      "sync",
      "Terminology audit",
      "--path",
      missingCodeRepository,
      "--dry-run",
      "--json",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.stage, "resolve-code-repository-directory");
  assert.match(payload.error, /Code repository directory does not exist/u);
  assert.equal(payload.codeRepositoryDir, null);
});

test("local preflight rejects missing package-lock.json", async () => {
  const codeRepositoryDir = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-lock-"));
  try {
    await mkdir(join(codeRepositoryDir, ".git"), { recursive: true });
    await writeFile(join(codeRepositoryDir, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
    const localOps = createCodeRepositorySyncLocalOps();
    await assert.rejects(localOps.inspectCodeRepository(codeRepositoryDir), /requires .*package-lock\.json/u);
    assert.equal(JSON.parse(await readFile(join(codeRepositoryDir, "package.json"), "utf8")).version, "1.2.3");
  } finally {
    await rm(codeRepositoryDir, { recursive: true, force: true });
  }
});

test("local preflight accepts a repository-root Vite application", async () => {
  const codeRepositoryDir = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-root-"));
  try {
    await writeFile(join(codeRepositoryDir, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
    await writeFile(join(codeRepositoryDir, "package-lock.json"), "{}\n", "utf8");
    const initialized = spawnSync("git", ["init", "-b", "main"], {
      cwd: codeRepositoryDir,
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0, initialized.stderr);
    const remote = spawnSync(
      "git",
      ["remote", "add", "origin", "git@github.com:organization/project.git"],
      { cwd: codeRepositoryDir, encoding: "utf8" },
    );
    assert.equal(remote.status, 0, remote.stderr);
    const staged = spawnSync("git", ["add", "package.json", "package-lock.json"], {
      cwd: codeRepositoryDir,
      encoding: "utf8",
    });
    assert.equal(staged.status, 0, staged.stderr);
    const committed = spawnSync(
      "git",
      [
        "-c",
        "user.name=Command Center SDK Test",
        "-c",
        "user.email=command-center-sdk@example.invalid",
        "commit",
        "-m",
        "Initial project",
      ],
      { cwd: codeRepositoryDir, encoding: "utf8" },
    );
    assert.equal(committed.status, 0, committed.stderr);
    const head = spawnSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: codeRepositoryDir,
      encoding: "utf8",
    });
    assert.equal(head.status, 0, head.stderr);

    const localOps = createCodeRepositorySyncLocalOps();
    assert.deepEqual(await localOps.inspectCodeRepository(codeRepositoryDir), {
      currentVersion: "1.2.3",
      canonicalRepositoryIdentity: TEST_REPOSITORY_IDENTITY,
      gitBranch: "main",
      repositoryRef: "refs/heads/main",
      commitSha: head.stdout.trim(),
      origin: "git@github.com:organization/project.git",
    });
  } finally {
    await rm(codeRepositoryDir, { recursive: true, force: true });
  }
});

test("local preflight rejects a Vite application below the Git repository root", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-root-"));
  const codeRepositoryDir = join(repositoryRoot, "frontend");
  try {
    await mkdir(codeRepositoryDir, { recursive: true });
    await writeFile(join(codeRepositoryDir, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
    await writeFile(join(codeRepositoryDir, "package-lock.json"), "{}\n", "utf8");
    const initialized = spawnSync("git", ["init"], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);

    const localOps = createCodeRepositorySyncLocalOps();
    await assert.rejects(
      localOps.inspectCodeRepository(codeRepositoryDir),
      /requires the Vite application at the Git repository root/u,
    );
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test("repository-key preflight never overwrites an existing private key", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-key-"));
  const sshDirectory = join(homeDirectory, ".ssh");
  const keyName = "mainsequence-project-0b359d1a1ee13a62";
  try {
    await mkdir(sshDirectory, { recursive: true });
    await writeFile(join(sshDirectory, keyName), "existing private key", "utf8");
    const localOps = createCodeRepositorySyncLocalOps({
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
  const homeDirectory = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-key-"));
  try {
    const localOps = createCodeRepositorySyncLocalOps({
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
  const homeDirectory = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-key-"));
  const generatedPaths = [];
  const sshDirectory = join(homeDirectory, ".ssh");
  try {
    await mkdir(sshDirectory, { recursive: true });
    await writeFile(join(sshDirectory, "app"), "unrelated legacy key", "utf8");
    const localOps = createCodeRepositorySyncLocalOps({
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
  const localOps = createCodeRepositorySyncLocalOps();
  await assert.rejects(
    localOps.ensureRepositoryKey("https://github.com/organization/project.git"),
    /must use SSH/u,
  );
});

test("Git push preflight uses the forced identity without mutating the remote", () => {
  const calls = [];
  const localOps = createCodeRepositorySyncLocalOps({
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

test("remote tag preflight queries the exact tag ref with the forced identity", () => {
  const calls = [];
  const env = { GIT_SSH_COMMAND: 'ssh -i "/keys/project" -o IdentitiesOnly=yes' };
  const localOps = createCodeRepositorySyncLocalOps({
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 2, stdout: "", stderr: "" };
    },
  });

  localOps.validateRemoteGitTag("/project", "v1.2.4-feature.1", env);

  assert.deepEqual(calls, [
    {
      command: "git",
      args: [
        "ls-remote",
        "--exit-code",
        "--refs",
        "--tags",
        "origin",
        "refs/tags/v1.2.4-feature.1",
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

test("remote tag preflight distinguishes a collision from a transport failure", () => {
  for (const [status, stderr, expected] of [
    [0, "", /already exists remotely/u],
    [1, "Permission denied", /Permission denied/u],
  ]) {
    const localOps = createCodeRepositorySyncLocalOps({
      spawnSyncImpl() {
        return { status, stdout: "", stderr };
      },
    });
    assert.throws(
      () => localOps.validateRemoteGitTag("/project", "v1.2.4", {}),
      expected,
    );
  }
});
