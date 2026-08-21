import { installAgentSkills, readSdkPackageMetadata } from "./install-agent-skills.mjs";
import { installMcpAgentSkills } from "./install-mcp-skills.mjs";
import {
  fetchPlatformSkillCatalog,
  resolveMcpConfiguration,
} from "./mcp-platform-skills.mjs";

export async function syncAgentSkills({
  projectDir,
  mcpUrl,
  accessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  dryRun = false,
  command = "command-center-sdk skills sync",
  packageMetadata,
} = {}) {
  const metadata = packageMetadata ?? (await readSdkPackageMetadata());
  const configuration = resolveMcpConfiguration({ mcpUrl, accessToken });
  if (!configuration.available) {
    throw new Error(
      `MCP skill synchronization requires ${configuration.missing.join(" and ")}.`,
    );
  }

  const catalog = await fetchPlatformSkillCatalog({
    mcpUrl: configuration.mcpUrl,
    accessToken: configuration.accessToken,
    clientVersion: metadata.version,
    fetchImpl,
    timeoutMs,
  });

  const [sdkPlan, platformPlan] = await Promise.all([
    installAgentSkills({
      projectDir,
      dryRun: true,
      command,
      packageMetadata: metadata,
    }),
    installMcpAgentSkills({
      projectDir,
      catalog,
      installerVersion: metadata.version,
      dryRun: true,
      command,
    }),
  ]);
  if (dryRun) {
    return { dryRun: true, sdk: sdkPlan, platform: platformPlan };
  }

  const sdk = await installAgentSkills({
    projectDir,
    command,
    packageMetadata: metadata,
  });
  const platform = await installMcpAgentSkills({
    projectDir,
    catalog,
    installerVersion: metadata.version,
    command,
  });
  return { dryRun: false, sdk, platform };
}
