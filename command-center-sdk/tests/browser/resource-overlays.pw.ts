import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const componentStylesPath = new URL("../../styles.css", import.meta.url);
const themeStylesPath = new URL("../../theme/styles.css", import.meta.url);

/**
 * The picker popup and the confirmation dialog render through portals from client state, which
 * the static renderer cannot produce. These checks exercise the published sheet classes against
 * the real stylesheets at a touch phone viewport; behavior is covered by the jsdom tests.
 */
test.describe("resource overlay sheets on a touch phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test("picker sheet and dialog sheet span the viewport width and sit at the bottom", async ({ page }) => {
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(componentStylesPath, "utf8"),
      readFile(themeStylesPath, "utf8"),
    ]);
    await page.setContent(`<!doctype html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${themeStyles}${componentStyles}</style></head>
      <body>
        <div class="cc-resource-picker__scrim" data-cc-resource-picker-scrim=""></div>
        <div class="cc-resource-picker__popup cc-resource-picker__popup--sheet" data-cc-presentation="sheet" data-resource-picker-popup="single" role="dialog" aria-modal="true" aria-label="Region" style="position:fixed;left:0;right:0;bottom:0;top:auto;visibility:visible;max-height:804px">
          <label class="cc-resource-picker__search"><input type="search" aria-label="Search" value=""></label>
          <div class="cc-resource-picker__options" role="listbox">
            <button type="button" role="option" class="cc-resource-picker__option">Europe</button>
            <button type="button" role="option" class="cc-resource-picker__option">United States</button>
          </div>
        </div>
        <div class="cc-resource-dialog-backdrop cc-resource-dialog-backdrop--sheet" role="presentation" style="z-index:200">
          <section class="cc-resource-dialog cc-resource-dialog--danger cc-resource-dialog--sheet" data-cc-presentation="sheet" role="dialog" aria-modal="true" aria-label="Archive">
            <header class="cc-resource-dialog__header"><span class="cc-resource-dialog__tone-icon"></span><h2>Archive records</h2><button class="cc-resource-dialog__close" type="button" aria-label="Close dialog">x</button></header>
            <div class="cc-resource-dialog__body">
              <div class="cc-resource-dialog__actions">
                <button type="button">Cancel</button>
                <button type="button" class="cc-resource-button--danger cc-resource-dialog__confirm">Archive</button>
              </div>
            </div>
          </section>
        </div>
      </body></html>`);

    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const sheet = rect("[data-resource-picker-popup]");
      const option = rect("[role='option']");
      const input = document.querySelector<HTMLInputElement>("input[type='search']")!;
      const dialog = rect("[data-cc-presentation='sheet'][role='dialog'].cc-resource-dialog");
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>(".cc-resource-dialog__actions button"),
      ).map((button) => button.getBoundingClientRect());
      return {
        coarse: matchMedia("(pointer: coarse)").matches,
        dialogBottom: dialog.bottom,
        dialogWidth: dialog.width,
        buttonsStacked: buttons[0]!.top !== buttons[1]!.top,
        buttonWidths: buttons.map((button) => button.width),
        inputFontSize: Number.parseFloat(getComputedStyle(input).fontSize),
        optionHeight: option.height,
        sheetBottom: sheet.bottom,
        sheetLeft: sheet.left,
        sheetWidth: sheet.width,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(geometry.coarse).toBe(true);
    expect(geometry.viewportWidth).toBe(375);
    expect(geometry.sheetLeft).toBe(0);
    expect(geometry.sheetWidth).toBe(375);
    expect(Math.abs(geometry.sheetBottom - geometry.viewportHeight)).toBeLessThanOrEqual(1);
    expect(geometry.optionHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.inputFontSize).toBeGreaterThanOrEqual(16);
    expect(geometry.dialogWidth).toBe(375);
    expect(Math.abs(geometry.dialogBottom - geometry.viewportHeight)).toBeLessThanOrEqual(1);
    expect(geometry.buttonsStacked).toBe(true);
    expect(Math.min(...geometry.buttonWidths)).toBeGreaterThan(300);
  });
});
