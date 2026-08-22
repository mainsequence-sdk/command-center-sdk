import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const skillsRoot = resolve(packageRoot, "agent_scaffold/skills");
const docsRoot = resolve(packageRoot, "docs");

async function listSkillPaths(directory = skillsRoot) {
  const paths = [];
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
    paths.push(relative(skillsRoot, directory).split(sep).join("/"));
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("__")) {
      paths.push(...(await listSkillPaths(join(directory, entry.name))));
    }
  }
  return paths.sort();
}

test("human documentation maps every packaged agent skill", async () => {
  const skillPaths = await listSkillPaths();
  const docsIndex = await readFile(resolve(docsRoot, "README.md"), "utf8");
  for (const skillPath of skillPaths) {
    assert.equal(docsIndex.includes(`\`${skillPath}\``), true, `${skillPath} is not documented`);
  }
  assert.equal(skillPaths.length, 21);
});

test("consumer scaffold excludes SDK-maintainer workflows", async () => {
  const skillPaths = await listSkillPaths();
  for (const name of [
    "extend-command-center-sdk",
    "evolve-command-center-contract",
    "verify-command-center-sdk-change",
  ]) {
    assert.equal(skillPaths.some((skillPath) => skillPath.endsWith(`/${name}`)), false);
  }
});

test("consumer guidance documents SDK status and update as a separate project lifecycle", async () => {
  const useSdkSkill = await readFile(
    join(skillsRoot, "general", "use-command-center-sdk", "SKILL.md"),
    "utf8",
  );
  const maintainProjectSkill = await readFile(
    join(skillsRoot, "general", "maintain-command-center-project", "SKILL.md"),
    "utf8",
  );
  const gettingStarted = await readFile(join(docsRoot, "getting-started.md"), "utf8");

  for (const value of [useSdkSkill, maintainProjectSkill, gettingStarted]) {
    assert.match(value, /project sdk-status/u);
    assert.match(value, /project update-sdk/u);
    assert.match(value, /dry-run/u);
  }
  assert.match(useSdkSkill, /declared.*locked.*installed.*wanted.*latest/isu);
  assert.match(maintainProjectSkill, /does not change the application version/iu);
});

test("contract skills point to the canonical manifest without bundling contract copies", async () => {
  const contractSkills = (await listSkillPaths()).filter((skillPath) =>
    skillPath.startsWith("contracts/"),
  );
  assert.equal(contractSkills.length, 4);
  for (const skillPath of contractSkills) {
    const skill = await readFile(join(skillsRoot, ...skillPath.split("/"), "SKILL.md"), "utf8");
    assert.match(skill, /contracts\/manifest\.json/u);
    assert.doesNotMatch(skill, /contracts\/schemas\/[a-z0-9-]+\.schema\.json/u);
  }
});

test("SDK documentation does not contain consumer migration inventories", async () => {
  const markdownFiles = (await readdir(docsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);
  const markdown = await Promise.all(
    markdownFiles.map((name) => readFile(resolve(docsRoot, name), "utf8")),
  );

  for (const value of markdown) {
    assert.doesNotMatch(value, /^## .*application route inventory.*$/imu);
    assert.doesNotMatch(value, /GET \/api\/v1\/[a-z0-9_{}?=&/-]+\/discovery\//iu);
  }
});

test("theme guidance makes closed-token consumption and audit mandatory", async () => {
  const themeSkill = await readFile(
    join(skillsRoot, "theme", "theme-command-center-app", "SKILL.md"),
    "utf8",
  );
  const embedSkill = await readFile(
    join(skillsRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
    "utf8",
  );
  const themesGuide = await readFile(join(docsRoot, "themes-and-embeds.md"), "utf8");

  for (const value of [themeSkill, embedSkill, themesGuide]) {
    assert.match(value, /closed theme contract|closed consumer contract|closed-token audit/iu);
    assert.match(value, /theme audit/iu);
    assert.match(value, /computed/iu);
  }
  assert.match(themeSkill, /Do not invent an SDK-looking namespace/iu);
  assert.match(themeSkill, /Do not add literal fallback values/iu);
});

test("static-site guidance keeps delegated FastAPI credentials behind the SDK lifecycle", async () => {
  const embedSkill = await readFile(
    join(skillsRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
    "utf8",
  );
  const useSdkSkill = await readFile(
    join(skillsRoot, "general", "use-command-center-sdk", "SKILL.md"),
    "utf8",
  );
  const applicationSkill = await readFile(
    join(skillsRoot, "general", "build-command-center-application", "SKILL.md"),
    "utf8",
  );
  const themesGuide = await readFile(join(docsRoot, "themes-and-embeds.md"), "utf8");

  for (const value of [embedSkill, themesGuide]) {
    assert.match(value, /fetchFastApi/u);
    assert.match(value, /relative path/iu);
    assert.match(value, /direct-link|direct link/iu);
    assert.match(value, /in memory|in-memory/iu);
    assert.match(value, /never fall back|no\s+fallback/iu);
    assert.match(value, /runtime-starting/iu);
    assert.match(value, /three attempts|maximum-three-attempt/iu);
    assert.match(value, /RequestInit\.signal|cancellation/iu);
    assert.match(value, /real cross-origin browser|real browser/iu);
  }
  assert.match(embedSkill, /resolveFastApiCredential/u);
  assert.match(useSdkSkill, /integrate-static-site-iframe/u);
  assert.match(applicationSkill, /fetchFastApi/u);
});
