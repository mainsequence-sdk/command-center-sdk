import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readPublicPackageGraph } from "./public-package-graph.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The repository publishes the SDK and, once its workspace exists, the chat (SDK ADR 012). Any
// other public package is a policy change that needs its own decision.
const sdkPackage = { name: "@dev-mainsequence/command-center-sdk", directory: "command-center-sdk" };
const chatPackage = { name: "@dev-mainsequence/chat", directory: "chat" };

const chatWorkspaceExists = fs.existsSync(
  path.join(repositoryRoot, chatPackage.directory, "package.json"),
);
const expectedPublicPackages = chatWorkspaceExists ? [sdkPackage, chatPackage] : [sdkPackage];
const packages = readPublicPackageGraph();

function describe(entries) {
  return (
    entries
      .map(({ name, directory }) => `${name} (${directory}/)`)
      .sort()
      .join(", ") || "none"
  );
}

if (
  packages.length !== expectedPublicPackages.length ||
  expectedPublicPackages.some(
    (expected) =>
      !packages.some(
        (entry) => entry.name === expected.name && entry.directory === expected.directory,
      ),
  )
) {
  throw new Error(
    `Expected the public packages to be ${describe(expectedPublicPackages)}; found ${describe(
      packages,
    )}. The repository publishes the SDK and, once chat/package.json exists, the chat as a public root workspace (SDK ADR 012).`,
  );
}

console.log(`Public package metadata validation passed for ${packages.length} package(s).`);
