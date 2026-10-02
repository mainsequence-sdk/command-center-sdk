import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LEGACY_MCP_AGENT_SKILL_NAMESPACE,
  MCP_AGENT_SKILL_NAMESPACE,
  MCP_PINNED_FROM_FILENAME,
  McpAgentSkillInstallBlocked,
  installMcpAgentSkills,
} from "../../cli/install-mcp-skills.mjs";
import {
  MCP_PROTOCOL_VERSION,
  PLATFORM_ONTOLOGY_URI,
  PLATFORM_SKILL_URI_PREFIX,
  fetchPlatformSkillCatalog,
  parsePlatformSkillCatalog,
} from "../../cli/mcp-platform-skills.mjs";
import { syncAgentSkills } from "../../cli/sync-agent-skills.mjs";
import { runPostinstall } from "../../cli/postinstall.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");
const postinstallPath = join(packageRoot, "cli", "postinstall.mjs");

async function temporaryDirectory(label) {
  return mkdtemp(join(tmpdir(), `command-center-sdk-mcp-${label}-`));
}

function resourceRow({ uri, name, path, mimeType, content, manifestSha256 = "a".repeat(64) }) {
  const size = Buffer.byteLength(content, "utf8");
  const contentSha256 = createHash("sha256").update(content, "utf8").digest("hex");
  return {
    uri,
    name,
    mimeType,
    size,
    _meta: {
      manifest_version: 2,
      manifest_sha256: manifestSha256,
      resource_path: path,
      content_sha256: contentSha256,
    },
    _content: {
      uri,
      mimeType,
      text: content,
      _meta: {
        resource_name: name,
        resource_path: path,
        manifest_version: 2,
        manifest_sha256: manifestSha256,
        content_sha256: contentSha256,
        content_size: size,
      },
    },
  };
}

function platformRows(skills = [
  { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
  { name: "code_repository_design", path: "skills/platform/code_repository_design/SKILL.md" },
]) {
  const declarations = skills.map((skill) => ({
    name: skill.name,
    uri: `${PLATFORM_SKILL_URI_PREFIX}${skill.name.replaceAll("_", "-")}`,
  }));
  const ontology = `${JSON.stringify({
    title: "Main Sequence Platform Ontology",
    skill_resources: declarations,
  })}\n`;
  return [
    resourceRow({
      uri: PLATFORM_ONTOLOGY_URI,
      name: "Main Sequence platform ontology",
      path: "ontology/platform.json",
      mimeType: "application/json",
      content: ontology,
    }),
    ...skills.map((skill) =>
      resourceRow({
        uri: `${PLATFORM_SKILL_URI_PREFIX}${skill.name.replaceAll("_", "-")}`,
        name: skill.name,
        path: skill.path,
        mimeType: "text/markdown",
        content:
          `---\nname: ${skill.name.replaceAll("_", "-")}\n` +
          `description: ${skill.name} platform guidance\n---\n\n# ${skill.name}\n`,
      }),
    ),
  ];
}

function catalog(skills) {
  return parsePlatformSkillCatalog(platformRows(skills), {
    sourceUrl: "https://platform.example.test/mcp",
  });
}

function mockMcpFetch(rows, calls = []) {
  const listed = rows.map(({ _content: _content, ...row }) => row);
  listed.splice(1, 0, { uri: "mainsequence://documents/release-notes", name: "release_notes" });
  const contentByUri = new Map(rows.map((row) => [row.uri, row._content]));
  return async (_url, request) => {
    const payload = JSON.parse(request.body);
    calls.push({ payload, headers: request.headers });
    let result;
    if (payload.method === "initialize") {
      result = {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { resources: {} },
      };
    } else if (payload.method === "resources/list") {
      result = { resources: listed };
    } else {
      result = { contents: [contentByUri.get(payload.params.uri)] };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ jsonrpc: "2.0", id: payload.id, result }),
    };
  };
}

function sanitizedEnvironment(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.COMMAND_CENTER_SDK_MCP_URL;
  delete env.MAINSEQUENCE_MCP_URL;
  delete env.MAINSEQUENCE_ENDPOINT;
  delete env.MAINSEQUENCE_ACCESS_TOKEN;
  return { ...env, ...overrides };
}

