import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApplicationStatusScreen,
  type ApplicationStatusScreenState,
} from "../../dist/feedback/index.js";
import {
  buildThemeStyleText,
  mainSequenceTheme,
  quartzLightTheme,
} from "../../dist/theme/index.js";

const componentStylesPath = new URL("../../styles.css", import.meta.url);
const themeStylesPath = new URL("../../theme/styles.css", import.meta.url);

const stages = [
  {
    id: "core",
    label: "Markets and portfolio data with a long but useful stage label",
    description: "Attached the baseline schemas required by every application route.",
    status: "complete" as const,
    elapsedSeconds: 1.2,
  },
  {
    id: "pricing",
    label: "Pricing and curves",
    description: "Resolving and attaching registered pricing models.",
    status: "active" as const,
    statusLabel: "Attaching",
    elapsedSeconds: 42,
    details: [
      {
        id: "curve",
        label: "ExtremelyLongRegisteredCurveSchemaIdentifierThatMustWrapWithoutOverflow",
      },
      { id: "discount", label: "DiscountCurvesStorage" },
    ],
  },
  {
    id: "portfolio",
    label: "Portfolio analytics",
    description: "Waiting for the preceding runtime stage.",
    status: "pending" as const,
  },
];

function fixture(state: ApplicationStatusScreenState, variant: "viewport" | "contained" = "viewport") {
  return renderToStaticMarkup(
    createElement(ApplicationStatusScreen, {
      action: state === "error" ? { label: "Retry startup", onSelect: () => undefined } : undefined,
      as: variant === "viewport" ? "main" : "section",
      emptyStagesMessage: "Discovering runtime stages.",
      eyebrow: state === "error" ? "Runtime unavailable" : "Runtime startup",
      message: state === "error"
        ? "The runtime did not become ready before the application timeout."
        : "Attaching shared application capabilities.",
      notice: state === "retrying"
        ? "The backend is unavailable. The application will retry using its configured policy."
        : undefined,
      stages,
      state,
      title: state === "error" ? "Application could not start" : "Preparing application",
      titleAs: variant === "viewport" ? "h1" : "h2",
      variant,
    }),
  );
}

async function styles() {
  const [componentStyles, themeStyles] = await Promise.all([
    readFile(componentStylesPath, "utf8"),
    readFile(themeStylesPath, "utf8"),
  ]);
  return { componentStyles, themeStyles };
}

test.describe("public application feedback", () => {
  test("remains usable across the viewport matrix in dark and light themes", async ({ page }) => {
    const styleText = await styles();
    for (const theme of [mainSequenceTheme, quartzLightTheme]) {
      for (const viewport of [
        { width: 375, height: 812 },
        { width: 768, height: 900 },
        { width: 1280, height: 800 },
      ]) {
        await page.setViewportSize(viewport);
        await page.setContent(`<!doctype html>
          <html data-theme="${theme.id}">
            <head><style>
              ${styleText.themeStyles}
              ${buildThemeStyleText({ theme })}
              ${styleText.componentStyles}
              html, body { margin: 0; min-height: 100%; }
            </style></head>
            <body>${fixture("retrying")}</body>
          </html>`);

        const screen = page.locator("[data-cc-application-status-screen]");
        await expect(screen).toBeVisible();
        await expect(page.getByRole("heading", { name: "Preparing application" })).toBeVisible();
        await expect(page.getByRole("list", { name: "Application progress" })).toBeVisible();
        await expect(page.getByText("DiscountCurvesStorage", { exact: true })).toBeVisible();

        const geometry = await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>("[data-cc-application-status-screen]")!;
          const content = root.querySelector<HTMLElement>(".cc-application-status-screen__content")!;
          return {
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth,
            rootHeight: root.getBoundingClientRect().height,
            contentLeft: content.getBoundingClientRect().left,
            contentRight: content.getBoundingClientRect().right,
          };
        });
        expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
        expect(geometry.rootHeight).toBeGreaterThanOrEqual(viewport.height);
        expect(geometry.contentLeft).toBeGreaterThanOrEqual(0);
        expect(geometry.contentRight).toBeLessThanOrEqual(viewport.width);
      }
    }
  });

  test("renders a bounded contained error with an actionable control", async ({ page }) => {
    const styleText = await styles();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.setContent(`<!doctype html>
      <html><head><style>
        ${styleText.themeStyles}
        ${styleText.componentStyles}
        html, body { margin: 0; }
      </style></head><body>${fixture("error", "contained")}</body></html>`);

    await expect(page.getByRole("alert")).toContainText("Application could not start");
    const retry = page.getByRole("button", { name: "Retry startup" });
    await expect(retry).toBeVisible();
    const box = await retry.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(36);
    expect(await page.locator("[data-variant=contained]").getAttribute("aria-busy")).toBe("false");
  });

  test("disables indicator motion for reduced-motion users", async ({ page }) => {
    const styleText = await styles();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setContent(`<!doctype html>
      <html><head><style>${styleText.themeStyles}${styleText.componentStyles}</style></head>
      <body>${fixture("loading")}</body></html>`);

    const animationName = await page.locator(".cc-activity-indicator > svg").first().evaluate(
      (element) => getComputedStyle(element).animationName,
    );
    expect(animationName).toBe("none");
  });
});
