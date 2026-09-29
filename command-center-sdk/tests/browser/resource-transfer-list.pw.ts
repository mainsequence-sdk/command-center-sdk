import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";

import { buildThemeStyleText, mainSequenceTheme } from "../../dist/theme/index.js";

// Keyboard focus and moves need React running in the page, so this spec bundles a live fixture.
const entry = fileURLToPath(new URL("./fixtures/transfer-list-app.ts", import.meta.url));
const componentStylesPath = new URL("../../styles.css", import.meta.url);
const themeStylesPath = new URL("../../theme/styles.css", import.meta.url);

let bundle = "";
let styles = "";

test.beforeAll(async () => {
  const output = await build({
    build: {
      emptyOutDir: false,
      lib: { entry, formats: ["iife"], name: "TransferListFixture" },
      minify: false,
      write: false,
    },
    configFile: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    logLevel: "silent",
  });
  bundle = (Array.isArray(output) ? output : [output])
    .flatMap((result) => ("output" in result ? result.output : []))
    .filter((item) => item.type === "chunk")
    .map((chunk) => ("code" in chunk ? chunk.code : ""))
    .join("\n");
  const [componentStyles, themeStyles] = await Promise.all([
    readFile(componentStylesPath, "utf8"),
    readFile(themeStylesPath, "utf8"),
  ]);
  styles = `${themeStyles}\n${buildThemeStyleText({ theme: mainSequenceTheme })}\n${componentStyles}`;
});

async function openEditor(page: Page) {
  await page.setContent(`<!doctype html>
    <html data-theme="${mainSequenceTheme.id}">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${styles} html, body { margin: 0; } main { padding: 1rem; }</style>
      </head>
      <body><main><div id="root"></div></main></body>
    </html>`);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByRole("listbox", { name: /^Available users/ })).toBeVisible();
}

const chosenUsers = (page: Page) => page.locator("output").getAttribute("data-users");

test.describe("transfer list with a fine pointer", () => {
  test.use({ viewport: { height: 900, width: 1280 } });

  test("marks with Space, moves with Enter, and keeps focus in the list", async ({ page }) => {
    await openEditor(page);
    const available = page.getByRole("listbox", { name: /^Available users/ });
    const selected = page.getByRole("listbox", { name: /^Selected users/ });

    await page.getByRole("searchbox", { name: "Search available users" }).focus();
    await page.keyboard.press("Tab");
    await expect(available.getByRole("option", { name: /Ada Lovelace/ })).toBeFocused();
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as HTMLElement);
      return { offset: style.outlineOffset, style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(ring).toEqual({ offset: "-2px", style: "solid", width: "2px" });

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(" ");
    await expect(available.getByRole("option", { name: /Grace Hopper/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Enter");

    await expect.poll(() => chosenUsers(page)).toBe("linus,grace,margaret");
    await expect(selected.getByRole("option")).toHaveCount(3);
    await expect(available.getByRole("option", { name: /Katherine Johnson/ })).toBeFocused();
    await expect(page.getByRole("status").first()).toHaveText("2 users added.");

    // One Tab stop per list: Tab leaves the list for the move buttons.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Add selected users" })).toBeFocused();
  });

  test("names every move button and moves every shown option", async ({ page }) => {
    await openEditor(page);
    await expect(page.locator(".cc-resource-transfer").first()).toHaveAttribute("data-cc-presentation", "columns");

    await page.getByRole("searchbox", { name: "Search available teams" }).fill("tra");
    await page.getByRole("button", { name: "Add all shown teams" }).click();
    await expect.poll(() => page.locator("output").getAttribute("data-teams")).toBe("trading");

    await page.getByRole("button", { name: "Add all shown users" }).click();
    await expect.poll(() => chosenUsers(page)).toBe("linus,ada,grace,margaret,katherine,alan");
    await page.getByRole("button", { name: "Remove all shown users" }).click();
    // The disabled user is a locked choice.
    await expect.poll(() => chosenUsers(page)).toBe("linus");
    // With nothing left to move, the button reports itself unavailable.
    await expect(page.getByRole("button", { name: "Remove all shown users" })).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("transfer list on a coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { height: 812, width: 375 } });

  test("stacks, meets the touch floor, and fits the viewport", async ({ page }) => {
    await openEditor(page);
    await expect(page.locator(".cc-resource-transfer").first()).toHaveAttribute("data-cc-presentation", "stacked");

    const metrics = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll(".cc-resource-transfer__actions button")].map((node) => node.getBoundingClientRect().height),
      coarse: matchMedia("(pointer: coarse)").matches,
      fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      options: [...document.querySelectorAll('[role="option"]')].map((node) => node.getBoundingClientRect().height),
    }));
    expect(metrics.coarse).toBe(true);
    expect(metrics.fits).toBe(true);
    for (const height of [...metrics.options, ...metrics.buttons]) expect(height).toBeGreaterThanOrEqual(44);

    await page.getByRole("option", { name: /Alan Turing/ }).tap();
    await page.getByRole("button", { name: "Add selected users" }).tap();
    await expect.poll(() => chosenUsers(page)).toBe("linus,alan");
  });
});
