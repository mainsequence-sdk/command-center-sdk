import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import {
  normalizeDocumentationNavigation,
  renderDocumentationSidebars,
  renderDocumentationSummary,
} from "./docs-navigation.mjs";

const applicationRoot = process.cwd();
const navigationPath = resolve(applicationRoot, "documentation/navigation.json");
const summaryPath = resolve(applicationRoot, "docs/SUMMARY.md");
const sidebarsPath = resolve(applicationRoot, "documentation/sidebars.mjs");
const check = process.argv.slice(2).includes("--check");

if (!existsSync(navigationPath)) {
  throw new Error("Missing documentation/navigation.json.");
}

const navigation = normalizeDocumentationNavigation(
  JSON.parse(readFileSync(navigationPath, "utf8")),
);
const generated = [
  [summaryPath, renderDocumentationSummary(navigation)],
  [sidebarsPath, renderDocumentationSidebars(navigation)],
];
const stale = generated.filter(
  ([path, content]) => !existsSync(path) || readFileSync(path, "utf8") !== content,
);

if (check && stale.length) {
  process.stderr.write(
    `${stale.map(([path]) => `- Generated user-guide navigation is stale: ${path}`).join("\n")}\n`,
  );
  process.exit(1);
}

if (!check) {
  for (const [path, content] of stale) writeFileSync(path, content, "utf8");
}

process.stdout.write(
  check
    ? `User-guide navigation is synchronized for ${navigation.docIds.size} page(s).\n`
    : `Synchronized user-guide navigation for ${navigation.docIds.size} page(s).\n`,
);