test("fetches the ontology-owned MCP catalog and ignores unrelated resources", async () => {
  const rows = platformRows();
  const calls = [];
  const result = await fetchPlatformSkillCatalog({
    mcpUrl: "https://platform.example.test/mcp",
    accessToken: "access-token",
    clientVersion: "0.1.3",
    fetchImpl: mockMcpFetch(rows, calls),
  });

  assert.deepEqual(result.skills.map((skill) => skill.name), ["code_repository_design", "command_center"]);
  assert.deepEqual(calls.map((call) => call.payload.method), [
    "initialize",
    "resources/list",
    "resources/read",
    "resources/read",
    "resources/read",
  ]);
  assert.equal(calls[0].headers["MCP-Protocol-Version"], undefined);
  assert.equal(calls[1].headers["MCP-Protocol-Version"], MCP_PROTOCOL_VERSION);
  assert.equal(calls.some((call) => call.payload.params?.uri?.includes("release-notes")), false);
});

test("follows MCP resource pagination before reading the ontology", async () => {
  const rows = platformRows();
  const listed = rows.map(({ _content: _content, ...row }) => row);
  const contentByUri = new Map(rows.map((row) => [row.uri, row._content]));
  const listParams = [];
  const fetchImpl = async (_url, request) => {
    const payload = JSON.parse(request.body);
    let result;
    if (payload.method === "initialize") {
      result = { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { resources: {} } };
    } else if (payload.method === "resources/list") {
      listParams.push(payload.params);
      result = payload.params.cursor
        ? { resources: listed.slice(1) }
        : { resources: listed.slice(0, 1), nextCursor: "page-2" };
    } else {
      result = { contents: [contentByUri.get(payload.params.uri)] };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ jsonrpc: "2.0", id: payload.id, result }),
    };
  };

  const result = await fetchPlatformSkillCatalog({
    mcpUrl: "https://platform.example.test/mcp",
    accessToken: "access-token",
    clientVersion: "0.1.3",
    fetchImpl,
  });
  assert.equal(result.skills.length, 2);
  assert.deepEqual(listParams, [{}, { cursor: "page-2" }]);
});

test("rejects drifted MCP content before installation", () => {
  const rows = platformRows();
  rows.at(-1)._content.text = "drifted";
  assert.throws(
    () => parsePlatformSkillCatalog(rows, { sourceUrl: "https://platform.example.test/mcp" }),
    /content hash mismatch/u,
  );
});

