import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { listPackagedSkills } from "../../cli/install-skills.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = join(packageRoot, "docs");

/** The rows of the documentation map: each names a skill and links its human guide. */
async function readSkillMap() {
  const index = await readFile(join(docsRoot, "README.md"), "utf8");
  const section = index.split(/^## Task and agent-skill map$/mu)[1] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*(?:Task|-+)\s*\|/u.test(line))
    .map((line) => ({
      skills: [...line.matchAll(/`([a-z0-9-]+)`/gu)].map((match) => match[1]),
      guides: [...line.matchAll(/\]\((\.\/[^)#]+\.md)\)/gu)].map((match) => match[1]),
    }));
}

test("every packaged skill has a human guide in the documentation map", async () => {
  const skills = await listPackagedSkills(join(packageRoot, "agent_scaffold", "skills"));
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
    const guideText = await readFile(join(docsRoot, guide), "utf8");
    const skillText = await readFile(join(packageRoot, "agent_scaffold", "skills", skill, "SKILL.md"), "utf8");
    assert.match(guideText, new RegExp(`\`${skill}\``, "u"), `${guide} does not name ${skill}`);
    assert.ok(skillText.includes(`docs/${guide.replace("./", "")}`), `${skill} does not name ${guide}`);
  }
});
