import { spawnSync } from "node:child_process";
import fs from "node:fs";

import {
  parseExcludedPackageNames,
  readPublicPackageGraph,
  readWorkspacePackageInventory,
} from "./public-package-graph.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
  }
}

function isPublished(name, version) {
  const result = spawnSync("npm", ["view", `${name}@${version}`, "version"], { stdio: "ignore" });
  return result.status === 0;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const excludedNames = parseExcludedPackageNames(args);
const packages = readPublicPackageGraph({ excludedNames });
const summary = readWorkspacePackageInventory().flatMap((entry) => {
  if (entry.manifest.private === true) {
    return [{ package: `${entry.manifest.name}@${entry.manifest.version}`, result: "private; not publishable" }];
  }
  if (excludedNames.includes(entry.manifest.name)) {
    return [{ package: `${entry.manifest.name}@${entry.manifest.version}`, result: "excluded; dedicated workflow" }];
  }
  return [];
});
let failed = false;

for (const entry of packages) {
  try {
    run("npm", ["--workspace", entry.name, "run", "check"]);
    run("npm", ["--workspace", entry.name, "run", "build"]);
    if (isPublished(entry.name, entry.version)) {
      console.log(`${entry.name}@${entry.version} is already published; skipping.`);
      summary.push({ package: `${entry.name}@${entry.version}`, result: "already published" });
      continue;
    }
    const publishArgs = ["publish", "--workspace", entry.name, "--access", "public", "--provenance"];
    if (dryRun) publishArgs.push("--dry-run");
    run("npm", publishArgs);
    summary.push({ package: `${entry.name}@${entry.version}`, result: dryRun ? "dry run" : "published" });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    summary.push({ package: `${entry.name}@${entry.version}`, result: "failed; dependants stopped" });
    failed = true;
    break;
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = summary.map((entry) => `| ${entry.package} | ${entry.result} |`).join("\n");
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\n## Command Center package publication\n\n| Package | Result |\n| --- | --- |\n${rows}\n`,
  );
}

if (failed) process.exitCode = 1;
