import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { findSdkReferencesToChat } from "./check-package-direction.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.join(scriptsRoot, "fixtures", "package-direction");

function fixtureRoots(name) {
  const root = path.join(fixturesRoot, name);
  return { sdkRoot: path.join(root, "command-center-sdk"), chatRoot: path.join(root, "chat") };
}

function summarize(violations, sdkRoot) {
  return violations.map((violation) => [
    path.relative(sdkRoot, violation.filePath).split(path.sep).join("/"),
    violation.kind,
    violation.text,
  ]);
}

test("accepts an SDK that does not know the chat while the chat imports the SDK", () => {
  const { checkedFileCount, violations } = findSdkReferencesToChat(fixtureRoots("valid"));

  assert.deepEqual(violations, []);
  assert.equal(checkedFileCount, 4);
});

test("rejects every way a file of the SDK can refer to the chat", () => {
  const roots = fixtureRoots("invalid");
  const { violations } = findSdkReferencesToChat(roots);

  assert.deepEqual(summarize(violations, roots.sdkRoot), [
    ["docs/guide.md", "package-name", "@dev-mainsequence/chat"],
    [
      "docs/guide.md",
      "link",
      "github.com/mainsequence-sdk/command-center-sdk/tree/main/chat",
    ],
    ["package.json", "manifest", "@dev-mainsequence/chat: ^0.1.0"],
    ["package.json", "package-name", "@dev-mainsequence/chat"],
    ["package.json", "manifest", "chat-source: file:../chat"],
    ["package.json", "path", "../chat"],
    ["src/thread.ts", "path", "../../chat/src/index.js"],
    ["styles.css", "path", "../chat/styles.css"],
  ]);
  assert.match(
    violations.find((violation) => violation.kind === "manifest")?.reason ?? "",
    /lists the chat in peerDependencies/,
  );
  assert.ok(violations.every((violation) => violation.line > 0 && violation.column > 0));
});

test("rejects a symbolic link into the chat and does not read build output or dependencies", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-direction-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sdkRoot = path.join(root, "command-center-sdk");
  const chatRoot = path.join(root, "chat");

  fs.mkdirSync(path.join(chatRoot, "src"), { recursive: true });
  fs.mkdirSync(path.join(sdkRoot, "src"), { recursive: true });
  fs.symlinkSync(path.join("..", "..", "chat", "src"), path.join(sdkRoot, "src", "chat"));
  for (const ignored of ["dist", "node_modules/some-dependency"]) {
    fs.mkdirSync(path.join(sdkRoot, ignored), { recursive: true });
    fs.writeFileSync(
      path.join(sdkRoot, ignored, "index.js"),
      'export * from "@dev-mainsequence/chat";\n',
    );
  }

  const { checkedFileCount, violations } = findSdkReferencesToChat({ sdkRoot, chatRoot });

  assert.deepEqual(summarize(violations, sdkRoot), [
    ["src/chat", "symlink", path.join("..", "..", "chat", "src")],
  ]);
  assert.equal(checkedFileCount, 0);
});
