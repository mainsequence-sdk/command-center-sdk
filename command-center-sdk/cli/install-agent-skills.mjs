import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const AGENT_SKILL_NAMESPACE = "command-center";
export const PINNED_FROM_FILENAME = "PINNED_FROM.txt";
export const INSTALL_LOCK_FILENAME = `.${AGENT_SKILL_NAMESPACE}.lock`;
export const PINNED_FROM_SCHEMA = "3";

const LEGACY_FLAT_SKILL_NAMES = [
  "adapt-resource-backend",
  "add-resource-actions",
  "build-resource-detail",
  "build-resource-list",
  "build-resource-picker",
  "choose-command-center-surface",
  "evolve-command-center-contract",
  "extend-command-center-sdk",
  "implement-command-center-contract",
  "integrate-static-site-iframe",
  "theme-command-center-app",
  "use-command-center-sdk",
  "verify-command-center-sdk-change",
];

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const defaultSkillsPath = join(packageRoot, "agent_scaffold", "skills");
const defaultPackageJsonPath = join(packageRoot, "package.json");
const unknownVersions = new Set(["", "unknown", "none", "null"]);

export class AgentSkillInstallBlocked extends Error {
  constructor(message) {
    super(message);
    this.name = "AgentSkillInstallBlocked";
  }
}

async function pathState(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function sameOrInside(path, possibleParent) {
  const pathFromParent = relative(possibleParent, path);
  return (
    pathFromParent === "" ||
    (pathFromParent !== ".." &&
      !pathFromParent.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromParent))
  );
}

function assertNoOverlap(source, destination, sourceLabel, destinationLabel) {
  if (sameOrInside(destination, source) || sameOrInside(source, destination)) {
    throw new AgentSkillInstallBlocked(
      `Blocked: agent skill source and destination overlap (${sourceLabel}=${source}, ${destinationLabel}=${destination}).`,
    );
  }
}

function requireSingleLine(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/u.test(value)) {
    throw new Error(`${label} must be a non-empty single-line string.`);
  }
  return value.trim();
}

function validatePackageMetadata(metadata) {
  const name = requireSingleLine(metadata?.name, "Package name");
  const version = requireSingleLine(metadata?.version, "Package version");
  if (unknownVersions.has(version.toLowerCase())) {
    throw new Error("Package version must resolve to an installed SDK version.");
  }
  return { name, version };
}

export async function readSdkPackageMetadata(packageJsonPath = defaultPackageJsonPath) {
  const raw = await readFile(packageJsonPath, "utf8");
  return validatePackageMetadata(JSON.parse(raw));
}

async function assertSafeSourceTree(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new AgentSkillInstallBlocked(
        `Blocked: packaged agent skills may not contain symbolic links (${entryPath}).`,
      );
    }
    if (entry.isDirectory()) {
      await assertSafeSourceTree(entryPath);
      continue;
    }
    if (!entry.isFile()) {
      throw new AgentSkillInstallBlocked(
        `Blocked: packaged agent skills may contain only directories and regular files (${entryPath}).`,
      );
    }
  }
}

function portablePath(path) {
  return path.split(sep).join("/");
}

function validateRelativeSkillPath(path, label) {
  const candidate = requireSingleLine(path, label);
  if (isAbsolute(candidate)) {
    throw new AgentSkillInstallBlocked(`Blocked: ${label} must be relative (${candidate}).`);
  }
  const segments = candidate.split(/[\\/]/u);
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        segment.startsWith("__"),
    )
  ) {
    throw new AgentSkillInstallBlocked(`Blocked: ${label} is unsafe (${candidate}).`);
  }
  return segments.join(sep);
}

