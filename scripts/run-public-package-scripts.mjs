// Runs npm scripts in the repository's public packages, each package after the public packages it
// depends on (peers included), so a package always builds against fresh output of its
// dependencies.
//
//   node scripts/run-public-package-scripts.mjs [--package <name> | --dependencies-of <name>] <script>...
//
// Without a selector every public package runs. `--package` runs <name> and the public packages it
// depends on; `--dependencies-of` runs only the public packages <name> depends on. The scripts run
// in the order given, one package at a time; a package that does not define a script skips it.
import { spawnSync } from "node:child_process";

import { collectPublicDependencyNames, readPublicPackageGraph } from "./public-package-graph.mjs";

const usage =
  "Usage: node scripts/run-public-package-scripts.mjs [--package <name> | --dependencies-of <name>] <script>...";
const selectors = { "--package": null, "--dependencies-of": null };
const scripts = [];
const args = process.argv.slice(2);

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (Object.hasOwn(selectors, arg)) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} needs a package name. ${usage}`);
    selectors[arg] = value;
    index += 1;
  } else if (arg.startsWith("--")) {
    throw new Error(`Unknown option ${arg}. ${usage}`);
  } else {
    scripts.push(arg);
  }
}

if (scripts.length === 0) throw new Error(usage);
if (selectors["--package"] && selectors["--dependencies-of"]) {
  throw new Error(`Use --package or --dependencies-of, not both. ${usage}`);
}

const packages = readPublicPackageGraph();
let selected = packages;

if (selectors["--package"]) {
  const dependencies = collectPublicDependencyNames(packages, selectors["--package"]);
  selected = packages.filter(
    (entry) => entry.name === selectors["--package"] || dependencies.has(entry.name),
  );
} else if (selectors["--dependencies-of"]) {
  const dependencies = collectPublicDependencyNames(packages, selectors["--dependencies-of"]);
  selected = packages.filter((entry) => dependencies.has(entry.name));
}

if (selected.length === 0) console.log("No public package selected; nothing to run.");

for (const entry of selected) {
  for (const script of scripts) {
    if (typeof entry.manifest.scripts?.[script] !== "string") {
      console.log(`${entry.name} has no "${script}" script; skipped.`);
      continue;
    }
    const result = spawnSync("npm", ["--workspace", entry.name, "run", script], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
