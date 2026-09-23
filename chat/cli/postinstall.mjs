// npm's postinstall: installs the chat's skills into the repository that installed the package
// (npm's INIT_CWD). A global install, and an install inside this package's own source repository,
// install nothing.
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { installChatSkills } from "./install-skills.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/** Whether `projectDir` is inside this package's source repository, whose workspaces hold the chat. */
export function isChatSourceRepository(projectDir, repositoryRoot = resolve(packageRoot, "..")) {
  try {
    const root = realpathSync(repositoryRoot);
    const fromRoot = relative(root, realpathSync(projectDir));
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) return false;
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return (
      manifest.name === "command-center-sdk-repository" &&
      Array.isArray(manifest.workspaces) &&
      manifest.workspaces.includes("chat")
    );
  } catch {
    return false;
  }
}

export async function runPostinstall({ env = process.env, logger = console, repositoryRoot } = {}) {
  if (env.npm_config_global === "true") {
    logger.log("[chat] Global install detected; run `mainsequence-chat skills install --path .` inside a repository.");
    return { skipped: "global-install" };
  }

  const projectDir = env.INIT_CWD?.trim();
  if (!projectDir) {
    throw new Error(
      "INIT_CWD is unavailable, so the target repository cannot be resolved. Run `mainsequence-chat skills install --path .` explicitly.",
    );
  }

  if (isChatSourceRepository(projectDir, repositoryRoot)) {
    logger.log("[chat] Source repository install detected; skipped consumer agent skill installation.");
    return { skipped: "source-repository" };
  }

  const result = await installChatSkills({ projectDir, command: "npm postinstall" });
  logger.log(`[chat] Installed ${result.installed.length} agent skill(s) in ${result.destinationRoot}.`);
  return result;
}

const isDirectExecution = process.argv[1]
  ? realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  : false;
if (isDirectExecution) {
  runPostinstall().catch((error) => {
    console.error(`[chat] Automatic agent skill installation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
