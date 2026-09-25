// npm's postinstall: installs the package's agent skills into the repository that installed it
// (npm's INIT_CWD), as the Command Center SDK's postinstall installs its own. A global install, and
// an install anywhere inside this package's own source repository, install nothing.
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENT_SKILL_NAMESPACE, installAgentSkills } from "./install-agent-skills.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/** Whether `projectDir` is inside the source repository whose workspaces hold this package. */
export function isCommandCenterAiSourceRepository(projectDir, repositoryRoot = resolve(packageRoot, "..")) {
  try {
    const root = realpathSync(repositoryRoot);
    const fromRoot = relative(root, realpathSync(projectDir));
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) return false;
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return (
      manifest.name === "command-center-sdk-repository" &&
      Array.isArray(manifest.workspaces) &&
      manifest.workspaces.includes("command-center-ai")
    );
  } catch {
    return false;
  }
}

export async function runPostinstall({ env = process.env, logger = console, repositoryRoot } = {}) {
  if (env.npm_config_global === "true") {
    logger.log(
      "[command-center-ai] Global install detected; run the explicit skills install command inside a repository.",
    );
    return { skipped: "global-install" };
  }

  const projectDir = env.INIT_CWD?.trim();
  if (!projectDir) {
    throw new Error(
      "INIT_CWD is unavailable, so the target repository cannot be resolved. Run `command-center-ai skills install --path .` explicitly.",
    );
  }

  if (isCommandCenterAiSourceRepository(projectDir, repositoryRoot)) {
    logger.log("[command-center-ai] Source repository install detected; skipped consumer agent skill installation.");
    return { skipped: "source-repository" };
  }

  const result = await installAgentSkills({ projectDir, command: "npm postinstall" });
  logger.log(`[command-center-ai] Installed ${result.copied.length} agent skill(s) in ${result.destinationRoot}.`);
  if (result.removed.length > 0) {
    logger.log(
      `[command-center-ai] Pruned ${result.removed.length} unauthorized ${AGENT_SKILL_NAMESPACE} namespace entr${result.removed.length === 1 ? "y" : "ies"}.`,
    );
  }
  return result;
}

const isDirectExecution = process.argv[1]
  ? realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  : false;
if (isDirectExecution) {
  runPostinstall().catch((error) => {
    console.error(`[command-center-ai] Automatic agent skill installation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
