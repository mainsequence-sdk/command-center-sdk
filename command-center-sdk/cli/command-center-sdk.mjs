#!/usr/bin/env node

import { auditThemeCss } from "./audit-theme-css.mjs";
import { installAgentSkills, readSdkPackageMetadata } from "./install-agent-skills.mjs";
import { syncProject } from "./project-sync.mjs";
import { syncAgentSkills } from "./sync-agent-skills.mjs";

const usage = `Command Center SDK

Usage:
  command-center-sdk skills install [--path <project>] [--dry-run] [--json]
  command-center-sdk skills sync [--path <project>] [--mcp-url <url>] [--dry-run] [--json]
  command-center-sdk project sync [message] [projectUid] [--path <project>] [-m <message>] [--dry-run] [--json]
  command-center-sdk theme audit [--path <css-file-or-directory>] [--json]
  command-center-sdk --version
  command-center-sdk --help

The install command copies packaged skills into:
  <project>/.agents/skills/command-center/

The sync command refreshes packaged skills and authenticated MCP skills in:
  <project>/.agents/skills/command-center/
  <project>/.agents/skills/mainsequence/

The project sync command bumps the npm patch version, requests the current ProjectBranch's
backend-owned deployment tag, refreshes package-lock.json, commits all changes, tags, and pushes.

The theme audit rejects unknown variables, literal fallbacks, and hardcoded semantic visual values.
`;

