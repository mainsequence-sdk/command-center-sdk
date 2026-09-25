// The one-direction rule of SDK ADR 012 (docs/packages/adr/), as amended on 2026-09-25: Command
// Center AI depends on the SDK, and the SDK depends on nothing of it. The SDK names the AI package
// only where it sends someone who needs AI capabilities to it. This check reads every file of the
// SDK workspace, whatever its type, and fails when one of them
//
// - names the AI package outside the allowlist below, or a different number of times than the
//   allowlist says, or imports it;
// - holds a path that resolves into the AI package's workspace directory;
// - links into the AI package's workspace directory on this repository's GitHub; or
// - is a symbolic link into the AI package's workspace directory;
//
// and when the SDK's manifest lists the AI package in a dependency field, or the allowlist names a
// file that does not exist. It reads text: a path that code assembles at run time from separate
// segments is left to review.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const aiPackageName = "@dev-mainsequence/command-center-ai";
const sdkWorkspaceDirectory = "command-center-sdk";
const aiWorkspaceDirectory = "command-center-ai";
const repositorySlug = "mainsequence-sdk/command-center-sdk";

// The only files of the SDK that may name the AI package, each exactly this many times: the two
// general skills and the guides mapped to them, which send an agent or a person who needs a chat
// or AI capabilities to the AI package. Paths are relative to the SDK workspace. A change to one of
// these mentions changes its count here, in the same change.
export const allowedPackageNameMentions = new Map([
  ["agent_scaffold/skills/general/use-command-center-sdk/SKILL.md", 4],
  ["agent_scaffold/skills/general/build-command-center-application/SKILL.md", 2],
  ["docs/getting-started.md", 4],
  ["docs/concepts/sdk-architecture.md", 1],
]);

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

const packageNamePattern = new RegExp(escapeRegExp(aiPackageName), "giu");
// A module specifier, a string literal after `from`, `import`, `import(`, or `require(`: an import
// in any file type, which even an allowlisted file may not contain. Markdown code spans use
// backticks, not quotes, so prose such as "comes from `the-package`" is not an import.
const packageImportPattern = new RegExp(
  `(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)["']${escapeRegExp(aiPackageName)}`,
  "giu",
);
// Runs of the characters a path is written with. A run is a candidate when it is absolute or has
// a ".." segment, because only those can leave the SDK workspace.
const pathTokenPattern = /[\w@.~+%*/-]+/gu;
const parentSegmentPattern = /(?:^|\/)\.\.(?:\/|$)/u;
const repositoryLinkPattern = new RegExp(
  `(?:github\\.com/${escapeRegExp(repositorySlug)}/(?:blob|tree|raw|edit|blame|commits)` +
    `|raw\\.githubusercontent\\.com/${escapeRegExp(repositorySlug)})` +
    `/[^/\\s"'\`()<>[\\]]+/${aiWorkspaceDirectory}(?![\\w-]|\\.\\w)`,
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

function portable(relativePath) {
  return relativePath.split(path.sep).join("/");
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

function findTextReferences(filePath, { sdkRoot, aiRoot, allowedMentions }) {
  const text = fs.readFileSync(filePath, "utf8");
  const violations = [];
  const report = (index, kind, reason, matchedText) => {
    violations.push({ filePath, ...positionOf(text, index), kind, reason, text: matchedText });
  };

  const nameMatches = [...text.matchAll(packageNamePattern)];
  const allowedCount = allowedMentions.get(portable(path.relative(sdkRoot, filePath)));
  if (allowedCount === undefined) {
    for (const match of nameMatches) {
      report(match.index, "package-name", "names the AI package outside the allowlist", match[0]);
    }
  } else {
    for (const match of text.matchAll(packageImportPattern)) {
      report(match.index, "import", "imports the AI package", match[0]);
    }
    if (nameMatches.length !== allowedCount) {
      report(
        nameMatches[0]?.index ?? 0,
        "allowlist",
        `names the AI package ${nameMatches.length} time(s); the allowlist says ${allowedCount}`,
        aiPackageName,
      );
    }
  }

  for (const match of text.matchAll(pathTokenPattern)) {
    const token = match[0];

    if (!path.isAbsolute(token) && !parentSegmentPattern.test(token)) continue;
    if (isPathInside(aiRoot, path.resolve(path.dirname(filePath), token))) {
      report(match.index, "path", "reaches into the AI package's workspace", token);
    }
  }

  for (const match of text.matchAll(repositoryLinkPattern)) {
    report(match.index, "link", "links into the AI package's workspace", match[0]);
  }

  return violations;
}

function findManifestReferences(manifestPath, aiRoot) {
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
      const namesPackage =
        String(name).toLowerCase() === aiPackageName ||
        range.toLowerCase().includes(aiPackageName);
      const reachesPackage =
        localPath !== null &&
        isPathInside(aiRoot, path.resolve(path.dirname(manifestPath), localPath));

      if (!namesPackage && !reachesPackage) return [];

      const fieldIndex = text.indexOf(`"${field}"`);
      const nameIndex = text.indexOf(`"${name}"`, Math.max(fieldIndex, 0));
      return [{
        filePath: manifestPath,
        ...(nameIndex >= 0 ? positionOf(text, nameIndex) : {}),
        kind: "manifest",
        reason: `lists the AI package in ${field}`,
        text: range ? `${name}: ${range}` : String(name),
      }];
    });
  });
}

export function findSdkReferencesToAiPackage({
  sdkRoot = path.join(repositoryRoot, sdkWorkspaceDirectory),
  aiRoot = path.join(repositoryRoot, aiWorkspaceDirectory),
  allowedMentions = allowedPackageNameMentions,
} = {}) {
  const resolvedSdkRoot = path.resolve(sdkRoot);
  const resolvedAiRoot = path.resolve(aiRoot);
  const { files, links } = listEntries(resolvedSdkRoot);
  const context = { sdkRoot: resolvedSdkRoot, aiRoot: resolvedAiRoot, allowedMentions };
  const readFiles = new Set(files.map((filePath) => portable(path.relative(resolvedSdkRoot, filePath))));

  const violations = [
    ...links.flatMap((linkPath) => {
      const target = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
      return isPathInside(resolvedAiRoot, target)
        ? [{
            filePath: linkPath,
            kind: "symlink",
            reason: "is a symbolic link into the AI package's workspace",
            text: fs.readlinkSync(linkPath),
          }]
        : [];
    }),
    ...files.flatMap((filePath) => findTextReferences(filePath, context)),
    ...findManifestReferences(path.join(resolvedSdkRoot, "package.json"), resolvedAiRoot),
    ...[...allowedMentions.keys()]
      .filter((relativePath) => !readFiles.has(relativePath))
      .map((relativePath) => ({
        filePath: path.join(resolvedSdkRoot, ...relativePath.split("/")),
        kind: "allowlist",
        reason: "is on the allowlist but is not a file of the SDK",
        text: relativePath,
      })),
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
  const { checkedFileCount, violations } = findSdkReferencesToAiPackage();

  if (violations.length > 0) {
    console.error(
      "Package direction validation failed: Command Center AI depends on the SDK; the SDK depends on nothing of it and names it only in the allowlisted files (SDK ADR 012).",
    );
    violations.forEach((violation) => console.error(`- ${formatViolation(violation)}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Package direction validation passed: ${checkedFileCount} file(s) under ${sdkWorkspaceDirectory}/ name ${aiPackageName} only in its ${allowedPackageNameMentions.size} allowlisted files and never reach into ${aiWorkspaceDirectory}/.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
