/** Internal, pure layout rules for the detail tab strip. Not part of the public entrypoint. */

export interface DetailTabFitInput {
  /** Rendered width of every tab, in declaration order. */
  widths: readonly number[];
  /** Width the strip may use, including the More trigger. */
  available: number;
  /** Width of the More trigger. */
  moreWidth: number;
  /** Gap between neighbouring tabs, and between the last tab and More. */
  gap?: number;
  /** Tabs that must stay visible (the active tab, a focused tab). */
  pinned?: readonly number[];
  /** Sub-pixel slack so rounding never hides a tab that fits. */
  tolerance?: number;
}

export interface DetailTabFit {
  /** Tab indexes shown in the strip, in declaration order. */
  visible: number[];
  /** Tab indexes listed in the More menu, in declaration order. */
  overflow: number[];
}

/**
 * Fit tabs into the strip. Everything fits: no More. Otherwise pinned tabs are kept first, then
 * leading tabs fill the room left beside More in declaration order, so a pinned tab from the end
 * takes the last visible slot. At least one tab stays visible. A strip that has not been laid out
 * (`available <= 0`) shows every tab.
 */
export function fitDetailTabs({
  available,
  gap = 0,
  moreWidth,
  pinned = [],
  tolerance = 1,
  widths,
}: DetailTabFitInput): DetailTabFit {
  const indexes = widths.map((_, index) => index);
  if (indexes.length === 0 || available <= 0) return { overflow: [], visible: indexes };

  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  if (total <= available + tolerance) return { overflow: [], visible: indexes };

  const budget = available - moreWidth - gap;
  const chosen = new Set<number>();
  let used = 0;
  const take = (index: number) => {
    used += (widths[index] ?? 0) + (chosen.size ? gap : 0);
    chosen.add(index);
  };

  for (const index of [...new Set(pinned)].sort((a, b) => a - b)) {
    if (index >= 0 && index < widths.length) take(index);
  }
  for (const index of indexes) {
    if (chosen.has(index)) continue;
    const next = used + (widths[index] ?? 0) + (chosen.size ? gap : 0);
    if (next > budget + tolerance) break;
    take(index);
  }
  if (chosen.size === 0) chosen.add(0);

  const visible = indexes.filter((index) => chosen.has(index));
  const overflow = indexes.filter((index) => !chosen.has(index));
  return { overflow, visible };
}

export interface DetailTabScrollInput {
  /** Tab start, measured from the scroller's visible start edge. */
  tabStart: number;
  /** Tab end, measured from the scroller's visible start edge. */
  tabEnd: number;
  /** Visible width of the scroller. */
  viewportWidth: number;
  /** Room to keep clear at each edge (the fades). */
  padding?: number;
}

/**
 * How far to scroll the strip so a tab is fully visible, as a delta for `scrollLeft`. Zero when it
 * already is. Only the strip scrolls; the page never moves.
 */
export function scrollDeltaForTab({
  padding = 0,
  tabEnd,
  tabStart,
  viewportWidth,
}: DetailTabScrollInput): number {
  if (viewportWidth <= 0) return 0;
  if (tabStart < padding) return tabStart - padding;
  if (tabEnd > viewportWidth - padding) {
    return Math.min(tabStart - padding, tabEnd - (viewportWidth - padding));
  }
  return 0;
}
