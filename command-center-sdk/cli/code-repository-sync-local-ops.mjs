import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const CANONICAL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const NPM_PATCH_VERSION_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?<prerelease>-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SUPPORTED_GIT_ORIGIN_SCHEMES = new Set(["git", "git+ssh", "http", "https", "ssh"]);
const SSH_GIT_ORIGIN_SCHEMES = new Set(["git+ssh", "ssh"]);
const DEFAULT_GIT_ORIGIN_PORTS = new Map([
  ["http", "80"],
  ["https", "443"],
  ["ssh", "22"],
  ["git+ssh", "22"],
]);
const SCP_GIT_ORIGIN_PATTERN = /^(?:[^@/\s]+@)?(?<host>[^:/\s]+):(?<path>.+)$/u;

export class CodeRepositorySyncLocalError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "CodeRepositorySyncLocalError";
  }
}

function cleanGitRepositoryPath(value) {
  if (value.includes("\\")) {
    throw new CodeRepositorySyncLocalError("Git origin repository paths must use forward slashes.");
  }
  let path = value.replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (path.toLowerCase().endsWith(".git")) path = path.slice(0, -4);
  path = path.replace(/\/+$/gu, "");
  if (!path) throw new CodeRepositorySyncLocalError("Git origin must include a repository path.");
  return path;
}

