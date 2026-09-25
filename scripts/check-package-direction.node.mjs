import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { findSdkReferencesToAiPackage } from "./check-package-direction.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(scriptsRoot, "fixtures", "package-direction");

function fixtureRoots(name) {
  const root = path.join(fixturesRoot, name);
  return {
    sdkRoot: path.join(root, "command-center-sdk"),
    aiRoot: path.join(root, "command-center-ai"),
    allowedMentions: new Map(),
  };
}

function summarize(violations, sdkRoot) {
  return violations.map((violation) => [
    path.relative(sdkRoot, violation.filePath).split(path.sep).join("/"),
    violation.kind,
    violation.text,
  ]);
}

function temporaryWorkspaces(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-direction-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sdkRoot = path.join(root, "command-center-sdk");
  const aiRoot = path.join(root, "command-center-ai");
  fs.mkdirSync(path.join(aiRoot, "src"), { recursive: true });
  fs.mkdirSync(path.join(sdkRoot, "docs"), { recursive: true });
  return { sdkRoot, aiRoot };
}

test("accepts an SDK that does not know the AI package while the AI package imports the SDK", () => {
  const { checkedFileCount, violations } = findSdkReferencesToAiPackage(fixtureRoots("valid"));

  assert.deepEqual(violations, []);
  assert.equal(checkedFileCount, 4);
});

test("rejects every way a file of the SDK can refer to the AI package outside the allowlist", () => {
  const roots = fixtureRoots("invalid");
  const { violations } = findSdkReferencesToAiPackage(roots);

  assert.deepEqual(summarize(violations, roots.sdkRoot), [
    ["docs/guide.md", "package-name", "@dev-mainsequence/command-center-ai"],
    [
      "docs/guide.md",
      "link",
      "github.com/mainsequence-sdk/command-center-sdk/tree/main/command-center-ai",
    ],
    ["package.json", "manifest", "@dev-mainsequence/command-center-ai: ^0.1.0"],
    ["package.json", "package-name", "@dev-mainsequence/command-center-ai"],
    ["package.json", "manifest", "chat-source: file:../command-center-ai"],
    ["package.json", "path", "../command-center-ai"],
    ["src/thread.ts", "path", "../../command-center-ai/src/index.js"],
    ["styles.css", "path", "../command-center-ai/styles.css"],
  ]);
  assert.match(
    violations.find((violation) => violation.kind === "manifest")?.reason ?? "",
    /lists the AI package in peerDependencies/,
  );
  assert.ok(violations.every((violation) => violation.line > 0 && violation.column > 0));
});

test("an allowlisted file names the AI package exactly as often as allowed, and never imports it", (t) => {
  const { sdkRoot, aiRoot } = temporaryWorkspaces(t);
  const guide = path.join(sdkRoot, "docs", "guide.md");
  fs.writeFileSync(
    guide,
    [
      "AI capabilities come from `@dev-mainsequence/command-center-ai`, not from the SDK.",
      "",
      "```bash",
      "npm install @dev-mainsequence/command-center-ai",
      "```",
      "",
    ].join("\n"),
  );

  const allowed = findSdkReferencesToAiPackage({
    sdkRoot,
    aiRoot,
    allowedMentions: new Map([["docs/guide.md", 2]]),
  });
  assert.deepEqual(allowed.violations, []);

  const miscounted = findSdkReferencesToAiPackage({
    sdkRoot,
    aiRoot,
    allowedMentions: new Map([["docs/guide.md", 1]]),
  });
  assert.deepEqual(summarize(miscounted.violations, sdkRoot), [
    ["docs/guide.md", "allowlist", "@dev-mainsequence/command-center-ai"],
  ]);
  assert.match(miscounted.violations[0].reason, /2 time\(s\); the allowlist says 1/u);

  fs.appendFileSync(guide, 'import { ChatThread } from "@dev-mainsequence/command-center-ai";\n');
  const imported = findSdkReferencesToAiPackage({
    sdkRoot,
    aiRoot,
    allowedMentions: new Map([["docs/guide.md", 3]]),
  });
  assert.deepEqual(summarize(imported.violations, sdkRoot), [
    ["docs/guide.md", "import", 'from "@dev-mainsequence/command-center-ai'],
  ]);

  const stale = findSdkReferencesToAiPackage({
    sdkRoot,
    aiRoot,
    allowedMentions: new Map([
      ["docs/guide.md", 3],
      ["docs/removed.md", 1],
    ]),
  });
  assert.deepEqual(summarize(stale.violations, sdkRoot).filter(([, kind]) => kind === "allowlist"), [
    ["docs/removed.md", "allowlist", "docs/removed.md"],
  ]);
});

test("rejects a symbolic link into the AI package and does not read build output or dependencies", (t) => {
  const { sdkRoot, aiRoot } = temporaryWorkspaces(t);

  fs.mkdirSync(path.join(sdkRoot, "src"), { recursive: true });
  fs.rmSync(path.join(sdkRoot, "docs"), { recursive: true });
  fs.symlinkSync(path.join("..", "..", "command-center-ai", "src"), path.join(sdkRoot, "src", "ai"));
  for (const ignored of ["dist", "node_modules/some-dependency"]) {
    fs.mkdirSync(path.join(sdkRoot, ignored), { recursive: true });
    fs.writeFileSync(
      path.join(sdkRoot, ignored, "index.js"),
      'export * from "@dev-mainsequence/command-center-ai";\n',
    );
  }

  const { checkedFileCount, violations } = findSdkReferencesToAiPackage({
    sdkRoot,
    aiRoot,
    allowedMentions: new Map(),
  });

  assert.deepEqual(summarize(violations, sdkRoot), [
    ["src/ai", "symlink", path.join("..", "..", "command-center-ai", "src")],
  ]);
  assert.equal(checkedFileCount, 0);
});
