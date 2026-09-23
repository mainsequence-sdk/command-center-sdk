// Installs the chat's packaged agent skills into a repository, in `.agents/skills/chat/`: a
// namespace the chat owns alone. Every install replaces that namespace with the skills of the
// installed package and records where they came from in its provenance file. No other entry under
// `.agents/skills/` is read or written, the SDK's `command-center/` included. Node's standard
// library only: the installer runs from npm's postinstall, before anything else is built.
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_NAMESPACE = "chat";
export const PROVENANCE_FILENAME = "PINNED_FROM.txt";
export const PROVENANCE_SCHEMA = "1";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultSkillsRoot = join(packageRoot, "agent_scaffold", "skills");
const defaultManifestPath = join(packageRoot, "package.json");

export class ChatSkillInstallBlocked extends Error {
  constructor(message) {
    super(message);
    this.name = "ChatSkillInstallBlocked";
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

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function singleLine(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n]/u.test(value)) {
    throw new Error(`${label} must be a non-empty single line.`);
  }
  return value.trim();
}

export async function readChatPackageMetadata(manifestPath = defaultManifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  return {
    name: singleLine(manifest.name, "The package name"),
    version: singleLine(manifest.version, "The package version"),
  };
}

/** The packaged skills: every directory under the skills root that holds a `SKILL.md`. */
export async function listPackagedSkills(skillsRoot = defaultSkillsRoot) {
  const skills = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ChatSkillInstallBlocked(`Blocked: packaged skills may not contain symbolic links (${entryPath}).`);
      }
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (!entry.isFile()) {
        throw new ChatSkillInstallBlocked(
          `Blocked: packaged skills may contain only directories and regular files (${entryPath}).`,
        );
      }
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      skills.push(relative(skillsRoot, directory).split(sep).join("/"));
    }
  }

  await visit(skillsRoot);
  skills.sort();
  if (skills.includes("")) {
    throw new ChatSkillInstallBlocked(`Blocked: the skills root itself holds a SKILL.md (${skillsRoot}).`);
  }
  const nested = skills.find((skill) => skills.some((other) => other !== skill && skill.startsWith(`${other}/`)));
  if (nested) {
    throw new ChatSkillInstallBlocked(`Blocked: a skill may not sit inside another skill (${nested}).`);
  }
  return skills;
}

async function assertDirectoryOrMissing(path) {
  const state = await pathState(path);
  if (!state) return;
  if (state.isSymbolicLink()) {
    throw new ChatSkillInstallBlocked(`Blocked: the skill destination may not be a symbolic link (${path}).`);
  }
  if (!state.isDirectory()) {
    throw new ChatSkillInstallBlocked(`Blocked: the skill destination is not a directory (${path}).`);
  }
}

function renderProvenance({ metadata, command, skills, copiedAt }) {
  return [
    `schema=${PROVENANCE_SCHEMA}`,
    `library_name=${metadata.name}`,
    `namespace=${SKILL_NAMESPACE}`,
    "ownership=authoritative_namespace",
    `pinned_version=${metadata.version}`,
    `copied_at_utc=${copiedAt.toISOString()}`,
    `command=${singleLine(command, "The install command")}`,
    ...skills.map((skill) => `skill_path=${skill}`),
    "",
  ].join("\n");
}

/**
 * Replaces `<projectDir>/.agents/skills/chat/` with the packaged skills and the provenance file.
 * The new namespace is staged next to the old one and swapped in by rename; if the swap fails, the
 * old namespace is put back.
 */
export async function installChatSkills({
  projectDir,
  command = "mainsequence-chat skills install",
  skillsRoot = defaultSkillsRoot,
  manifestPath = defaultManifestPath,
  now = () => new Date(),
} = {}) {
  const projectState = projectDir ? await pathState(projectDir) : null;
  if (!projectState?.isDirectory()) {
    throw new Error(`The repository root is not a directory (${projectDir ?? "none given"}).`);
  }
  const projectRoot = await realpath(projectDir);
  const sourceRoot = await realpath(skillsRoot);
  const metadata = await readChatPackageMetadata(manifestPath);
  const skills = await listPackagedSkills(sourceRoot);
  if (skills.length === 0) {
    throw new ChatSkillInstallBlocked(`Blocked: the package holds no skills (${sourceRoot}).`);
  }

  const agentsRoot = join(projectRoot, ".agents");
  const skillsParent = join(agentsRoot, "skills");
  const destinationRoot = join(skillsParent, SKILL_NAMESPACE);
  if (isInside(sourceRoot, destinationRoot) || isInside(destinationRoot, sourceRoot)) {
    throw new ChatSkillInstallBlocked(
      `Blocked: the packaged skills and the destination overlap (${sourceRoot}, ${destinationRoot}).`,
    );
  }
  await assertDirectoryOrMissing(agentsRoot);
  await assertDirectoryOrMissing(skillsParent);
  await assertDirectoryOrMissing(destinationRoot);

  const previousEntries = (await pathState(destinationRoot))
    ? (await readdir(destinationRoot)).filter((name) => name !== PROVENANCE_FILENAME)
    : [];
  const installedTopLevel = new Set(skills.map((skill) => skill.split("/")[0]));

  await mkdir(skillsParent, { recursive: true });
  const workRoot = await mkdtemp(join(skillsParent, `.${SKILL_NAMESPACE}-install-`));
  const nextRoot = join(workRoot, "next");
  const previousRoot = join(workRoot, "previous");
  let movedPrevious = false;

  try {
    for (const skill of skills) {
      await cp(join(sourceRoot, skill), join(nextRoot, skill), { recursive: true, errorOnExist: true, force: false });
    }
    await writeFile(
      join(nextRoot, PROVENANCE_FILENAME),
      renderProvenance({ metadata, command, skills, copiedAt: now() }),
      "utf8",
    );
    if (await pathState(destinationRoot)) {
      await rename(destinationRoot, previousRoot);
      movedPrevious = true;
    }
    await rename(nextRoot, destinationRoot);
  } catch (error) {
    if (movedPrevious && !(await pathState(destinationRoot))) {
      await rename(previousRoot, destinationRoot).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }

  return {
    destinationRoot,
    installed: skills,
    removed: previousEntries.filter((name) => !installedTopLevel.has(name)).sort(),
    version: metadata.version,
  };
}