async function readSkillName(skillRoot) {
  const skillFile = join(skillRoot, "SKILL.md");
  const source = await readFile(skillFile, "utf8");
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
  if (!frontmatter) {
    throw new Error(`Packaged skill has invalid YAML frontmatter: ${skillFile}`);
  }
  const nameLines = frontmatter
    .split(/\r?\n/u)
    .map((line) => line.match(/^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/u)?.[1])
    .filter(Boolean);
  if (nameLines.length !== 1) {
    throw new Error(`Packaged skill must declare exactly one kebab-case name: ${skillFile}`);
  }
  return nameLines[0];
}

async function listPackagedSkills(skillsPath) {
  const skillsState = await pathState(skillsPath);
  if (!skillsState?.isDirectory() || skillsState.isSymbolicLink()) {
    throw new Error(`Packaged agent skill directory does not exist: ${skillsPath}`);
  }

  await assertSafeSourceTree(skillsPath);
  const skillRoots = [];
  async function collectSkillRoots(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.startsWith("__")) {
        continue;
      }
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await collectSkillRoots(entryPath);
      } else if (entry.isFile() && entry.name === "SKILL.md") {
        if (directory === skillsPath) {
          throw new Error(`The packaged skill namespace root may not be a skill: ${skillsPath}`);
        }
        skillRoots.push(directory);
      }
    }
  }
  await collectSkillRoots(skillsPath);
  const orderedRoots = [...skillRoots].sort((left, right) => left.length - right.length);
  for (let index = 0; index < orderedRoots.length; index += 1) {
    for (let nestedIndex = index + 1; nestedIndex < orderedRoots.length; nestedIndex += 1) {
      if (sameOrInside(orderedRoots[nestedIndex], orderedRoots[index])) {
        throw new Error(
          `Packaged skills may not be nested inside another skill (${orderedRoots[index]} contains ${orderedRoots[nestedIndex]}).`,
        );
      }
    }
  }

  const skills = [];
  const names = new Set();
  for (const source of skillRoots) {
    const relativePath = validateRelativeSkillPath(
      relative(skillsPath, source),
      "Packaged skill path",
    );
    const name = await readSkillName(source);
    if (basename(source) !== name) {
      throw new Error(
        `Packaged skill folder must match its frontmatter name (${source} declares ${name}).`,
      );
    }
    if (names.has(name)) {
      throw new Error(`Packaged skill name is duplicated: ${name}`);
    }
    names.add(name);
    skills.push({ name, relativePath: portablePath(relativePath), source });
  }

  skills.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (skills.length === 0) {
    throw new Error(`Packaged agent skill directory contains no skills: ${skillsPath}`);
  }
  return skills;
}

async function assertSafeDestinationPath(destinationRoot, destination) {
  const relativeDestination = relative(destinationRoot, destination);
  const segments = relativeDestination ? relativeDestination.split(sep) : [];
  let current = destinationRoot;
  for (const segment of segments) {
    current = join(current, segment);
    const state = await pathState(current);
    if (state?.isSymbolicLink()) {
      throw new AgentSkillInstallBlocked(
        `Blocked: managed skill destination may not contain symbolic links (${current}).`,
      );
    }
    if (state && !state.isDirectory()) {
      throw new AgentSkillInstallBlocked(
        `Blocked: managed skill destination path is not a directory (${current}).`,
      );
    }
  }
}

async function validateDestination(destinationRoot, copied, stale) {
  const destinationState = await pathState(destinationRoot);
  if (destinationState?.isSymbolicLink()) {
    throw new AgentSkillInstallBlocked(
      `Blocked: managed agent skill destination may not be a symbolic link (${destinationRoot}).`,
    );
  }
  if (destinationState && !destinationState.isDirectory()) {
    throw new AgentSkillInstallBlocked(
      `Blocked: managed agent skill destination is not a directory (${destinationRoot}).`,
    );
  }

  for (const item of copied) {
    await assertSafeDestinationPath(destinationRoot, item.destination);
  }
  for (const item of stale) {
    await assertSafeDestinationPath(destinationRoot, dirname(item.destination));
  }
}

