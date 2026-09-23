import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { auditThemeCss } from "../../cli/audit-theme-css.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");

async function fixture(css) {
  const root = await mkdtemp(join(tmpdir(), "command-center-theme-audit-"));
  const source = join(root, "src");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "styles.css"), css, "utf8");
  return { root, source };
}

test("accepts SDK tokens, derived aliases, and application-owned structure", async () => {
  const { root, source } = await fixture(`
    :root {
      --app-panel: color-mix(in srgb, var(--card) 90%, transparent);
    }
    .panel {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      max-width: 80rem;
      background: var(--app-panel);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-panel);
      font-family: var(--font-sans);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-medium);
      letter-spacing: var(--letter-spacing-ui);
      line-height: var(--line-height-body);
      text-transform: var(--text-transform-label);
    }
  `);
  try {
    const result = await auditThemeCss({ projectDir: root, targetPath: source });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps the SDK shared component stylesheet inside its own closed theme contract", async () => {
  const result = await auditThemeCss({
    projectDir: packageRoot,
    targetPath: join(packageRoot, "styles.css"),
  });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
});

test("rejects invented variables, fallbacks, and hardcoded semantic values", async () => {
  const { root, source } = await fixture(`
    :root {
      --app-panel: var(--ms-color-surface, #10231d);
      --local-shadow: 0 1px 2px currentColor;
    }
    .panel {
      background: var(--app-panel);
      color: #eef5f2;
      box-shadow: var(--local-shadow);
      border-radius: 0.75rem;
      font-family: Inter, sans-serif;
      font-size: 1rem;
      font-weight: 650;
      letter-spacing: 0.02em;
      line-height: 1.5;
      text-transform: uppercase;
    }
  `);
  try {
    const result = await auditThemeCss({ projectDir: root, targetPath: source });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some(({ rule }) => rule === "unknown-theme-variable"), true);
    assert.equal(result.diagnostics.some(({ rule }) => rule === "theme-fallback"), true);
    assert.equal(result.diagnostics.some(({ rule }) => rule === "hardcoded-theme-color"), true);
    assert.equal(result.diagnostics.some(({ rule }) => rule === "hardcoded-theme-value"), true);
    assert.equal(result.diagnostics.some(({ rule }) => rule === "non-sdk-theme-alias"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reads an allowed theme value without its !important flag", async () => {
  const { root, source } = await fixture(`
    .picker-trigger {
      background-color: transparent !important;
      box-shadow: none !important;
      border-color: TRANSPARENT !IMPORTANT;
      outline: none ! important;
      background-image: none!important;
      color: var(--primary) !important;
    }
  `);
  try {
    const result = await auditThemeCss({ projectDir: root, targetPath: source });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an !important flag neither causes nor hides a theme violation", async () => {
  const declarations = [
    "color: #fff",
    "font-size: 12px",
    "background: var(--card, #10231d)",
    "border-color: var(--ms-color-unknown)",
    "box-shadow: none",
  ];
  const css = (flag) => `.panel {\n${declarations.map((line) => `  ${line}${flag};`).join("\n")}\n}\n`;
  const plain = await fixture(css(""));
  const flagged = await fixture(css(" !important"));
  const rulesByLine = ({ diagnostics }) => diagnostics.map(({ line, rule }) => `${line} ${rule}`);
  try {
    const plainResult = await auditThemeCss({ projectDir: plain.root, targetPath: plain.source });
    const flaggedResult = await auditThemeCss({
      projectDir: flagged.root,
      targetPath: flagged.source,
    });
    assert.equal(flaggedResult.ok, false);
    assert.deepEqual(rulesByLine(flaggedResult), rulesByLine(plainResult));
    for (const expected of [
      "2 hardcoded-theme-color",
      "3 hardcoded-theme-value",
      "4 theme-fallback",
      "5 unknown-theme-variable",
    ]) {
      assert.equal(rulesByLine(flaggedResult).includes(expected), true, expected);
    }
  } finally {
    await rm(plain.root, { recursive: true, force: true });
    await rm(flagged.root, { recursive: true, force: true });
  }
});

test("CLI emits machine-readable failures and exits nonzero", async () => {
  const { root, source } = await fixture(`.panel { color: var(--ms-color-text, #fff); }`);
  try {
    const result = spawnSync(
      process.execPath,
      [cliPath, "theme", "audit", "--path", source, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.diagnostics.some(({ rule }) => rule === "unknown-theme-variable"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
