import { installAgentSkills, readSdkPackageMetadata } from "./install-agent-skills.mjs";
import { installMcpAgentSkills } from "./install-mcp-skills.mjs";
import {
  fetchPlatformSkillCatalog,
  resolveMcpConfiguration,
} from "./mcp-platform-skills.mjs";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function isSdkSourceRepository(projectDir) {
  try {
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    const repositoryRoot = resolve(packageRoot, "..");
    if (realpathSync(projectDir) !== realpathSync(repositoryRoot)) {
      return false;
    }
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    return (
      manifest.name === "command-center-sdk-repository" &&
      manifest.workspaces?.includes("command-center-sdk")
    );
  } catch {
    return false;
  }
}

export async function runPostinstall({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  if (env.npm_config_global === "true") {
    logger.log(
      "[command-center-sdk] Global install detected; run the explicit skills install command inside a project.",
    );
    return { skipped: "global-install" };
  }

  const projectDir = env.INIT_CWD?.trim();
  if (!projectDir) {
    throw new Error(
      "INIT_CWD is unavailable, so the target project cannot be resolved. Run `command-center-sdk skills install --path .` explicitly.",
    );
  }

  if (isSdkSourceRepository(projectDir)) {
    logger.log(
      "[command-center-sdk] Source repository install detected; skipped consumer agent skill installation.",
    );
    return { skipped: "source-repository" };
  }

  const result = await installAgentSkills({
    projectDir,
    command: "npm postinstall",
  });
  logger.log(
    `[command-center-sdk] Installed ${result.copied.length} agent skill(s) in ${result.destinationRoot}.`,
  );

  if (env.COMMAND_CENTER_SDK_MCP_POSTINSTALL === "0") {
    logger.log("[command-center-sdk] MCP skill synchronization disabled for postinstall.");
    return { sdk: result, platform: { skipped: "disabled" } };
  }
  try {
    const configuration = resolveMcpConfiguration({ env });
    if (!configuration.available) {
      logger.log(
        `[command-center-sdk] Skipped MCP skills; missing ${configuration.missing.join(" and ")}. Run \`command-center-sdk skills sync --path .\` after configuring authentication.`,
      );
      return { sdk: result, platform: { skipped: "missing-configuration" } };
    }
    const metadata = await readSdkPackageMetadata();
    const catalog = await fetchPlatformSkillCatalog({
      mcpUrl: configuration.mcpUrl,
      accessToken: configuration.accessToken,
      clientVersion: metadata.version,
      fetchImpl,
      timeoutMs: 3_000,
    });
    const platform = await installMcpAgentSkills({
      projectDir,
      catalog,
      installerVersion: metadata.version,
      command: "npm postinstall",
    });
    logger.log(
      `[command-center-sdk] Installed ${platform.installed.length} MCP skill(s) in ${platform.destinationRoot}.`,
    );
    return { sdk: result, platform };
  } catch (error) {
    logger.warn(
      `[command-center-sdk] MCP skill synchronization was skipped without blocking installation: ${error.message}`,
    );
    return { sdk: result, platform: { skipped: "failed", error: error.message } };
  }
}

const isDirectExecution = process.argv[1]
  ? realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  : false;
if (isDirectExecution) {
  runPostinstall().catch((error) => {
    console.error(`[command-center-sdk] Automatic agent skill installation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
