import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readPublicPackageGraph } from "./public-package-graph.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repositoryRoot, "examples", "sdk-consumer-fixture");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "command-center-packed-consumer-"));
const tarballRoot = path.join(temporaryRoot, "tarballs");
const npmCacheRoot = path.join(temporaryRoot, "npm-cache");
fs.mkdirSync(tarballRoot);
fs.mkdirSync(npmCacheRoot);

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: npmCacheRoot },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const packages = readPublicPackageGraph();
packages.forEach((entry) => {
  run("npm", ["--workspace", entry.name, "run", "build"]);
  run("npm", ["pack", "--workspace", entry.name, "--pack-destination", tarballRoot]);
});

fs.cpSync(path.join(fixtureRoot, "src"), path.join(temporaryRoot, "src"), { recursive: true });
fs.copyFileSync(path.join(fixtureRoot, "tsconfig.json"), path.join(temporaryRoot, "tsconfig.json"));
const originalManifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "package.json"), "utf8"));
const tarballs = fs.readdirSync(tarballRoot).filter((name) => name.endsWith(".tgz"));
const dependencies = { ...originalManifest.dependencies };
packages.forEach((entry) => {
  const prefix = entry.name.replace(/^@/, "").replaceAll("/", "-").replaceAll("_", "-");
  const tarball = tarballs.find((name) => name.startsWith(prefix));
  if (!tarball) throw new Error(`Missing packed artifact for ${entry.name}.`);
  dependencies[entry.name] = `file:${path.join(tarballRoot, tarball)}`;
});
fs.writeFileSync(
  path.join(temporaryRoot, "package.json"),
  JSON.stringify({ ...originalManifest, workspaces: undefined, dependencies }, null, 2),
);
run("npm", ["install", "--ignore-scripts"], temporaryRoot);
run("npm", ["run", "check"], temporaryRoot);
console.log(`Packed consumer verified in ${temporaryRoot}.`);
