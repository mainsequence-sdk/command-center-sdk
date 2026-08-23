import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ApplicationCard,
  ApplicationCardGrid,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "../../dist/layout/index.js";
import {
  verifyCommandCenterPageLayout,
} from "../../dist/layout/testing/index.js";
import {
  buildThemeStyleText,
  mainSequenceTheme,
  quartzLightTheme,
} from "../../dist/theme/index.js";

const componentStylesPath = new URL("../../styles.css", import.meta.url);
const themeStylesPath = new URL("../../theme/styles.css", import.meta.url);

function card(title: string, body: string) {
  return createElement(
    ApplicationCard,
    { header: createElement("h2", null, title) },
    createElement("p", null, body),
    createElement("button", { type: "button" }, `Inspect ${title}`),
  );
}

function renderFixture() {
  const positions = createElement(
    "div",
    { style: { overflowX: "auto" } },
    createElement(
      "table",
      { style: { borderCollapse: "collapse", width: "52rem" } },
      createElement(
        "tbody",
        null,
        createElement(
          "tr",
          null,
          createElement("td", null, "ALPHA"),
          createElement("td", null, "Long-running position data remains intentionally scrollable."),
        ),
      ),
    ),
  );

  return renderToStaticMarkup(
    createElement(
      ApplicationPage,
      { maxWidth: "wide" },
      createElement(ApplicationPageHeader, {
        actions: createElement(
          "div",
          null,
          createElement("button", { type: "button" }, "Refresh data"),
          createElement("button", { type: "button" }, "Rebalance portfolio"),
        ),
        description:
          "Monitor exposures, inspect current positions, and rebalance the active portfolio without losing responsive page rhythm.",
        eyebrow: "Portfolio operations",
        title:
          "Portfolio overview with a deliberately long title that must wrap without colliding with actions",
      }),
      createElement(
        ApplicationPageStack,
        null,
        createElement("div", { role: "status" }, "Backend data is current."),
        createElement(
          ApplicationCardGrid,
          { minimumCardWidth: "18rem" },
          card("Exposure", "Current gross and net exposure."),
          card("Risk", "Current volatility and drawdown."),
          card("Liquidity", "Estimated days to liquidate."),
        ),
        createElement(
          ApplicationCard,
          {
            contentPadding: "none",
            header: createElement("h2", null, "Positions"),
          },
          positions,
        ),
        createElement(
          ApplicationCard,
          { surface: "nested" },
          createElement("div", { role: "alert" }, "One optional data source is unavailable."),
          createElement("button", { disabled: true, type: "button" }, "Loading replacement"),
        ),
      ),
    ),
  );
}

test.describe("public application layout", () => {
  test("conforms across the baseline viewport matrix in dark and light themes", async ({ page }) => {
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(componentStylesPath, "utf8"),
      readFile(themeStylesPath, "utf8"),
    ]);
    const markup = renderFixture();

    for (const theme of [mainSequenceTheme, quartzLightTheme]) {
      await page.setContent(`<!doctype html>
        <html data-theme="${theme.id}">
          <head>
            <style>${themeStyles}\n${buildThemeStyleText({ theme })}\n${componentStyles}</style>
          </head>
          <body>${markup}</body>
        </html>`);
      const report = await verifyCommandCenterPageLayout(page);
      expect(report.violations, JSON.stringify(report.violations, null, 2)).toEqual([]);
      expect(report.reports).toHaveLength(3);
    }
  });

  test("reports missing parent rhythm and standard card inset", async ({ page }) => {
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(componentStylesPath, "utf8"),
      readFile(themeStylesPath, "utf8"),
    ]);
    await page.setContent(`<!doctype html>
      <html>
        <head>
          <style>
            ${themeStyles}
            ${componentStyles}
            .cc-application-page,
            .cc-application-page-stack { gap: 0 !important; }
            .cc-application-card__content--standard { padding: 0 !important; }
          </style>
        </head>
        <body>${renderFixture()}</body>
      </html>`);

    const report = await verifyCommandCenterPageLayout(page);
    const codes = new Set(report.violations.map((violation) => violation.code));
    expect(report.ok).toBe(false);
    expect(codes.has("stack-gap")).toBe(true);
    expect(codes.has("card-inset")).toBe(true);
  });

  test("reports responsive grid, header, overflow, and interactive regressions", async ({ page }) => {
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(componentStylesPath, "utf8"),
      readFile(themeStylesPath, "utf8"),
    ]);
    await page.setContent(`<!doctype html>
      <html>
        <head>
          <style>
            ${themeStyles}
            ${componentStyles}
            [role="status"] { width: 200vw; }
            .cc-application-page-header { position: relative; }
            .cc-application-page-header__actions {
              left: 0;
              position: absolute;
              top: 0;
            }
            .cc-application-card-grid {
              grid-template-columns: repeat(2, 18rem) !important;
            }
            .cc-application-card-grid > :nth-child(2) {
              transform: translateX(calc(-100% - var(--application-card-grid-gap)));
            }
            .cc-application-card-grid > :nth-child(3) {
              min-width: 60rem !important;
            }
            button[disabled] {
              border: 0;
              height: 0;
              overflow: hidden;
              padding: 0;
              width: 0;
            }
          </style>
        </head>
        <body>${renderFixture()}</body>
      </html>`);

    const report = await verifyCommandCenterPageLayout(page);
    const codes = new Set(report.violations.map((violation) => violation.code));
    expect(report.ok).toBe(false);
    expect(codes.has("horizontal-overflow")).toBe(true);
    expect(codes.has("grid-overflow")).toBe(true);
    expect(codes.has("grid-overlap")).toBe(true);
    expect(codes.has("header-overlap")).toBe(true);
    expect(codes.has("interactive-size")).toBe(true);
  });

  test("reports a card grid that refuses to collapse at the narrow viewport", async ({ page }) => {
    const [componentStyles, themeStyles] = await Promise.all([
      readFile(componentStylesPath, "utf8"),
      readFile(themeStylesPath, "utf8"),
    ]);
    await page.setContent(`<!doctype html>
      <html>
        <head>
          <style>
            ${themeStyles}
            ${componentStyles}
            .cc-application-card-grid {
              grid-template-columns: repeat(2, 18rem) !important;
            }
          </style>
        </head>
        <body>${renderFixture()}</body>
      </html>`);

    const report = await verifyCommandCenterPageLayout(page, {
      viewports: [{ width: 375, height: 812 }],
    });
    const codes = new Set(report.violations.map((violation) => violation.code));
    expect(report.ok).toBe(false);
    expect(codes.has("grid-collapse")).toBe(true);
  });
});
