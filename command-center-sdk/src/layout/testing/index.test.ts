import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_LAYOUT_VIEWPORTS,
  CommandCenterPageLayoutError,
  formatCommandCenterPageLayoutViolations,
  type CommandCenterPageLayoutReport,
  verifyCommandCenterPageLayout,
} from "./index.js";

describe("application layout verification reporting", () => {
  it("publishes the phone, tablet, and desktop matrix with declared pointers", () => {
    expect(COMMAND_CENTER_LAYOUT_VIEWPORTS).toEqual([
      { width: 320, height: 568, pointer: "coarse" },
      { width: 375, height: 812, pointer: "coarse" },
      { width: 812, height: 375, pointer: "coarse" },
      { width: 768, height: 1024, pointer: "coarse" },
      { width: 1024, height: 768, pointer: "fine" },
      { width: 1280, height: 800, pointer: "fine" },
    ]);
  });

  it("formats violations and preserves the complete report on assertion errors", () => {
    const viewport = { width: 375, height: 812, pointer: "coarse" as const };
    const report: CommandCenterPageLayoutReport = {
      ok: false,
      reports: [],
      violations: [
        {
          code: "card-inset",
          element: "[data-cc-application-card]",
          message: "A standard card has no content inset.",
          severity: "error",
          viewport,
        },
      ],
      warnings: [],
    };

    expect(formatCommandCenterPageLayoutViolations(report)).toContain(
      "[375x812 coarse] card-inset",
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

  it("rejects an unknown pointer declaration before accessing the browser", async () => {
    const page = {
      async evaluate() {
        throw new Error("evaluate should not run");
      },
      async setViewportSize() {
        throw new Error("setViewportSize should not run");
      },
    };

    await expect(
      verifyCommandCenterPageLayout(page, {
        viewports: [{ width: 375, height: 812, pointer: "stylus" as unknown as "coarse" }],
      }),
    ).rejects.toThrow("pointer must be");
  });
});
