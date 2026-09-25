import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = await mkdtemp(join(tmpdir(), "command-center-sdk-packed-consumer-"));

try {
  const packRoot = join(fixtureRoot, "pack");
  const extractRoot = join(fixtureRoot, "extract");
  const consumerRoot = join(fixtureRoot, "consumer");
  const documentationConsumerRoot = join(fixtureRoot, "documentation-consumer");
  await mkdir(packRoot, { recursive: true });
  await mkdir(extractRoot, { recursive: true });
  await mkdir(consumerRoot, { recursive: true });
  await mkdir(documentationConsumerRoot, { recursive: true });

  const staleBuildArtifact = join(packageRoot, "dist", "removed-source.js");
  await mkdir(dirname(staleBuildArtifact), { recursive: true });
  await writeFile(staleBuildArtifact, "throw new Error('stale build artifact');\n", "utf8");

  execFileSync("npm", ["pack", "--pack-destination", packRoot], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: join(fixtureRoot, "npm-cache") },
    stdio: "pipe",
  });
  const tarballs = (await readdir(packRoot)).filter((name) => name.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, "npm pack should produce one tarball");
  execFileSync("tar", ["-xzf", join(packRoot, tarballs[0]), "-C", extractRoot]);

  const extractedPackage = join(extractRoot, "package");
  await assert.rejects(
    readFile(join(extractedPackage, "dist", "removed-source.js"), "utf8"),
    { code: "ENOENT" },
    "prepack should remove output from deleted source files before compiling",
  );
  const packageJson = JSON.parse(await readFile(join(extractedPackage, "package.json"), "utf8"));
  assert.equal(packageJson.bin["command-center-sdk"], "./cli/command-center-sdk.mjs");
  assert.equal(packageJson.scripts.postinstall, "node ./cli/postinstall.mjs");
  assert.equal(
    packageJson.exports["./contracts/manifest.json"],
    "./contracts/manifest.json",
  );
  assert.deepEqual(packageJson.exports["./navigation"], {
    types: "./dist/navigation/index.d.ts",
    import: "./dist/navigation/index.js",
  });
  assert.deepEqual(packageJson.exports["./navigation/testing"], {
    types: "./dist/navigation/testing/index.d.ts",
    import: "./dist/navigation/testing/index.js",
  });
  assert.deepEqual(packageJson.exports["./layout"], {
    types: "./dist/layout/index.d.ts",
    import: "./dist/layout/index.js",
  });
  assert.deepEqual(packageJson.exports["./layout/testing"], {
    types: "./dist/layout/testing/index.d.ts",
    import: "./dist/layout/testing/index.js",
  });
  assert.deepEqual(packageJson.exports["./feedback"], {
    types: "./dist/feedback/index.d.ts",
    import: "./dist/feedback/index.js",
  });
  assert.deepEqual(packageJson.exports["./controls"], {
    types: "./dist/controls/index.d.ts",
    import: "./dist/controls/index.js",
  });
  assert.notEqual(
    (await stat(join(extractedPackage, "cli", "command-center-sdk.mjs"))).mode & 0o111,
    0,
    "the packed npm binary should be executable",
  );
  await Promise.all([
    "install-agent-skills.mjs",
    "install-mcp-skills.mjs",
    "mcp-platform-skills.mjs",
    "code-repository-sync-api.mjs",
    "code-repository-sync-local-ops.mjs",
    "code-repository-sync.mjs",
    "application-sdk-maintenance.mjs",
    "application-docs.mjs",
    "sync-agent-skills.mjs",
  ].map((name) => readFile(join(extractedPackage, "cli", name), "utf8")));
  await Promise.all(
    ["project-sdk-maintenance.mjs", "project-docs.mjs"].map((name) =>
      assert.rejects(readFile(join(extractedPackage, "cli", name), "utf8"), { code: "ENOENT" }),
    ),
  );
  const cliHelp = execFileSync(
    process.execPath,
    [join(extractedPackage, "cli", "command-center-sdk.mjs"), "--help"],
    { encoding: "utf8" },
  );
  assert.match(cliHelp, /skills sync/u);
  assert.match(cliHelp, /application sdk-status/u);
  assert.match(cliHelp, /application update-sdk/u);
  assert.match(cliHelp, /application docs init/u);
  assert.match(cliHelp, /code-repository sync/u);
  assert.match(cliHelp, /--timeout-ms/u);
  assert.match(cliHelp, /repository-root/u);
  const embedModule = await import(
    pathToFileURL(join(extractedPackage, "dist", "embed", "index.js")).href
  );
  assert.equal(typeof embedModule.createStaticSiteIframeHost, "function");
  assert.equal(typeof embedModule.createStaticSiteIframeClient, "function");
  assert.equal(typeof embedModule.StaticSiteFastApiCredentialError, "function");
  assert.equal(typeof embedModule.StaticSiteFastApiWebSocketError, "function");
  assert.equal(typeof embedModule.StaticSitePlatformRequestError, "function");
  assert.equal(
    embedModule.STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
    "mainsequence.ws-bridge.v1",
  );
  assert.equal(embedModule.STATIC_SITE_IFRAME_PROTOCOL_VERSION, 1);
  assert.equal(
    embedModule.STATIC_SITE_IFRAME_CONTRACT,
    "command-center.static_site_iframe@v1",
  );
  const embedDeclarations = await readFile(
    join(extractedPackage, "dist", "embed", "static-site.d.ts"),
    "utf8",
  );
  assert.match(embedDeclarations, /createFastApiWebSocket/u);
  assert.match(embedDeclarations, /sendPlatformRequest\(request: Request\): Promise<Response>/u);
  const resourceModule = await import(
    pathToFileURL(join(extractedPackage, "dist", "resource", "index.js")).href
  );
  assert.equal(typeof resourceModule.parseResourceDiscovery, "function");
  assert.equal(typeof resourceModule.serializeResourceIdentity, "function");
  await Promise.all([
    "index.js",
    "index.d.ts",
    "ApplicationRail.js",
    "ApplicationNavigationPanel.js",
    "ApplicationNavigationPanelShell.js",
    "ApplicationNavigationShell.js",
    "ApplicationNavigationTrigger.js",
    "ApplicationNavigationDrawer.js",
    "ApplicationImmersiveBar.js",
    "definition.js",
  ].map((name) => readFile(join(extractedPackage, "dist", "navigation", name), "utf8")));
  await Promise.all([
    "index.js",
    "index.d.ts",
  ].map((name) => readFile(join(extractedPackage, "dist", "navigation", "testing", name), "utf8")));
  await Promise.all([
    "index.js",
    "index.d.ts",
    "components.js",
    "components.d.ts",
    "viewport.js",
    "viewport.d.ts",
  ].map((name) => readFile(join(extractedPackage, "dist", "layout", name), "utf8")));
  await Promise.all([
    "index.js",
    "index.d.ts",
  ].map((name) => readFile(join(extractedPackage, "dist", "layout", "testing", name), "utf8")));
  await Promise.all([
    "index.js",
    "index.d.ts",
    "components.js",
    "components.d.ts",
  ].map((name) => readFile(join(extractedPackage, "dist", "feedback", name), "utf8")));
  await Promise.all([
    "index.js",
    "index.d.ts",
    "components.js",
    "components.d.ts",
  ].map((name) => readFile(join(extractedPackage, "dist", "controls", name), "utf8")));
  const docsIndex = await readFile(join(extractedPackage, "docs", "README.md"), "utf8");
  assert.match(docsIndex, /build-command-center-application/u);
  await Promise.all([
    "application-operations.md",
    "backend-contracts.md",
    "application-feedback.md",
    "application-controls.md",
    "application-layout.md",
    "application-documentation.md",
    "concepts/resource-applications.md",
    "concepts/sdk-architecture.md",
    "concepts/state-and-ownership.md",
    "getting-started.md",
    "navigation.md",
    "public-api.md",
    "resources.md",
    "static-site-embeds.md",
    "themes.md",
    "themes-and-embeds.md",
    "extending-and-releasing.md",
  ].map((name) => readFile(join(extractedPackage, "docs", name), "utf8")));

  const runningNodeMajor = Number(process.versions.node.split(".")[0]);
  await writeFile(
    join(documentationConsumerRoot, "package.json"),
    `${JSON.stringify({
      name: "packed-documentation-consumer",
      version: "1.0.0",
      private: true,
      engines: { node: `${runningNodeMajor}.x` },
      scripts: { build: "vite build" },
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(documentationConsumerRoot, "package-lock.json"),
    `${JSON.stringify({
      name: "packed-documentation-consumer",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {},
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(documentationConsumerRoot, ".node-version"), `${runningNodeMajor}\n`, "utf8");
  const docsInit = execFileSync(
    process.execPath,
    [
      join(extractedPackage, "cli", "command-center-sdk.mjs"),
      "application",
      "docs",
      "init",
      "--path",
      documentationConsumerRoot,
      "--skip-install",
      "--json",
    ],
    { encoding: "utf8" },
  );
  const docsInitPayload = JSON.parse(docsInit);
  assert.equal(docsInitPayload.docsBaseUrl, "/docs/");
  assert.equal(docsInitPayload.applicationRoot, await realpath(documentationConsumerRoot));
  assert.equal("projectRoot" in docsInitPayload, false);
  assert.match(
    await readFile(join(documentationConsumerRoot, "documentation", "docusaurus.config.mjs"), "utf8"),
    /baseUrl: "\/docs\/"/u,
  );
  execFileSync(
    process.execPath,
    [join(documentationConsumerRoot, "scripts", "sync-docs-navigation.mjs"), "--check"],
    { cwd: documentationConsumerRoot, encoding: "utf8" },
  );
  execFileSync(
    process.execPath,
    [join(documentationConsumerRoot, "scripts", "validate-docs.mjs")],
    { cwd: documentationConsumerRoot, encoding: "utf8" },
  );

  const contractManifest = JSON.parse(
    await readFile(join(extractedPackage, "contracts", "manifest.json"), "utf8"),
  );
  const packedRequire = createRequire(join(extractedPackage, "package.json"));
  assert.equal(
    await realpath(packedRequire.resolve(`${packageJson.name}/contracts/manifest.json`)),
    await realpath(join(extractedPackage, "contracts", "manifest.json")),
  );
  assert.equal(contractManifest.format, "command-center-contract-manifest@v1");
  assert.equal(contractManifest.schemas.length, 6);
  const contractIds = new Set(contractManifest.schemas.map((contract) => contract.contract));
  for (const contractId of [
    "command-center.resource_discovery@v1",
    "command-center.static_site_iframe@v1",
  ]) {
    assert.equal(contractIds.has(contractId), true, `${contractId} should be packaged`);
  }
  for (const contract of contractManifest.schemas) {
    const schema = JSON.parse(
      await readFile(join(extractedPackage, "contracts", contract.file), "utf8"),
    );
    assert.equal(schema.$id, contract.id);
    assert.equal(
      await realpath(packedRequire.resolve(contract.npmPath)),
      await realpath(join(extractedPackage, "contracts", contract.file)),
    );
    for (const fixture of [...contract.fixtures.valid, ...contract.fixtures.invalid]) {
      await readFile(join(extractedPackage, "contracts", fixture), "utf8");
    }
  }

  execFileSync(process.execPath, [join(extractedPackage, "cli", "postinstall.mjs")], {
    cwd: extractedPackage,
    env: {
      ...process.env,
      INIT_CWD: consumerRoot,
      npm_config_global: "false",
      COMMAND_CENTER_SDK_MCP_POSTINSTALL: "0",
    },
    encoding: "utf8",
  });
  const managedRoot = join(consumerRoot, ".agents", "skills", "command-center");
  const sentinel = await readFile(join(managedRoot, "PINNED_FROM.txt"), "utf8");
  assert.match(sentinel, new RegExp(`pinned_version=${packageJson.version.replaceAll(".", "\\.")}`, "u"));
  assert.equal(
    (await readdir(managedRoot, { withFileTypes: true })).filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith("."),
    ).length,
    11,
  );
  const navigationSkillRoot = join(
    managedRoot,
    "navigation",
    "compose-command-center-application-shell",
  );
  assert.match(
    await readFile(join(navigationSkillRoot, "SKILL.md"), "utf8"),
    /assertCommandCenterApplicationShell/u,
  );
  await readFile(join(navigationSkillRoot, "agents", "openai.yaml"), "utf8");
  await readFile(join(navigationSkillRoot, "assets", "embedded-application-shell.tsx"), "utf8");
  await readFile(
    join(navigationSkillRoot, "references", "application-shell-standard.md"),
    "utf8",
  );
  const documentationSkillRoot = join(
    managedRoot,
    "documentation",
    "document-command-center-application",
  );
  assert.match(
    await readFile(join(documentationSkillRoot, "SKILL.md"), "utf8"),
    /command-center-sdk application docs init/u,
  );
  await readFile(join(documentationSkillRoot, "agents", "openai.yaml"), "utf8");
  await readFile(
    join(documentationSkillRoot, "references", "user-documentation-standard.md"),
    "utf8",
  );
  await readFile(
    join(documentationSkillRoot, "references", "build-and-toolchain.md"),
    "utf8",
  );
  await readFile(
    join(documentationSkillRoot, "assets", "application", "scripts", "validate-docs.mjs"),
    "utf8",
  );
  await readFile(
    join(documentationSkillRoot, "assets", "application", "documentation", "docusaurus.config.mjs"),
    "utf8",
  );
  await assert.rejects(
    readFile(join(documentationSkillRoot, "assets", "project", "scripts", "validate-docs.mjs"), "utf8"),
    { code: "ENOENT" },
  );
  const layoutSkill = await readFile(
    join(managedRoot, "layout", "compose-command-center-page", "SKILL.md"),
    "utf8",
  );
  assert.match(layoutSkill, /@dev-mainsequence\/command-center-sdk\/layout/u);
  assert.match(layoutSkill, /assertCommandCenterPageLayout/u);
  await readFile(
    join(managedRoot, "layout", "compose-command-center-page", "agents", "openai.yaml"),
    "utf8",
  );
  const feedbackSkill = await readFile(
    join(managedRoot, "feedback", "build-application-loading-flow", "SKILL.md"),
    "utf8",
  );
  assert.match(feedbackSkill, /@dev-mainsequence\/command-center-sdk\/feedback/u);
  assert.match(feedbackSkill, /ApplicationStatusScreen/u);
  await readFile(
    join(managedRoot, "feedback", "build-application-loading-flow", "agents", "openai.yaml"),
    "utf8",
  );
  await readFile(
    join(managedRoot, "general", "use-command-center-sdk", "agents", "openai.yaml"),
    "utf8",
  );
  const maintainCodeRepositorySkill = await readFile(
    join(managedRoot, "general", "maintain-command-center-code-repository", "SKILL.md"),
    "utf8",
  );
  assert.match(maintainCodeRepositorySkill, /backend-owned tag|backend-returned annotated tag/iu);
  assert.match(maintainCodeRepositorySkill, /exact backend tag ref|exact tag ref/iu);
  assert.match(maintainCodeRepositorySkill, /--atomic --follow-tags/iu);
  assert.match(maintainCodeRepositorySkill, /canonical[^.]*origin[^.]*branch[^.]*HEAD/isu);
  assert.match(maintainCodeRepositorySkill, /Do not add or restore superseded caller-supplied repository/u);
  assert.match(
    await readFile(
      join(managedRoot, "general", "use-command-center-sdk", "SKILL.md"),
      "utf8",
    ),
    /application sdk-status/u,
  );
  await readFile(
    join(managedRoot, "contracts", "implement-command-center-contract", "agents", "openai.yaml"),
    "utf8",
  );
  assert.match(
    await readFile(
      join(managedRoot, "contracts", "implement-command-center-contract", "SKILL.md"),
      "utf8",
    ),
    /contracts\/manifest\.json/u,
  );
  assert.match(await readFile(
    join(managedRoot, "embed", "integrate-static-site-iframe", "agents", "openai.yaml"),
    "utf8",
  ), /local Vite\/FastAPI proxy and developer identity/u);
  assert.match(
    await readFile(
      join(managedRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
      "utf8",
    ),
    /fetchFastApi/u,
  );
  assert.match(
    await readFile(
      join(managedRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
      "utf8",
    ),
    /## Complete The Local Vite And FastAPI Setup[\s\S]*\.\/references\/local-vite-fastapi\.md[\s\S]*python -m uvicorn local_api:app/u,
  );
  assert.match(
    await readFile(
      join(managedRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
      "utf8",
    ),
    /Non-local deployment: direct link or no initialized trusted host[\s\S]*validated `ready`\/`initialize` handshake and initial `onContext`/u,
  );
  assert.match(
    await readFile(
      join(managedRoot, "embed", "integrate-static-site-iframe", "references", "local-vite-fastapi.md"),
      "utf8",
    ),
    /User\.get_authenticated_user_details\(\)[\s\S]*proxy: \{ "\/api": "http:\/\/127\.0\.0\.1:8001" \}[\s\S]*fetch\("\/api\/me", \{ signal \}\)/u,
  );
  assert.match(
    await readFile(
      join(managedRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
      "utf8",
    ),
    /getFastApiState/u,
  );
  assert.match(
    await readFile(
      join(managedRoot, "embed", "integrate-static-site-iframe", "SKILL.md"),
      "utf8",
    ),
    /createFastApiWebSocket/u,
  );
  await readFile(
    join(managedRoot, "contracts", "implement-resource-collection-contract", "SKILL.md"),
    "utf8",
  );
  await readFile(
    join(managedRoot, "contracts", "implement-bulk-actions-contract", "SKILL.md"),
    "utf8",
  );
  await assert.rejects(
    readFile(join(managedRoot, "extend-command-center-sdk", "SKILL.md"), "utf8"),
    { code: "ENOENT" },
  );

  console.log(`Packed consumer smoke test passed for ${packageJson.name}@${packageJson.version}.`);
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