function parseThemeAuditArguments(args) {
  let targetPath = process.cwd();
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") return { help: true, targetPath, json };
    if (argument === "--path" || argument === "-p") {
      index += 1;
      if (!args[index]) throw new Error(`${argument} requires a CSS file or directory.`);
      targetPath = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      targetPath = argument.slice("--path=".length);
      if (!targetPath) throw new Error("--path requires a CSS file or directory.");
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { help: false, targetPath, json };
}

function parseSkillArguments(args, { allowMcpUrl = false } = {}) {
  let projectDir = process.cwd();
  let dryRun = false;
  let json = false;
  let mcpUrl;

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
      return { help: true, projectDir, dryRun, json, mcpUrl };
    }
    if (argument === "--path" || argument === "-p") {
      index += 1;
      if (!args[index]) {
        throw new Error(`${argument} requires a project directory.`);
      }
      projectDir = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      projectDir = argument.slice("--path=".length);
      if (!projectDir) {
        throw new Error("--path requires a project directory.");
      }
      continue;
    }
    if (argument === "--mcp-url") {
      if (!allowMcpUrl) throw new Error("--mcp-url is available only for skills sync.");
      index += 1;
      if (!args[index]) throw new Error("--mcp-url requires an absolute MCP URL.");
      mcpUrl = args[index];
      continue;
    }
    if (argument.startsWith("--mcp-url=")) {
      if (!allowMcpUrl) throw new Error("--mcp-url is available only for skills sync.");
      mcpUrl = argument.slice("--mcp-url=".length);
      if (!mcpUrl) throw new Error("--mcp-url requires an absolute MCP URL.");
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { help: false, projectDir, dryRun, json, mcpUrl };
}

export function parseProjectSyncArguments(args) {
  let projectDir = process.cwd();
  let messageOption;
  let dryRun = false;
  let json = false;
  const positional = [];

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
      return { help: true, projectDir, message: null, projectUid: null, dryRun, json };
    }
    if (argument === "--path" || argument === "-p") {
      index += 1;
      if (!args[index]) throw new Error(`${argument} requires a project directory.`);
      projectDir = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      projectDir = argument.slice("--path=".length);
      if (!projectDir) throw new Error("--path requires a project directory.");
      continue;
    }
    if (argument === "--message" || argument === "-m") {
      index += 1;
      if (!args[index]) throw new Error(`${argument} requires a commit message.`);
      messageOption = args[index];
      continue;
    }
    if (argument.startsWith("--message=")) {
      messageOption = argument.slice("--message=".length);
      if (!messageOption) throw new Error("--message requires a commit message.");
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown argument: ${argument}`);
    positional.push(argument);
  }

  if (positional.length > 2) {
    throw new Error("project sync accepts at most two positional arguments.");
  }
  if (positional[0] !== undefined && messageOption !== undefined) {
    throw new Error("Pass the commit message either positionally or with --message, not both.");
  }
  return {
    help: false,
    projectDir,
    message: positional[0] ?? messageOption,
    projectUid: positional[1] ?? null,
    dryRun,
    json,
  };
}

function printHumanSyncResult(result) {
  const action = result.dryRun ? "Would synchronize" : "Synchronized";
  console.log(
    `${action} ${result.sdk.copied.length} SDK skill(s) in ${result.sdk.destinationRoot}.`,
  );
  console.log(
    `${action} ${result.platform.installed.length} MCP skill(s) in ${result.platform.destinationRoot}.`,
  );
  console.log(`SDK version: ${result.sdk.pinnedVersion}`);
  console.log(`Platform manifest: ${result.platform.manifestSha256}`);
  if (!result.dryRun) {
    console.log(`SDK provenance: ${result.sdk.sentinelPath}`);
    console.log(`MCP provenance: ${result.platform.sentinelPath}`);
  }
}

function printHumanResult(result) {
  const action = result.dryRun ? "Would install" : "Installed";
  console.log(
    `${action} ${result.copied.length} Command Center SDK skill(s) in ${result.destinationRoot}.`,
  );
  console.log(`Pinned SDK version: ${result.pinnedVersion}`);
  if (!result.dryRun) {
    console.log(`Provenance: ${result.sentinelPath}`);
  }
}

function printHumanThemeAudit(result) {
  if (result.ok) {
    console.log(`Theme audit passed for ${result.files.length} CSS file(s).`);
    return;
  }
  for (const item of result.diagnostics) {
    console.error(`${item.file}:${item.line} [${item.rule}] ${item.message}`);
  }
  console.error(`Theme audit failed with ${result.diagnostics.length} violation(s).`);
}

function printHumanProjectSyncPlan(plan) {
  console.log(`Project: ${plan.projectUid}`);
  console.log(`Git branch: ${plan.gitBranch}`);
  console.log(`ProjectBranch: ${plan.projectBranchUid}`);
  console.log(`Current version: ${plan.currentVersion}`);
  console.log("Sync plan:");
  plan.commands.forEach((command, index) => console.log(`  ${index + 1}. ${command}`));
}

function printHumanProjectSyncResult(result) {
  if (result.dryRun) {
    console.log("Dry run: no files, commits, tags, keys, or remote state were changed.");
    return;
  }
  console.log(`Synced ${result.projectDir}.`);
  console.log(`Version: ${result.version}`);
  console.log(`Branch tag: ${result.tagName}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) {
    const metadata = await readSdkPackageMetadata();
    console.log(metadata.version);
    return;
  }
  if (args[0] === "theme" && args[1] === "audit") {
    const options = parseThemeAuditArguments(args.slice(2));
    if (options.help) {
      console.log(usage);
      return;
    }
    const result = await auditThemeCss({ targetPath: options.targetPath });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHumanThemeAudit(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (args[0] === "project" && args[1] === "sync") {
    const options = parseProjectSyncArguments(args.slice(2));
    if (options.help) {
      console.log(usage);
      return;
    }
    const result = await syncProject({
      message: options.message,
      projectUid: options.projectUid,
      projectDir: options.projectDir,
      dryRun: options.dryRun,
      quiet: options.json,
      onPlan: options.json ? undefined : printHumanProjectSyncPlan,
    });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHumanProjectSyncResult(result);
    return;
  }
  if (args[0] !== "skills" || !new Set(["install", "sync"]).has(args[1])) {
    throw new Error(`Unknown command: ${args.join(" ")}`);
  }

  const operation = args[1];
  const options = parseSkillArguments(args.slice(2), { allowMcpUrl: operation === "sync" });
  if (options.help) {
    console.log(usage);
    return;
  }
  const result =
    operation === "install"
      ? await installAgentSkills({
          projectDir: options.projectDir,
          dryRun: options.dryRun,
          command: "command-center-sdk skills install",
        })
      : await syncAgentSkills({
          projectDir: options.projectDir,
          mcpUrl: options.mcpUrl,
          dryRun: options.dryRun,
          command: "command-center-sdk skills sync",
        });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (operation === "install") printHumanResult(result);
  else printHumanSyncResult(result);
}

main().catch((error) => {
  const wantsJson = process.argv.includes("--json");
  if (wantsJson) {
    console.error(
      JSON.stringify(
        typeof error.toJSON === "function" ? error.toJSON() : { error: error.message },
        null,
        2,
      ),
    );
  } else {
    console.error(`command-center-sdk: ${error.message}`);
  }
  process.exitCode = 1;
});
