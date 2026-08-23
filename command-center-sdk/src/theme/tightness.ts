import type { ThemeTightness } from "./types.js";

export interface ThemeTightnessMetrics {
  layout: {
    cardContentGap: string;
    cardGridGap: string;
    cardHeaderGap: string;
    cardPaddingBlock: string;
    cardPaddingInline: string;
    pageGutterBlock: string;
    pageGutterInline: string;
    sectionGap: string;
  };
  table: {
    agGridHeaderHeight: number;
    agGridRowHeight: number;
    agGridSpacing: number;
    rowGapY: string;
    fontSize: string;
    metaFontSize: string;
    compactCellPaddingY: string;
    compactHeaderPaddingY: string;
    standardCellPaddingY: string;
    standardHeaderPaddingY: string;
  };
  typography: {
    pageTitleSize: string;
    sectionTitleSize: string;
    bodySize: string;
    bodySmSize: string;
    bodyXsSize: string;
    bodyLineHeight: string;
    markdownH1Size: string;
    markdownH2Size: string;
    markdownH3Size: string;
    markdownH4Size: string;
  };
  summary: {
    statGridGap: string;
    highlightGap: string;
    statCardPaddingX: string;
    statCardPaddingY: string;
    statLabelSize: string;
    statValueSize: string;
    statInfoSize: string;
    highlightCardPaddingX: string;
    highlightCardPaddingY: string;
    statValueMarginTop: string;
    statInfoMarginTop: string;
    highlightValueMarginTop: string;
    highlightMetaMarginTop: string;
  };
}

