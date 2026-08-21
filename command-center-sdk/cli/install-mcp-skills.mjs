import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const MCP_AGENT_SKILL_NAMESPACE = "mainsequence";
export const MCP_PINNED_FROM_FILENAME = "MCP_PINNED_FROM.txt";
export const MCP_PINNED_FROM_SCHEMA = "1";

const PYTHON_PINNED_FROM_FILENAME = "PINNED_FROM.txt";
const INSTALLER_NAME = "@dev-mainsequence/command-center-sdk";

export class McpAgentSkillInstallBlocked extends Error {
  constructor(message) {
    super(message);
    this.name = "McpAgentSkillInstallBlocked";
  }
}

async function pathState(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function requireSingleLine(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/u.test(value)) {
    throw new McpAgentSkillInstallBlocked(`${label} must be non-empty single-line text.`);
  }
  return value.trim();
}

function validateManagedRoot(value, label = "Managed MCP skill path") {
  const candidate = requireSingleLine(value, label);
  if (isAbsolute(candidate) || candidate.includes("\\")) {
    throw new McpAgentSkillInstallBlocked(`${label} is unsafe (${candidate}).`);
  }
  const segments = candidate.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment || segment === "." || segment === ".." || segment.startsWith("."),
    )
  ) {
    throw new McpAgentSkillInstallBlocked(`${label} is unsafe (${candidate}).`);
  }
  return segments.join("/");
}

function assertNoManagedRootOverlap(roots) {
  const ordered = [...new Set(roots)].sort();
  for (let index = 0; index < ordered.length; index += 1) {
    for (let nestedIndex = index + 1; nestedIndex < ordered.length; nestedIndex += 1) {
      if (ordered[nestedIndex].startsWith(`${ordered[index]}/`)) {
        throw new McpAgentSkillInstallBlocked(
          `Managed MCP skill paths may not overlap (${ordered[index]} contains ${ordered[nestedIndex]}).`,
        );
      }
    }
  }
}

function parseSentinelFields(source) {
  const fields = new Map();
  for (const line of source.split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const values = fields.get(key) ?? [];
    values.push(value);
    fields.set(key, values);
  }
  return fields;
}

async function readRegularSentinel(path, label) {
  const state = await pathState(path);
  if (!state) return null;
  if (!state.isFile() || state.isSymbolicLink()) {
    throw new McpAgentSkillInstallBlocked(`${label} must be a regular file (${path}).`);
  }
  return parseSentinelFields(await readFile(path, "utf8"));
}

async function previousManagedRoots(sentinelPath) {
  const fields = await readRegularSentinel(sentinelPath, "Managed MCP pin sentinel");
  if (!fields) return [];
  if (
    fields.get("schema")?.[0] !== MCP_PINNED_FROM_SCHEMA ||
    fields.get("installer")?.[0] !== INSTALLER_NAME ||
    fields.get("namespace")?.[0] !== MCP_AGENT_SKILL_NAMESPACE ||
    fields.get("source")?.[0] !== "mcp"
  ) {
    throw new McpAgentSkillInstallBlocked(
      `Managed MCP pin sentinel belongs to another installer or schema (${sentinelPath}).`,
    );
  }
  return [
    ...new Set(
      (fields.get("managed_skill_path") ?? []).map((path) => validateManagedRoot(path)),
    ),
  ];
}

async function pythonManagedRoots(destinationRoot) {
  const sentinelPath = join(destinationRoot, PYTHON_PINNED_FROM_FILENAME);
  const fields = await readRegularSentinel(sentinelPath, "Main Sequence Python pin sentinel");
  if (!fields) return [];
  if (
    fields.get("schema")?.[0] !== "2" ||
    fields.get("namespace")?.[0] !== MCP_AGENT_SKILL_NAMESPACE
  ) {
    return [];
  }
  const roots = [];
  for (const [key, values] of fields) {
    if (!key.startsWith("platform_resource.") || !key.endsWith(".path")) continue;
    for (const resourcePath of values) {
      if (!resourcePath.startsWith("skills/")) continue;
      const relativePath = resourcePath.slice("skills/".length);
      if (!new Set(["SKILL.md", "SKILL.markdown"]).has(relativePath.split("/").at(-1))) {
        continue;
      }
      roots.push(validateManagedRoot(relativePath.split("/").slice(0, -1).join("/")));
    }
  }
  return [...new Set(roots)];
}

async function assertSafeDestinationPath(destinationRoot, destination) {
  const relativeDestination = relative(destinationRoot, destination);
  const segments = relativeDestination ? relativeDestination.split(sep) : [];
  let current = destinationRoot;
  for (const segment of segments) {
    current = join(current, segment);
    const state = await pathState(current);
    if (state?.isSymbolicLink()) {
      throw new McpAgentSkillInstallBlocked(
        `Managed MCP skill destination may not contain symbolic links (${current}).`,
      );
    }
    if (state && !state.isDirectory()) {
      throw new McpAgentSkillInstallBlocked(
        `Managed MCP skill destination path is not a directory (${current}).`,
      );
    }
  }
}

