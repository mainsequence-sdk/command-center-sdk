import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import process from "node:process";

const applicationRoot = process.cwd();
const docsRoot = resolve(applicationRoot, "docs");
const navigationPath = resolve(applicationRoot, "documentation/navigation.json");
const errors = [];

for (const directory of ["surfaces", "technical"]) {
  if (!existsSync(resolve(docsRoot, directory))) {
    errors.push(`Missing documentation section: docs/${directory}/`);
  }
}
if (!existsSync(navigationPath)) errors.push("Missing documentation/navigation.json.");
if (!existsSync(resolve(docsRoot, "SUMMARY.md"))) errors.push("Missing generated docs/SUMMARY.md.");

const rootMarkdown = existsSync(docsRoot)
  ? readdirSync(docsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && new Set([".md", ".mdx"]).has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
  : [];
for (const file of rootMarkdown) {
  if (file !== "SUMMARY.md") errors.push(`Classify docs/${file} under surfaces/ or technical/.`);
}

const pages = ["surfaces", "technical"].flatMap((directory) =>
  collectPages(resolve(docsRoot, directory)),
);
const filesToCheck = [resolve(applicationRoot, "README.md"), resolve(docsRoot, "SUMMARY.md"), ...pages]
  .filter(existsSync);
for (const file of filesToCheck) validateLocalLinks(file);

if (existsSync(navigationPath)) {
  const navigation = JSON.parse(readFileSync(navigationPath, "utf8"));
  const declaredIds = new Set();
  collectNavigationIds(navigation.sections, declaredIds);
  for (const id of declaredIds) {
    const target = resolveDocId(id);
    if (!target) errors.push(`Navigation document does not exist: ${id}`);
  }
  for (const page of pages) {
    const id = pageId(page);
    if (!declaredIds.has(id)) {
      errors.push(`Documentation page is missing from documentation/navigation.json: ${relative(applicationRoot, page)}`);
    }
  }
}

if (errors.length) {
  process.stderr.write(`${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Documentation validation passed for ${pages.length} authored page(s).\n`);

function collectPages(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectPages(target);
    return entry.isFile() && new Set([".md", ".mdx"]).has(extname(entry.name).toLowerCase())
      ? [target]
      : [];
  });
}

function collectNavigationIds(items, result) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (typeof item?.doc === "string") result.add(item.doc);
    collectNavigationIds(item?.items, result);
  }
}

function resolveDocId(id) {
  const base = resolve(docsRoot, id);
  return [base, `${base}.md`, `${base}.mdx`, resolve(base, "index.md"), resolve(base, "index.mdx")]
    .find(existsSync) ?? null;
}

function pageId(path) {
  const value = relative(docsRoot, path).replaceAll("\\", "/").replace(/\.mdx?$/u, "");
  return value;
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
