import { parseExcludedPackageNames, readPublicPackageGraph } from "./public-package-graph.mjs";

const args = process.argv.slice(2);
const requiredScripts = args.flatMap((arg, index) =>
  arg === "--with-script" && args[index + 1] ? [args[index + 1]] : [],
);
const packages = readPublicPackageGraph({ excludedNames: parseExcludedPackageNames(args) }).filter(
  (entry) => requiredScripts.every((script) => typeof entry.manifest.scripts?.[script] === "string"),
);

if (args.includes("--matrix")) {
  console.log(JSON.stringify({ include: packages.map(({ name, directory, version }) => ({ name, directory, version })) }));
} else {
  packages.forEach((entry) => console.log(`${entry.name}\t${entry.directory}\t${entry.version}`));
}
