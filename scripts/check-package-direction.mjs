// The one-direction rule of SDK ADR 012 (docs/packages/adr/): the chat depends on the SDK, and the
// SDK knows nothing about the chat. This check reads every file of the SDK workspace, whatever its
// type, and fails when one of them
//
// - contains the chat's package name;
// - holds a path that resolves into the chat's workspace directory;
// - links into the chat's workspace directory on this repository's GitHub; or
// - is a symbolic link into the chat's workspace directory;
//
// and when the SDK's manifest lists the chat in a dependency field. It reads text: a path that
// code assembles at run time from separate segments is left to review.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const chatPackageName = "@dev-mainsequence/chat";
const sdkWorkspaceDirectory = "command-center-sdk";
const chatWorkspaceDirectory = "chat";
const repositorySlug = "mainsequence-sdk/command-center-sdk";

// Build output and installed dependencies are not the SDK's source; every other file is read.
const ignoredDirectoryNames = new Set([
  ".git",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const manifestDependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "optionalDependencies",
  "bundleDependencies",
  "bundledDependencies",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
}

const chatPackageNamePattern = new RegExp(escapeRegExp(chatPackageName), "giu");
// Runs of the characters a path is written with. A run is a candidate when it is absolute or has
// a ".." segment, because only those can leave the SDK workspace.
const pathTokenPattern = /[\w@.~+%*/-]+/gu;
const parentSegmentPattern = /(?:^|\/)\.\.(?:\/|$)/u;
const repositoryLinkPattern = new RegExp(
  `(?:github\\.com/${escapeRegExp(repositorySlug)}/(?:blob|tree|raw|edit|blame|commits)` +
    `|raw\\.githubusercontent\\.com/${escapeRegExp(repositorySlug)})` +
    `/[^/\\s"'\`()<>[\\]]+/${chatWorkspaceDirectory}(?![\\w-]|\\.\\w)`,
  "giu",
);

function isPathInside(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function listEntries(rootPath) {
  const files = [];
  const links = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        links.push(entryPath);
      } else if (entry.isDirectory()) {
        if (!ignoredDirectoryNames.has(entry.name)) visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  if (fs.existsSync(rootPath)) visit(rootPath);
  return { files, links };
}

function positionOf(text, index) {
  const before = text.slice(0, index);
  return {
    line: before.split("\n").length,
    column: index - before.lastIndexOf("\n"),
  };
}

function findTextReferences(filePath, chatRoot) {
  const text = fs.readFileSync(filePath, "utf8");
  const violations = [];
  const report = (index, kind, reason, matchedText) => {
    violations.push({ filePath, ...positionOf(text, index), kind, reason, text: matchedText });
  };

  for (const match of text.matchAll(chatPackageNamePattern)) {
    report(match.index, "package-name", "names the chat package", match[0]);
  }

  for (const match of text.matchAll(pathTokenPattern)) {
    const token = match[0];

    if (!path.isAbsolute(token) && !parentSegmentPattern.test(token)) continue;
    if (isPathInside(chatRoot, path.resolve(path.dirname(filePath), token))) {
      report(match.index, "path", "reaches into the chat workspace", token);
    }
  }

  for (const match of text.matchAll(repositoryLinkPattern)) {
    report(match.index, "link", "links into the chat workspace", match[0]);
  }

  return violations;
}

function findManifestReferences(manifestPath, chatRoot) {
  if (!fs.existsSync(manifestPath)) return [];

  const text = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(text);

  return manifestDependencyFields.flatMap((field) => {
    const value = manifest[field];
    const entries = Array.isArray(value)
      ? value.map((name) => [name, ""])
      : value && typeof value === "object"
        ? Object.entries(value)
        : [];

    return entries.flatMap(([name, specifier]) => {
      const range = typeof specifier === "string" ? specifier : "";
      const localPath = /^(?:file|link):/u.test(range) ? range.replace(/^(?:file|link):/u, "") : null;
      const namesChat =
        String(name).toLowerCase() === chatPackageName ||
        range.toLowerCase().includes(chatPackageName);
      const reachesChat =
        localPath !== null &&
        isPathInside(chatRoot, path.resolve(path.dirname(manifestPath), localPath));

      if (!namesChat && !reachesChat) return [];

      const fieldIndex = text.indexOf(`"${field}"`);
      const nameIndex = text.indexOf(`"${name}"`, Math.max(fieldIndex, 0));
      return [{
        filePath: manifestPath,
        ...(nameIndex >= 0 ? positionOf(text, nameIndex) : {}),
        kind: "manifest",
        reason: `lists the chat in ${field}`,
        text: range ? `${name}: ${range}` : String(name),
      }];
    });
  });
}

export function findSdkReferencesToChat({
  sdkRoot = path.join(repositoryRoot, sdkWorkspaceDirectory),
  chatRoot = path.join(repositoryRoot, chatWorkspaceDirectory),
} = {}) {
  const resolvedSdkRoot = path.resolve(sdkRoot);
  const resolvedChatRoot = path.resolve(chatRoot);
  const { files, links } = listEntries(resolvedSdkRoot);

  const violations = [
    ...links.flatMap((linkPath) => {
      const target = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
      return isPathInside(resolvedChatRoot, target)
        ? [{
            filePath: linkPath,
            kind: "symlink",
            reason: "is a symbolic link into the chat workspace",
            text: fs.readlinkSync(linkPath),
          }]
        : [];
    }),
    ...files.flatMap((filePath) => findTextReferences(filePath, resolvedChatRoot)),
    ...findManifestReferences(path.join(resolvedSdkRoot, "package.json"), resolvedChatRoot),
  ];

  violations.sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) ||
      (left.line ?? 0) - (right.line ?? 0) ||
      (left.column ?? 0) - (right.column ?? 0),
  );

  return { checkedFileCount: files.length, violations };
}

function formatViolation(violation) {
  const relativeFilePath = path.relative(repositoryRoot, violation.filePath);
  const location = violation.line
    ? `${relativeFilePath}:${violation.line}:${violation.column}`
    : relativeFilePath;

  return `${location} ${violation.reason} (${violation.text})`;
}

function runCli() {
  const { checkedFileCount, violations } = findSdkReferencesToChat();

  if (violations.length > 0) {
    console.error(
      "Package direction validation failed: the chat depends on the SDK, and the SDK must not refer to the chat (SDK ADR 012).",
    );
    violations.forEach((violation) => console.error(`- ${formatViolation(violation)}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Package direction validation passed: ${checkedFileCount} file(s) under ${sdkWorkspaceDirectory}/ do not refer to ${chatPackageName} or ${chatWorkspaceDirectory}/.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
