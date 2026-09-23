import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { collectPublicDependencyNames, readPublicPackageGraph } from "./public-package-graph.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplesRoot = path.join(repositoryRoot, "examples");

// Every public package is verified in its own clean consumer, built from its fixture at
// examples/<workspace directory>-consumer-fixture/. The SDK's fixture predates that convention and
// keeps its name. See docs/packages/sdk-consumer-fixture.md.
const fixtureDirectoryNames = new Map([
  ["@dev-mainsequence/command-center-sdk", "sdk-consumer-fixture"],
]);

function fixtureRootFor(entry) {
  return path.join(
    examplesRoot,
    fixtureDirectoryNames.get(entry.name) ?? `${path.basename(entry.directory)}-consumer-fixture`,
  );
}

function artifactDirectoryName(entry) {
  return entry.name.replace(/^@/, "").replaceAll("/", "-");
}

const packages = readPublicPackageGraph();
const packagesWithoutFixture = packages.filter(
  (entry) => !fs.existsSync(path.join(fixtureRootFor(entry), "package.json")),
);

if (packagesWithoutFixture.length > 0) {
  console.error("Every public package needs a packed consumer fixture (docs/packages/sdk-consumer-fixture.md):");
  packagesWithoutFixture.forEach((entry) => {
    console.error(
      `- ${entry.name}: no fixture at ${path.relative(repositoryRoot, fixtureRootFor(entry))}/`,
    );
  });
  process.exit(1);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "command-center-packed-consumer-"));
const tarballRoot = path.join(temporaryRoot, "tarballs");
const consumersRoot = path.join(temporaryRoot, "consumers");
const npmCacheRoot = path.join(temporaryRoot, "npm-cache");
fs.mkdirSync(tarballRoot);
fs.mkdirSync(consumersRoot);
fs.mkdirSync(npmCacheRoot);

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: npmCacheRoot },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Build and pack every public package, a package after the packages it depends on.
const tarballs = new Map();
packages.forEach((entry) => {
  const destination = path.join(tarballRoot, artifactDirectoryName(entry));
  fs.mkdirSync(destination);
  run("npm", ["--workspace", entry.name, "run", "build"]);
  run("npm", ["pack", "--workspace", entry.name, "--pack-destination", destination]);
  const tarball = fs.readdirSync(destination).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error(`Missing packed artifact for ${entry.name}.`);
  tarballs.set(entry.name, path.join(destination, tarball));
});

// Install each package into its own consumer with the tarballs of the sibling packages it
// declares as dependencies or peers, as an application installs them, and compile the fixture.
packages.forEach((entry) => {
  const fixtureRoot = fixtureRootFor(entry);
  const consumerRoot = path.join(consumersRoot, artifactDirectoryName(entry));
  const installedNames = [entry.name, ...collectPublicDependencyNames(packages, entry.name)];

  fs.mkdirSync(consumerRoot);
  fs.cpSync(path.join(fixtureRoot, "src"), path.join(consumerRoot, "src"), { recursive: true });
  fs.copyFileSync(path.join(fixtureRoot, "tsconfig.json"), path.join(consumerRoot, "tsconfig.json"));
  const originalManifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "package.json"), "utf8"));
  const dependencies = { ...originalManifest.dependencies };
  installedNames.forEach((name) => {
    dependencies[name] = `file:${tarballs.get(name)}`;
  });
  fs.writeFileSync(
    path.join(consumerRoot, "package.json"),
    JSON.stringify({ ...originalManifest, workspaces: undefined, dependencies }, null, 2),
  );
  run("npm", ["install", "--ignore-scripts"], consumerRoot);
  run("npm", ["run", "check"], consumerRoot);
  console.log(`Packed consumer verified for ${installedNames.join(" with ")} in ${consumerRoot}.`);
});
