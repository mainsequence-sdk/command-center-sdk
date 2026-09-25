import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AGENT_SKILL_NAMESPACE,
  AgentSkillInstallBlocked,
  installAgentSkills,
  listPackagedSkills,
  PINNED_FROM_FILENAME,
} from "../../cli/install-agent-skills.mjs";
import { isCommandCenterAiSourceRepository, runPostinstall } from "../../cli/postinstall.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = resolve(packageRoot, "..");
const skillsRoot = join(packageRoot, "agent_scaffold", "skills");
const cliPath = join(packageRoot, "cli", "command-center-ai.mjs");
const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const expectedSkills = [
  "backend/connect-command-center-ai-to-the-platform",
  "contracts/design-agent-conversation-capabilities",
  "engine/mount-agent-conversation",
  "general/build-command-center-ai-application",
  "general/use-command-center-ai",
  "model-providers/manage-model-providers",
  "sessions/manage-agent-sessions",
  "ui/compose-command-center-ai-rail",
];
const silent = { log() {}, error() {}, warn() {} };
const packageMetadata = { name: "@dev-mainsequence/command-center-ai", version: "9.8.7" };

async function temporaryDirectory(t, label) {
  const root = await mkdtemp(join(tmpdir(), `command-center-ai-${label}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFileAt(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

async function writeSkill(root, relativePath, content = "skill", name = relativePath.split("/").at(-1)) {
  const skillRoot = join(root, ...relativePath.split("/"));
  await writeFileAt(join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: ${content}\n---\n\n# ${name}\n`);
  await writeFileAt(join(skillRoot, "agents", "openai.yaml"), `interface:\n  display_name: "${name}"\n`);
}

function skillText(relativePath) {
  return readFile(join(skillsRoot, ...relativePath.split("/"), "SKILL.md"), "utf8");
}

function codeBlocks(markdown) {
  return [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/gu)].map((match) => match[1]).join("\n");
}

