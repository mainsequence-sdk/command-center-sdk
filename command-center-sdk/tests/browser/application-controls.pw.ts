import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Badge, Button, Field, Input, Textarea } from "../../dist/controls/index.js";
import {
  buildThemeStyleText,
  mainSequenceTheme,
  quartzLightTheme,
} from "../../dist/theme/index.js";

const componentStylesPath = new URL("../../styles.css", import.meta.url);
const themeStylesPath = new URL("../../theme/styles.css", import.meta.url);

function fixture() {
  return renderToStaticMarkup(
    createElement(
      "main",
      { style: { padding: "1rem" } },
      createElement(
        "div",
        { style: { display: "flex", flexWrap: "wrap", gap: "0.5rem" } },
        createElement(Button, { variant: "primary" }, "Primary"),
        createElement(Button, null, "Outline"),
        createElement(Button, { variant: "secondary" }, "Secondary"),
        createElement(Button, { variant: "ghost" }, "Ghost"),
        createElement(Button, { variant: "danger" }, "Danger"),
        createElement(Button, { size: "small" }, "Small"),
        createElement(Button, { size: "large" }, "Large"),
        createElement(Button, { "aria-label": "Remove", iconOnly: true }, "×"),
        createElement(Button, { pending: true, variant: "primary" }, "Saving"),
        createElement(Badge, { variant: "success" }, "Deployed"),
      ),
      createElement(Field, {
        children: createElement(Input, { defaultValue: "", name: "name" }),
        controlId: "name",
        description: "Shown in the catalog.",
        error: "Enter a name.",
        label: "Display name",
        required: true,
      }),
      createElement(Field, {
        children: createElement(Textarea, { name: "notes", rows: 3 }),
        controlId: "notes",
        label: "Notes",
      }),
    ),
  );
}

async function documentFor(theme: typeof mainSequenceTheme) {
  const [componentStyles, themeStyles] = await Promise.all([
    readFile(componentStylesPath, "utf8"),
    readFile(themeStylesPath, "utf8"),
  ]);
  return `<!doctype html>
    <html data-theme="${theme.id}">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          ${themeStyles}
          ${buildThemeStyleText({ theme })}
          ${componentStyles}
          html, body { margin: 0; min-height: 100%; }
        </style>
      </head>
      <body>${fixture()}</body>
    </html>`;
}

function measure() {
  const px = (value: string) => Number.parseFloat(value);
  return {
    buttons: [...document.querySelectorAll<HTMLElement>("[data-cc-button]")].map((element) => ({
      height: element.getBoundingClientRect().height,
      iconOnly: element.classList.contains("cc-button--icon-only"),
      pending: element.hasAttribute("data-pending"),
      size: element.dataset.size,
      width: element.getBoundingClientRect().width,
    })),
    coarse: matchMedia("(pointer: coarse)").matches,
    documentWidth: document.documentElement.scrollWidth,
    inputs: [...document.querySelectorAll<HTMLElement>("[data-cc-input], [data-cc-textarea]")].map(
      (element) => ({
        describedBy: element.getAttribute("aria-describedby"),
        fontSize: px(getComputedStyle(element).fontSize),
        height: element.getBoundingClientRect().height,
        id: element.id,
        invalid: element.getAttribute("aria-invalid"),
      }),
    ),
    labelTargets: [...document.querySelectorAll<HTMLLabelElement>("[data-cc-label]")].map(
      (element) => element.htmlFor,
    ),
    viewportWidth: document.documentElement.clientWidth,
  };
}

test.describe("public controls on a coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

  test("meet the touch floor, keep inputs at 16px, and stay inside the viewport", async ({ page }) => {
    for (const theme of [mainSequenceTheme, quartzLightTheme]) {
      await page.setContent(await documentFor(theme));
      const metrics = await page.evaluate(measure);

      expect(metrics.coarse).toBe(true);
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.buttons).toHaveLength(9);
      for (const button of metrics.buttons) {
        if (button.size === "small") expect(button.height).toBeGreaterThanOrEqual(36);
        else expect(button.height).toBeGreaterThanOrEqual(44);
        if (button.iconOnly) expect(button.width).toBeGreaterThanOrEqual(44);
      }
      expect(metrics.inputs).toHaveLength(2);
      for (const input of metrics.inputs) {
        expect(input.fontSize).toBeGreaterThanOrEqual(16);
        expect(input.height).toBeGreaterThanOrEqual(44);
      }
      expect(metrics.inputs[0]).toMatchObject({
        describedBy: "name-error name-description",
        id: "name",
        invalid: "true",
      });
      expect(metrics.labelTargets).toEqual(["name", "notes"]);
      await expect(page.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true");
      await expect(page.getByText("Deployed", { exact: true })).toBeVisible();
    }
  });
});

test.describe("public controls on a fine pointer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keep desktop control sizes and a visible keyboard focus ring", async ({ page }) => {
    for (const theme of [mainSequenceTheme, quartzLightTheme]) {
      await page.setContent(await documentFor(theme));
      const metrics = await page.evaluate(measure);

      expect(metrics.coarse).toBe(false);
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      for (const button of metrics.buttons.filter((item) => item.size === "medium")) {
        expect(button.height).toBeGreaterThanOrEqual(36);
        expect(button.height).toBeLessThan(44);
      }
      for (const input of metrics.inputs) expect(input.height).toBeGreaterThanOrEqual(36);

      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        const style = getComputedStyle(element);
        return {
          control: element.classList.contains("cc-control"),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          text: element.textContent,
        };
      });
      expect(focus).toMatchObject({
        control: true,
        outlineStyle: "solid",
        outlineWidth: "2px",
        text: "Primary",
      });
    }
  });
});
