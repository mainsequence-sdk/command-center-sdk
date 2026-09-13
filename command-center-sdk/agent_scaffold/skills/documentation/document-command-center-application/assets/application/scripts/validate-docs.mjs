import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import process from "node:process";

import { normalizeDocumentationNavigation } from "./docs-navigation.mjs";

const applicationRoot = process.cwd();
const docsRoot = resolve(applicationRoot, "docs");
const navigationPath = resolve(applicationRoot, "documentation/navigation.json");
const summaryPath = resolve(docsRoot, "SUMMARY.md");
const errors = [];
const markdownExtensions = new Set([".md", ".mdx"]);

if (!existsSync(docsRoot)) errors.push("Missing end-user documentation root: docs/.");
if (!existsSync(navigationPath)) errors.push("Missing documentation/navigation.json.");
if (!existsSync(summaryPath)) errors.push("Missing generated docs/SUMMARY.md.");
for (const legacyDirectory of ["surfaces", "technical"]) {
  if (existsSync(resolve(docsRoot, legacyDirectory))) {
    errors.push(
      `Legacy docs/${legacyDirectory}/ is not allowed in the user guide. Migrate user-facing pages into application-navigation folders and move engineering material outside docs/.`,
    );
  }
}

const authoredPages = existsSync(docsRoot)
  ? collectPages(docsRoot).filter((path) => path !== summaryPath)
  : [];
const rootMarkdown = authoredPages
  .filter((path) => dirname(path) === docsRoot)
  .map((path) => relative(docsRoot, path));
for (const file of rootMarkdown) {
  if (file !== "index.md" && file !== "index.mdx") {
    errors.push(`Only docs/index.md may be authored at the user-guide root; found docs/${file}.`);
  }
}

let navigation = null;
if (existsSync(navigationPath)) {
  try {
    navigation = normalizeDocumentationNavigation(
      JSON.parse(readFileSync(navigationPath, "utf8")),
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

if (navigation) {
  const expectedById = new Map(navigation.pages.map((page) => [page.doc, page]));
  const actualById = new Map(authoredPages.map((page) => [pageId(page), page]));

  for (const [id, expected] of expectedById) {
    const path = actualById.get(id);
    if (!path) {
      errors.push(`Navigation-derived user-guide page does not exist: docs/${id}.md`);
      continue;
    }
    validateUserPage(path, expected);
  }
  for (const [id, path] of actualById) {
    if (!expectedById.has(id)) {
      errors.push(
        `User-guide page is not represented by the application navigation: ${relative(applicationRoot, path)}`,
      );
    }
  }
}

for (const file of [summaryPath, ...authoredPages].filter(existsSync)) validateLocalLinks(file);

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`End-user documentation validation passed for ${authoredPages.length} page(s).\n`);

function collectPages(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectPages(target);
    return entry.isFile() && markdownExtensions.has(extname(entry.name).toLowerCase())
      ? [target]
      : [];
  });
}

function pageId(path) {
  return relative(docsRoot, path).replaceAll("\\", "/").replace(/\.mdx?$/u, "");
}

