#!/usr/bin/env node
// Command Center AI's command line: installs its agent skills into a repository, with the options
// and output of `command-center-sdk skills install`.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { installAgentSkills } from "./install-agent-skills.mjs";

export const usage = `Command Center AI

Usage:
  command-center-ai skills install [--path <repository-root>] [--dry-run] [--json]

Installs the package's agent skills into <repository-root>/.agents/skills/command-center-ai/
(default: the current directory). The namespace is authoritative: every entry the installed package
does not ship is pruned. No other namespace under .agents/skills/ is touched.

Options:
  --path, -p <path>  The repository root.
  --dry-run          Validate and report what would change, without writing.
  --json             Print the result as JSON.`;

class UsageError extends Error {}

function parseSkillArguments(args) {
  let projectDir = ".";
  let dryRun = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true, projectDir, dryRun, json };
    }
    if (argument === "--path" || argument === "-p") {
      index += 1;
      if (!args[index]) throw new UsageError(`${argument} requires a repository directory.`);
      projectDir = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      projectDir = argument.slice("--path=".length);
      if (!projectDir) throw new UsageError("--path requires a repository directory.");
      continue;
    }
    throw new UsageError(`Unknown argument: ${argument}`);
  }

  return { help: false, projectDir, dryRun, json };
}

function printHumanResult(result, logger) {
  const action = result.dryRun ? "Would install" : "Installed";
  const pruneAction = result.dryRun ? "Would prune" : "Pruned";
  logger.log(`${action} ${result.copied.length} Command Center AI skill(s) in ${result.destinationRoot}.`);
  logger.log(
    `${pruneAction} ${result.removed.length} unauthorized namespace entr${result.removed.length === 1 ? "y" : "ies"}.`,
  );
  logger.log(`Pinned Command Center AI version: ${result.pinnedVersion}`);
  if (!result.dryRun) {
    logger.log(`Provenance: ${result.sentinelPath}`);
  }
}

export async function runCli(argv, { cwd = process.cwd(), logger = console } = {}) {
  const [group, action, ...rest] = argv;
  if (!group || ["help", "--help", "-h"].includes(group)) {
    logger.log(usage);
    return 0;
  }
  if (group !== "skills" || action !== "install") {
    logger.error(`Unknown command: ${argv.join(" ")}\n\n${usage}`);
    return 2;
  }

  let options;
  try {
    options = parseSkillArguments(rest);
  } catch (error) {
    logger.error(`command-center-ai: ${error.message}\n\n${usage}`);
    return 2;
  }
  if (options.help) {
    logger.log(usage);
    return 0;
  }

  try {
    const result = await installAgentSkills({
      projectDir: resolve(cwd, options.projectDir),
      dryRun: options.dryRun,
      command: "command-center-ai skills install",
    });
    if (options.json) logger.log(JSON.stringify(result, null, 2));
    else printHumanResult(result, logger);
    return 0;
  } catch (error) {
    logger.error(
      options.json ? JSON.stringify({ error: error.message }, null, 2) : `command-center-ai: ${error.message}`,
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
