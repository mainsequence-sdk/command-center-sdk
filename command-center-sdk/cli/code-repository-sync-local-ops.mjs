import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export class CodeRepositorySyncLocalError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "CodeRepositorySyncLocalError";
  }
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function resultText(result) {
  return String(result?.stderr || result?.stdout || "").trim();
}

function runSpawn(spawnSyncImpl, command, args, { cwd, env, quiet = true } = {}) {
  const result = spawnSyncImpl(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.error) {
    throw new CodeRepositorySyncLocalError(
      `Could not run ${commandText(command, args)}: ${result.error.message}`,
      { cause: result.error },
    );
  }
  if (result.status !== 0) {
    const detail = resultText(result);
    throw new CodeRepositorySyncLocalError(
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

/**
 * The nearest directory at or above `directory` that holds a `.git` entry: a folder in a clone, a
 * file in a linked worktree or a submodule. Found on the file system, so the sync runs no Git
 * command.
 */
async function findGitRepositoryRoot(directory) {
  let candidate = directory;
  for (;;) {
    if (await pathExists(join(candidate, ".git"))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

export function createCodeRepositorySyncLocalOps({
  spawnSyncImpl = spawnSync,
  processEnv = process.env,
} = {}) {
  return {
    async resolveCodeRepositoryDir(path) {
      const codeRepositoryDir = resolve(path || process.cwd());
      let codeRepositoryStat;
      try {
        codeRepositoryStat = await stat(codeRepositoryDir);
      } catch (error) {
        throw new CodeRepositorySyncLocalError(`Code repository directory does not exist: ${codeRepositoryDir}`, {
          cause: error,
        });
      }
      if (!codeRepositoryStat.isDirectory()) {
        throw new CodeRepositorySyncLocalError(`Code repository path is not a directory: ${codeRepositoryDir}`);
      }
      return codeRepositoryDir;
    },

    async inspectCodeRepository(codeRepositoryDir) {
      const manifestPath = join(codeRepositoryDir, "package.json");
      const lockPath = join(codeRepositoryDir, "package-lock.json");
      try {
        JSON.parse(await readFile(manifestPath, "utf8"));
      } catch (error) {
        throw new CodeRepositorySyncLocalError(`Could not read a valid ${manifestPath}: ${error.message}`, {
          cause: error,
        });
      }
      if (!(await pathExists(lockPath))) {
        throw new CodeRepositorySyncLocalError(`CodeRepository sync requires ${lockPath}.`);
      }
      const canonicalCodeRepositoryDir = await realpath(codeRepositoryDir);
      const repositoryRoot = await findGitRepositoryRoot(canonicalCodeRepositoryDir);
      if (!repositoryRoot) {
        throw new CodeRepositorySyncLocalError(
          `Command Center code-repository sync requires the Vite application at the Git repository root; ${codeRepositoryDir} is not inside a Git repository.`,
        );
      }
      if (repositoryRoot !== canonicalCodeRepositoryDir) {
        throw new CodeRepositorySyncLocalError(
          `Command Center code-repository sync requires the Vite application at the Git repository root (${repositoryRoot}); received nested code repository directory ${codeRepositoryDir}.`,
        );
      }
      return { repositoryRoot };
    },

    runCommand(command, args, { cwd, env = processEnv, quiet = false } = {}) {
      runSpawn(spawnSyncImpl, command, args, { cwd, env, quiet });
    },
  };
}

export const codeRepositorySyncLocalOps = createCodeRepositorySyncLocalOps();
