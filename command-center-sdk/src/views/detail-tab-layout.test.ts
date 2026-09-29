import { describe, expect, it } from "vitest";

import { fitDetailTabs, scrollDeltaForTab } from "./detail-tab-layout.js";

describe("fitDetailTabs", () => {
  it("shows every tab and no More when they fit", () => {
    expect(fitDetailTabs({ available: 300, moreWidth: 60, widths: [100, 100, 100] }))
      .toEqual({ overflow: [], visible: [0, 1, 2] });
  });

  it("shows every tab before the strip has been laid out", () => {
    expect(fitDetailTabs({ available: 0, moreWidth: 60, widths: [100, 100, 100] }))
      .toEqual({ overflow: [], visible: [0, 1, 2] });
  });

  it("fills leading tabs beside More and lists the rest in order", () => {
    expect(fitDetailTabs({ available: 330, moreWidth: 60, widths: [100, 100, 100, 100] }))
      .toEqual({ overflow: [2, 3], visible: [0, 1] });
  });

  it("keeps a pinned tab from the end in the last visible slot", () => {
    expect(fitDetailTabs({ available: 330, moreWidth: 60, pinned: [3], widths: [100, 100, 100, 100] }))
      .toEqual({ overflow: [1, 2], visible: [0, 3] });
  });

  it("keeps both pinned tabs, the active one and a focused one", () => {
    expect(fitDetailTabs({ available: 330, moreWidth: 60, pinned: [3, 0], widths: [100, 100, 100, 100] }))
      .toEqual({ overflow: [1, 2], visible: [0, 3] });
  });

  it("keeps one tab visible even when none fits", () => {
    expect(fitDetailTabs({ available: 200, moreWidth: 50, widths: [500, 500] }))
      .toEqual({ overflow: [1], visible: [0] });
    expect(fitDetailTabs({ available: 200, moreWidth: 50, pinned: [1], widths: [500, 500] }))
      .toEqual({ overflow: [0], visible: [1] });
  });

  it("counts the gaps between tabs and before More", () => {
    expect(fitDetailTabs({ available: 310, gap: 10, moreWidth: 50, widths: [100, 100, 100] }))
      .toEqual({ overflow: [2], visible: [0, 1] });
  });

  it("absorbs sub-pixel rounding", () => {
    expect(fitDetailTabs({ available: 301, moreWidth: 60, widths: [100.4, 100.4, 100.4] }))
      .toEqual({ overflow: [], visible: [0, 1, 2] });
  });

  it("ignores pinned indexes outside the tab list", () => {
    expect(fitDetailTabs({ available: 330, moreWidth: 60, pinned: [-1, 9], widths: [100, 100, 100, 100] }))
      .toEqual({ overflow: [2, 3], visible: [0, 1] });
  });
});

describe("scrollDeltaForTab", () => {
  it("leaves a fully visible tab alone", () => {
    expect(scrollDeltaForTab({ padding: 24, tabEnd: 200, tabStart: 100, viewportWidth: 300 })).toBe(0);
  });

  it("scrolls back to reveal a tab before the start edge", () => {
    expect(scrollDeltaForTab({ padding: 24, tabEnd: 60, tabStart: -40, viewportWidth: 300 })).toBe(-64);
  });

  it("scrolls forward to reveal a tab past the end edge", () => {
    expect(scrollDeltaForTab({ padding: 24, tabEnd: 380, tabStart: 280, viewportWidth: 300 })).toBe(104);
  });

  it("aligns the start of a tab wider than the strip", () => {
    expect(scrollDeltaForTab({ padding: 24, tabEnd: 720, tabStart: 320, viewportWidth: 300 })).toBe(296);
  });

  it("does nothing before the strip has been laid out", () => {
    expect(scrollDeltaForTab({ padding: 24, tabEnd: 380, tabStart: 280, viewportWidth: 0 })).toBe(0);
  });
});
