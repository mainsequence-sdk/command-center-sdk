import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

import { buildThemeStyleText, mainSequenceTheme } from "../../dist/theme/index.js";

// The other browser specs load server-rendered markup. Tab focus, the More menu, and strip
// measurement need React running in the page, so this spec bundles a live fixture.
const entry = fileURLToPath(new URL("./fixtures/detail-tabs-app.ts", import.meta.url));
const componentStylesPath = new URL("../../styles.css", import.meta.url);
const themeStylesPath = new URL("../../theme/styles.css", import.meta.url);

let bundle = "";
let styles = "";

test.beforeAll(async () => {
  const output = await build({
    build: {
      emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "DetailTabsFixture" },
      minify: false,
      write: false,
    },
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "silent",
  });
  const chunks = (Array.isArray(output) ? output : [output])
    .flatMap((result) => ("output" in result ? result.output : []))
    .filter((item) => item.type === "chunk");
  bundle = chunks.map((chunk) => ("code" in chunk ? chunk.code : "")).join("\n");
  const [componentStyles, themeStyles] = await Promise.all([
    readFile(componentStylesPath, "utf8"),
    readFile(themeStylesPath, "utf8"),
  ]);
  styles = `${themeStyles}\n${buildThemeStyleText({ theme: mainSequenceTheme })}\n${componentStyles}`;
});

async function openDetail(
  page: Page,
  { active = "overview", overflow = "auto", spacer = false }: { active?: string; overflow?: string; spacer?: boolean } = {},
) {
  await page.setContent(`<!doctype html>
    <html data-theme="${mainSequenceTheme.id}">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${styles} html, body { margin: 0; } main { padding: 1rem; }</style>
      </head>
      <body>
        <main>
          ${spacer ? '<div data-spacer style="height: 2000px"></div>' : ""}
          <div id="root" data-active="${active}" data-overflow="${overflow}"></div>
        </main>
      </body>
    </html>`);
  await page.addScriptTag({ content: bundle });
  const tablist = page.getByRole("tablist", { name: "Agent sections" });
  await expect(tablist).toBeAttached();
  return tablist;
}

const body = (page: Page) => page.locator("[data-body]");

test.describe("detail tabs with a fine pointer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("arrow keys move focus, Enter and Space select, and a disabled tab never selects", async ({ page }) => {
    const tablist = await openDetail(page);
    await expect(tablist).toHaveAttribute("data-overflow", "menu");
    await expect(tablist.getByRole("tab")).toHaveCount(7);
    await expect(page.getByRole("button", { name: /^More/ })).toHaveCount(0);

    await page.keyboard.press("Tab");
    await expect(tablist.getByRole("tab", { name: "Overview" })).toBeFocused();
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as HTMLElement);
      return { offset: style.outlineOffset, style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(ring).toEqual({ offset: "-4px", style: "solid", width: "2px" });

    await page.keyboard.press("ArrowRight");
    await expect(tablist.getByRole("tab", { name: "Logs" })).toBeFocused();
    await expect(body(page)).toHaveAttribute("data-body", "overview");
    await page.keyboard.press("Enter");
    await expect(tablist.getByRole("tab", { name: "Logs" })).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(" ");
    await expect(tablist.getByRole("tab", { name: "Usage" })).toHaveAttribute("aria-selected", "true");
    await expect(body(page)).toHaveAttribute("data-body", "usage");

    await page.keyboard.press("ArrowRight");
    await expect(tablist.getByRole("tab", { name: "Agent card" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(body(page)).toHaveAttribute("data-body", "usage");

    // One Tab stop per strip: the next Tab leaves the tabs for the panel.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tabpanel")).toBeFocused();
    await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Usage");
  });

  for (const width of [700, 520]) {
    const presentation = width < 640 ? "sheet" : "popover";
    test(`moves tabs that do not fit into More (${presentation}) and focuses the tab picked from it`, async ({ page }) => {
      await page.setViewportSize({ height: 800, width });
      const tablist = await openDetail(page);
      await expect(tablist).toHaveAttribute("data-overflow", "menu");
      const more = page.getByRole("button", { name: /^More agent sections, \d+ hidden$/ });
      await expect(more).toBeVisible();
      expect(await tablist.getByRole("tab").count()).toBeLessThan(7);

      await more.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menu")).toBeVisible();
      // A browser focuses only a visible element; the picker focuses its first enabled item.
      await expect(page.getByRole("menuitem", { disabled: false }).first()).toBeFocused();
      await page.keyboard.press("End");
      await expect(page.getByRole("menuitem", { name: "Releases" })).toBeFocused();
      await page.keyboard.press("Enter");

      const releases = tablist.getByRole("tab", { name: "Releases" });
      await expect(releases).toHaveAttribute("aria-selected", "true");
      await expect(releases).toBeFocused();
      await expect(body(page)).toHaveAttribute("data-body", "releases");
      await expect(page.getByRole("tablist", { name: "Releases sections" })).toBeVisible();
      await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Releases Current");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
        .toBe(true);
    });
  }

  test("scrolls only the strip, never the page, to show the selected tab", async ({ page }) => {
    await page.setViewportSize({ height: 800, width: 700 });
    const tablist = await openDetail(page, { active: "releases", overflow: "scroll", spacer: true });
    await expect(tablist).toHaveAttribute("data-overflow", "scroll");

    await expect.poll(() => tablist.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe("detail tabs on a coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { height: 812, width: 375 } });

  test("scroll instead of a More menu, meet the touch floor, and stack the accessory", async ({ page }) => {
    const tablist = await openDetail(page);
    await expect(tablist).toHaveAttribute("data-overflow", "scroll");
    await expect(tablist.getByRole("tab")).toHaveCount(7);
    await expect(page.getByRole("button", { name: /^More/ })).toHaveCount(0);

    const metrics = await page.evaluate(() => {
      const strip = document.querySelector('[role="tablist"]')!.getBoundingClientRect();
      const accessory = document.querySelector("[data-accessory]")!.getBoundingClientRect();
      return {
        accessoryBelowStrip: accessory.top >= strip.bottom - 1,
        coarse: matchMedia("(pointer: coarse)").matches,
        documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        tabHeights: [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.getBoundingClientRect().height),
      };
    });
    expect(metrics.coarse).toBe(true);
    expect(metrics.documentFits).toBe(true);
    expect(metrics.accessoryBelowStrip).toBe(true);
    for (const height of metrics.tabHeights) expect(height).toBeGreaterThanOrEqual(44);
  });
});
