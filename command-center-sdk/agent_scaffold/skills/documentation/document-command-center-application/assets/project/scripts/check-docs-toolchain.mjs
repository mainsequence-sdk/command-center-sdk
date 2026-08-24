import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const packagePath = resolve(projectRoot, "package.json");
const lockPath = resolve(projectRoot, "package-lock.json");
const documentationPackagePath = resolve(projectRoot, "documentation/package.json");
const errors = [];

if (!existsSync(packagePath)) errors.push("Missing package.json at the project root.");
if (!existsSync(lockPath)) errors.push("Missing package-lock.json at the project root.");
for (const name of ["yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"]) {
  if (existsSync(resolve(projectRoot, name))) errors.push(`Conflicting root lockfile: ${name}`);
}

const manifest = existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, "utf8")) : {};
const documentationManifest = existsSync(documentationPackagePath)
  ? JSON.parse(readFileSync(documentationPackagePath, "utf8"))
  : {};
if (documentationManifest.type === "module") {
  errors.push(
    "documentation/package.json must not set type=module; Docusaurus webpack requires ambiguous module mode while .mjs keeps configuration files ESM.",
  );
}
const declarations = [];
if (manifest?.engines?.node) {
  declarations.push({ source: "package.json engines.node", major: parseMajor(manifest.engines.node) });
} else {
  errors.push("package.json must declare engines.node as one exact major such as 24.x.");
}
for (const name of [".node-version", ".nvmrc"]) {
  const path = resolve(projectRoot, name);
  if (existsSync(path)) declarations.push({ source: name, major: parseMajor(readFileSync(path, "utf8")) });
}
if (!declarations.some(({ source }) => source === ".node-version" || source === ".nvmrc")) {
  errors.push("Add .node-version or .nvmrc with the same Node.js major as package.json.");
}

const workflowRoot = resolve(projectRoot, ".mainsequence/workflows");
if (existsSync(workflowRoot)) {
  for (const entry of readdirSync(workflowRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/u.test(entry.name)) continue;
    const source = readFileSync(resolve(workflowRoot, entry.name), "utf8");
    for (const match of source.matchAll(/^\s*node_version:\s*["']?(\d+)["']?\s*$/gmu)) {
      declarations.push({ source: `.mainsequence/workflows/${entry.name}`, major: Number(match[1]) });
    }
  }
}

const validMajors = declarations.filter(({ major }) => major !== null);
const majors = new Set(validMajors.map(({ major }) => major));
if (majors.size > 1) {
  errors.push(
    `Node.js declarations disagree: ${validMajors.map(({ source, major }) => `${source}=${major}`).join(", ")}`,
  );
}
const expectedMajor = [...majors][0];
const runningMajor = Number(process.versions.node.split(".")[0]);
if (expectedMajor !== undefined && (expectedMajor < 20 || expectedMajor % 2 !== 0)) {
  errors.push(
    `Documentation tooling requires an even-numbered Node.js LTS major at or above 20; found ${expectedMajor}.`,
  );
}
if (expectedMajor !== undefined && expectedMajor !== runningMajor) {
  errors.push(`Running Node.js ${process.versions.node}; expected major ${expectedMajor}.`);
}

if (manifest.packageManager && !String(manifest.packageManager).startsWith("npm@")) {
  errors.push(`packageManager must select npm; found ${manifest.packageManager}.`);
}
if (
  manifest.packageManager &&
  existsSync(lockPath) &&
  readFileSync(lockPath, "utf8").includes('"node_modules/postman-code-generators"')
) {
  errors.push(
    "The locked Postman code-generator postinstall can invoke Yarn and conflicts with a root npm packageManager declaration; upgrade or patch that dependency, or remove the declaration with an explicit compatibility note.",
  );
}

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  `Documentation toolchain validation passed with Node.js ${expectedMajor} and one npm lockfile.\n`,
);

function parseMajor(raw) {
  const value = String(raw || "").trim().replace(/^v/u, "");
  const match = value.match(/^(\d+)(?:\.x)?$/u);
  if (!match) {
    errors.push(`Node.js declaration must select one exact major; found ${JSON.stringify(value)}.`);
    return null;
  }
  return Number(match[1]);
}
