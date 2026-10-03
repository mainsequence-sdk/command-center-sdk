import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { listPackagedSkills } from "../../cli/install-agent-skills.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = join(packageRoot, "docs");

/** The rows of the documentation map: each names a skill by its lane path and links its human guide. */
async function readSkillMap() {
  const index = await readFile(join(docsRoot, "README.md"), "utf8");
  const section = index.split(/^## Task and agent-skill map$/mu)[1] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*(?:Task|-+)\s*\|/u.test(line))
    .map((line) => ({
      skills: [...line.matchAll(/`([a-z0-9-]+\/[a-z0-9-]+)`/gu)].map((match) => match[1]),
      guides: [...line.matchAll(/\]\((\.\/[^)#]+\.md)\)/gu)].map((match) => match[1]),
    }));
}

test("every packaged skill has a human guide in the documentation map", async () => {
  const skills = (await listPackagedSkills(join(packageRoot, "agent_scaffold", "skills"))).map(
    (skill) => skill.relativePath,
  );
  const rows = await readSkillMap();

  assert.ok(skills.length > 0);
  for (const skill of skills) {
    const row = rows.find((candidate) => candidate.skills.includes(skill));
    assert.ok(row, `${skill} has no row in the task and agent-skill map of docs/README.md`);
    assert.equal(row.guides.length, 1, `${skill} must link exactly one human guide`);
    await access(join(docsRoot, row.guides[0])).catch(() => {
      assert.fail(`${skill}: its guide ${row.guides[0]} does not exist`);
    });
  }
  assert.equal(rows.length, skills.length, "the map lists a skill the package does not ship");
});

test("every guide names its skill, and every skill names its guide", async () => {
  const rows = await readSkillMap();

  for (const { skills: [skill], guides: [guide] } of rows) {
    const name = skill.split("/").at(-1);
    const guideText = await readFile(join(docsRoot, guide), "utf8");
    const skillText = await readFile(join(packageRoot, "agent_scaffold", "skills", ...skill.split("/"), "SKILL.md"), "utf8");
    assert.match(guideText, new RegExp(`\`${name}\``, "u"), `${guide} does not name ${name}`);
    assert.ok(skillText.includes(`docs/${guide.replace("./", "")}`), `${skill} does not name ${guide}`);
  }
});

test("an embedded application names its Environment and its Agent for each Environment", async () => {
  const skillsRoot = join(packageRoot, "agent_scaffold", "skills");
  const mountSkill = await readFile(join(skillsRoot, "engine", "mount-agent-conversation", "SKILL.md"), "utf8");
  const applicationSkill = await readFile(
    join(skillsRoot, "general", "build-command-center-ai-application", "SKILL.md"),
    "utf8",
  );
  const applicationGuide = await readFile(join(docsRoot, "build-an-ai-application.md"), "utf8");
  const resolutionGuide = await readFile(join(docsRoot, "agent-session-resolution.md"), "utf8");

  for (const value of [mountSkill, applicationGuide]) {
    assert.match(value, /Name The Environment And The Agent Per Environment/iu);
    assert.match(value, /build_environment:\n\s+VITE_ENVIRONMENT_UID: .+\n\s+VITE_AGENT_UID: /u);
    assert.match(value, /organization_environment_uid=<Environment UID>/u);
    assert.match(value, /status: environmentUid && agentUid \? "ready" : "error"/u);
    assert.match(value, /\.env\.development/u);
    assert.match(value, /person's Command Center Environment/u);
  }
  for (const value of [mountSkill, applicationGuide, resolutionGuide]) {
    assert.match(value, /empty (?:session list|without an error)|come back empty/iu);
  }
  assert.match(mountSkill, /\$maintain-command-center-code-repository/u);
  assert.match(applicationSkill, /\*\*Which Environment\.\*\*/u);
  assert.match(applicationSkill, /\$mount-agent-conversation/u);
});