function validateUserPage(file, expected) {
  const source = readFileSync(file, "utf8");
  const parsed = parseFrontmatter(source, file);
  if (!parsed) return;
  const { attributes, body } = parsed;
  const path = relative(applicationRoot, file);

  if (attributes.title !== expected.label) {
    errors.push(`${path} title must match the application-navigation label ${JSON.stringify(expected.label)}.`);
  }
  if (!attributes.description || attributes.description.length < 24) {
    errors.push(`${path} description must state a concrete user outcome.`);
  }
  if (attributes.audience !== "end-user") {
    errors.push(`${path} must declare audience: end-user.`);
  }
  if (attributes.pageType !== expected.pageType) {
    errors.push(`${path} must declare pageType: ${expected.pageType}.`);
  }
  if (!new RegExp(`^# ${escapeRegExp(expected.label)}\\s*$`, "mu").test(body)) {
    errors.push(`${path} must use the exact application-navigation label as its H1.`);
  }

  const requiredHeadings = {
    home: ["Find a feature"],
    section: ["What you can do", "Choose a feature"],
    feature: [
      "Open this page",
      "What you can do",
      "Common tasks",
      "Understand what you see",
      "If something goes wrong",
    ],
    task: ["Before you start", "Steps", "Expected result", "If something goes wrong"],
  }[expected.pageType] ?? [];
  for (const heading of requiredHeadings) {
    if (!new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "mu").test(body)) {
      errors.push(`${path} is missing the required user-facing section: ${heading}.`);
    }
  }
  if (expected.pageType === "task" && !/^\s*1\.\s+\S/mu.test(body)) {
    errors.push(`${path} task steps must contain a numbered procedure.`);
  }
  if (/^```/mu.test(body)) {
    errors.push(`${path} contains a fenced code block; served application docs are not developer documentation.`);
  }
  if (
    /^#{1,6}\s+(?:architecture|implementation(?: details)?|developer(?: guide| notes)?|source code|api contracts?|schemas?|local development|build and test|deployment architecture|maintainer(?: guide| notes)?)\s*$/imu.test(
      body,
    )
  ) {
    errors.push(`${path} contains an engineering-only heading that does not belong in the user guide.`);
  }
  if (/@dev-mainsequence\/command-center-sdk/u.test(body)) {
    errors.push(`${path} references an SDK package entrypoint; explain only application behavior.`);
  }
  if (/https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\//iu.test(body)) {
    errors.push(`${path} links to a source repository; served application docs must remain user-facing.`);
  }
  for (const target of localTargets(body)) {
    const cleanTarget = target.split("#", 1)[0].split("?", 1)[0];
    if (
      /(?:^|\/)(?:src|contracts|tests?|scripts)\//iu.test(cleanTarget) ||
      /(?:package\.json|\.[cm]?[jt]sx?)$/iu.test(cleanTarget)
    ) {
      errors.push(`${path} links to implementation material: ${target}`);
    }
  }
}

function parseFrontmatter(source, file) {
  const path = relative(applicationRoot, file);
  if (!source.startsWith("---\n")) {
    errors.push(`${path} must begin with YAML frontmatter.`);
    return null;
  }
  const closing = source.indexOf("\n---\n", 4);
  if (closing === -1) {
    errors.push(`${path} has unterminated YAML frontmatter.`);
    return null;
  }
  const attributes = {};
  for (const line of source.slice(4, closing).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    attributes[key] = rawValue.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }
  return { attributes, body: source.slice(closing + 5) };
}

function validateLocalLinks(file) {
  const markdown = stripFencedCode(readFileSync(file, "utf8"));
  for (const rawTarget of localTargets(markdown)) {
    const target = resolveLocalTarget(file, rawTarget);
    if (target && !existsSync(target)) {
      errors.push(`Broken local link in ${relative(applicationRoot, file)}: ${rawTarget}`);
    }
  }
}

function stripFencedCode(markdown) {
  return markdown.replace(/^```[\s\S]*?^```\s*$/gmu, "");
}

function localTargets(markdown) {
  const targets = [
    ...Array.from(markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu), (match) => match[1]),
    ...Array.from(markdown.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gmu), (match) => match[1]),
    ...Array.from(markdown.matchAll(/(?:href|src)=["']([^"']+)["']/giu), (match) => match[1]),
  ];
  return targets.map((target) => target.trim().replace(/^<|>$/g, ""));
}

function resolveLocalTarget(sourceFile, rawTarget) {
  if (!rawTarget || rawTarget.startsWith("#") || /^[a-z][a-z\d+.-]*:/iu.test(rawTarget)) return null;
  if (rawTarget.startsWith("/") && !rawTarget.startsWith("/docs/")) return null;
  const withoutTitle = rawTarget.replace(/\s+["'][^"']*["']\s*$/u, "");
  const withoutFragment = withoutTitle.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return null;
  try {
    const decoded = decodeURIComponent(withoutFragment);
    const target = decoded.startsWith("/docs/")
      ? resolve(docsRoot, decoded.slice("/docs/".length))
      : resolve(dirname(sourceFile), decoded);
    return resolveTarget(target);
  } catch {
    errors.push(`Invalid encoded local link in ${relative(applicationRoot, sourceFile)}: ${rawTarget}`);
    return null;
  }
}

function resolveTarget(target) {
  return [
    target,
    `${target}.md`,
    `${target}.mdx`,
    resolve(target, "index.md"),
    resolve(target, "index.mdx"),
  ].find(existsSync) ?? target;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
