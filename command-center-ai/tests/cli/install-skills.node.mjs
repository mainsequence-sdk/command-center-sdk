import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ChatSkillInstallBlocked,
  installChatSkills,
  listPackagedSkills,
  PROVENANCE_FILENAME,
} from "../../cli/install-skills.mjs";
import { isChatSourceRepository, runPostinstall } from "../../cli/postinstall.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositoryRoot = resolve(packageRoot, "..");
const skillsRoot = join(packageRoot, "agent_scaffold", "skills");
const cliPath = join(packageRoot, "cli", "command-center-ai.mjs");
const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const expectedSkills = [
  "build-chat-application",
  "connect-chat-to-the-platform",
  "design-agent-conversation-capabilities",
  "manage-model-providers",
];
const silent = { log() {}, error() {}, warn() {} };

async function temporaryRepository(t) {
  const root = await mkdtemp(join(tmpdir(), "chat-skills-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFileAt(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

test("every packaged skill is a standalone skill with its agent metadata", async () => {
  assert.deepEqual(await listPackagedSkills(skillsRoot), expectedSkills);

  for (const skill of expectedSkills) {
    const text = await readFile(join(skillsRoot, skill, "SKILL.md"), "utf8");
    const frontMatter = /^---\n([\s\S]*?)\n---\n/u.exec(text)?.[1] ?? "";
    assert.match(frontMatter, new RegExp(`^name: ${skill}$`, "mu"), `${skill}: name`);
    assert.match(frontMatter, /^description: \S.{80,}$/mu, `${skill}: description`);
    assert.doesNotMatch(text, /\]\((?:\.\.\/)+(?:src|dist)\//u, `${skill} links into package internals`);

    const metadata = await readFile(join(skillsRoot, skill, "agents", "openai.yaml"), "utf8");
    assert.match(metadata, /^interface:\n {2}display_name: "[^"]+"\n {2}short_description: "[^"]+"\n {2}default_prompt: "[^"]+"\n$/u);
    assert.match(metadata, new RegExp(`\\$${skill}\\b`, "u"), `${skill}: default_prompt names the skill`);
  }
});

test("installs every skill into its own namespace and leaves every other namespace alone", async (t) => {
  const project = await temporaryRepository(t);
  const others = {
    ".agents/skills/command-center/general/build-command-center-application/SKILL.md": "SDK skill\n",
    ".agents/skills/command-center/PINNED_FROM.txt": "library_name=@dev-mainsequence/command-center-sdk\n",
    ".agents/skills/mainsequence/platform-skill/SKILL.md": "platform skill\n",
    ".agents/skills/notes.md": "a file beside the namespaces\n",
  };
  for (const [path, text] of Object.entries(others)) await writeFileAt(join(project, path), text);

  const result = await installChatSkills({
    projectDir: project,
    command: "test install",
    now: () => new Date("2026-09-23T12:00:00Z"),
  });

  assert.equal(result.destinationRoot, join(await realpathOf(project), ".agents", "skills", "command-center-ai"));
  assert.deepEqual(result.installed, expectedSkills);
  assert.deepEqual(result.removed, []);
  for (const skill of expectedSkills) {
    assert.equal(
      await readFile(join(result.destinationRoot, skill, "SKILL.md"), "utf8"),
      await readFile(join(skillsRoot, skill, "SKILL.md"), "utf8"),
    );
    await readFile(join(result.destinationRoot, skill, "agents", "openai.yaml"), "utf8");
  }
  const provenance = await readFile(join(result.destinationRoot, PROVENANCE_FILENAME), "utf8");
  assert.match(provenance, new RegExp(`^library_name=${manifest.name}$`, "mu"));
  assert.match(provenance, new RegExp(`^pinned_version=${manifest.version}$`, "mu"));
  assert.match(provenance, /^namespace=command-center-ai$/mu);
  assert.match(provenance, /^ownership=authoritative_namespace$/mu);
  assert.match(provenance, /^copied_at_utc=2026-09-23T12:00:00.000Z$/mu);
  assert.match(provenance, /^command=test install$/mu);
  for (const skill of expectedSkills) assert.match(provenance, new RegExp(`^skill_path=${skill}$`, "mu"));

  for (const [path, text] of Object.entries(others)) {
    assert.equal(await readFile(join(project, path), "utf8"), text, `${path} changed`);
  }
  // Nothing is left beside the namespaces: no staging directory survives the install.
  assert.deepEqual((await readdir(join(project, ".agents", "skills"))).sort(), [
    "command-center",
    "command-center-ai",
    "mainsequence",
    "notes.md",
  ]);
});

test("replaces the whole namespace on every install", async (t) => {
  const project = await temporaryRepository(t);
  const namespace = join(project, ".agents", "skills", "command-center-ai");
  await writeFileAt(join(namespace, "retired-skill", "SKILL.md"), "retired\n");
  await writeFileAt(join(namespace, "build-chat-application", "local-edit.md"), "a local edit\n");
  await writeFileAt(join(namespace, PROVENANCE_FILENAME), "schema=0\n");

  const result = await installChatSkills({ projectDir: project });

  assert.deepEqual(result.removed, ["retired-skill"]);
  assert.deepEqual((await readdir(namespace)).sort(), [...expectedSkills, PROVENANCE_FILENAME].sort());
  assert.deepEqual((await readdir(join(namespace, "build-chat-application"))).sort(), ["SKILL.md", "agents"]);
  assert.match(await readFile(join(namespace, PROVENANCE_FILENAME), "utf8"), /^schema=1$/mu);
});

test("refuses a destination that is a symbolic link and writes nothing through it", async (t) => {
  const project = await temporaryRepository(t);
  const elsewhere = join(project, "elsewhere");
  await writeFileAt(join(elsewhere, "kept.md"), "kept\n");
  await mkdir(join(project, ".agents", "skills"), { recursive: true });
  await symlink(elsewhere, join(project, ".agents", "skills", "command-center-ai"));

  await assert.rejects(installChatSkills({ projectDir: project }), ChatSkillInstallBlocked);
  assert.deepEqual(await readdir(elsewhere), ["kept.md"]);
  assert.deepEqual((await readdir(join(project, ".agents", "skills"))).sort(), ["command-center-ai"]);
});

test("postinstall skips this source repository and global installs, and installs for an application", async (t) => {
  assert.equal(isChatSourceRepository(repositoryRoot), true);
  assert.equal(isChatSourceRepository(packageRoot), true);

  assert.deepEqual(await runPostinstall({ env: { INIT_CWD: repositoryRoot }, logger: silent }), {
    skipped: "source-repository",
  });
  assert.deepEqual(await runPostinstall({ env: { INIT_CWD: packageRoot }, logger: silent }), {
    skipped: "source-repository",
  });
  assert.deepEqual(await runPostinstall({ env: { npm_config_global: "true" }, logger: silent }), {
    skipped: "global-install",
  });
  await assert.rejects(runPostinstall({ env: {}, logger: silent }), /INIT_CWD is unavailable/u);

  const application = await temporaryRepository(t);
  assert.equal(isChatSourceRepository(application), false);
  const result = await runPostinstall({ env: { INIT_CWD: application }, logger: silent });
  assert.deepEqual(result.installed, expectedSkills);
  assert.match(await readFile(join(result.destinationRoot, PROVENANCE_FILENAME), "utf8"), /^command=npm postinstall$/mu);
});

test("the command installs into --path and explains its usage", async (t) => {
  const project = await temporaryRepository(t);
  const install = spawnSync(process.execPath, [cliPath, "skills", "install", "--path", project], {
    encoding: "utf8",
  });
  assert.equal(install.status, 0, install.stderr);
  assert.match(install.stdout, /Installed 4 chat skill\(s\)/u);
  assert.equal(
    (await readdir(join(project, ".agents", "skills", "command-center-ai"))).sort().join(","),
    [...expectedSkills, PROVENANCE_FILENAME].sort().join(","),
  );

  const help = spawnSync(process.execPath, [cliPath, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: command-center-ai skills install/u);

  const wrong = spawnSync(process.execPath, [cliPath, "skills", "remove"], { encoding: "utf8" });
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /Usage: command-center-ai skills install/u);
});

async function realpathOf(path) {
  const { realpath } = await import("node:fs/promises");
  return realpath(path);
}
