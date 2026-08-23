import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_LAYOUT_VIEWPORTS,
  CommandCenterPageLayoutError,
  formatCommandCenterPageLayoutViolations,
  type CommandCenterPageLayoutReport,
  verifyCommandCenterPageLayout,
} from "./index.js";

describe("application layout verification reporting", () => {
  it("publishes the baseline narrow, compact, and desktop viewport matrix", () => {
    expect(COMMAND_CENTER_LAYOUT_VIEWPORTS).toEqual([
      { width: 375, height: 812 },
      { width: 768, height: 900 },
      { width: 1280, height: 800 },
    ]);
  });

  it("formats violations and preserves the complete report on assertion errors", () => {
    const viewport = { width: 375, height: 812 };
    const report: CommandCenterPageLayoutReport = {
      ok: false,
      reports: [],
      violations: [
        {
          code: "card-inset",
          element: "[data-cc-application-card]",
          message: "A standard card has no content inset.",
          viewport,
        },
      ],
    };

    expect(formatCommandCenterPageLayoutViolations(report)).toContain(
      "[375x812] card-inset",
    );
    const error = new CommandCenterPageLayoutError(report);
    expect(error.name).toBe("CommandCenterPageLayoutError");
    expect(error.report).toBe(report);
  });

  it("rejects an empty viewport matrix before accessing the browser", async () => {
    const page = {
      async evaluate() {
        throw new Error("evaluate should not run");
      },
      async setViewportSize() {
        throw new Error("setViewportSize should not run");
      },
    };

    await expect(
      verifyCommandCenterPageLayout(page, { viewports: [] }),
    ).rejects.toThrow("At least one layout verification viewport is required");
  });
});
