import { describe, expect, it } from "vitest";

import { buildThemeCssVariableMap } from "./css-vars.js";
import { mainSequenceTheme } from "./presets/main-sequence.js";
import { getThemeTightnessMetrics } from "./tightness.js";

describe("application layout theme metrics", () => {
  it("resolves a complete metric set for every tightness", () => {
    for (const tightness of ["relaxed", "default", "tight"] as const) {
      const metrics = getThemeTightnessMetrics(tightness).layout;
      expect(metrics.pageGutterInline).toBeTruthy();
      expect(metrics.pageGutterBlock).toBeTruthy();
      expect(metrics.sectionGap).toBeTruthy();
      expect(metrics.cardGridGap).toBeTruthy();
      expect(metrics.cardPaddingInline).toBeTruthy();
      expect(metrics.cardPaddingBlock).toBeTruthy();
      expect(metrics.cardHeaderGap).toBeTruthy();
      expect(metrics.cardContentGap).toBeTruthy();
    }
  });

  it("publishes resolved layout CSS variables with the active theme", () => {
    const variables = buildThemeCssVariableMap({
      theme: mainSequenceTheme,
      tightness: "default",
    });

    expect(variables["--application-page-gutter-inline"]).toBe(
      "clamp(1rem, 2.5vw, 1.5rem)",
    );
    expect(variables["--application-section-gap"]).toBe(
      "clamp(1.25rem, 2.5vw, 1.5rem)",
    );
    expect(variables["--application-card-padding-inline"]).toBe(
      "clamp(1rem, 2vw, 1.25rem)",
    );
  });
});