async function validateDestination(destinationRoot, current, stale, ownedRoots) {
  const destinationState = await pathState(destinationRoot);
  if (destinationState?.isSymbolicLink()) {
    throw new McpAgentSkillInstallBlocked(
      `Managed MCP skill namespace may not be a symbolic link (${destinationRoot}).`,
    );
  }
  if (destinationState && !destinationState.isDirectory()) {
    throw new McpAgentSkillInstallBlocked(
      `Managed MCP skill namespace is not a directory (${destinationRoot}).`,
    );
  }

  for (const item of [...current, ...stale]) {
    await assertSafeDestinationPath(destinationRoot, item.destination);
  }
  for (const item of current) {
    const state = await pathState(item.destination);
    if (!state) continue;
    if (!state.isDirectory() || state.isSymbolicLink()) {
      throw new McpAgentSkillInstallBlocked(
        `Managed MCP skill destination must be a regular directory (${item.destination}).`,
      );
    }
    if (!ownedRoots.has(item.managedRoot)) {
      throw new McpAgentSkillInstallBlocked(
        `Refusing to overwrite an unowned MCP skill destination (${item.destination}).`,
      );
    }
  }
}

function sentinelContent({ catalog, installerVersion, command, installedAtUtc }) {
  const lines = [
    `schema=${MCP_PINNED_FROM_SCHEMA}`,
    `installer=${INSTALLER_NAME}`,
    `installer_version=${requireSingleLine(installerVersion, "Installer version")}`,
    `namespace=${MCP_AGENT_SKILL_NAMESPACE}`,
    "source=mcp",
    `source_url=${requireSingleLine(catalog.sourceUrl, "MCP source URL")}`,
    `installed_at_utc=${installedAtUtc}`,
    `platform_manifest_version=${catalog.manifestVersion}`,
    `platform_manifest_sha256=${catalog.manifestSha256}`,
    `platform_ontology_uri=${catalog.ontologyUri}`,
    `platform_ontology_sha256=${catalog.ontologySha256}`,
    `platform_resource_count=${catalog.resources.length}`,
    `platform_skill_count=${catalog.skills.length}`,
  ];
  for (const resource of catalog.resources) {
    const prefix = `platform_resource.${resource.name}`;
    lines.push(
      `${prefix}.uri=${requireSingleLine(resource.uri, "MCP resource URI")}`,
      `${prefix}.path=${requireSingleLine(resource.resourcePath, "MCP resource path")}`,
      `${prefix}.content_sha256=${resource.contentSha256}`,
    );
  }
  for (const skill of catalog.skills) {
    lines.push(`managed_skill_path=${validateManagedRoot(skill.managedRoot)}`);
  }
  lines.push(`command=${requireSingleLine(command, "Install command")}`, "");
  return lines.join("\n");
}

async function rollbackInstall({ destinationRoot, backupRoot, installed, backedUp, previousSentinel }) {
  await rm(join(destinationRoot, MCP_PINNED_FROM_FILENAME), { force: true }).catch(() => {});
  for (const destination of installed.reverse()) {
    await rm(destination, { recursive: true, force: true }).catch(() => {});
  }
  for (const item of backedUp.reverse()) {
    await mkdir(dirname(item.destination), { recursive: true }).catch(() => {});
    await rename(item.backup, item.destination).catch(() => {});
  }
  if (previousSentinel) {
    await rename(join(backupRoot, MCP_PINNED_FROM_FILENAME), previousSentinel).catch(() => {});
  }
}

async function pruneEmptyParents(start, stop) {
  let current = start;
  while (current !== stop && relative(stop, current) && !relative(stop, current).startsWith("..")) {
    try {
      await rmdir(current);
    } catch (error) {
      if (new Set(["ENOTEMPTY", "ENOENT"]).has(error?.code)) return;
      throw error;
    }
    current = dirname(current);
  }
}