const tightnessMetrics: Record<ThemeTightness, ThemeTightnessMetrics> = {
  relaxed: {
    layout: {
      cardContentGap: "0.875rem",
      cardGridGap: "1.25rem",
      cardHeaderGap: "0.75rem",
      cardPaddingBlock: "clamp(1.25rem, 2.5vw, 1.5rem)",
      cardPaddingInline: "clamp(1.25rem, 2.5vw, 1.5rem)",
      pageGutterBlock: "clamp(1.25rem, 3vw, 2rem)",
      pageGutterInline: "clamp(1.25rem, 3vw, 2rem)",
      sectionGap: "clamp(1.5rem, 3vw, 2rem)",
    },
    table: {
      agGridHeaderHeight: 38,
      agGridRowHeight: 38,
      agGridSpacing: 8,
      rowGapY: "0.5rem",
      fontSize: "0.875rem",
      metaFontSize: "0.75rem",
      compactCellPaddingY: "0.5rem",
      compactHeaderPaddingY: "0.5rem",
      standardCellPaddingY: "0.75rem",
      standardHeaderPaddingY: "0.5rem",
    },
    typography: {
      pageTitleSize: "1.25rem",
      sectionTitleSize: "0.875rem",
      bodySize: "0.875rem",
      bodySmSize: "0.75rem",
      bodyXsSize: "0.6875rem",
      bodyLineHeight: "1.45",
      markdownH1Size: "1.5rem",
      markdownH2Size: "1.1875rem",
      markdownH3Size: "1rem",
      markdownH4Size: "0.875rem",
    },
    summary: {
      statGridGap: "0.75rem",
      highlightGap: "0.625rem",
      statCardPaddingX: "1rem",
      statCardPaddingY: "0.75rem",
      statLabelSize: "0.6875rem",
      statValueSize: "1.25rem",
      statInfoSize: "0.75rem",
      highlightCardPaddingX: "0.75rem",
      highlightCardPaddingY: "0.625rem",
      statValueMarginTop: "0.75rem",
      statInfoMarginTop: "0.5rem",
      highlightValueMarginTop: "0.375rem",
      highlightMetaMarginTop: "0.125rem",
    },
  },
  default: {
    layout: {
      cardContentGap: "0.75rem",
      cardGridGap: "1rem",
      cardHeaderGap: "0.5rem",
      cardPaddingBlock: "clamp(1rem, 2vw, 1.25rem)",
      cardPaddingInline: "clamp(1rem, 2vw, 1.25rem)",
      pageGutterBlock: "clamp(1rem, 2.5vw, 1.5rem)",
      pageGutterInline: "clamp(1rem, 2.5vw, 1.5rem)",
      sectionGap: "clamp(1.25rem, 2.5vw, 1.5rem)",
    },
    table: {
      agGridHeaderHeight: 34,
      agGridRowHeight: 34,
      agGridSpacing: 6,
      rowGapY: "0.25rem",
      fontSize: "0.8125rem",
      metaFontSize: "0.6875rem",
      compactCellPaddingY: "0.375rem",
      compactHeaderPaddingY: "0.375rem",
      standardCellPaddingY: "0.5rem",
      standardHeaderPaddingY: "0.375rem",
    },
    typography: {
      pageTitleSize: "1.125rem",
      sectionTitleSize: "0.8125rem",
      bodySize: "0.8125rem",
      bodySmSize: "0.71875rem",
      bodyXsSize: "0.625rem",
      bodyLineHeight: "1.35",
      markdownH1Size: "1.25rem",
      markdownH2Size: "1rem",
      markdownH3Size: "0.875rem",
      markdownH4Size: "0.75rem",
    },
    summary: {
      statGridGap: "0.625rem",
      highlightGap: "0.5rem",
      statCardPaddingX: "0.9375rem",
      statCardPaddingY: "0.625rem",
      statLabelSize: "0.625rem",
      statValueSize: "1rem",
      statInfoSize: "0.6875rem",
      highlightCardPaddingX: "0.6875rem",
      highlightCardPaddingY: "0.5625rem",
      statValueMarginTop: "0.625rem",
      statInfoMarginTop: "0.4375rem",
      highlightValueMarginTop: "0.3125rem",
      highlightMetaMarginTop: "0.125rem",
    },
  },
  tight: {
    layout: {
      cardContentGap: "0.625rem",
      cardGridGap: "0.875rem",
      cardHeaderGap: "0.5rem",
      cardPaddingBlock: "clamp(0.875rem, 2vw, 1.125rem)",
      cardPaddingInline: "clamp(0.875rem, 2vw, 1.125rem)",
      pageGutterBlock: "clamp(0.875rem, 2vw, 1.25rem)",
      pageGutterInline: "clamp(0.875rem, 2vw, 1.25rem)",
      sectionGap: "clamp(1rem, 2vw, 1.25rem)",
    },
    table: {
      agGridHeaderHeight: 30,
      agGridRowHeight: 30,
      agGridSpacing: 4,
      rowGapY: "0.125rem",
      fontSize: "0.75rem",
      metaFontSize: "0.625rem",
      compactCellPaddingY: "0.25rem",
      compactHeaderPaddingY: "0.25rem",
      standardCellPaddingY: "0.375rem",
      standardHeaderPaddingY: "0.3125rem",
    },
    typography: {
      pageTitleSize: "1rem",
      sectionTitleSize: "0.75rem",
      bodySize: "0.75rem",
      bodySmSize: "0.6875rem",
      bodyXsSize: "0.625rem",
      bodyLineHeight: "1.3",
      markdownH1Size: "1.125rem",
      markdownH2Size: "1rem",
      markdownH3Size: "0.8125rem",
      markdownH4Size: "0.75rem",
    },
    summary: {
      statGridGap: "0.5rem",
      highlightGap: "0.5rem",
      statCardPaddingX: "0.875rem",
      statCardPaddingY: "0.625rem",
      statLabelSize: "0.5625rem",
      statValueSize: "0.9375rem",
      statInfoSize: "0.625rem",
      highlightCardPaddingX: "0.625rem",
      highlightCardPaddingY: "0.5rem",
      statValueMarginTop: "0.375rem",
      statInfoMarginTop: "0.25rem",
      highlightValueMarginTop: "0.25rem",
      highlightMetaMarginTop: "0.125rem",
    },
  },
};

export function getThemeTightnessMetrics(tightness: ThemeTightness) {
  return tightnessMetrics[tightness];
}
