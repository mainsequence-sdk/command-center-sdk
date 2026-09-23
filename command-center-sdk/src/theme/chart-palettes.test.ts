import { describe, expect, it } from "vitest";

import {
  getThemeDivergingScale,
  getThemeSequentialScale,
  resolveThemeDataVizPalette,
} from "./chart-palettes.js";
import { quartzLightTheme } from "./presets/quartz-light.js";
import type { ThemePreset } from "./types.js";

function channels(hex: string) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

describe("theme data-viz palettes", () => {
  it("gives a pure grey endpoint the other endpoint's hue", () => {
    const theme: Pick<ThemePreset, "dataViz" | "mode"> = {
      mode: "light",
      dataViz: {
        diverging: {
          default: { negative: "#E42020", neutral: "#F4F4F4", positive: "#1F8536" },
        },
      },
    };
    const palette = resolveThemeDataVizPalette(theme, quartzLightTheme.tokens);
    const scale = getThemeDivergingScale(palette, "default", 9);

    expect(scale[4]).toBe("#F4F4F4");
    // Red half stays red (r dominant, g == b); green half stays green (g dominant).
    for (const hex of scale.slice(0, 4)) {
      const [r, g, b] = channels(hex);
      expect(r).toBeGreaterThan(g);
      expect(g).toBe(b);
    }
    for (const hex of scale.slice(5)) {
      const [r, g, b] = channels(hex);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it("keeps Main Sequence Light neutral centers and the warning start on dead-neutral grey", () => {
    const palette = resolveThemeDataVizPalette(quartzLightTheme, quartzLightTheme.tokens);

    expect(getThemeSequentialScale(palette, "warning", 7)[0]).toBe("#F4F4F4");
    expect(getThemeDivergingScale(palette, "default", 9)[4]).toBe("#F0F0F0");
    expect(getThemeDivergingScale(palette, "positive-negative", 9)).toEqual([
      "#E42020",
      "#D76666",
      "#D6A0A0",
      "#DFD0D0",
      "#F4F4F4",
      "#C3D4C7",
      "#86C093",
      "#41B45B",
      "#1F8536",
    ]);
  });
});
