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
  assert.equal(skillPaths.length, 24);
});

test("application documentation guidance stays aligned with the official scaffold", async () => {
  const documentationSkill = await readFile(
    join(
      skillsRoot,
      "documentation",
      "document-command-center-application",
      "SKILL.md",
    ),
    "utf8",
  );
  const documentationGuide = await readFile(
    join(docsRoot, "application-documentation.md"),
    "utf8",
  );

  for (const value of [documentationSkill, documentationGuide]) {
    assert.match(value, /application docs init/u);
    assert.match(value, /documentation\/navigation\.json/u);
    assert.match(value, /dist\/docs/u);
    assert.match(value, /package-lock\.json/u);
    assert.match(value, /Node(?:\.js)? major|Node runtime/iu);
    assert.match(value, /deep link/iu);
    assert.match(value, /same (?:static )?artifact|same-artifact|combined production artifact/iu);
  }
  assert.match(documentationSkill, /postman-code-generators/u);
  assert.match(documentationGuide, /platform owns|deployment platform owns/iu);
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

test("consumer guidance documents SDK status and update as a separate application lifecycle", async () => {
  const useSdkSkill = await readFile(
    join(skillsRoot, "general", "use-command-center-sdk", "SKILL.md"),
    "utf8",
  );
  const maintainCodeRepositorySkill = await readFile(
    join(skillsRoot, "general", "maintain-command-center-code-repository", "SKILL.md"),
    "utf8",
  );
  const gettingStarted = await readFile(join(docsRoot, "getting-started.md"), "utf8");

  for (const value of [useSdkSkill, maintainCodeRepositorySkill, gettingStarted]) {
    assert.match(value, /application sdk-status/u);
    assert.match(value, /application update-sdk/u);
    assert.match(value, /dry-run/u);
  }
  assert.match(useSdkSkill, /declared.*locked.*installed.*wanted.*latest/isu);
  assert.match(maintainCodeRepositorySkill, /does not change the application version/iu);
  for (const value of [maintainCodeRepositorySkill, gettingStarted]) {
    assert.match(value, /(?:next|preview\w*)[^.]*npm[^.]*patch[^.]*version/iu);
    assert.match(value, /exact.*tag.*origin|exact `refs\/tags/isu);
    assert.match(value, /--atomic --follow-tags/iu);
  }
});

test("active application lifecycle guidance does not revive the retired platform ontology", async () => {
  const paths = [
    resolve(packageRoot, "README.md"),
    resolve(packageRoot, "cli", "README.md"),
    join(docsRoot, "README.md"),
    join(docsRoot, "application-documentation.md"),
    join(docsRoot, "getting-started.md"),
    join(skillsRoot, "documentation", "document-command-center-application", "SKILL.md"),
    join(skillsRoot, "general", "maintain-command-center-code-repository", "SKILL.md"),
    join(skillsRoot, "general", "use-command-center-sdk", "SKILL.md"),
  ];

  for (const path of paths) {
    assert.doesNotMatch(await readFile(path, "utf8"), /\bProjects?\b/u, path);
  }
});

test("CodeRepository sync guidance uses Git-native identity without a local CodeRepository UID marker", async () => {
  const maintainCodeRepositorySkill = await readFile(
    join(skillsRoot, "general", "maintain-command-center-code-repository", "SKILL.md"),
    "utf8",
  );
  const gettingStarted = await readFile(join(docsRoot, "getting-started.md"), "utf8");
  const packageReadme = await readFile(resolve(packageRoot, "README.md"), "utf8");
  const cliReadme = await readFile(resolve(packageRoot, "cli", "README.md"), "utf8");

  for (const value of [maintainCodeRepositorySkill, gettingStarted, packageReadme, cliReadme]) {
    assert.match(value, /canonical[^.]*origin[^.]*branch[^.]*HEAD/isu);
    assert.match(value, /assertion/iu);
    assert.doesNotMatch(value, /requires?[^.]*local repository identity/iu);
  }
  assert.match(cliReadme, /resolve-git-context/u);
  assert.match(maintainCodeRepositorySkill, /Do not add or restore superseded caller-supplied repository/u);
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

test("layout guidance uses public primitives and real-browser geometry verification", async () => {
  const layoutSkill = await readFile(
    join(skillsRoot, "layout", "compose-command-center-page", "SKILL.md"),
    "utf8",
  );
  const applicationSkill = await readFile(
    join(skillsRoot, "general", "build-command-center-application", "SKILL.md"),
    "utf8",
  );
  const themeSkill = await readFile(
    join(skillsRoot, "theme", "theme-command-center-app", "SKILL.md"),
    "utf8",
  );
  const layoutGuide = await readFile(join(docsRoot, "application-layout.md"), "utf8");

  for (const value of [layoutSkill, layoutGuide]) {
    assert.match(value, /@dev-mainsequence\/command-center-sdk\/layout/u);
    assert.match(value, /ApplicationPageStack/u);
    assert.match(value, /contentPadding="none"/u);
    assert.match(value, /layout\/testing/u);
    assert.match(value, /375×812/u);
    assert.match(value, /dark and one\s+light/iu);
    assert.match(value, /Do not wrap|Do not double-wrap/iu);
  }
  assert.match(applicationSkill, /\$compose-command-center-page/u);
  assert.match(themeSkill, /\$compose-command-center-page/u);
  assert.match(themeSkill, /theme audit as proof/iu);
});

test("application feedback guidance keeps presentation controlled and lifecycle application-owned", async () => {
  const feedbackSkill = await readFile(
    join(skillsRoot, "feedback", "build-application-loading-flow", "SKILL.md"),
    "utf8",
  );
  const feedbackGuide = await readFile(join(docsRoot, "application-feedback.md"), "utf8");
  const applicationSkill = await readFile(
    join(skillsRoot, "general", "build-command-center-application", "SKILL.md"),
    "utf8",
  );

  for (const value of [feedbackSkill, feedbackGuide]) {
    assert.match(value, /@dev-mainsequence\/command-center-sdk\/feedback/u);
    assert.match(value, /ApplicationStatusScreen/u);
    assert.match(value, /ProgressStageList/u);
    assert.match(value, /375×812/u);
    assert.match(value, /dark\s+and one light/iu);
    assert.match(value, /reduced motion/iu);
    assert.match(value, /polling.*retry.*timeout.*application|application.*polling.*retry/isu);
    assert.match(value, /Do not.*percentage|Do not calculate a percentage/iu);
  }
  assert.match(applicationSkill, /\$build-application-loading-flow/u);
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