function sentinelContent({ metadata, skillsPath, copiedAtUtc, command, copied }) {
  return [
    `schema=${PINNED_FROM_SCHEMA}`,
    `library_name=${metadata.name}`,
    `namespace=${AGENT_SKILL_NAMESPACE}`,
    "ownership=authoritative_namespace",
    `pinned_version=${metadata.version}`,
    `skills_path=${skillsPath}`,
    `copied_at_utc=${copiedAtUtc}`,
    `command=${requireSingleLine(command, "Install command")}`,
    ...copied.map((item) => `skill_path=${item.relativePath}`),
    "",
  ].join("\n");
}

async function previousManagedSkillPaths(sentinelPath, metadata) {
  const sentinelState = await pathState(sentinelPath);
  if (!sentinelState) {
    return [];
  }
  if (!sentinelState.isFile() || sentinelState.isSymbolicLink()) {
    throw new AgentSkillInstallBlocked(
      `Blocked: managed pin sentinel is not a regular file (${sentinelPath}).`,
    );
  }
  const fields = new Map();
  for (const line of (await readFile(sentinelPath, "utf8")).split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const values = fields.get(key) ?? [];
    values.push(value);
    fields.set(key, values);
  }
  if (
    fields.get("library_name")?.[0] !== metadata.name ||
    fields.get("namespace")?.[0] !== AGENT_SKILL_NAMESPACE
  ) {
    throw new AgentSkillInstallBlocked(
      `Blocked: managed pin sentinel belongs to another package or namespace (${sentinelPath}).`,
    );
  }
  const schema = fields.get("schema")?.[0];
  const paths = schema === "1" ? LEGACY_FLAT_SKILL_NAMES : fields.get("skill_path") ?? [];
  return [...new Set(paths.map((path) => portablePath(validateRelativeSkillPath(path, "Managed skill path"))))];
}

async function listUnauthorizedNamespaceEntries(destinationRoot, authorizedDestinations) {
  const destinationState = await pathState(destinationRoot);
  if (!destinationState) {
    return [];
  }

  const unauthorized = [];
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (directory === destinationRoot && entry.name === PINNED_FROM_FILENAME) {
        continue;
      }

      const destination = join(directory, entry.name);
      const isAuthorizedRoot = authorizedDestinations.some(
        (authorizedDestination) => authorizedDestination === destination,
      );
      if (isAuthorizedRoot) {
        continue;
      }

      const isAuthorizedAncestor = authorizedDestinations.some((authorizedDestination) =>
        sameOrInside(authorizedDestination, destination),
      );
      if (isAuthorizedAncestor) {
        if (entry.isDirectory()) {
          await inspect(destination);
        }
        continue;
      }

      unauthorized.push({
        relativePath: portablePath(relative(destinationRoot, destination)),
        destination,
      });
    }
  }

  await inspect(destinationRoot);
  unauthorized.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return unauthorized;
}

// Installs into one repository take turns. npm runs one postinstall per workspace that nests its
// own copy of the package, all at once and into the same `INIT_CWD`; without the lock, one install
// renames entries another is moving. The lock is a file beside the namespace, created exclusively;
// the others wait for it, then validate and install against what the first one left.
const installLockPollMs = 50;
const installLockTimeoutMs = 60_000;
// An install holds the lock for well under a second; one this old was left by an install that died.
const installLockAbandonedAfterMs = 10 * 60_000;

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

