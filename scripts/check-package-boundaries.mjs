import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { readWorkspacePackageInventory } from "./public-package-graph.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const ignoredDirectoryNames = new Set([
  ".git",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);
const applicationOnlyBareImports = new Set([
  "@tanstack/react-query",
  "react-router-dom",
  "zustand",
]);
const applicationRootPrefixes = ["@/", "apps/", "extensions/", "src/"];

function isPathInside(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function listSourceFiles(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const stats = fs.statSync(rootPath);

  if (stats.isFile()) {
    return sourceExtensions.has(path.extname(rootPath)) ? [rootPath] : [];
  }

  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      return [];
    }

    const entryPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function collectModuleSpecifiers(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = [];

  function appendLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      specifiers.push({
        column: position.character + 1,
        line: position.line + 1,
        value: node.text,
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      appendLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      appendLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";

      if (isDynamicImport || isRequire) {
        appendLiteral(node.arguments[0]);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function explainForbiddenSpecifier(specifier, filePath, packageRoot) {
  if (applicationRootPrefixes.some((prefix) => specifier.startsWith(prefix))) {
    return "public packages must import public package exports instead of Command Center application paths";
  }

  if (applicationOnlyBareImports.has(specifier)) {
    return `public packages must not depend on application runtime package \"${specifier}\"`;
  }

  if (path.isAbsolute(specifier)) {
    return "public packages must not import absolute filesystem paths";
  }

  if (specifier.startsWith(".")) {
    const resolvedPath = path.resolve(path.dirname(filePath), specifier);

    if (!isPathInside(packageRoot, resolvedPath)) {
      return "relative imports must not traverse outside the package; use another package's declared export";
    }
  }

  return null;
}

export function findPackageBoundaryViolations({ packageRoot, sourceRoots = [packageRoot] }) {
  const normalizedPackageRoot = path.resolve(packageRoot);

  return sourceRoots
    .flatMap((sourceRoot) => listSourceFiles(path.resolve(sourceRoot)))
    .sort()
    .flatMap((filePath) => {
      const sourceText = fs.readFileSync(filePath, "utf8");

      return collectModuleSpecifiers(sourceText, filePath).flatMap((specifier) => {
        const reason = explainForbiddenSpecifier(
          specifier.value,
          filePath,
          normalizedPackageRoot,
        );

        if (!reason) {
          return [];
        }

        return [{
          column: specifier.column,
          filePath,
          line: specifier.line,
          reason,
          specifier: specifier.value,
        }];
      });
    });
}

export function discoverPublishablePackages(rootPath) {
  if (rootPath === undefined) {
    return readWorkspacePackageInventory()
      .filter((entry) => entry.manifest.private !== true)
      .map((entry) => ({
        name: typeof entry.manifest.name === "string" ? entry.manifest.name : entry.directory,
        packageRoot: entry.packageRoot,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  if (!fs.existsSync(rootPath)) {
    return [];
  }

  return fs.readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const packageRoot = path.join(rootPath, entry.name);
      const packageJsonPath = path.join(packageRoot, "package.json");

      if (!fs.existsSync(packageJsonPath)) {
        return [];
      }

      const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

      if (manifest.private === true) {
        return [];
      }

      return [{
        name: typeof manifest.name === "string" ? manifest.name : entry.name,
        packageRoot,
      }];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function checkPublishablePackageBoundaries(rootPath) {
  return discoverPublishablePackages(rootPath).flatMap((workspacePackage) =>
    findPackageBoundaryViolations({ packageRoot: workspacePackage.packageRoot }).map(
      (violation) => ({ ...violation, packageName: workspacePackage.name }),
    ),
  );
}

function formatViolation(violation) {
  const relativeFilePath = path.relative(repositoryRoot, violation.filePath);
  const packagePrefix = violation.packageName ? `${violation.packageName}: ` : "";

  return `${relativeFilePath}:${violation.line}:${violation.column} ${packagePrefix}${violation.reason} (${violation.specifier})`;
}

function runCli() {
  const violations = checkPublishablePackageBoundaries();

  if (violations.length > 0) {
    console.error("Package boundary validation failed:");
    violations.forEach((violation) => console.error(`- ${formatViolation(violation)}`));
    process.exitCode = 1;
    return;
  }

  const packageCount = discoverPublishablePackages().length;
  console.log(`Package boundary validation passed for ${packageCount} publishable package(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
