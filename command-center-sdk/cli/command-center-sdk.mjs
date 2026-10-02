#!/usr/bin/env node

import { auditThemeCss } from "./audit-theme-css.mjs";
import { installAgentSkills, readSdkPackageMetadata } from "./install-agent-skills.mjs";
import {
  inspectApplicationSdk,
  updateApplicationSdk,
} from "./application-sdk-maintenance.mjs";
import { initializeApplicationDocumentation } from "./application-docs.mjs";
import { syncCodeRepository } from "./code-repository-sync.mjs";
import {
  authStatus,
  authToken,
  login,
  logout,
  parseSessionArguments,
  refreshToken,
  resolvePlatformAccess,
} from "./session-commands.mjs";
import { syncAgentSkills } from "./sync-agent-skills.mjs";

const usage = `Command Center SDK

Usage:
  command-center-sdk login [<backend-url>] [--backend <url>] [--no-open] [--mcp] [--json]
  command-center-sdk logout [--backend <url>] [--json]
  command-center-sdk refresh-token [--backend <url>] [--json]
  command-center-sdk auth status [--backend <url>] [--check] [--json]
  command-center-sdk auth token [--backend <url>] [--json]
  command-center-sdk skills install [--path <repository-root>] [--dry-run] [--json]
  command-center-sdk skills sync [--path <repository-root>] [--mcp-url <url>] [--dry-run] [--json]
  command-center-sdk application docs init [--path <repository-root>] [--dry-run] [--skip-install] [--json]
  command-center-sdk application sdk-status [--path <repository-root>] [--json]
  command-center-sdk application update-sdk [--path <repository-root>] [--dry-run] [--json]
  command-center-sdk code-repository sync [--path <repository-root>] [--json]
  command-center-sdk theme audit [--path <css-file-or-directory>] [--json]
  command-center-sdk --version
  command-center-sdk --help

The login command signs this machine in to the platform and saves one session per backend in the
operating system's credential store (macOS Keychain, or Secret Service on Linux). Every project on
the machine uses it, and the Main Sequence Python CLI reads and writes the same session. No project
file holds a token. Commands that call the platform use MAINSEQUENCE_ACCESS_TOKEN when it is set,
and otherwise the saved session of the backend the project names with MAINSEQUENCE_ENDPOINT, in the
environment or in its .env. "auth token" prints a short-lived access token for another local tool;
"refresh-token" renews the session and removes credential entries left in ./.env.

The install command copies packaged skills into:
  <repository-root>/.agents/skills/command-center/

The sync command refreshes packaged skills and authenticated MCP skills in:
  <repository-root>/.agents/skills/command-center/
  <repository-root>/.agents/skills/ms-command-center/
It also removes the MCP skills versions before 0.5.12 recorded in .agents/skills/mainsequence/,
which the Python Main Sequence SDK owns, and leaves everything else there.

The CodeRepository sync command requires the Vite application at the Git repository root. It
refreshes package-lock.json (npm install --package-lock-only) and installs it (npm ci), and nothing
else: it calls no backend and does not version, commit, tag, or push. Commit and push the changes
yourself. The platform deploys from Git pushes as the repository's .mainsequence/workflows/*.yaml
says (tag_regex), and release tags come from the repository's own CI.

The SDK status and update commands compare and refresh only the application's declared Command Center
SDK dependency. Updates respect its existing npm semver policy and do not commit, tag, push, or
call the backend.

The application docs init command safely adds the official same-artifact end-user Docusaurus
scaffold. It keeps one root npm lockfile, derives the user-guide folders and generated navigation
from a schema-version-2 projection of the application menu, and emits the site at /docs/ inside
dist/docs.

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
        throw new Error(`${argument} requires a repository directory.`);
      }
      projectDir = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      projectDir = argument.slice("--path=".length);
      if (!projectDir) {
        throw new Error("--path requires a repository directory.");
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

// What earlier versions took to commit, tag, and push. Named in the error so a person who still
// passes one learns that the command no longer does any of that.
const REMOVED_CODE_REPOSITORY_SYNC_OPTIONS = new Set(["--message", "-m", "--dry-run", "--timeout-ms"]);

export function parseCodeRepositorySyncArguments(args) {
  let codeRepositoryDir = process.cwd();
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true, codeRepositoryDir, json };
    }
    if (argument === "--path" || argument === "-p") {
      index += 1;
      if (!args[index]) throw new Error(`${argument} requires a code repository directory.`);
      codeRepositoryDir = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      codeRepositoryDir = argument.slice("--path=".length);
      if (!codeRepositoryDir) throw new Error("--path requires a code repository directory.");
      continue;
    }
    const option = argument.split("=", 1)[0];
    if (!argument.startsWith("-") || REMOVED_CODE_REPOSITORY_SYNC_OPTIONS.has(option)) {
      const removed = argument.startsWith("-") ? option : "a commit message or CodeRepository UID";
      throw new Error(
        `code-repository sync no longer takes ${removed}: it refreshes package-lock.json and runs npm ci, and does not commit, tag, or push. Commit and push the changes yourself.`,
      );
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { help: false, codeRepositoryDir, json };
}

function parseApplicationSdkArguments(args, { allowDryRun = false } = {}) {
  let applicationDir = process.cwd();
  let dryRun = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--dry-run") {
      if (!allowDryRun) throw new Error("--dry-run is available only for application update-sdk.");
      dryRun = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true, applicationDir, dryRun, json };
    }
    if (argument === "--path" || argument === "-p") {
      index += 1;
      if (!args[index]) throw new Error(argument + " requires an application directory.");
      applicationDir = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      applicationDir = argument.slice("--path=".length);
      if (!applicationDir) throw new Error("--path requires an application directory.");
      continue;
    }
    throw new Error("Unknown argument: " + argument);
  }

  return { help: false, applicationDir, dryRun, json };
}

export function parseApplicationDocsArguments(args) {
  let applicationDir = process.cwd();
  let dryRun = false;
  let json = false;
  let install = true;

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
    if (argument === "--skip-install") {
      install = false;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true, applicationDir, dryRun, json, install };
    }
    if (argument === "--path" || argument === "-p") {
      index += 1;
      if (!args[index]) throw new Error(`${argument} requires an application directory.`);
      applicationDir = args[index];
      continue;
    }
    if (argument.startsWith("--path=")) {
      applicationDir = argument.slice("--path=".length);
      if (!applicationDir) throw new Error("--path requires an application directory.");
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { help: false, applicationDir, dryRun, json, install };
}

function printHumanSyncResult(result) {
  const action = result.dryRun ? "Would synchronize" : "Synchronized";
  const pruneAction = result.dryRun ? "Would prune" : "Pruned";
  console.log(
    `${action} ${result.sdk.copied.length} SDK skill(s) in ${result.sdk.destinationRoot}.`,
  );
  console.log(
    `${pruneAction} ${result.sdk.removed.length} unauthorized Command Center namespace entr${result.sdk.removed.length === 1 ? "y" : "ies"}.`,
  );
  console.log(
    `${action} ${result.platform.installed.length} MCP skill(s) in ${result.platform.destinationRoot}.`,
  );
  printLegacyRetirement(result.platform.legacy, result.dryRun);
  console.log(`SDK version: ${result.sdk.pinnedVersion}`);
  console.log(`Platform manifest: ${result.platform.manifestSha256}`);
  if (!result.dryRun) {
    console.log(`SDK provenance: ${result.sdk.sentinelPath}`);
    console.log(`MCP provenance: ${result.platform.sentinelPath}`);
  }
}

/** What an earlier version left in `.agents/skills/mainsequence/` (issue #9). */
function printLegacyRetirement(legacy, dryRun) {
  if (!legacy?.sentinelPath) return;
  console.log(
    `${dryRun ? "Would remove" : "Removed"} ${legacy.removed.length} MCP skill folder(s) an earlier version installed in ${legacy.root}.`,
  );
  if (legacy.kept.length > 0) {
    console.log(
      `Left ${legacy.kept.length} there that the Python Main Sequence SDK also records: ${legacy.kept.map((item) => item.managedRoot).join(", ")}.`,
    );
  }
}

function printHumanResult(result) {
  const action = result.dryRun ? "Would install" : "Installed";
  const pruneAction = result.dryRun ? "Would prune" : "Pruned";
  console.log(
    `${action} ${result.copied.length} Command Center SDK skill(s) in ${result.destinationRoot}.`,
  );
  console.log(
    `${pruneAction} ${result.removed.length} unauthorized namespace entr${result.removed.length === 1 ? "y" : "ies"}.`,
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

function printHumanCodeRepositorySyncResult(result) {
  console.log(`Synced dependencies in ${result.codeRepositoryDir}: ${result.commands.join(", then ")}.`);
  console.log("Nothing was committed, tagged, or pushed. Commit and push the changed files yourself.");
}

function printHumanApplicationSdkStatus(result) {
  console.log("SDK Status");
  console.log("Application: " + result.applicationRoot);
  console.log("Package: " + result.package);
  console.log("Dependency type: " + (result.dependencyType || "not declared"));
  console.log("Declared: " + (result.declared || "not declared"));
  console.log("Locked: " + (result.locked || "not found"));
  console.log("Installed: " + (result.installed || "not found"));
  console.log("Wanted: " + (result.wanted || "unavailable"));
  console.log("Latest: " + result.latest);
  console.log("Status: " + result.status);
  console.log("Hint: " + result.hint);
}

function printHumanApplicationSdkUpdatePlan(plan) {
  console.log("SDK Update Plan");
  console.log("Application: " + plan.applicationRoot);
  console.log("Current status: " + plan.before.status);
  if (plan.commands.length === 0) {
    console.log("Action: none (" + plan.before.hint + ")");
    return;
  }
  plan.commands.forEach((command, index) => console.log("  " + (index + 1) + ". " + command));
}

function printHumanApplicationSdkUpdateResult(result) {
  if (result.dryRun) {
    console.log("Dry run: package.json, package-lock.json, node_modules, and skills were unchanged.");
    return;
  }
  if (!result.updated) {
    console.log("No SDK update applied: " + result.after.hint);
    return;
  }
  console.log(
    "Updated " +
      result.package +
      ": " +
      (result.before.locked || "not locked") +
      " -> " +
      result.after.locked +
      ".",
  );
  console.log("Next: command-center-sdk skills sync --path .");
}

function printHumanApplicationDocsResult(result) {
  const mode = result.dryRun ? "Documentation initialization preview" : "Documentation initialized";
  console.log(`${mode}: ${result.applicationRoot}`);
  console.log(`Node.js major: ${result.nodeMajor}`);
  console.log(`Documentation route: ${result.docsBaseUrl}`);
  if (result.created.length > 0) console.log(`Created: ${result.created.join(", ")}`);
  if (result.updated.length > 0) console.log(`Updated: ${result.updated.join(", ")}`);
  if (result.unchanged.length > 0) console.log(`Unchanged: ${result.unchanged.length} file(s)`);
  if (result.dryRun && result.commands.length > 0) {
    console.log(`Would run: ${result.commands.join("; ")}`);
  }
  console.log(`Next: ${result.next.join("; ")}`);
}

// `refresh_token` is the spelling a person may type after the Python CLI's alias.
const SESSION_COMMANDS = [
  { words: ["login"], allowed: ["--no-open", "--mcp"], positionalBackend: true, run: login },
  { words: ["logout"], run: logout },
  { words: ["refresh-token"], run: refreshToken },
  { words: ["refresh_token"], run: refreshToken },
  { words: ["auth", "status"], allowed: ["--check"], run: authStatus },
  { words: ["auth", "token"], run: authToken },
];

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
  const sessionCommand = SESSION_COMMANDS.find(({ words }) =>
    words.every((word, index) => args[index] === word),
  );
  if (sessionCommand) {
    const options = parseSessionArguments(args.slice(sessionCommand.words.length), sessionCommand);
    // These commands report their own failures: the exit code says what is missing.
    process.exitCode = await sessionCommand.run(options);
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
  if (args[0] === "application" && args[1] === "sdk-status") {
    const options = parseApplicationSdkArguments(args.slice(2));
    if (options.help) {
      console.log(usage);
      return;
    }
    const result = await inspectApplicationSdk({ applicationDir: options.applicationDir });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHumanApplicationSdkStatus(result);
    return;
  }
  if (args[0] === "application" && args[1] === "docs" && args[2] === "init") {
    const options = parseApplicationDocsArguments(args.slice(3));
    if (options.help) {
      console.log(usage);
      return;
    }
    const result = await initializeApplicationDocumentation({
      applicationDir: options.applicationDir,
      dryRun: options.dryRun,
      install: options.install,
      quiet: options.json,
    });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHumanApplicationDocsResult(result);
    return;
  }
  if (args[0] === "application" && args[1] === "update-sdk") {
    const options = parseApplicationSdkArguments(args.slice(2), { allowDryRun: true });
    if (options.help) {
      console.log(usage);
      return;
    }
    const result = await updateApplicationSdk({
      applicationDir: options.applicationDir,
      dryRun: options.dryRun,
      quiet: options.json,
      onPlan: options.json ? undefined : printHumanApplicationSdkUpdatePlan,
    });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHumanApplicationSdkUpdateResult(result);
    return;
  }
  if (args[0] === "code-repository" && args[1] === "sync") {
    const options = parseCodeRepositorySyncArguments(args.slice(2));
    if (options.help) {
      console.log(usage);
      return;
    }
    const result = await syncCodeRepository({
      codeRepositoryDir: options.codeRepositoryDir,
      quiet: options.json,
    });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printHumanCodeRepositorySyncResult(result);
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
          sessionAccess: resolvePlatformAccess,
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
