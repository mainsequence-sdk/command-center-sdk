import { readPublicPackageGraph } from "./public-package-graph.mjs";

const packages = readPublicPackageGraph();
const expectedPublicPackages = ["@dev-mainsequence/command-center-sdk"];
const actualPublicPackages = packages.map((entry) => entry.name);

if (
  actualPublicPackages.length !== expectedPublicPackages.length ||
  actualPublicPackages.some((name, index) => name !== expectedPublicPackages[index])
) {
  throw new Error(
    `Expected the unified SDK to be the only public package; found: ${
      actualPublicPackages.join(", ") || "none"
    }`,
  );
}

console.log(`Public package metadata validation passed for ${packages.length} package(s).`);