test("every packaged skill is a standalone skill in its lane, with its agent metadata", async () => {
  const skills = await listPackagedSkills(skillsRoot);
  assert.deepEqual(skills.map((skill) => skill.relativePath), expectedSkills);

  for (const { name, relativePath } of skills) {
    const text = await skillText(relativePath);
    const frontMatter = /^---\n([\s\S]*?)\n---\n/u.exec(text)?.[1] ?? "";
    assert.match(frontMatter, new RegExp(`^name: ${name}$`, "mu"), `${relativePath}: name`);
    assert.match(frontMatter, /^description: \S.{80,}$/mu, `${relativePath}: description`);
    assert.doesNotMatch(text, /\]\((?:\.\.\/)+(?:src|dist)\//u, `${relativePath} links into package internals`);

    const metadata = await readFile(join(skillsRoot, ...relativePath.split("/"), "agents", "openai.yaml"), "utf8");
    assert.match(metadata, /^interface:\n {2}display_name: "[^"]+"\n {2}short_description: "[^"]+"\n {2}default_prompt: "[^"]+"\n$/u);
    assert.match(metadata, new RegExp(`\\$${name}\\b`, "u"), `${relativePath}: default_prompt names the skill`);
  }
});

test("skills route with $names that exist here or in the installed SDK's skills", async () => {
  const require = createRequire(import.meta.url);
  const sdkRoot = dirname(require.resolve("@dev-mainsequence/command-center-sdk/package.json"));
  const sdkSkills = await listPackagedSkills(join(sdkRoot, "agent_scaffold", "skills"));
  const known = new Set([
    ...(await listPackagedSkills(skillsRoot)).map((skill) => skill.name),
    ...sdkSkills.map((skill) => skill.name),
  ]);

  for (const relativePath of expectedSkills) {
    const routes = [...(await skillText(relativePath)).matchAll(/\$([a-z][a-z0-9-]+)/gu)].map((match) => match[1]);
    assert.ok(routes.length > 0, `${relativePath} routes to no skill`);
    for (const route of routes) assert.ok(known.has(route), `${relativePath} routes to unknown $${route}`);
  }
});

test("screen-building skills use the SDK's controls, render no raw control, and load the SDK first", async () => {
  for (const relativePath of [
    "general/use-command-center-ai",
    "general/build-command-center-ai-application",
    "engine/mount-agent-conversation",
    "ui/compose-command-center-ai-rail",
    "sessions/manage-agent-sessions",
    "model-providers/manage-model-providers",
  ]) {
    const text = await skillText(relativePath);
    assert.match(text, /\/controls|\$compose-command-center-controls/u, `${relativePath} does not route controls to the SDK`);
  }
  for (const relativePath of expectedSkills) {
    const rendered = codeBlocks(await skillText(relativePath));
    assert.doesNotMatch(rendered, /<(button|input|textarea|label|select)\b/u, `${relativePath} renders a raw control`);
    assert.doesNotMatch(rendered, /--legacy-peer-deps/u, `${relativePath} forces peers`);
    assert.doesNotMatch(rendered, /VITE_\w*TOKEN/u, `${relativePath} puts a token in a build variable`);
  }
  const mount = await skillText("engine/mount-agent-conversation");
  assert.ok(
    mount.indexOf("@dev-mainsequence/command-center-sdk/theme/markdown.css") <
      mount.indexOf('import "@dev-mainsequence/command-center-ai/styles.css"'),
    "the package's stylesheet loads after the SDK's",
  );
  const rail = await skillText("ui/compose-command-center-ai-rail");
  for (const rule of [/540px/u, /1400px/u, /Expand/u, /Close chat rail/u, /surface="page"/u, /--shadow-panel/u, /375×812/u]) {
    assert.match(rail, rule);
  }
  assert.doesNotMatch(codeBlocks(rail), /gradient|rgba\(|#[0-9a-f]{3,8}\b/iu, "the rail's example uses literal colours");
});

test("installs the authoritative namespace, prunes unauthorized entries, and writes provenance", async (t) => {
  const root = await temporaryDirectory(t, "copy");
  const packageSkills = join(root, "package", "skills");
  const project = join(root, "project");
  await writeSkill(packageSkills, "general/alpha-skill", "new alpha");
  await writeSkill(packageSkills, "ui/beta-skill", "new beta");
  await writeSkill(packageSkills, ".hidden-skill", "hidden");
  await writeSkill(packageSkills, "__cache", "cache");
  await writeFileAt(join(packageSkills, "README.md"), "not a skill");

  const managed = join(project, ".agents", "skills", AGENT_SKILL_NAMESPACE);
  await writeFileAt(join(managed, "general", "alpha-skill", "stale.txt"), "stale");
  await writeSkill(managed, "retired-skill", "retired");
  await writeFileAt(join(managed, "consumer-owned", "keep.txt"), "removed");
  await writeFileAt(
    join(managed, PINNED_FROM_FILENAME),
    ["schema=1", `library_name=${packageMetadata.name}`, "namespace=command-center-ai", "skill_path=retired-skill", ""].join("\n"),
  );
  const others = {
    ".agents/skills/command-center/general/build-command-center-application/SKILL.md": "SDK skill\n",
    ".agents/skills/command-center/PINNED_FROM.txt": "library_name=@dev-mainsequence/command-center-sdk\n",
    ".agents/skills/mainsequence/platform-skill/SKILL.md": "platform skill\n",
    ".agents/skills/notes.md": "a file beside the namespaces\n",
  };
  for (const [path, text] of Object.entries(others)) await writeFileAt(join(project, path), text);

  const result = await installAgentSkills({ projectDir: project, skillsPath: packageSkills, packageMetadata, command: "test install" });

  assert.equal(result.destinationRoot, join(await realpath(project), ".agents", "skills", "command-center-ai"));
  assert.deepEqual(result.copied.map((item) => item.relativePath), ["general/alpha-skill", "ui/beta-skill"]);
  assert.deepEqual(result.removed.map((item) => item.relativePath), ["consumer-owned", "retired-skill"]);
  assert.match(await readFile(join(managed, "general", "alpha-skill", "SKILL.md"), "utf8"), /new alpha/u);
  await assert.rejects(readFile(join(managed, "general", "alpha-skill", "stale.txt")), { code: "ENOENT" });
  await assert.rejects(readFile(join(managed, "consumer-owned", "keep.txt")), { code: "ENOENT" });

  const sentinel = await readFile(join(managed, PINNED_FROM_FILENAME), "utf8");
  for (const line of [
    "schema=2",
    `library_name=${packageMetadata.name}`,
    "namespace=command-center-ai",
    "ownership=authoritative_namespace",
    "pinned_version=9.8.7",
    `skills_path=${await realpath(packageSkills)}`,
    "command=test install",
    "skill_path=general/alpha-skill",
    "skill_path=ui/beta-skill",
  ]) {
    assert.ok(sentinel.split("\n").includes(line), `provenance lacks ${line}`);
  }
  for (const [path, text] of Object.entries(others)) {
    assert.equal(await readFile(join(project, path), "utf8"), text, `${path} changed`);
  }
  assert.deepEqual((await readdir(join(project, ".agents", "skills"))).sort(), [
    "command-center",
    "command-center-ai",
    "mainsequence",
    "notes.md",
  ]);
});

test("dry-run validates and reports without writing", async (t) => {
  const project = await temporaryDirectory(t, "dry-run");
  await writeFileAt(join(project, ".agents", "skills", "command-center-ai", "retired-skill", "SKILL.md"), "retired\n");

  const result = await installAgentSkills({ projectDir: project, dryRun: true });

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.copied.map((item) => item.relativePath), expectedSkills);
  assert.deepEqual(result.removed.map((item) => item.relativePath), ["retired-skill"]);
  assert.equal(result.pinnedVersion, manifest.version);
  assert.deepEqual(await readdir(join(project, ".agents", "skills", "command-center-ai")), ["retired-skill"]);
});

test("refuses a namespace whose provenance names another package, and writes nothing", async (t) => {
  const project = await temporaryDirectory(t, "owner");
  const managed = join(project, ".agents", "skills", "command-center-ai");
  await writeFileAt(join(managed, PINNED_FROM_FILENAME), "library_name=@someone-else/other\nnamespace=command-center-ai\n");
  await writeFileAt(join(managed, "their-skill", "SKILL.md"), "theirs\n");

  await assert.rejects(installAgentSkills({ projectDir: project }), AgentSkillInstallBlocked);
  assert.deepEqual((await readdir(managed)).sort(), [PINNED_FROM_FILENAME, "their-skill"]);
});

test("blocks source and destination overlap, symbolic links, nested skills, and duplicate or mismatched names", async (t) => {
  const root = await temporaryDirectory(t, "blocked");
  const project = join(root, "project");
  await mkdir(project, { recursive: true });

  const overlapping = join(project, ".agents", "skills", "command-center-ai");
  await writeSkill(overlapping, "general/alpha-skill");
  await assert.rejects(installAgentSkills({ projectDir: project, skillsPath: overlapping, packageMetadata }), AgentSkillInstallBlocked);

  const linked = join(root, "linked");
  await writeSkill(linked, "general/alpha-skill");
  await symlink(join(root, "linked", "general", "alpha-skill", "SKILL.md"), join(linked, "general", "alpha-skill", "linked.md"));
  await assert.rejects(installAgentSkills({ projectDir: project, skillsPath: linked, packageMetadata }), AgentSkillInstallBlocked);

  const duplicated = join(root, "duplicated");
  await writeSkill(duplicated, "general/alpha-skill");
  await writeSkill(duplicated, "ui/alpha-skill");
  await assert.rejects(installAgentSkills({ projectDir: project, skillsPath: duplicated, packageMetadata }), /duplicated: alpha-skill/u);

  const mismatched = join(root, "mismatched");
  await writeSkill(mismatched, "general/alpha-skill", "skill", "other-name");
  await assert.rejects(installAgentSkills({ projectDir: project, skillsPath: mismatched, packageMetadata }), /must match its frontmatter name/u);

  const nested = join(root, "nested");
  await writeSkill(nested, "general/alpha-skill");
  await writeSkill(nested, "general/alpha-skill/inner-skill");
  await assert.rejects(installAgentSkills({ projectDir: project, skillsPath: nested, packageMetadata }), /nested inside another skill/u);
});

test("refuses a destination that is a symbolic link and writes nothing through it", async (t) => {
  const project = await temporaryDirectory(t, "symlink");
  const elsewhere = join(project, "elsewhere");
  await writeFileAt(join(elsewhere, "kept.md"), "kept\n");
  await mkdir(join(project, ".agents", "skills"), { recursive: true });
  await symlink(elsewhere, join(project, ".agents", "skills", "command-center-ai"));
  await assert.rejects(installAgentSkills({ projectDir: project }), AgentSkillInstallBlocked);
  assert.deepEqual(await readdir(elsewhere), ["kept.md"]);

  const other = await temporaryDirectory(t, "symlink-parent");
  await mkdir(join(other, ".agents"), { recursive: true });
  await symlink(elsewhere, join(other, ".agents", "skills"));
  await assert.rejects(installAgentSkills({ projectDir: other }), AgentSkillInstallBlocked);
  assert.deepEqual(await readdir(elsewhere), ["kept.md"]);
});

test("the command installs into --path, -p, and --path=, previews with --dry-run, prints --json, and explains its usage", async (t) => {
  for (const form of [["--path"], ["-p"], ["--path="]]) {
    const project = await temporaryDirectory(t, "cli");
    const args = form[0] === "--path=" ? [`--path=${project}`] : [form[0], project];
    const install = spawnSync(process.execPath, [cliPath, "skills", "install", ...args], { encoding: "utf8" });
    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /Installed 8 Command Center AI skill\(s\)/u);
    assert.match(install.stdout, /Provenance: .*PINNED_FROM\.txt/u);
  }

  const project = await temporaryDirectory(t, "cli-json");
  const preview = spawnSync(process.execPath, [cliPath, "skills", "install", "--path", project, "--dry-run", "--json"], {
    encoding: "utf8",
  });
  assert.equal(preview.status, 0, preview.stderr);
  const result = JSON.parse(preview.stdout);
  assert.equal(result.dryRun, true);
  assert.equal(result.copied.length, expectedSkills.length);
  await assert.rejects(readdir(join(project, ".agents")), { code: "ENOENT" });

  const help = spawnSync(process.execPath, [cliPath, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /command-center-ai skills install \[--path <repository-root>\] \[--dry-run\] \[--json\]/u);

  const wrongCommand = spawnSync(process.execPath, [cliPath, "skills", "remove"], { encoding: "utf8" });
  assert.equal(wrongCommand.status, 2);
  assert.match(wrongCommand.stderr, /Usage:/u);
  const wrongArgument = spawnSync(process.execPath, [cliPath, "skills", "install", "--force"], { encoding: "utf8" });
  assert.equal(wrongArgument.status, 2);
  assert.match(wrongArgument.stderr, /Unknown argument: --force/u);
});

test("postinstall skips this source repository and global installs, and installs into INIT_CWD", async (t) => {
  assert.equal(isCommandCenterAiSourceRepository(repositoryRoot), true);
  assert.equal(isCommandCenterAiSourceRepository(packageRoot), true);
  assert.deepEqual(await runPostinstall({ env: { INIT_CWD: repositoryRoot }, logger: silent }), { skipped: "source-repository" });
  assert.deepEqual(await runPostinstall({ env: { INIT_CWD: packageRoot }, logger: silent }), { skipped: "source-repository" });
  assert.deepEqual(await runPostinstall({ env: { npm_config_global: "true" }, logger: silent }), { skipped: "global-install" });
  await assert.rejects(runPostinstall({ env: {}, logger: silent }), /INIT_CWD is unavailable/u);

  const application = await temporaryDirectory(t, "postinstall");
  assert.equal(isCommandCenterAiSourceRepository(application), false);
  const result = await runPostinstall({ env: { INIT_CWD: application }, logger: silent });
  assert.deepEqual(result.copied.map((item) => item.relativePath), expectedSkills);
  assert.match(await readFile(result.sentinelPath, "utf8"), /^command=npm postinstall$/mu);
});
