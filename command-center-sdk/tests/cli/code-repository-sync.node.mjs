import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { access, chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createCodeRepositorySyncLocalOps } from "../../cli/code-repository-sync-local-ops.mjs";
import { CodeRepositorySyncError, syncCodeRepository } from "../../cli/code-repository-sync.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");
const DEPENDENCY_COMMANDS = [
  ["npm", ["install", "--package-lock-only"]],
  ["npm", ["ci"]],
];
const ALL_STAGES = [
  "resolve-code-repository-directory",
  "inspect-code-repository",
  "update-lockfile",
  "install-lockfile",
];

async function applicationAtRepositoryRoot(prefix = "command-center-code-repository-sync-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, ".git"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "application", version: "1.2.3" }), "utf8");
  await writeFile(join(root, "package-lock.json"), "{}\n", "utf8");
  return root;
}

/** Records every program the sync starts; `failing` names the arguments that exit 1. */
function recordingSpawn(calls, { failing } = {}) {
  return (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, stdio: options.stdio });
    if (failing && failing.join(" ") === args.join(" ")) {
      return { status: 1, stdout: "", stderr: "npm error code ERESOLVE" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
}

/** Runs `operation` with a fetch that records and refuses every request. */
async function withoutBackend(operation) {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (...args) => {
    requests.push(args);
    throw new Error("code-repository sync must not send a request");
  };
  try {
    await operation();
  } finally {
    globalThis.fetch = original;
  }
  return requests;
}

test("sync runs exactly the lockfile refresh and npm ci in the repository root", async () => {
  const root = await applicationAtRepositoryRoot();
  try {
    const calls = [];
    let result;
    const requests = await withoutBackend(async () => {
      result = await syncCodeRepository({
        codeRepositoryDir: root,
        localOps: createCodeRepositorySyncLocalOps({ spawnSyncImpl: recordingSpawn(calls) }),
      });
    });

    assert.deepEqual(
      calls.map(({ command, args, cwd }) => [command, args, cwd]),
      DEPENDENCY_COMMANDS.map(([command, args]) => [command, args, root]),
    );
    // npm writes to the terminal when the output is not JSON.
    assert.deepEqual(calls.map(({ stdio }) => stdio), ["inherit", "inherit"]);
    assert.deepEqual(requests, []);
    assert.deepEqual(result, {
      command: "command-center-sdk code-repository sync",
      codeRepositoryDir: root,
      commands: ["npm install --package-lock-only", "npm ci"],
      completed: ALL_STAGES,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("quiet sync keeps npm output off standard output for --json", async () => {
  const root = await applicationAtRepositoryRoot();
  try {
    const calls = [];
    await syncCodeRepository({
      codeRepositoryDir: root,
      quiet: true,
      localOps: createCodeRepositorySyncLocalOps({ spawnSyncImpl: recordingSpawn(calls) }),
    });
    assert.deepEqual(calls.map(({ stdio }) => stdio), ["pipe", "pipe"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed lockfile refresh stops before npm ci and names the stage", async () => {
  const root = await applicationAtRepositoryRoot();
  try {
    const calls = [];
    await assert.rejects(
      syncCodeRepository({
        codeRepositoryDir: root,
        localOps: createCodeRepositorySyncLocalOps({
          spawnSyncImpl: recordingSpawn(calls, { failing: ["install", "--package-lock-only"] }),
        }),
      }),
      (caught) => {
        assert.equal(caught instanceof CodeRepositorySyncError, true);
        assert.equal(caught.stage, "update-lockfile");
        assert.match(caught.message, /npm install --package-lock-only failed with status 1: npm error code ERESOLVE/u);
        assert.deepEqual(caught.toJSON(), {
          error: caught.message,
          stage: "update-lockfile",
          codeRepositoryDir: root,
          completed: ["resolve-code-repository-directory", "inspect-code-repository"],
        });
        return true;
      },
    );
    assert.deepEqual(calls.map(({ args }) => args), [["install", "--package-lock-only"]]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an application below the Git repository root stops before npm runs", async () => {
  const root = await applicationAtRepositoryRoot();
  const nested = join(root, "frontend");
  try {
    await mkdir(nested);
    await writeFile(join(nested, "package.json"), "{}\n", "utf8");
    await writeFile(join(nested, "package-lock.json"), "{}\n", "utf8");
    const calls = [];
    await assert.rejects(
      syncCodeRepository({
        codeRepositoryDir: nested,
        localOps: createCodeRepositorySyncLocalOps({ spawnSyncImpl: recordingSpawn(calls) }),
      }),
      (caught) => {
        assert.equal(caught.stage, "inspect-code-repository");
        assert.match(caught.message, /requires the Vite application at the Git repository root/u);
        assert.match(caught.message, /nested code repository directory/u);
        return true;
      },
    );
    assert.deepEqual(calls, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local preflight rejects missing package-lock.json", async () => {
  const root = await applicationAtRepositoryRoot();
  try {
    await rm(join(root, "package-lock.json"));
    const localOps = createCodeRepositorySyncLocalOps({
      spawnSyncImpl: () => assert.fail("no program runs before the preflight passes"),
    });
    await assert.rejects(localOps.inspectCodeRepository(root), /requires .*package-lock\.json/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local preflight accepts the root of a Git clone and of a linked worktree", async () => {
  const clone = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-root-"));
  const worktree = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-worktree-"));
  try {
    for (const root of [clone, worktree]) {
      await writeFile(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }), "utf8");
      await writeFile(join(root, "package-lock.json"), "{}\n", "utf8");
    }
    // The test creates the clone with Git; the sync itself finds `.git` without running Git.
    const initialized = spawnSync("git", ["init", "-b", "main"], { cwd: clone, encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    // A linked worktree or a submodule has a `.git` file instead of a folder.
    await writeFile(join(worktree, ".git"), "gitdir: /elsewhere/.git/worktrees/application\n", "utf8");

    const localOps = createCodeRepositorySyncLocalOps({
      spawnSyncImpl: () => assert.fail("the preflight runs no program"),
    });
    for (const root of [clone, worktree]) {
      assert.deepEqual(await localOps.inspectCodeRepository(root), {
        repositoryRoot: await realpath(root),
      });
    }
  } finally {
    await rm(clone, { recursive: true, force: true });
    await rm(worktree, { recursive: true, force: true });
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

test("CLI forwards --path to the repository preflight", () => {
  const missingCodeRepository = join(
    tmpdir(),
    `command-center-sdk-missing-code-repository-${process.pid}`,
  );
  const result = spawnSync(
    process.execPath,
    [cliPath, "code-repository", "sync", "--path", missingCodeRepository, "--json"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.stage, "resolve-code-repository-directory");
  assert.match(payload.error, /Code repository directory does not exist/u);
  assert.equal(payload.codeRepositoryDir, null);
  assert.deepEqual(payload.completed, []);
});

test("CLI refuses the removed commit, tag, preview, and timeout arguments", () => {
  for (const [args, named] of [
    [["Describe the change"], "a commit message or CodeRepository UID"],
    [["-m", "Describe the change"], "-m"],
    [["--message=Describe the change"], "--message"],
    [["--dry-run"], "--dry-run"],
    [["--timeout-ms", "60000"], "--timeout-ms"],
    [["--timeout-ms=60000"], "--timeout-ms"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [cliPath, "code-repository", "sync", ...args, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, args.join(" "));
    assert.deepEqual(JSON.parse(result.stderr), {
      error: `code-repository sync no longer takes ${named}: it refreshes package-lock.json and runs npm ci, and does not commit, tag, or push. Commit and push the changes yourself.`,
    });
  }
});

test(
  "the CLI runs only npm in the repository root, sends no request, and creates no SSH key",
  { skip: process.platform === "win32" ? "stand-in programs are POSIX shell scripts" : false },
  async () => {
    const root = await applicationAtRepositoryRoot();
    const scratch = await mkdtemp(join(tmpdir(), "command-center-code-repository-sync-cli-"));
    const binDirectory = join(scratch, "bin");
    const home = join(scratch, "home");
    const commandLog = join(scratch, "commands.log");
    const requests = [];
    const server = createServer((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      response.writeHead(500).end();
    });
    try {
      await mkdir(binDirectory);
      await mkdir(home);
      // Stand-ins for every program the sync used to start: each records where and how it ran.
      for (const program of ["npm", "git", "ssh-keygen"]) {
        const path = join(binDirectory, program);
        await writeFile(
          path,
          `#!/bin/sh\nprintf '%s|%s\\n' "$(pwd -P)" "${program} $*" >> "$COMMAND_LOG"\n`,
          "utf8",
        );
        await chmod(path, 0o755);
      }
      await new Promise((listening) => server.listen(0, "127.0.0.1", listening));
      const backend = `http://127.0.0.1:${server.address().port}`;
      const env = {
        PATH: `${binDirectory}${delimiter}${process.env.PATH}`,
        HOME: home,
        COMMAND_LOG: commandLog,
        // A backend and a token are set, so a request, if one were sent, would reach the server.
        MAINSEQUENCE_ENDPOINT: backend,
        MAINSEQUENCE_ACCESS_TOKEN: "test-access-token",
      };

      const human = await execFileAsync(
        process.execPath,
        [cliPath, "code-repository", "sync", "--path", root],
        { env, encoding: "utf8" },
      );
      assert.match(human.stdout, /Synced dependencies in .*: npm install --package-lock-only, then npm ci\./u);
      assert.match(human.stdout, /Nothing was committed, tagged, or pushed\. Commit and push the changed files yourself\./u);

      const json = await execFileAsync(
        process.execPath,
        [cliPath, "code-repository", "sync", "--path", root, "--json"],
        { env, encoding: "utf8" },
      );
      assert.deepEqual(JSON.parse(json.stdout), {
        command: "command-center-sdk code-repository sync",
        codeRepositoryDir: root,
        commands: ["npm install --package-lock-only", "npm ci"],
        completed: ALL_STAGES,
      });

      const canonicalRoot = await realpath(root);
      const ran = (await readFile(commandLog, "utf8")).trim().split("\n");
      const once = DEPENDENCY_COMMANDS.map(([command, args]) => `${canonicalRoot}|${command} ${args.join(" ")}`);
      assert.deepEqual(ran, [...once, ...once]);
      assert.deepEqual(requests, []);
      await assert.rejects(access(join(home, ".ssh")), { code: "ENOENT" });
    } finally {
      await new Promise((closed) => server.close(closed));
      await rm(root, { recursive: true, force: true });
      await rm(scratch, { recursive: true, force: true });
    }
  },
);
