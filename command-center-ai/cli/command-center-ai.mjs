#!/usr/bin/env node
// The chat's command line: installs its agent skills into a repository.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ChatSkillInstallBlocked, installChatSkills } from "./install-skills.mjs";

export const usage = `Usage: command-center-ai skills install [--path <repository-root>]

Installs the chat's agent skills into <repository-root>/.agents/skills/command-center-ai/ (default: the current
directory). The namespace is replaced by the skills of the installed package; no other namespace
under .agents/skills/ is touched.`;

export async function runCli(argv, { cwd = process.cwd(), logger = console } = {}) {
  const [group, action, ...rest] = argv;
  if (!group || ["help", "--help", "-h"].includes(group)) {
    logger.log(usage);
    return 0;
  }
  if (group !== "skills" || action !== "install") {
    logger.error(usage);
    return 2;
  }

  let targetPath = ".";
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--path" && rest[index + 1]) {
      targetPath = rest[index + 1];
      index += 1;
    } else {
      logger.error(`Unknown argument "${rest[index]}".\n\n${usage}`);
      return 2;
    }
  }

  try {
    const result = await installChatSkills({ projectDir: resolve(cwd, targetPath) });
    logger.log(`Installed ${result.installed.length} chat skill(s) in ${result.destinationRoot}.`);
    if (result.removed.length > 0) {
      logger.log(`Removed what the package no longer ships: ${result.removed.join(", ")}.`);
    }
    return 0;
  } catch (error) {
    logger.error(
      error instanceof ChatSkillInstallBlocked ? error.message : `Chat skill installation failed: ${error.message}`,
    );
    return 1;
  }
}

const isDirectExecution = process.argv[1]
  ? realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  : false;
if (isDirectExecution) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
