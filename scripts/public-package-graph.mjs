import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryManifestPath = path.join(repositoryRoot, "package.json");

function toRepositoryPath(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

function expandWorkspacePattern(pattern) {
  if (!pattern.endsWith("/*")) {
    return [path.join(repositoryRoot, pattern)];
  }

  const parentDirectory = path.join(repositoryRoot, pattern.slice(0, -2));
  if (!fs.existsSync(parentDirectory)) return [];

  return fs.readdirSync(parentDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parentDirectory, entry.name));
}

function assertPublicPackageManifest({ directory, packageRoot, manifest }) {
  const label = manifest.name ?? directory;
  const fail = (message) => {
    throw new Error(`${label}: ${message}`);
  };
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@dev-mainsequence/")) {
    fail("public package name must use the @dev-mainsequence scope");
  }
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    fail("version must be semantic versioning");
  }
  if (manifest.license !== "Apache-2.0") fail("license must be Apache-2.0");
  if (typeof manifest.description !== "string" || !manifest.description.trim()) fail("description is required");
  if (manifest.repository?.directory !== directory) fail("repository.directory must match the workspace directory");
  if (manifest.publishConfig?.access !== "public") fail("publishConfig.access must be public");
  if (manifest.publishConfig?.registry !== "https://registry.npmjs.org/") fail("publishConfig.registry must be npmjs.org");
  if (!manifest.main || !manifest.types || !manifest.exports?.["."] || !manifest.exports?.["./package.json"]) {
    fail("main, types, root export, and package.json export are required");
  }
  if (!manifest.scripts?.build || !manifest.scripts?.check) fail("build and check scripts are required");
  for (const file of ["README.md", "CHANGELOG.md", "LICENSE"]) {
    if (!fs.existsSync(path.join(packageRoot, file))) fail(`${file} is missing`);
    if (!Array.isArray(manifest.files) || !manifest.files.includes(file)) fail(`${file} must be included in files`);
  }
  if (!manifest.files.includes("dist")) fail("dist must be included in files");
  const dependencyRanges = Object.entries({
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
  });
  dependencyRanges.forEach(([name, range]) => {
    if (typeof range !== "string" || /^(?:file:|workspace:|link:)/.test(range)) {
      fail(`publishable dependency ${name} must use a registry version range`);
    }
  });
}

export function readPublicPackageGraph(options = {}) {
  const excludedNames = new Set(options.excludedNames ?? []);
  const packages = readWorkspacePackageInventory()
    .filter((entry) => entry.manifest.private !== true && !excludedNames.has(entry.manifest.name))
    .map((entry) => {
      assertPublicPackageManifest(entry);
      return {
        directory: entry.directory,
        name: entry.manifest.name,
        version: entry.manifest.version,
        packageRoot: entry.packageRoot,
        manifest: entry.manifest,
        dependencies: Object.keys({
          ...(entry.manifest.dependencies ?? {}),
          ...(entry.manifest.peerDependencies ?? {}),
        }),
      };
    });
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  packages.forEach((entry) => {
    Object.entries(entry.manifest.dependencies ?? {}).forEach(([dependencyName, range]) => {
      const dependency = byName.get(dependencyName);
      if (!dependency) return;
      if (range !== `^${dependency.version}`) {
        throw new Error(
          `${entry.name}: internal dependency ${dependencyName} must use ^${dependency.version}; found ${range}`,
        );
      }
    });
  });
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  function visit(entry) {
    if (visited.has(entry.name)) return;
    if (visiting.has(entry.name)) throw new Error(`Public package dependency cycle at ${entry.name}.`);
    visiting.add(entry.name);
    entry.dependencies.filter((name) => byName.has(name)).sort().forEach((name) => visit(byName.get(name)));
    visiting.delete(entry.name);
    visited.add(entry.name);
    ordered.push(entry);
  }

  packages.sort((left, right) => left.name.localeCompare(right.name)).forEach(visit);
  return ordered;
}

export function readWorkspacePackageInventory() {
  const repositoryManifest = JSON.parse(fs.readFileSync(repositoryManifestPath, "utf8"));
  const workspacePatterns = Array.isArray(repositoryManifest.workspaces)
    ? repositoryManifest.workspaces
    : [];

  return workspacePatterns
    .flatMap(expandWorkspacePattern)
    .flatMap((packageRoot) => {
      const manifestPath = path.join(packageRoot, "package.json");
      if (!fs.existsSync(manifestPath)) return [];
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      return [{
        directory: toRepositoryPath(packageRoot),
        packageRoot,
        manifest,
      }];
    })
    .sort((left, right) => left.directory.localeCompare(right.directory));
}

export function parseExcludedPackageNames(args) {
  const names = [];
  args.forEach((arg, index) => {
    if (arg === "--exclude" && args[index + 1]) names.push(args[index + 1]);
  });
  return names;
}
