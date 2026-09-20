import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { commandCenterBreakpoints } from "./breakpoints.js";

const componentCss = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../../theme/styles.css", import.meta.url), "utf8");

/** Return the selector text of every rule together with the at-rule preludes enclosing it. */
function selectorsWithContext(css: string) {
  const source = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const results: Array<{ context: string[]; selector: string }> = [];
  const stack: string[] = [];
  let buffer = "";
  for (const character of source) {
    if (character === "{") {
      const prelude = buffer.trim();
      buffer = "";
      if (prelude.startsWith("@")) {
        stack.push(prelude);
      } else {
        results.push({ context: [...stack], selector: prelude });
        stack.push(prelude);
      }
    } else if (character === "}") {
      stack.pop();
      buffer = "";
    } else {
      buffer += character;
    }
  }
  return results;
}

describe("SDK stylesheets device axis", () => {
  it.each([
    ["styles.css", componentCss],
    ["theme/styles.css", themeCss],
  ])("guards every hover rule in %s with a hover-capable media query", (_name, css) => {
    const unguarded = selectorsWithContext(css)
      .filter(({ selector }) => selector.includes(":hover"))
      .filter(({ context }) => !context.some((prelude) => /\(hover:\s*hover\)/u.test(prelude)));
    expect(unguarded.map(({ selector }) => selector)).toEqual([]);
  });

  it("uses only the published breakpoint scale in max-width media queries", () => {
    const boundaries = new Set(
      Object.values(commandCenterBreakpoints).map((value) => `${value - 1}px`),
    );
    const widths = [...componentCss.matchAll(/@media \(max-width:\s*([^)]+)\)/gu)].map(
      (match) => match[1]!.trim(),
    );
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.filter((width) => !boundaries.has(width))).toEqual([]);
  });

  it("publishes the device-axis variables and touch overrides", () => {
    for (const variable of [
      "--application-control-min-size",
      "--application-safe-area-top",
      "--application-safe-area-right",
      "--application-safe-area-bottom",
      "--application-safe-area-left",
      "--application-navigation-rail-width",
      "--application-navigation-drawer-width",
    ]) {
      expect(themeCss).toContain(`${variable}:`);
    }
    expect(themeCss).toMatch(/@media \(pointer: coarse\)[\s\S]*--application-control-min-size: 2\.75rem/u);
    expect(componentCss).toMatch(/@media \(pointer: coarse\)[\s\S]*font-size: max\(16px, var\(--font-size-body\)\)/u);
  });

  it("pairs every dynamic viewport height with a static fallback", () => {
    const vhCount = (componentCss.match(/100vh/gu) ?? []).length;
    const dvhCount = (componentCss.match(/100dvh/gu) ?? []).length;
    expect(dvhCount).toBeGreaterThanOrEqual(vhCount);
  });
});