export function repositorySshKeyIdentity(origin) {
  const candidate = String(origin || "").trim().replace(/[?#].*$/u, "");
  if (!candidate) throw new CodeRepositorySyncLocalError("Git origin must be non-empty.");
  if (/[\r\n]/u.test(candidate)) {
    throw new CodeRepositorySyncLocalError("Git origin must contain one non-empty line.");
  }

  const schemeMatch = candidate.match(/^(?<scheme>[A-Za-z][A-Za-z0-9+.-]*):\/\//u);
  if (schemeMatch) {
    const scheme = schemeMatch.groups.scheme.toLowerCase();
    if (!SUPPORTED_GIT_ORIGIN_SCHEMES.has(scheme)) {
      throw new CodeRepositorySyncLocalError(`Unsupported Git origin scheme: ${scheme}.`);
    }
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch (error) {
      throw new CodeRepositorySyncLocalError(`Invalid Git origin: ${origin}.`, { cause: error });
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
    if (!host) throw new CodeRepositorySyncLocalError("Git origin must include a hostname.");
    const path = cleanGitRepositoryPath(parsed.pathname);
    const port = parsed.port;
    const defaultPort = DEFAULT_GIT_ORIGIN_PORTS.get(scheme);
    const hostIdentity = !port || port === defaultPort ? host : `${host}:${port}`;
    return {
      identity: `${hostIdentity}/${path}`,
      usesSsh: SSH_GIT_ORIGIN_SCHEMES.has(scheme),
    };
  }

  const scpMatch = candidate.match(SCP_GIT_ORIGIN_PATTERN);
  if (!scpMatch) {
    throw new CodeRepositorySyncLocalError(
      "Git origin must be an SSH, Git, HTTP, or HTTPS repository URL.",
    );
  }
  const host = scpMatch.groups.host.toLowerCase().replace(/\.$/u, "");
  const path = cleanGitRepositoryPath(scpMatch.groups.path);
  return { identity: `${host}/${path}`, usesSsh: true };
}

export function repositorySshKeyName(origin) {
  const { identity } = repositorySshKeyIdentity(origin);
  const repositoryName = identity.split("/").at(-1);
  const slug =
    repositoryName
      .replace(/[^A-Za-z0-9._-]+/gu, "-")
      .replace(/^[._-]+|[._-]+$/gu, "")
      .toLowerCase()
      .slice(0, 48)
      .replace(/[._-]+$/gu, "") || "repository";
  const digest = createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 16);
  return `mainsequence-${slug}-${digest}`;
}

export function requireSshGitOrigin(origin) {
  const result = repositorySshKeyIdentity(origin);
  if (!result.usesSsh) {
    throw new CodeRepositorySyncLocalError(
      "Git origin must use SSH before a repository deploy key can be selected.",
    );
  }
  return result.identity;
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
    throw new CodeRepositorySyncLocalError(
      `Could not run ${commandText(command, args)}: ${result.error.message}`,
      { cause: result.error },
    );
  }
  if (!allowFailure && result.status !== 0) {
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

export function sanitizeCommitMessage(message) {
  const normalized = String(message || "")
    .replace(/[\r\n]/gu, " ")
    .replaceAll('"', "'")
    .trim();
  if (!normalized) throw new CodeRepositorySyncLocalError("Commit message is required.");
  return normalized;
}

export function nextNpmPatchVersion(version) {
  const match = String(version || "").match(NPM_PATCH_VERSION_PATTERN);
  if (!match) {
    throw new CodeRepositorySyncLocalError(`Cannot calculate npm patch version from: ${version}`);
  }
  const { major, minor, patch, prerelease } = match.groups;
  return prerelease
    ? `${major}.${minor}.${patch}`
    : `${major}.${minor}.${BigInt(patch) + 1n}`;
}

export function createCodeRepositorySyncLocalOps({
  spawnSyncImpl = spawnSync,
  processEnv = process.env,
  homeDirectory = homedir(),
  hostName = hostname(),
} = {}) {
  function capture(command, args, cwd, env = processEnv) {
    return String(
      runSpawn(spawnSyncImpl, command, args, { cwd, env, quiet: true }).stdout || "",
    ).trim();
  }

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
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      } catch (error) {
        throw new CodeRepositorySyncLocalError(`Could not read a valid ${manifestPath}: ${error.message}`, {
          cause: error,
        });
      }
      if (typeof manifest.version !== "string" || !SEMVER_PATTERN.test(manifest.version)) {
        throw new CodeRepositorySyncLocalError(`${manifestPath} must declare a semantic version.`);
      }
      if (!(await pathExists(lockPath))) {
        throw new CodeRepositorySyncLocalError(`CodeRepository sync requires ${lockPath}.`);
      }
      capture("npm", ["--version"], codeRepositoryDir);
      const repositoryRoot = resolve(
        capture("git", ["rev-parse", "--show-toplevel"], codeRepositoryDir),
      );
      const [canonicalCodeRepositoryDir, canonicalRepositoryRoot] = await Promise.all([
        realpath(codeRepositoryDir),
        realpath(repositoryRoot),
      ]);
      if (canonicalRepositoryRoot !== canonicalCodeRepositoryDir) {
        throw new CodeRepositorySyncLocalError(
          `Command Center code-repository sync requires the Vite application at the Git repository root (${repositoryRoot}); received nested code repository directory ${codeRepositoryDir}.`,
        );
      }
      const gitBranch = capture("git", ["branch", "--show-current"], codeRepositoryDir);
      if (!gitBranch) {
        throw new CodeRepositorySyncLocalError("Current Git checkout is detached or has no named branch.");
      }
      const repositoryRef = capture("git", ["symbolic-ref", "--quiet", "HEAD"], codeRepositoryDir);
      if (repositoryRef !== `refs/heads/${gitBranch}`) {
        throw new CodeRepositorySyncLocalError(
          `Git branch ${JSON.stringify(gitBranch)} does not match attached ref ${JSON.stringify(repositoryRef)}.`,
        );
      }
      const commitSha = capture("git", ["rev-parse", "--verify", "HEAD^{commit}"], codeRepositoryDir)
        .toLowerCase();
      if (!CANONICAL_COMMIT_SHA_PATTERN.test(commitSha)) {
        throw new CodeRepositorySyncLocalError("Git HEAD is not a canonical full commit SHA.");
      }
      const origin = capture("git", ["remote", "get-url", "origin"], codeRepositoryDir);
      if (!origin) throw new CodeRepositorySyncLocalError('Could not find Git remote "origin".');
      const canonicalRepositoryIdentity = repositorySshKeyIdentity(origin).identity;
      return {
        currentVersion: manifest.version,
        canonicalRepositoryIdentity,
        gitBranch,
        repositoryRef,
        commitSha,
        origin,
      };
    },

    async readPackageVersion(codeRepositoryDir) {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(join(codeRepositoryDir, "package.json"), "utf8"));
      } catch (error) {
        throw new CodeRepositorySyncLocalError(`Could not read the updated package.json: ${error.message}`, {
          cause: error,
        });
      }
      if (typeof manifest.version !== "string" || !SEMVER_PATTERN.test(manifest.version)) {
        throw new CodeRepositorySyncLocalError("npm version did not produce a semantic code repository version.");
      }
      return manifest.version;
    },

    async ensureRepositoryKey(origin, { quiet = true } = {}) {
      requireSshGitOrigin(origin);
      const repositoryName = repositorySshKeyName(origin);
      const sshDirectory = join(homeDirectory, ".ssh");
      const keyPath = join(sshDirectory, repositoryName);
      const publicKeyPath = `${keyPath}.pub`;
      await mkdir(sshDirectory, { recursive: true, mode: 0o700 });
      const [privateKeyExists, publicKeyExists] = await Promise.all([
        pathExists(keyPath),
        pathExists(publicKeyPath),
      ]);
      if (privateKeyExists !== publicKeyExists) {
        throw new CodeRepositorySyncLocalError(
          privateKeyExists
            ? `Repository SSH public key is missing: ${publicKeyPath}`
            : `Repository SSH private key is missing: ${keyPath}`,
        );
      }
      const created = !privateKeyExists;
      if (created) {
        runSpawn(
          spawnSyncImpl,
          "ssh-keygen",
          ["-t", "ed25519", "-C", "mainsequence@main-sequence.io", "-f", keyPath, "-N", ""],
          { env: processEnv, quiet },
        );
      }
      if (!(await pathExists(keyPath))) {
        throw new CodeRepositorySyncLocalError(`Repository SSH key was not created: ${keyPath}`);
      }
      if (!(await pathExists(publicKeyPath))) {
        throw new CodeRepositorySyncLocalError(`Repository SSH public key is missing: ${publicKeyPath}`);
      }
      let publicKey;
      try {
        publicKey = (await readFile(publicKeyPath, "utf8")).trim();
      } catch (error) {
        throw new CodeRepositorySyncLocalError(
          `Could not read repository SSH public key ${publicKeyPath}: ${error.message}`,
          { cause: error },
        );
      }
      if (!publicKey || /[\r\n]/u.test(publicKey)) {
        throw new CodeRepositorySyncLocalError(
          `Repository SSH public key must contain one non-empty line: ${publicKeyPath}`,
        );
      }
      const keyTitle = String(hostName || "").trim();
      if (!keyTitle || /[\r\n]/u.test(keyTitle)) {
        throw new CodeRepositorySyncLocalError("Local hostname must contain one non-empty line.");
      }
      return { created, keyPath, keyTitle, publicKey };
    },

    gitEnvironment(keyPath) {
      const escapedKeyPath = keyPath.replaceAll('"', '\\"');
      return {
        ...processEnv,
        GIT_SSH_COMMAND: `ssh -i "${escapedKeyPath}" -o IdentitiesOnly=yes`,
      };
    },

    verifyGitPush(codeRepositoryDir, gitBranch, env, { quiet = true } = {}) {
      runSpawn(
        spawnSyncImpl,
        "git",
        [
          "push",
          "--dry-run",
          "--follow-tags",
          "origin",
          `HEAD:refs/heads/${gitBranch}`,
        ],
        { cwd: codeRepositoryDir, env, quiet },
      );
    },

    validateGitTag(codeRepositoryDir, tagName, env = processEnv) {
      runSpawn(
        spawnSyncImpl,
        "git",
        ["check-ref-format", `refs/tags/${tagName}`],
        { cwd: codeRepositoryDir, env, quiet: true },
      );
      const existing = runSpawn(
        spawnSyncImpl,
        "git",
        ["show-ref", "--verify", "--quiet", `refs/tags/${tagName}`],
        { cwd: codeRepositoryDir, env, quiet: true, allowFailure: true },
      );
      if (existing.status === 0) {
        throw new CodeRepositorySyncLocalError(`Git tag already exists locally: ${tagName}`);
      }
      if (existing.status !== 1) {
        throw new CodeRepositorySyncLocalError(`Could not check whether Git tag already exists: ${tagName}`);
      }
    },

    validateRemoteGitTag(codeRepositoryDir, tagName, env) {
      const remoteRef = `refs/tags/${tagName}`;
      const existing = runSpawn(
        spawnSyncImpl,
        "git",
        ["ls-remote", "--exit-code", "--refs", "--tags", "origin", remoteRef],
        { cwd: codeRepositoryDir, env, quiet: true, allowFailure: true },
      );
      if (existing.status === 0) {
        throw new CodeRepositorySyncLocalError(`Git tag already exists remotely: ${tagName}`);
      }
      if (existing.status !== 2) {
        const detail = resultText(existing);
        throw new CodeRepositorySyncLocalError(
          `Could not check whether Git tag exists remotely: ${tagName}${detail ? `: ${detail}` : "."}`,
        );
      }
    },

    runCommand(command, args, { cwd, env = processEnv, quiet = false } = {}) {
      runSpawn(spawnSyncImpl, command, args, { cwd, env, quiet });
    },
  };
}

export const codeRepositorySyncLocalOps = createCodeRepositorySyncLocalOps();
