import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  AGENT_SKILL_NAMESPACE,
  AgentSkillInstallBlocked,
  installAgentSkills,
} from "../../cli/install-agent-skills.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");
const postinstallPath = join(packageRoot, "cli", "postinstall.mjs");

async function temporaryDirectory(label) {
  return mkdtemp(join(tmpdir(), `command-center-sdk-${label}-`));
}

async function writeSkill(skillsRoot, relativePath, content = "skill") {
  const name = relativePath.split("/").at(-1);
  const skillRoot = join(skillsRoot, ...relativePath.split("/"));
  await mkdir(join(skillRoot, "agents"), { recursive: true });
  await writeFile(
    join(skillRoot, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${content}\n---\n\n# ${name}\n`,
    "utf8",
  );
  await writeFile(
    join(skillRoot, "agents", "openai.yaml"),
    `interface:\n  display_name: "${name}"\n`,
    "utf8",
  );
}

test("installs packaged skill folders, preserves unrelated skills, and writes provenance", async () => {
  const fixtureRoot = await temporaryDirectory("copy");
  try {
    const skillsRoot = join(fixtureRoot, "package", "skills");
    const projectRoot = join(fixtureRoot, "project");
    await writeSkill(skillsRoot, "contracts/alpha-skill", "new alpha");
    await writeSkill(skillsRoot, "views/beta-skill", "new beta");
    await writeSkill(skillsRoot, ".hidden-skill", "hidden");
    await writeSkill(skillsRoot, "__cache", "cache");
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(skillsRoot, "README.md"), "not a skill", "utf8");

    const managedRoot = join(projectRoot, ".agents", "skills", AGENT_SKILL_NAMESPACE);
    await mkdir(join(managedRoot, "contracts", "alpha-skill"), { recursive: true });
    await writeFile(join(managedRoot, "contracts", "alpha-skill", "stale.txt"), "stale", "utf8");
    await mkdir(join(managedRoot, "consumer-owned"), { recursive: true });
    await writeFile(join(managedRoot, "consumer-owned", "keep.txt"), "keep", "utf8");
    const siblingSkill = join(projectRoot, ".agents", "skills", "project-skill");
    await mkdir(siblingSkill, { recursive: true });
    await writeFile(join(siblingSkill, "keep.txt"), "keep", "utf8");

    const result = await installAgentSkills({
      projectDir: projectRoot,
      skillsPath: skillsRoot,
      packageMetadata: {
        name: "@dev-mainsequence/command-center-sdk",
        version: "9.8.7",
      },
      command: "test install",
    });

    assert.deepEqual(
      result.copied.map((item) => item.relativePath),
      ["contracts/alpha-skill", "views/beta-skill"],
    );
    assert.match(await readFile(join(managedRoot, "contracts", "alpha-skill", "SKILL.md"), "utf8"), /new alpha/u);
    await assert.rejects(readFile(join(managedRoot, "contracts", "alpha-skill", "stale.txt"), "utf8"), {
      code: "ENOENT",
    });
    assert.equal(await readFile(join(managedRoot, "consumer-owned", "keep.txt"), "utf8"), "keep");
    assert.equal(await readFile(join(siblingSkill, "keep.txt"), "utf8"), "keep");

    const sentinel = await readFile(join(managedRoot, "PINNED_FROM.txt"), "utf8");
    assert.match(sentinel, /schema=2/u);
    assert.match(sentinel, /namespace=command-center/u);
    assert.match(sentinel, /pinned_version=9\.8\.7/u);
    assert.match(sentinel, /command=test install/u);
    assert.match(sentinel, /skill_path=contracts\/alpha-skill/u);
    assert.match(sentinel, /skill_path=views\/beta-skill/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("dry-run validates and reports without writing", async () => {
  const fixtureRoot = await temporaryDirectory("dry-run");
  try {
    const skillsRoot = join(fixtureRoot, "package", "skills");
    const projectRoot = join(fixtureRoot, "project");
    await writeSkill(skillsRoot, "views/alpha-skill");
    await mkdir(projectRoot, { recursive: true });

    const result = await installAgentSkills({
      projectDir: projectRoot,
      skillsPath: skillsRoot,
      packageMetadata: { name: "sdk", version: "1.0.0" },
      dryRun: true,
    });

    assert.equal(result.dryRun, true);
    await assert.rejects(readFile(result.sentinelPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("blocks source and destination overlap before copying", async () => {
  const fixtureRoot = await temporaryDirectory("overlap");
  try {
    const projectRoot = join(fixtureRoot, "project");
    const skillsRoot = join(projectRoot, ".agents", "skills", AGENT_SKILL_NAMESPACE);
    await writeSkill(skillsRoot, "views/alpha-skill");

    await assert.rejects(
      installAgentSkills({
        projectDir: projectRoot,
        skillsPath: skillsRoot,
        packageMetadata: { name: "sdk", version: "1.0.0" },
      }),
      AgentSkillInstallBlocked,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("blocks symbolic links in a packaged skill", async () => {
  const fixtureRoot = await temporaryDirectory("symlink");
  try {
    const skillsRoot = join(fixtureRoot, "package", "skills");
    const projectRoot = join(fixtureRoot, "project");
    await writeSkill(skillsRoot, "views/alpha-skill");
    await mkdir(projectRoot, { recursive: true });
    await symlink(
      join(skillsRoot, "views", "alpha-skill", "SKILL.md"),
      join(skillsRoot, "views", "alpha-skill", "linked.md"),
    );

    await assert.rejects(
      installAgentSkills({
        projectDir: projectRoot,
        skillsPath: skillsRoot,
        packageMetadata: { name: "sdk", version: "1.0.0" },
      }),
      AgentSkillInstallBlocked,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("rejects duplicate skill names in different categories", async () => {
  const fixtureRoot = await temporaryDirectory("duplicates");
  try {
    const skillsRoot = join(fixtureRoot, "package", "skills");
    const projectRoot = join(fixtureRoot, "project");
    await writeSkill(skillsRoot, "contracts/shared-skill");
    await writeSkill(skillsRoot, "views/shared-skill");
    await mkdir(projectRoot, { recursive: true });

    await assert.rejects(
      installAgentSkills({
        projectDir: projectRoot,
        skillsPath: skillsRoot,
        packageMetadata: { name: "sdk", version: "1.0.0" },
      }),
      /duplicated/u,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("migrates the legacy flat managed layout without removing consumer-owned skills", async () => {
  const fixtureRoot = await temporaryDirectory("legacy-layout");
  try {
    const skillsRoot = join(fixtureRoot, "package", "skills");
    const projectRoot = join(fixtureRoot, "project");
    const managedRoot = join(projectRoot, ".agents", "skills", AGENT_SKILL_NAMESPACE);
    await writeSkill(skillsRoot, "general/use-command-center-sdk");
    await mkdir(join(managedRoot, "use-command-center-sdk"), { recursive: true });
    await writeFile(join(managedRoot, "use-command-center-sdk", "legacy.txt"), "legacy", "utf8");
    await mkdir(join(managedRoot, "consumer-owned"), { recursive: true });
    await writeFile(join(managedRoot, "consumer-owned", "keep.txt"), "keep", "utf8");
    await writeFile(
      join(managedRoot, "PINNED_FROM.txt"),
      "schema=1\nlibrary_name=sdk\nnamespace=command-center\npinned_version=0.1.0\n",
      "utf8",
    );

    await installAgentSkills({
      projectDir: projectRoot,
      skillsPath: skillsRoot,
      packageMetadata: { name: "sdk", version: "1.0.0" },
    });

    await assert.rejects(readFile(join(managedRoot, "use-command-center-sdk", "legacy.txt"), "utf8"), {
      code: "ENOENT",
    });
    await readFile(join(managedRoot, "general", "use-command-center-sdk", "SKILL.md"), "utf8");
    assert.equal(await readFile(join(managedRoot, "consumer-owned", "keep.txt"), "utf8"), "keep");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("explicit CLI installs the packaged skills and emits JSON", async () => {
  const projectRoot = await temporaryDirectory("cli");
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "skills", "install", "--path", projectRoot, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.namespace, AGENT_SKILL_NAMESPACE);
    assert.equal(payload.copied.length, 23);
    assert.equal(
      await readFile(
        join(payload.destinationRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
        "utf8",
      ).then((value) => value.includes("createStaticSiteIframeClient")),
      true,
    );
    assert.equal(
      await readFile(join(payload.destinationRoot, "PINNED_FROM.txt"), "utf8").then((value) =>
        value.includes(`pinned_version=${payload.pinnedVersion}`),
      ),
      true,
    );
    assert.equal(
      await readFile(
        join(payload.destinationRoot, "widget", "built-ins", "implement-app-component", "SKILL.md"),
        "utf8",
      ).then((value) => value.includes("command-center.app_component_authoring@v1")),
      true,
    );
    await readFile(
      join(payload.destinationRoot, "contracts", "implement-bulk-actions-contract", "SKILL.md"),
      "utf8",
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("postinstall resolves and installs into INIT_CWD", async () => {
  const projectRoot = await temporaryDirectory("postinstall");
  try {
    const result = spawnSync(process.execPath, [postinstallPath], {
      encoding: "utf8",
      env: {
        ...process.env,
        INIT_CWD: projectRoot,
        npm_config_global: "false",
        COMMAND_CENTER_SDK_MCP_POSTINSTALL: "0",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Installed 23 agent skill/u);
    const sentinel = await readFile(
      join(projectRoot, ".agents", "skills", AGENT_SKILL_NAMESPACE, "PINNED_FROM.txt"),
      "utf8",
    );
    assert.match(sentinel, /command=npm postinstall/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("postinstall skips consumer scaffolding in the SDK source repository", () => {
  const result = spawnSync(process.execPath, [postinstallPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      INIT_CWD: dirname(packageRoot),
      npm_config_global: "false",
      COMMAND_CENTER_SDK_MCP_POSTINSTALL: "0",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Source repository install detected/u);
});
