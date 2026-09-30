import { installAgentSkills, readSdkPackageMetadata } from "./install-agent-skills.mjs";
import { installMcpAgentSkills } from "./install-mcp-skills.mjs";
import {
  fetchPlatformSkillCatalog,
  resolveMcpConfiguration,
} from "./mcp-platform-skills.mjs";

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function syncAgentSkills({
  projectDir,
  mcpUrl,
  accessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  dryRun = false,
  command = "command-center-sdk skills sync",
  packageMetadata,
  env = process.env,
  sessionAccess,
} = {}) {
  const metadata = packageMetadata ?? (await readSdkPackageMetadata());
  let configuration = resolveMcpConfiguration({ mcpUrl, accessToken, env });
  if (!configuration.accessToken && sessionAccess) {
    // No token was passed or set: the machine session of the backend this repository names.
    const session = await sessionAccess({ env, cwd: projectDir, fetchImpl });
    if (session) {
      configuration = resolveMcpConfiguration({
        mcpUrl,
        accessToken: session.accessToken,
        env: { ...env, MAINSEQUENCE_ENDPOINT: session.backendUrl },
      });
      // A saved session is sent only to the backend it belongs to.
      if (originOf(configuration.mcpUrl) !== originOf(session.backendUrl)) {
        throw new Error(
          `The MCP URL is not on ${session.backendUrl}, the backend of the saved session. Set MAINSEQUENCE_ENDPOINT to the backend that serves it, or set MAINSEQUENCE_ACCESS_TOKEN for this shell.`,
        );
      }
    }
  }
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