export async function installMcpAgentSkills({
  projectDir,
  catalog,
  installerVersion,
  dryRun = false,
  command = "command-center-sdk skills sync",
  onBeforeSentinelWrite,
} = {}) {
  if (!projectDir) throw new Error("A target project directory is required.");
  if (!catalog || !Array.isArray(catalog.skills) || !Array.isArray(catalog.resources)) {
    throw new Error("A validated MCP platform skill catalog is required.");
  }
  requireSingleLine(installerVersion, "Installer version");

  const requestedProjectDir = resolve(projectDir);
  const projectState = await pathState(requestedProjectDir);
  if (!projectState?.isDirectory() || projectState.isSymbolicLink()) {
    throw new Error(`Target project directory does not exist: ${requestedProjectDir}`);
  }
  const resolvedProjectDir = await realpath(requestedProjectDir);
  const destinationRoot = join(
    resolvedProjectDir,
    ".agents",
    "skills",
    MCP_AGENT_SKILL_NAMESPACE,
  );
  await assertSafeDestinationPath(resolvedProjectDir, destinationRoot);
  const sentinelPath = join(destinationRoot, MCP_PINNED_FROM_FILENAME);
  const previousRoots = await previousManagedRoots(sentinelPath);
  const adoptableRoots = await pythonManagedRoots(destinationRoot);
  const ownedRoots = new Set([...previousRoots, ...adoptableRoots]);

  const current = catalog.skills.map((skill) => {
    const managedRoot = validateManagedRoot(skill.managedRoot);
    const expectedRelativePath = `${managedRoot}/${skill.relativePath.split("/").at(-1)}`;
    if (skill.relativePath !== expectedRelativePath) {
      throw new McpAgentSkillInstallBlocked(
        `MCP skill path does not match its managed root (${skill.relativePath}).`,
      );
    }
    return {
      name: skill.name,
      uri: skill.uri,
      managedRoot,
      relativePath: skill.relativePath,
      contentSha256: skill.contentSha256,
      content: skill.content,
      destination: join(destinationRoot, ...managedRoot.split("/")),
    };
  });
  const currentRoots = new Set(current.map((item) => item.managedRoot));
  assertNoManagedRootOverlap([...previousRoots, ...currentRoots]);
  const stale = previousRoots
    .filter((managedRoot) => !currentRoots.has(managedRoot))
    .map((managedRoot) => ({
      managedRoot,
      destination: join(destinationRoot, ...managedRoot.split("/")),
    }));
  await validateDestination(destinationRoot, current, stale, ownedRoots);

  const result = {
    namespace: MCP_AGENT_SKILL_NAMESPACE,
    projectDir: resolvedProjectDir,
    destinationRoot,
    sentinelPath,
    installerVersion,
    sourceUrl: catalog.sourceUrl,
    manifestVersion: catalog.manifestVersion,
    manifestSha256: catalog.manifestSha256,
    ontologyUri: catalog.ontologyUri,
    ontologySha256: catalog.ontologySha256,
    dryRun: Boolean(dryRun),
    installed: current.map(({ content: _content, ...item }) => item),
    removed: stale,
  };
  if (dryRun) return result;

  const skillsParent = dirname(destinationRoot);
  await mkdir(skillsParent, { recursive: true });
  const stageRoot = await mkdtemp(join(skillsParent, ".mainsequence-mcp-stage-"));
  const backupRoot = await mkdtemp(join(skillsParent, ".mainsequence-mcp-backup-"));
  const installed = [];
  const backedUp = [];
  let previousSentinel = null;
  let temporarySentinel = null;

  try {
    for (const item of current) {
      const stagedRoot = join(stageRoot, ...item.managedRoot.split("/"));
      await mkdir(stagedRoot, { recursive: true });
      await writeFile(
        join(stagedRoot, item.relativePath.split("/").at(-1)),
        item.content,
        "utf8",
      );
    }

    await mkdir(destinationRoot, { recursive: true });
    const sentinelState = await pathState(sentinelPath);
    if (sentinelState) {
      previousSentinel = sentinelPath;
      await rename(sentinelPath, join(backupRoot, MCP_PINNED_FROM_FILENAME));
    }

    const destinations = [...stale, ...current];
    const moved = new Set();
    for (const item of destinations) {
      if (moved.has(item.destination) || !(await pathState(item.destination))) continue;
      const backup = join(backupRoot, ...item.managedRoot.split("/"));
      await mkdir(dirname(backup), { recursive: true });
      await rename(item.destination, backup);
      backedUp.push({ destination: item.destination, backup });
      moved.add(item.destination);
    }

    for (const item of current) {
      await mkdir(dirname(item.destination), { recursive: true });
      await rename(join(stageRoot, ...item.managedRoot.split("/")), item.destination);
      installed.push(item.destination);
    }

    if (onBeforeSentinelWrite) await onBeforeSentinelWrite();
    const installedAtUtc = new Date().toISOString();
    temporarySentinel = join(destinationRoot, `.${MCP_PINNED_FROM_FILENAME}.${process.pid}`);
    await writeFile(
      temporarySentinel,
      sentinelContent({ catalog, installerVersion, command, installedAtUtc }),
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporarySentinel, sentinelPath);
    result.installedAtUtc = installedAtUtc;
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
    if (temporarySentinel) await rm(temporarySentinel, { force: true }).catch(() => {});
    await rm(stageRoot, { recursive: true, force: true }).catch(() => {});
    await rm(backupRoot, { recursive: true, force: true }).catch(() => {});
  }

  for (const item of stale) {
    await pruneEmptyParents(dirname(item.destination), destinationRoot);
  }
  return result;
}
