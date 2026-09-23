// The chat package's boundary check (ADR 096).
//
// The package is independent of the Command Center application. This check fails on anything
// that would tie it back: a dependency outside the allowlist, an `@/` import, an import that
// leaves the package root, an environment read in the library, or a TypeScript configuration
// that borrows the host's. It also holds the peers to being peers: the Command Center SDK and
// React are never regular dependencies, so an application has exactly one of each (ADR 097).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// What the library and the standalone application may import. Adding a name here is a decision:
// nothing from the Command Center application or an application package belongs on this list.
// The Command Center SDK is on it as a peer: the chat depends on the SDK, one way (ADR 097).
const runtimeAllowlist = new Set([
  "@assistant-ui/core",
  "@assistant-ui/react",
  "@assistant-ui/store",
  "@dev-mainsequence/command-center-sdk",
  "assistant-stream",
  "lucide-react",
  "react",
  "react-dom",
  "react-markdown",
  "rehype-raw",
  "rehype-sanitize",
  "remark-gfm",
]);

// Allowed only as peer dependencies (and as development dependencies for the package's own
// build and tests), never as regular ones.
const peerOnly = new Set(["@dev-mainsequence/command-center-sdk", "react", "react-dom"]);

// What tests and build configuration may import on top of the runtime allowlist.
const toolingAllowlist = new Set(["@playwright/test", "@vitejs/plugin-react", "jsdom", "vite", "vitest"]);

const devOnlyManifestAllowlist = new Set([
  ...toolingAllowlist,
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "typescript",
]);

const sourceRoots = ["src", "standalone"];
const configFiles = ["vite.config.ts"];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".css"]);
const failures = [];

function relative(filePath) {
  return path.relative(packageRoot, filePath).split(path.sep).join("/");
}

function fail(filePath, line, message) {
  failures.push(`${relative(filePath)}${line ? `:${line}` : ""} ${message}`);
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name === "dist" ? [] : listFiles(entryPath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function lineOf(text, position) {
  return text.slice(0, position).split("\n").length;
}

function packageNameOf(specifier) {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

function isTestFile(filePath) {
  return /\.test\.[cm]?tsx?$/.test(filePath);
}

function readImports(filePath, text) {
  if (path.extname(filePath) === ".css") {
    return [...text.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g)].map((match) => ({
      specifier: match[1],
      position: match.index ?? 0,
    }));
  }

  const imports = ts.preProcessFile(text, true, true).importedFiles.map((entry) => ({
    specifier: entry.fileName,
    position: entry.pos,
  }));
  // Module mocks name a module the same way an import does.
  const mocks = [...text.matchAll(/\bvi\.(?:mock|doMock|importActual)\(\s*["']([^"']+)["']/g)].map(
    (match) => ({ specifier: match[1], position: match.index ?? 0 }),
  );

  return [...imports, ...mocks];
}

function checkSpecifier(filePath, text, { specifier, position }, { tooling }) {
  const line = lineOf(text, position);

  if (specifier.startsWith("@/")) {
    fail(filePath, line, `imports the host alias "${specifier}".`);
    return;
  }

  if (specifier.startsWith(".")) {
    const resolved = path.resolve(path.dirname(filePath), specifier);
    const insidePackage = resolved === packageRoot || resolved.startsWith(`${packageRoot}${path.sep}`);

    if (!insidePackage) {
      fail(filePath, line, `imports "${specifier}", which is outside the package.`);
    }
    return;
  }

  if (specifier.startsWith("/")) {
    fail(filePath, line, `imports the absolute path "${specifier}".`);
    return;
  }

  if (specifier.startsWith("node:")) {
    if (!tooling) {
      fail(filePath, line, `imports the Node builtin "${specifier}".`);
    }
    return;
  }

  const packageName = packageNameOf(specifier);
  const allowed = runtimeAllowlist.has(packageName) || (tooling && toolingAllowlist.has(packageName));

  if (!allowed) {
    fail(filePath, line, `imports "${packageName}", which is not on the allowlist.`);
  }
}

function checkEnvironmentReads(filePath, text) {
  const pattern = /\bimport\.meta\.env\b|\bprocess\.env\b/g;

  for (const match of text.matchAll(pattern)) {
    fail(filePath, lineOf(text, match.index ?? 0), `reads the environment (${match[0]}).`);
  }
}

function checkSourceFile(filePath, { library, tooling }) {
  const text = fs.readFileSync(filePath, "utf8");

  readImports(filePath, text).forEach((entry) => checkSpecifier(filePath, text, entry, { tooling }));

  // The library takes its configuration as inputs. The standalone application is an application
  // and may read its own environment.
  if (library) {
    checkEnvironmentReads(filePath, text);
  }
}

function checkManifest() {
  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    Object.keys(manifest[field] ?? {}).forEach((name) => {
      if (!runtimeAllowlist.has(name)) {
        fail(manifestPath, 0, `${field} lists "${name}", which is not on the allowlist.`);
      } else if (peerOnly.has(name) && field !== "peerDependencies") {
        fail(manifestPath, 0, `${field} lists "${name}", which must be a peer dependency.`);
      }
    });
  }

  peerOnly.forEach((name) => {
    if (!manifest.peerDependencies?.[name]) {
      fail(manifestPath, 0, `peerDependencies does not list "${name}".`);
    }
  });

  Object.keys(manifest.devDependencies ?? {}).forEach((name) => {
    if (!runtimeAllowlist.has(name) && !devOnlyManifestAllowlist.has(name)) {
      fail(manifestPath, 0, `devDependencies lists "${name}", which is not on the allowlist.`);
    }
  });
}

function checkTypeScriptConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return;
  }

  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);

  if (error) {
    fail(configPath, 0, "could not be read.");
    return;
  }

  if (config.extends) {
    const extended = path.resolve(path.dirname(configPath), config.extends);

    if (!extended.startsWith(`${packageRoot}${path.sep}`)) {
      fail(configPath, 0, `extends "${config.extends}", which is outside the package.`);
    }
  }

  if (config.compilerOptions?.paths) {
    fail(configPath, 0, "defines path aliases.");
  }
}

for (const root of sourceRoots) {
  for (const filePath of listFiles(path.join(packageRoot, root))) {
    checkSourceFile(filePath, {
      library: root === "src",
      tooling: isTestFile(filePath),
    });
  }
}

for (const configFile of configFiles) {
  const filePath = path.join(packageRoot, configFile);

  if (fs.existsSync(filePath)) {
    checkSourceFile(filePath, { library: false, tooling: true });
  }
}

checkManifest();
checkTypeScriptConfig(path.join(packageRoot, "tsconfig.json"));
checkTypeScriptConfig(path.join(packageRoot, "standalone", "tsconfig.json"));

if (failures.length > 0) {
  console.error("Chat package boundary check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("The chat package is independent of the Command Center application.");