// Whether the lock's holder can no longer release it: a process on this machine that has exited,
// or a lock older than any install takes. A lock just created, whose fields are not written yet,
// is held.
async function isAbandonedInstallLock(lockPath) {
  let state;
  let text;
  try {
    state = await lstat(lockPath);
    text = await readFile(lockPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (Date.now() - state.mtimeMs > installLockAbandonedAfterMs) return true;
  const fields = new Map();
  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0) fields.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const pid = Number(fields.get("pid"));
  return fields.get("host") === hostname() && Number.isInteger(pid) && pid > 0 && !processIsRunning(pid);
}

/** Waits for the namespace's install lock in `skillsParent` and returns the function that releases it. */
async function acquireInstallLock(skillsParent) {
  await mkdir(skillsParent, { recursive: true });
  const lockPath = join(skillsParent, INSTALL_LOCK_FILENAME);
  const claim = `pid=${process.pid}\nhost=${hostname()}\nacquired_at_utc=${new Date().toISOString()}\n`;
  const deadline = Date.now() + installLockTimeoutMs;
  for (;;) {
    try {
      await writeFile(lockPath, claim, { encoding: "utf8", flag: "wx" });
      return async () => {
        const held = await readFile(lockPath, "utf8").catch(() => null);
        if (held === claim) await rm(lockPath, { force: true }).catch(() => {});
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    if (await isAbandonedInstallLock(lockPath)) {
      await rm(lockPath, { force: true });
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Another ${AGENT_SKILL_NAMESPACE} agent skill install still holds ${lockPath} after ${installLockTimeoutMs / 1000}s. If no install is running, remove that file and install again.`,
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, installLockPollMs));
  }
}

async function rollbackInstall({ destinationRoot, backupRoot, installed, backedUp, previousSentinel }) {
  await rm(join(destinationRoot, PINNED_FROM_FILENAME), { force: true }).catch(() => {});
  for (const destination of installed.reverse()) {
    await rm(destination, { recursive: true, force: true }).catch(() => {});
  }
  for (const item of backedUp.reverse()) {
    await rename(item.backup, item.destination).catch(() => {});
  }
  if (previousSentinel) {
    await rename(join(backupRoot, PINNED_FROM_FILENAME), previousSentinel).catch(() => {});
  }
}

export async function installAgentSkills({
  projectDir,
  dryRun = false,
  command = "command-center-sdk skills install",
  skillsPath = defaultSkillsPath,
  packageMetadata,
} = {}) {
  if (!projectDir) {
    throw new Error("A target repository directory is required.");
  }

  const requestedProjectDir = resolve(projectDir);
  const projectState = await pathState(requestedProjectDir);
  if (!projectState?.isDirectory() || projectState.isSymbolicLink()) {
    throw new Error(`Target repository directory does not exist: ${requestedProjectDir}`);
  }

  const resolvedProjectDir = await realpath(requestedProjectDir);
  const resolvedSkillsPath = await realpath(resolve(skillsPath));
  const destinationRoot = join(
    resolvedProjectDir,
    ".agents",
    "skills",
    AGENT_SKILL_NAMESPACE,
  );
  const sentinelPath = join(destinationRoot, PINNED_FROM_FILENAME);
  const metadata = packageMetadata
    ? validatePackageMetadata(packageMetadata)
    : await readSdkPackageMetadata();

  assertNoOverlap(
    resolvedSkillsPath,
    destinationRoot,
    "skills_path",
    "destination_root",
  );

  const packagedSkills = await listPackagedSkills(resolvedSkillsPath);
  const copied = packagedSkills.map((skill) => ({
    name: skill.name,
    relativePath: skill.relativePath,
    source: skill.source,
    destination: join(destinationRoot, ...skill.relativePath.split("/")),
  }));
  for (const item of copied) {
    assertNoOverlap(item.source, item.destination, `source skill ${item.name}`, `destination skill ${item.name}`);
  }
  const plan = { metadata, resolvedProjectDir, resolvedSkillsPath, destinationRoot, sentinelPath, copied, dryRun, command };
  if (dryRun) {
    return installIntoNamespace(plan);
  }
  const releaseInstallLock = await acquireInstallLock(dirname(destinationRoot));
  try {
    return await installIntoNamespace(plan);
  } finally {
    await releaseInstallLock();
  }
}

// Validates the namespace and, unless this is a dry run, replaces it. An install that writes holds
// the install lock, so nothing else moves the namespace's entries while this reads or writes them.
async function installIntoNamespace({
  metadata,
  resolvedProjectDir,
  resolvedSkillsPath,
  destinationRoot,
  sentinelPath,
  copied,
  dryRun,
  command,
}) {
  await validateDestination(destinationRoot, copied, []);
  await previousManagedSkillPaths(sentinelPath, metadata);
  const stale = await listUnauthorizedNamespaceEntries(
    destinationRoot,
    copied.map((item) => item.destination),
  );
  await validateDestination(destinationRoot, copied, stale);

  const result = {
    libraryName: metadata.name,
    namespace: AGENT_SKILL_NAMESPACE,
    pinnedVersion: metadata.version,
    projectDir: resolvedProjectDir,
    skillsPath: resolvedSkillsPath,
    destinationRoot,
    sentinelPath,
    dryRun: Boolean(dryRun),
    copied,
    removed: stale,
  };
  if (dryRun) {
    return result;
  }

  const skillsParent = dirname(destinationRoot);
  const stageRoot = await mkdtemp(join(skillsParent, ".command-center-stage-"));
  const backupRoot = await mkdtemp(join(skillsParent, ".command-center-backup-"));
  const installed = [];
  const backedUp = [];
  let previousSentinel = null;
  let temporarySentinel = null;

  try {
    for (const item of copied) {
      const staged = join(stageRoot, ...item.relativePath.split("/"));
      await mkdir(dirname(staged), { recursive: true });
      await cp(item.source, staged, {
        recursive: true,
        dereference: false,
        errorOnExist: true,
        force: false,
      });
    }

    await mkdir(destinationRoot, { recursive: true });
    const sentinelState = await pathState(sentinelPath);
    if (sentinelState?.isSymbolicLink()) {
      throw new AgentSkillInstallBlocked(
        `Blocked: managed pin sentinel may not be a symbolic link (${sentinelPath}).`,
      );
    }
    if (sentinelState && !sentinelState.isFile()) {
      throw new AgentSkillInstallBlocked(
        `Blocked: managed pin sentinel is not a regular file (${sentinelPath}).`,
      );
    }
    if (sentinelState) {
      previousSentinel = sentinelPath;
      await rename(sentinelPath, join(backupRoot, PINNED_FROM_FILENAME));
    }

    for (const item of stale) {
      if (await pathState(item.destination)) {
        const backup = join(backupRoot, ...item.relativePath.split("/"));
        await mkdir(dirname(backup), { recursive: true });
        await rename(item.destination, backup);
        backedUp.push({ destination: item.destination, backup });
      }
    }

    for (const item of copied) {
      if (await pathState(item.destination)) {
        const backup = join(backupRoot, ...item.relativePath.split("/"));
        await mkdir(dirname(backup), { recursive: true });
        await rename(item.destination, backup);
        backedUp.push({ destination: item.destination, backup });
      }
      await mkdir(dirname(item.destination), { recursive: true });
      await rename(join(stageRoot, ...item.relativePath.split("/")), item.destination);
      installed.push(item.destination);
    }

    const copiedAtUtc = new Date().toISOString();
    temporarySentinel = join(destinationRoot, `.${PINNED_FROM_FILENAME}.${process.pid}`);
    await writeFile(
      temporarySentinel,
      sentinelContent({ metadata, skillsPath: resolvedSkillsPath, copiedAtUtc, command, copied }),
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporarySentinel, sentinelPath);
    result.copiedAtUtc = copiedAtUtc;
  } catch (error) {
    await rollbackInstall({
      destinationRoot,
      backupRoot,
      installed,
      backedUp,
      previousSentinel,
    });
    throw error;
  } finally {
    if (temporarySentinel) {
      await rm(temporarySentinel, { force: true }).catch(() => {});
    }
    await rm(stageRoot, { recursive: true, force: true }).catch(() => {});
    await rm(backupRoot, { recursive: true, force: true }).catch(() => {});
  }

  return result;
}