test("installs MCP skill folders, removes stale managed folders, and preserves unrelated content", async () => {
  const projectRoot = await temporaryDirectory("install");
  try {
    const unrelated = join(
      projectRoot,
      ".agents",
      "skills",
      MCP_AGENT_SKILL_NAMESPACE,
      "project_owned",
      "keep",
    );
    await mkdir(unrelated, { recursive: true });
    await writeFile(join(unrelated, "keep.txt"), "keep", "utf8");

    const first = await installMcpAgentSkills({
      projectDir: projectRoot,
      catalog: catalog(),
      installerVersion: "0.1.3",
    });
    assert.equal(first.installed.length, 2);
    await readFile(
      join(first.destinationRoot, "command_center", "command_center", "SKILL.md"),
      "utf8",
    );

    const secondCatalog = catalog([
      { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
      { name: "static_site", path: "skills/releases/static_site/SKILL.md" },
    ]);
    await installMcpAgentSkills({
      projectDir: projectRoot,
      catalog: secondCatalog,
      installerVersion: "0.1.4",
    });

    await assert.rejects(
      readFile(join(first.destinationRoot, "platform", "code_repository_design", "SKILL.md"), "utf8"),
      { code: "ENOENT" },
    );
    await readFile(join(first.destinationRoot, "releases", "static_site", "SKILL.md"), "utf8");
    assert.equal(await readFile(join(unrelated, "keep.txt"), "utf8"), "keep");
    const sentinel = await readFile(
      join(first.destinationRoot, MCP_PINNED_FROM_FILENAME),
      "utf8",
    );
    assert.match(sentinel, /namespace=ms-command-center/u);
    assert.match(sentinel, /managed_skill_path=releases\/static_site/u);
    assert.doesNotMatch(sentinel, /managed_skill_path=platform\/code_repository_design/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("installs into its own namespace, apart from the Python SDK's", () => {
  assert.equal(MCP_AGENT_SKILL_NAMESPACE, "ms-command-center");
  assert.equal(LEGACY_MCP_AGENT_SKILL_NAMESPACE, "mainsequence");
});

test("rejects an unowned folder in its own namespace, even one a Python sentinel names", async () => {
  const projectRoot = await temporaryDirectory("ownership");
  try {
    const destinationRoot = join(projectRoot, ".agents", "skills", MCP_AGENT_SKILL_NAMESPACE);
    const managedRoot = join(destinationRoot, "command_center", "command_center");
    await mkdir(managedRoot, { recursive: true });
    await writeFile(join(managedRoot, "SKILL.md"), "old", "utf8");
    await writeFile(
      join(destinationRoot, "PINNED_FROM.txt"),
      [
        "schema=2",
        "namespace=mainsequence",
        "platform_resource.command_center.path=skills/command_center/command_center/SKILL.md",
        "",
      ].join("\n"),
      "utf8",
    );

    await assert.rejects(
      installMcpAgentSkills({
        projectDir: projectRoot,
        catalog: catalog([
          { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
        ]),
        installerVersion: "0.1.3",
      }),
      McpAgentSkillInstallBlocked,
    );
    assert.equal(await readFile(join(managedRoot, "SKILL.md"), "utf8"), "old");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

/** An earlier version's install in the Python SDK's namespace, beside the Python SDK's own files. */
async function writeLegacyNamespace(projectRoot, { installer = "@dev-mainsequence/command-center-sdk" } = {}) {
  const legacyRoot = join(projectRoot, ".agents", "skills", LEGACY_MCP_AGENT_SKILL_NAMESPACE);
  const files = {
    "command_center/command_center/SKILL.md": "earlier Command Center install",
    "platform/shared/SKILL.md": "recorded by both installers",
    "python_owned/SKILL.md": "the Python SDK's",
    "notes/project.md": "the project's",
    [MCP_PINNED_FROM_FILENAME]: [
      "schema=1",
      `installer=${installer}`,
      "namespace=mainsequence",
      "source=mcp",
      "managed_skill_path=command_center/command_center",
      "managed_skill_path=platform/shared",
      "",
    ].join("\n"),
    "PINNED_FROM.txt": [
      "schema=2",
      "namespace=mainsequence",
      "platform_resource.shared.path=skills/platform/shared/SKILL.md",
      "platform_resource.python.path=skills/python_owned/SKILL.md",
      "",
    ].join("\n"),
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(legacyRoot, path)), { recursive: true });
    await writeFile(join(legacyRoot, path), text, "utf8");
  }
  return legacyRoot;
}

test("removes only what an earlier version recorded in the Python SDK's namespace", async () => {
  const projectRoot = await temporaryDirectory("legacy");
  try {
    const legacyRoot = await writeLegacyNamespace(projectRoot);
    const skills = catalog([
      { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
    ]);

    const plan = await installMcpAgentSkills({
      projectDir: projectRoot,
      catalog: skills,
      installerVersion: "0.5.12",
      dryRun: true,
    });
    assert.deepEqual(plan.legacy.removed.map((item) => item.managedRoot), ["command_center/command_center"]);
    assert.deepEqual(plan.legacy.kept.map((item) => item.managedRoot), ["platform/shared"]);
    await readFile(join(legacyRoot, "command_center", "command_center", "SKILL.md"), "utf8");

    const result = await installMcpAgentSkills({
      projectDir: projectRoot,
      catalog: skills,
      installerVersion: "0.5.12",
    });
    await readFile(
      join(projectRoot, ".agents", "skills", "ms-command-center", "command_center", "command_center", "SKILL.md"),
      "utf8",
    );
    assert.equal(result.legacy.removed.length, 1);
    // The earlier install and its sentinel are gone, emptied parents with them.
    await assert.rejects(readFile(join(legacyRoot, MCP_PINNED_FROM_FILENAME), "utf8"), { code: "ENOENT" });
    await assert.rejects(readdir(join(legacyRoot, "command_center")), { code: "ENOENT" });
    // Everything the Python SDK or the project owns stays.
    assert.equal(await readFile(join(legacyRoot, "platform", "shared", "SKILL.md"), "utf8"), "recorded by both installers");
    assert.equal(await readFile(join(legacyRoot, "python_owned", "SKILL.md"), "utf8"), "the Python SDK's");
    assert.equal(await readFile(join(legacyRoot, "notes", "project.md"), "utf8"), "the project's");
    await readFile(join(legacyRoot, "PINNED_FROM.txt"), "utf8");

    // A second run finds nothing of its own there.
    const again = await installMcpAgentSkills({ projectDir: projectRoot, catalog: skills, installerVersion: "0.5.12" });
    assert.equal(again.legacy.sentinelPath, null);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("leaves the Python SDK's namespace alone when its MCP sentinel is not this installer's", async () => {
  const projectRoot = await temporaryDirectory("legacy-foreign");
  try {
    const legacyRoot = await writeLegacyNamespace(projectRoot, { installer: "someone-else" });
    const result = await installMcpAgentSkills({
      projectDir: projectRoot,
      catalog: catalog([
        { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
      ]),
      installerVersion: "0.5.12",
    });

    assert.equal(result.legacy.sentinelPath, null);
    await readFile(join(legacyRoot, "command_center", "command_center", "SKILL.md"), "utf8");
    await readFile(join(legacyRoot, MCP_PINNED_FROM_FILENAME), "utf8");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("removes the old namespace folder only when nothing else is left in it", async () => {
  const projectRoot = await temporaryDirectory("legacy-empty");
  try {
    const legacyRoot = join(projectRoot, ".agents", "skills", LEGACY_MCP_AGENT_SKILL_NAMESPACE);
    await mkdir(join(legacyRoot, "command_center", "command_center"), { recursive: true });
    await writeFile(join(legacyRoot, "command_center", "command_center", "SKILL.md"), "earlier", "utf8");
    await writeFile(
      join(legacyRoot, MCP_PINNED_FROM_FILENAME),
      [
        "schema=1",
        "installer=@dev-mainsequence/command-center-sdk",
        "namespace=mainsequence",
        "source=mcp",
        "managed_skill_path=command_center/command_center",
        "",
      ].join("\n"),
      "utf8",
    );

    await installMcpAgentSkills({
      projectDir: projectRoot,
      catalog: catalog([
        { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
      ]),
      installerVersion: "0.5.12",
    });

    assert.deepEqual((await readdir(join(projectRoot, ".agents", "skills"))).sort(), ["ms-command-center"]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("restores the previous MCP tree and sentinel when the final write fails", async () => {
  const projectRoot = await temporaryDirectory("rollback");
  try {
    const firstCatalog = catalog([
      { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
    ]);
    const first = await installMcpAgentSkills({
      projectDir: projectRoot,
      catalog: firstCatalog,
      installerVersion: "0.1.3",
    });
    const skillPath = join(first.destinationRoot, "command_center", "command_center", "SKILL.md");
    const previousSkill = await readFile(skillPath, "utf8");
    const previousSentinel = await readFile(first.sentinelPath, "utf8");

    await assert.rejects(
      installMcpAgentSkills({
        projectDir: projectRoot,
        catalog: catalog([
          { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
          { name: "static_site", path: "skills/releases/static_site/SKILL.md" },
        ]),
        installerVersion: "0.1.4",
        onBeforeSentinelWrite: () => {
          throw new Error("injected failure");
        },
      }),
      /injected failure/u,
    );
    assert.equal(await readFile(skillPath, "utf8"), previousSkill);
    assert.equal(await readFile(first.sentinelPath, "utf8"), previousSentinel);
    await assert.rejects(
      readFile(join(first.destinationRoot, "releases", "static_site", "SKILL.md"), "utf8"),
      { code: "ENOENT" },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("strict synchronization refreshes both SDK and MCP namespaces", async () => {
  const projectRoot = await temporaryDirectory("sync");
  try {
    const rows = platformRows([
      { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
    ]);
    const options = {
      projectDir: projectRoot,
      mcpUrl: "https://platform.example.test/mcp",
      accessToken: "access-token",
      fetchImpl: mockMcpFetch(rows),
      packageMetadata: {
        name: "@dev-mainsequence/command-center-sdk",
        version: "9.8.7",
      },
    };
    const plan = await syncAgentSkills({ ...options, dryRun: true });
    assert.equal(plan.dryRun, true);
    await assert.rejects(readFile(join(projectRoot, ".agents", "skills"), "utf8"), {
      code: "ENOENT",
    });

    const result = await syncAgentSkills(options);
    assert.equal(result.sdk.copied.length, 18);
    assert.equal(result.platform.installed.length, 1);
    await readFile(
      join(projectRoot, ".agents", "skills", "command-center", "general", "use-command-center-sdk", "SKILL.md"),
      "utf8",
    );
    await readFile(
      join(projectRoot, ".agents", "skills", MCP_AGENT_SKILL_NAMESPACE, "command_center", "command_center", "SKILL.md"),
      "utf8",
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("without a token the skills sync uses the machine session and the MCP of its backend", async () => {
  const projectRoot = await temporaryDirectory("session-sync");
  try {
    const rows = platformRows([
      { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
    ]);
    const calls = [];
    const urls = [];
    const asked = [];
    const mcp = mockMcpFetch(rows, calls);

    const plan = await syncAgentSkills({
      projectDir: projectRoot,
      dryRun: true,
      env: {},
      fetchImpl: (url, request) => {
        urls.push(url);
        return mcp(url, request);
      },
      packageMetadata: { name: "@dev-mainsequence/command-center-sdk", version: "9.8.7" },
      sessionAccess: async (options) => {
        asked.push(options);
        return { backendUrl: "https://session.example", accessToken: "session-access-token" };
      },
    });

    assert.equal(plan.platform.installed.length, 1);
    // Asked once, for this repository: its .env may name the backend.
    assert.equal(asked.length, 1);
    assert.equal(asked[0].cwd, projectRoot);
    assert.equal(urls.length > 0 && urls.every((url) => url === "https://session.example/mcp"), true);
    assert.equal(calls.every(({ headers }) => headers.Authorization === "Bearer session-access-token"), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("a saved session is sent only to the MCP of the backend it belongs to", async () => {
  const sessionAccess = async () => ({ backendUrl: "https://session.example", accessToken: "session-access-token" });
  const noRequest = async () => assert.fail("the session token is not sent to another backend");
  const packageMetadata = { name: "@dev-mainsequence/command-center-sdk", version: "9.8.7" };

  await assert.rejects(
    syncAgentSkills({
      projectDir: tmpdir(),
      dryRun: true,
      mcpUrl: "https://elsewhere.example/mcp",
      env: {},
      fetchImpl: noRequest,
      packageMetadata,
      sessionAccess,
    }),
    /The MCP URL is not on https:\/\/session\.example, the backend of the saved session\./u,
  );
  await assert.rejects(
    syncAgentSkills({
      projectDir: tmpdir(),
      dryRun: true,
      env: { COMMAND_CENTER_SDK_MCP_URL: "https://elsewhere.example/mcp" },
      fetchImpl: noRequest,
      packageMetadata,
      sessionAccess,
    }),
    /The MCP URL is not on https:\/\/session\.example/u,
  );
});

test("a token set for the skills sync wins, and a library caller without a session source is told the variable", async () => {
  const rows = platformRows([
    { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
  ]);
  const calls = [];
  const packageMetadata = { name: "@dev-mainsequence/command-center-sdk", version: "9.8.7" };
  const projectRoot = await temporaryDirectory("token-sync");
  try {
    await syncAgentSkills({
      projectDir: projectRoot,
      dryRun: true,
      env: { MAINSEQUENCE_ENDPOINT: "https://environment.example", MAINSEQUENCE_ACCESS_TOKEN: "environment-token" },
      fetchImpl: mockMcpFetch(rows, calls),
      packageMetadata,
      sessionAccess: async () => assert.fail("the saved session is not read when a token is set"),
    });
    assert.equal(calls.every(({ headers }) => headers.Authorization === "Bearer environment-token"), true);

    await assert.rejects(
      syncAgentSkills({ projectDir: projectRoot, dryRun: true, env: {}, packageMetadata }),
      /MCP skill synchronization requires MCP URL \(COMMAND_CENTER_SDK_MCP_URL or MAINSEQUENCE_ENDPOINT\) and MAINSEQUENCE_ACCESS_TOKEN\./u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("postinstall installs MCP skills when process authentication is available", async () => {
  const projectRoot = await temporaryDirectory("postinstall-success");
  const rows = platformRows([
    { name: "command_center", path: "skills/command_center/command_center/SKILL.md" },
  ]);

  try {
    const messages = [];
    const result = await runPostinstall({
      env: sanitizedEnvironment({
        INIT_CWD: projectRoot,
        npm_config_global: "false",
        COMMAND_CENTER_SDK_MCP_URL: "https://platform.example.test/mcp",
        MAINSEQUENCE_ACCESS_TOKEN: "access-token",
      }),
      fetchImpl: mockMcpFetch(rows),
      logger: {
        log: (message) => messages.push(message),
        warn: (message) => messages.push(message),
      },
    });
    assert.equal(result.platform.installed.length, 1);
    assert.equal(messages.some((message) => /Installed 1 MCP skill/u.test(message)), true);
    await readFile(
      join(
        projectRoot,
        ".agents",
        "skills",
        MCP_AGENT_SKILL_NAMESPACE,
        "command_center",
        "command_center",
        "SKILL.md",
      ),
      "utf8",
    );
    assert.match(
      await readFile(
        join(projectRoot, ".agents", "skills", MCP_AGENT_SKILL_NAMESPACE, MCP_PINNED_FROM_FILENAME),
        "utf8",
      ),
      /command=npm postinstall/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("postinstall MCP failures are nonblocking and explicit sync failures are strict", async () => {
  const projectRoot = await temporaryDirectory("postinstall");
  try {
    const env = sanitizedEnvironment({
      INIT_CWD: projectRoot,
      npm_config_global: "false",
      COMMAND_CENTER_SDK_MCP_URL: "http://127.0.0.1:1/mcp",
      MAINSEQUENCE_ACCESS_TOKEN: "access-token",
    });
    const postinstall = spawnSync(process.execPath, [postinstallPath], { encoding: "utf8", env });
    assert.equal(postinstall.status, 0, postinstall.stderr);
    assert.match(postinstall.stderr, /without blocking installation/u);
    await readFile(
      join(projectRoot, ".agents", "skills", "command-center", "PINNED_FROM.txt"),
      "utf8",
    );

    const invalidConfiguration = spawnSync(process.execPath, [postinstallPath], {
      encoding: "utf8",
      env: sanitizedEnvironment({
        INIT_CWD: projectRoot,
        npm_config_global: "false",
        COMMAND_CENTER_SDK_MCP_URL: "not-a-url",
        MAINSEQUENCE_ACCESS_TOKEN: "access-token",
      }),
    });
    assert.equal(invalidConfiguration.status, 0, invalidConfiguration.stderr);
    assert.match(invalidConfiguration.stderr, /without blocking installation/u);

    // A token is set, so the command does not look for a session saved on this machine.
    const strict = spawnSync(
      process.execPath,
      [cliPath, "skills", "sync", "--path", projectRoot, "--json"],
      { encoding: "utf8", env: sanitizedEnvironment({ MAINSEQUENCE_ACCESS_TOKEN: "access-token" }) },
    );
    assert.notEqual(strict.status, 0);
    assert.match(strict.stderr, /MCP skill synchronization requires MCP URL/u);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
