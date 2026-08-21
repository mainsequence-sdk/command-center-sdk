import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export class ProjectSyncLocalError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ProjectSyncLocalError";
  }
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function resultText(result) {
  return String(result?.stderr || result?.stdout || "").trim();
}

function runSpawn(spawnSyncImpl, command, args, { cwd, env, quiet = true, allowFailure = false } = {}) {
  const result = spawnSyncImpl(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.error) {
    throw new ProjectSyncLocalError(
      `Could not run ${commandText(command, args)}: ${result.error.message}`,
      { cause: result.error },
    );
  }
  if (!allowFailure && result.status !== 0) {
    const detail = resultText(result);
    throw new ProjectSyncLocalError(
      `${commandText(command, args)} failed with status ${result.status ?? "unknown"}${detail ? `: ${detail}` : "."}`,
    );
  }
  return result;
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function sanitizeCommitMessage(message) {
  const normalized = String(message || "")
    .replace(/[\r\n]/gu, " ")
    .replaceAll('"', "'")
    .trim();
  if (!normalized) throw new ProjectSyncLocalError("Commit message is required.");
  return normalized;
}

export function createProjectSyncLocalOps({
  spawnSyncImpl = spawnSync,
  processEnv = process.env,
  homeDirectory = homedir(),
} = {}) {
  function capture(command, args, cwd, env = processEnv) {
    return String(
      runSpawn(spawnSyncImpl, command, args, { cwd, env, quiet: true }).stdout || "",
    ).trim();
  }

  return {
    async resolveProjectDir(path) {
      const projectDir = resolve(path || process.cwd());
      let projectStat;
      try {
        projectStat = await stat(projectDir);
      } catch (error) {
        throw new ProjectSyncLocalError(`Project directory does not exist: ${projectDir}`, {
          cause: error,
        });
      }
      if (!projectStat.isDirectory()) {
        throw new ProjectSyncLocalError(`Project path is not a directory: ${projectDir}`);
      }
      return projectDir;
    },

    async readProjectUid(projectDir) {
      const envPath = join(projectDir, ".env");
      let source;
      try {
        source = await readFile(envPath, "utf8");
      } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw new ProjectSyncLocalError(`Could not read ${envPath}: ${error.message}`, {
          cause: error,
        });
      }
      for (const line of source.split(/\r?\n/u)) {
        const match = line.match(/^\s*(?:export\s+)?MAIN_SEQUENCE_PROJECT_UID\s*=\s*(.*?)\s*$/u);
        if (match) return parseEnvValue(match[1]) || null;
      }
      return null;
    },

    async inspectProject(projectDir) {
      const manifestPath = join(projectDir, "package.json");
      const lockPath = join(projectDir, "package-lock.json");
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      } catch (error) {
        throw new ProjectSyncLocalError(`Could not read a valid ${manifestPath}: ${error.message}`, {
          cause: error,
        });
      }
      if (typeof manifest.version !== "string" || !SEMVER_PATTERN.test(manifest.version)) {
        throw new ProjectSyncLocalError(`${manifestPath} must declare a semantic version.`);
      }
      if (!(await pathExists(lockPath))) {
        throw new ProjectSyncLocalError(`Project sync requires ${lockPath}.`);
      }
      capture("npm", ["--version"], projectDir);
      const gitBranch = capture("git", ["branch", "--show-current"], projectDir);
      if (!gitBranch) {
        throw new ProjectSyncLocalError("Current Git checkout is detached or has no named branch.");
      }
      const origin = capture("git", ["remote", "get-url", "origin"], projectDir);
      if (!origin) throw new ProjectSyncLocalError('Could not find Git remote "origin".');
      return { currentVersion: manifest.version, gitBranch, origin };
    },

    async readPackageVersion(projectDir) {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(join(projectDir, "package.json"), "utf8"));
      } catch (error) {
        throw new ProjectSyncLocalError(`Could not read the updated package.json: ${error.message}`, {
          cause: error,
        });
      }
      if (typeof manifest.version !== "string" || !SEMVER_PATTERN.test(manifest.version)) {
        throw new ProjectSyncLocalError("npm version did not produce a semantic project version.");
      }
      return manifest.version;
    },

    async ensureRepositoryKey(origin, { quiet = true } = {}) {
      const repositoryName = origin
        .replace(/[?#].*$/u, "")
        .split("/")
        .at(-1)
        .replace(/\.git$/iu, "")
        .replace(/[^A-Za-z0-9._-]+/gu, "-") || "project";
      const sshDirectory = join(homeDirectory, ".ssh");
      const keyPath = join(sshDirectory, repositoryName);
      const publicKeyPath = `${keyPath}.pub`;
      await mkdir(sshDirectory, { recursive: true, mode: 0o700 });
      if (!(await pathExists(keyPath))) {
        runSpawn(
          spawnSyncImpl,
          "ssh-keygen",
          ["-t", "ed25519", "-C", "mainsequence@main-sequence.io", "-f", keyPath, "-N", ""],
          { env: processEnv, quiet },
        );
      }
      if (!(await pathExists(keyPath))) {
        throw new ProjectSyncLocalError(`Repository SSH key was not created: ${keyPath}`);
      }
      if (!(await pathExists(publicKeyPath))) {
        throw new ProjectSyncLocalError(`Repository SSH public key is missing: ${publicKeyPath}`);
      }
      return keyPath;
    },

    gitEnvironment(keyPath) {
      const escapedKeyPath = keyPath.replaceAll('"', '\\"');
      return {
        ...processEnv,
        GIT_SSH_COMMAND: `ssh -i "${escapedKeyPath}" -o IdentitiesOnly=yes`,
      };
    },

    validateGitTag(projectDir, tagName, env) {
      runSpawn(
        spawnSyncImpl,
        "git",
        ["check-ref-format", `refs/tags/${tagName}`],
        { cwd: projectDir, env, quiet: true },
      );
      const existing = runSpawn(
        spawnSyncImpl,
        "git",
        ["show-ref", "--verify", "--quiet", `refs/tags/${tagName}`],
        { cwd: projectDir, env, quiet: true, allowFailure: true },
      );
      if (existing.status === 0) {
        throw new ProjectSyncLocalError(`Git tag already exists locally: ${tagName}`);
      }
      if (existing.status !== 1) {
        throw new ProjectSyncLocalError(`Could not check whether Git tag already exists: ${tagName}`);
      }
    },

    runCommand(command, args, { cwd, env = processEnv, quiet = false } = {}) {
      runSpawn(spawnSyncImpl, command, args, { cwd, env, quiet });
    },
  };
}

export const projectSyncLocalOps = createProjectSyncLocalOps();
