import { parseExcludedPackageNames, readPublicPackageGraph } from "./public-package-graph.mjs";

const args = process.argv.slice(2);
const packages = readPublicPackageGraph({ excludedNames: parseExcludedPackageNames(args) });

if (args.includes("--matrix")) {
  console.log(JSON.stringify({ include: packages.map(({ name, directory, version }) => ({ name, directory, version })) }));
} else {
  packages.forEach((entry) => console.log(`${entry.name}\t${entry.directory}\t${entry.version}`));
}
