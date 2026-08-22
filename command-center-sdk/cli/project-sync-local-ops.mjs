import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SUPPORTED_GIT_ORIGIN_SCHEMES = new Set(["git", "git+ssh", "http", "https", "ssh"]);
const SSH_GIT_ORIGIN_SCHEMES = new Set(["git+ssh", "ssh"]);
const DEFAULT_GIT_ORIGIN_PORTS = new Map([
  ["http", "80"],
  ["https", "443"],
  ["ssh", "22"],
  ["git+ssh", "22"],
]);
const SCP_GIT_ORIGIN_PATTERN = /^(?:[^@/\s]+@)?(?<host>[^:/\s]+):(?<path>.+)$/u;

export class ProjectSyncLocalError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ProjectSyncLocalError";
  }
}

function cleanGitRepositoryPath(value) {
  if (value.includes("\\")) {
    throw new ProjectSyncLocalError("Git origin repository paths must use forward slashes.");
  }
  let path = value.replace(/\/{2,}/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (path.toLowerCase().endsWith(".git")) path = path.slice(0, -4);
  path = path.replace(/\/+$/gu, "");
  if (!path) throw new ProjectSyncLocalError("Git origin must include a repository path.");
  return path;
}

export function repositorySshKeyIdentity(origin) {
  const candidate = String(origin || "").trim().replace(/[?#].*$/u, "");
  if (!candidate) throw new ProjectSyncLocalError("Git origin must be non-empty.");
  if (/[\r\n]/u.test(candidate)) {
    throw new ProjectSyncLocalError("Git origin must contain one non-empty line.");
  }

  const schemeMatch = candidate.match(/^(?<scheme>[A-Za-z][A-Za-z0-9+.-]*):\/\//u);
  if (schemeMatch) {
    const scheme = schemeMatch.groups.scheme.toLowerCase();
    if (!SUPPORTED_GIT_ORIGIN_SCHEMES.has(scheme)) {
      throw new ProjectSyncLocalError(`Unsupported Git origin scheme: ${scheme}.`);
    }
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch (error) {
      throw new ProjectSyncLocalError(`Invalid Git origin: ${origin}.`, { cause: error });
    }
    const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
    if (!host) throw new ProjectSyncLocalError("Git origin must include a hostname.");
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
    throw new ProjectSyncLocalError(
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
    throw new ProjectSyncLocalError(
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
  hostName = hostname(),
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
      const repositoryRoot = resolve(
        capture("git", ["rev-parse", "--show-toplevel"], projectDir),
      );
      const [canonicalProjectDir, canonicalRepositoryRoot] = await Promise.all([
        realpath(projectDir),
        realpath(repositoryRoot),
      ]);
      if (canonicalRepositoryRoot !== canonicalProjectDir) {
        throw new ProjectSyncLocalError(
          `Command Center project sync requires the Vite application at the Git repository root (${repositoryRoot}); received nested project directory ${projectDir}.`,
        );
      }
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
        throw new ProjectSyncLocalError(
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
        throw new ProjectSyncLocalError(`Repository SSH key was not created: ${keyPath}`);
      }
      if (!(await pathExists(publicKeyPath))) {
        throw new ProjectSyncLocalError(`Repository SSH public key is missing: ${publicKeyPath}`);
      }
      let publicKey;
      try {
        publicKey = (await readFile(publicKeyPath, "utf8")).trim();
      } catch (error) {
        throw new ProjectSyncLocalError(
          `Could not read repository SSH public key ${publicKeyPath}: ${error.message}`,
          { cause: error },
        );
      }
      if (!publicKey || /[\r\n]/u.test(publicKey)) {
        throw new ProjectSyncLocalError(
          `Repository SSH public key must contain one non-empty line: ${publicKeyPath}`,
        );
      }
      const keyTitle = String(hostName || "").trim();
      if (!keyTitle || /[\r\n]/u.test(keyTitle)) {
        throw new ProjectSyncLocalError("Local hostname must contain one non-empty line.");
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

    verifyGitPush(projectDir, gitBranch, env, { quiet = true } = {}) {
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
        { cwd: projectDir, env, quiet },
      );
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
