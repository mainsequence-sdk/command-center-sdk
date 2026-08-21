import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultThemeCssPath = join(packageRoot, "theme", "styles.css");
const ignoredDirectories = new Set([".git", "build", "coverage", "dist", "node_modules"]);

const colorLiteralPattern =
  /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(|\b(?:black|blue|gray|green|grey|orange|pink|purple|red|white|yellow)\b/iu;
const themeLikeCustomPropertyPattern =
  /(?:background|border|card|color|danger|font|foreground|input|muted|primary|radius|ring|shadow|success|surface|text|warning)/iu;
const allowedThemeIndependentValuePattern =
  /^(?:0(?:\s+0){0,3}|50%|currentcolor|inherit|initial|none|revert(?:-layer)?|transparent|unset)$/iu;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//gu, (comment) => comment.replace(/[^\n]/gu, " "));
}

function parseDeclarations(css) {
  const source = stripComments(css);
  const declarations = [];
  const pattern = /(?:^|[;{])\s*([a-z_-][\w-]*)\s*:\s*([^;{}]+)(?=\s*[;}])/gimu;

  for (const match of source.matchAll(pattern)) {
    const property = match[1].toLowerCase();
    const value = match[2].trim();
    const propertyOffset = match[0].indexOf(match[1]);
    const index = (match.index ?? 0) + Math.max(propertyOffset, 0);
    const line = source.slice(0, index).split("\n").length;
    declarations.push({ line, property, value });
  }

  return declarations;
}

function variableReferences(value) {
  return [...value.matchAll(/var\(\s*(--[a-z0-9_-]+)/giu)].map((match) => match[1]);
}

function hasVariableFallback(value) {
  return /var\(\s*--[a-z0-9_-]+\s*,/iu.test(value);
}

function isThemeOwnedProperty(property) {
  return (
    /^(?:accent-color|background|background-color|background-image|box-shadow|caret-color|color|color-scheme|fill|font-family|font-size|font-weight|letter-spacing|line-height|outline|outline-color|stop-color|stroke|text-shadow|text-transform)$/u.test(
      property,
    ) ||
    /^border(?:-(?:block|block-end|block-start|bottom|inline|inline-end|inline-start|left|right|top))?$/u.test(
      property,
    ) ||
    /^border(?:-(?:block|block-end|block-start|bottom|inline|inline-end|inline-start|left|right|top))?-color$/u.test(
      property,
    ) ||
    /^border(?:-(?:bottom-left|bottom-right|end-end|end-start|start-end|start-start|top-left|top-right))?-radius$/u.test(
      property,
    )
  );
}

async function collectCssFiles(targetPath) {
  const target = resolve(targetPath);
  const targetState = await stat(target);
  if (targetState.isFile()) return extname(target) === ".css" ? [target] : [];
  if (!targetState.isDirectory()) return [];

  const files = [];
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = join(target, entry.name);
    if (entry.isDirectory()) files.push(...(await collectCssFiles(entryPath)));
    else if (entry.isFile() && extname(entry.name) === ".css") files.push(entryPath);
  }
  return files.sort();
}

function diagnostic(file, line, rule, message) {
  return { file, line, rule, message };
}

export async function auditThemeCss({
  projectDir = process.cwd(),
  targetPath = projectDir,
  themeCssPath = defaultThemeCssPath,
} = {}) {
  const resolvedProjectDir = resolve(projectDir);
  const sdkThemeCss = await readFile(resolve(themeCssPath), "utf8");
  const sdkVariables = new Set(
    parseDeclarations(sdkThemeCss)
      .filter(({ property }) => property.startsWith("--"))
      .map(({ property }) => property),
  );
  const files = await collectCssFiles(resolve(resolvedProjectDir, targetPath));
  const sources = await Promise.all(
    files.map(async (file) => ({ file, declarations: parseDeclarations(await readFile(file, "utf8")) })),
  );
  const consumerVariables = new Set(
    sources.flatMap(({ declarations }) =>
      declarations.filter(({ property }) => property.startsWith("--")).map(({ property }) => property),
    ),
  );
  const consumerVariableValues = new Map();
  for (const { declarations } of sources) {
    for (const { property, value } of declarations) {
      if (!property.startsWith("--")) continue;
      const values = consumerVariableValues.get(property) ?? [];
      values.push(value);
      consumerVariableValues.set(property, values);
    }
  }

  function resolvesToSdkVariable(variable, visiting = new Set()) {
    if (sdkVariables.has(variable)) return true;
    if (visiting.has(variable)) return false;
    const values = consumerVariableValues.get(variable);
    if (!values?.length) return false;
    const nextVisiting = new Set(visiting).add(variable);
    return values.every((value) => {
      const references = variableReferences(value);
      return (
        references.length > 0 &&
        references.every((reference) => resolvesToSdkVariable(reference, nextVisiting))
      );
    });
  }
  const diagnostics = [];

  for (const { file, declarations } of sources) {
    const displayFile = relative(resolvedProjectDir, file) || file;
    for (const { line, property, value } of declarations) {
      const references = variableReferences(value);
      for (const reference of references) {
        if (!sdkVariables.has(reference) && !consumerVariables.has(reference)) {
          diagnostics.push(
            diagnostic(
              displayFile,
              line,
              "unknown-theme-variable",
              `${reference} is neither published by the SDK theme nor declared by this consumer.`,
            ),
          );
        }
      }

      const themeOwned = isThemeOwnedProperty(property);
      const themeLikeCustomProperty =
        property.startsWith("--") && themeLikeCustomPropertyPattern.test(property);

      if (
        (themeOwned || themeLikeCustomProperty) &&
        references.some(
          (reference) => consumerVariables.has(reference) && !resolvesToSdkVariable(reference),
        )
      ) {
        diagnostics.push(
          diagnostic(
            displayFile,
            line,
            "non-sdk-theme-alias",
            "A theme-owned value references a consumer variable that does not resolve entirely to published SDK variables.",
          ),
        );
      }

      if (themeLikeCustomProperty && !resolvesToSdkVariable(property)) {
        diagnostics.push(
          diagnostic(
            displayFile,
            line,
            "non-sdk-theme-alias",
            `${property} must resolve entirely to published SDK variables.`,
          ),
        );
      }

      if ((themeOwned || property.startsWith("--")) && hasVariableFallback(value)) {
        diagnostics.push(
          diagnostic(
            displayFile,
            line,
            "theme-fallback",
            "Theme-owned values must not provide fallbacks; fallbacks hide missing or misspelled SDK tokens.",
          ),
        );
      }

      if ((themeOwned || property.startsWith("--")) && colorLiteralPattern.test(value)) {
        diagnostics.push(
          diagnostic(
            displayFile,
            line,
            "hardcoded-theme-color",
            "Use an SDK theme variable or an expression derived from SDK theme variables instead of a color literal.",
          ),
        );
      }

      if (
        (themeOwned || themeLikeCustomProperty) &&
        references.length === 0 &&
        !allowedThemeIndependentValuePattern.test(value)
      ) {
        diagnostics.push(
          diagnostic(
            displayFile,
            line,
            "hardcoded-theme-value",
            `${property} must consume an SDK theme variable or a consumer alias derived from SDK theme variables.`,
          ),
        );
      }
    }
  }

  diagnostics.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule),
  );

  return {
    ok: diagnostics.length === 0,
    projectDir: resolvedProjectDir,
    targetPath: resolve(resolvedProjectDir, targetPath),
    themeCssPath: resolve(themeCssPath),
    files: files.map((file) => relative(resolvedProjectDir, file) || file),
    diagnostics,
  };
}
