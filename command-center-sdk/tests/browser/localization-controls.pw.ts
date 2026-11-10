import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { buildThemeStyleText, mainSequenceTheme } from "../../dist/theme/index.js";

let bundle = "";
let styles = "";
test.beforeAll(async () => {
  const output = await build({ configFile: false, logLevel: "silent", define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: { write: false, emptyOutDir: false, minify: false, lib: { entry: fileURLToPath(new URL("./fixtures/localization-app.ts", import.meta.url)), formats: ["iife"], name: "LocalizationFixture" } },
  });
  bundle = (Array.isArray(output) ? output : [output]).flatMap(result => "output" in result ? result.output : []).filter(item => item.type === "chunk").map(chunk => "code" in chunk ? chunk.code : "").join("\n");
  styles = buildThemeStyleText({ theme: mainSequenceTheme }) + await readFile(new URL("../../styles.css", import.meta.url), "utf8");
});

test("localizes resource selection, long pagination labels and an open confirmation in place", async ({ page }) => {
  await page.setContent(`<!doctype html><html><head><style>${styles} body { margin: 0; padding: 16px; } #root { max-width: 1100px; }</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: bundle });
  await expect(page.getByRole("button", { name: "Weiter zur nächsten Ergebnisseite" })).toBeVisible();
  const pagination = page.getByRole("navigation", { name: "records pagination" });
  expect(await pagination.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByLabel("Unsaved draft").fill("Unsaved multilingual form");
  await page.getByLabel("Select one", { exact: true }).check();
  await expect(page.getByText("1 Datensatz auf dieser Seite ausgewählt.", { exact: true })).toBeVisible();
  await page.getByLabel("Select two", { exact: true }).check();
  await expect(page.getByText("2 Datensätze auf dieser Seite ausgewählt.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Aktionen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  const dialog = page.getByRole("dialog", { name: "Review archive" });
  await expect(dialog.getByRole("button", { name: "Abbrechen" })).toBeVisible();
  const confirmationInput = dialog.getByRole("textbox");
  const originalInput = await confirmationInput.elementHandle();
  await dialog.getByLabel("Bestätigungswort").fill("ARC");
  // An application-owned update can arrive while focus is inside a modal.
  await page.getByRole("button", { name: "Change language" }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(confirmationInput).toHaveAttribute("aria-label", "Confirmation word");
  await expect(confirmationInput).toHaveValue("ARC");
  await expect(confirmationInput).toBeFocused();
  expect(await originalInput?.evaluate(element => element.isConnected)).toBe(true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Unsaved draft")).toHaveValue("Unsaved multilingual form");
  await expect(page.getByLabel("Select one", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Select two", { exact: true })).toBeChecked();
  await expect(page.getByText("2 selected on this page.", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-list-calls", "1");
});
