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

function fail(message) {
  console.error(`Packed skills verification failed: ${message}`);
  process.exit(1);
}

/** Every skill leaf under a packaged `agent_scaffold/skills`, by its path in its lane. */
function listPackagedSkillPaths(skillsRoot) {
  const paths = [];
  function visit(directory, relativePath) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.startsWith("__")) continue;
      const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), entryPath);
      else if (entry.isFile() && entry.name === "SKILL.md" && relativePath) paths.push(relativePath);
    }
  }
  visit(skillsRoot, "");
  return paths.sort();
}

// The consumer installs with --ignore-scripts, so the packages' postinstalls have not run. Run each
// installed package's postinstall into the consumer, as npm does for an application, with the SDK's
// network lane off, and prove every packaged skill landed in the namespace its provenance claims.
function verifyPackedSkills(consumerRoot, name) {
  const packageRoot = path.join(consumerRoot, "node_modules", ...name.split("/"));
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const skillsRoot = path.join(packageRoot, "agent_scaffold", "skills");
  if (!fs.existsSync(skillsRoot)) return;

  const script = /^node\s+(\S+)$/u.exec(manifest.scripts?.postinstall ?? "")?.[1];
  if (!script) fail(`${name} ships agent skills but no "node <script>" postinstall.`);
  const result = spawnSync(process.execPath, [path.join(packageRoot, script)], {
    cwd: packageRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      COMMAND_CENTER_SDK_MCP_POSTINSTALL: "0",
      INIT_CWD: consumerRoot,
      npm_config_global: "false",
    },
  });
  if (result.status !== 0) fail(`${name}'s postinstall exited with ${result.status}.`);

  const skillsParent = path.join(consumerRoot, ".agents", "skills");
  const namespaces = (fs.existsSync(skillsParent) ? fs.readdirSync(skillsParent) : [])
    .map((namespace) => path.join(skillsParent, namespace))
    .filter((namespace) => {
      const provenance = path.join(namespace, "PINNED_FROM.txt");
      return fs.existsSync(provenance) && fs.readFileSync(provenance, "utf8").split("\n").includes(`library_name=${name}`);
    });
  if (namespaces.length !== 1) fail(`${name} owns ${namespaces.length} skill namespaces instead of one.`);

  const provenance = fs.readFileSync(path.join(namespaces[0], "PINNED_FROM.txt"), "utf8").split("\n");
  if (!provenance.includes(`pinned_version=${manifest.version}`)) {
    fail(`${name}'s PINNED_FROM.txt does not record version ${manifest.version}.`);
  }
  const expected = listPackagedSkillPaths(skillsRoot);
  const recorded = provenance.filter((line) => line.startsWith("skill_path=")).map((line) => line.slice(11)).sort();
  if (expected.length === 0 || expected.join("\n") !== recorded.join("\n")) {
    fail(`${name}'s PINNED_FROM.txt records [${recorded.join(", ")}] instead of [${expected.join(", ")}].`);
  }
  for (const skillPath of expected) {
    if (!fs.existsSync(path.join(namespaces[0], ...skillPath.split("/"), "SKILL.md"))) {
      fail(`${name}'s skill ${skillPath} is missing from ${namespaces[0]}.`);
    }
  }
  console.log(
    `Packed skills verified for ${name}: ${expected.length} skill(s) in ${path.relative(consumerRoot, namespaces[0])}.`,
  );
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
  installedNames.forEach((name) => verifyPackedSkills(consumerRoot, name));
  console.log(`Packed consumer verified for ${installedNames.join(" with ")} in ${consumerRoot}.`);
});
