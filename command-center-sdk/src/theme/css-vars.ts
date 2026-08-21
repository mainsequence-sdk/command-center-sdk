import { getThemeSurfaceHierarchyMetrics } from "./surface-hierarchy.js";
import { getThemeTightnessMetrics } from "./tightness.js";
import {
  defaultThemeFontStacks,
  themeTokenKeys,
  type ThemeFontStacks,
  type ThemePreset,
  type ThemeSurfaceHierarchy,
  type ThemeTightness,
  type ThemeTokens,
} from "./types.js";

export type ThemeCssVariableMap = Record<`--${string}`, string>;

export interface BuildThemeCssVariablesInput {
  fonts?: ThemeFontStacks;
  resolvedTokens?: ThemeTokens;
  surfaceHierarchy?: ThemeSurfaceHierarchy;
  theme: ThemePreset;
  tightness?: ThemeTightness;
}

export interface BuildThemeStyleTextInput extends BuildThemeCssVariablesInput {
  selector?: string;
}

export function buildThemeCssVariableMap({
  fonts,
  resolvedTokens,
  surfaceHierarchy,
  theme,
  tightness,
}: BuildThemeCssVariablesInput): ThemeCssVariableMap {
  const tokens = resolvedTokens ?? theme.tokens;
  const resolvedTightness = tightness ?? theme.tightness;
  const resolvedSurfaceHierarchy = surfaceHierarchy ?? theme.surfaceHierarchy;
  const resolvedFonts = {
    ...defaultThemeFontStacks,
    ...theme.fonts,
    ...fonts,
  };
  const tightnessMetrics = getThemeTightnessMetrics(resolvedTightness);
  const surfaceHierarchyMetrics = getThemeSurfaceHierarchyMetrics(resolvedSurfaceHierarchy);
  const variables: Record<`--${string}`, string> = {
    "--font-mono": resolvedFonts.mono,
    "--font-sans": resolvedFonts.sans,
  };

  themeTokenKeys.forEach((token) => {
    variables[`--${token}`] = tokens[token];
  });

  return {
    ...variables,
    "--table-standard-cell-padding-y": tightnessMetrics.table.standardCellPaddingY,
    "--table-standard-header-padding-y": tightnessMetrics.table.standardHeaderPaddingY,
    "--table-row-gap-y": tightnessMetrics.table.rowGapY,
    "--table-font-size": tightnessMetrics.table.fontSize,
    "--table-meta-font-size": tightnessMetrics.table.metaFontSize,
    "--table-compact-cell-padding-y": tightnessMetrics.table.compactCellPaddingY,
    "--table-compact-header-padding-y": tightnessMetrics.table.compactHeaderPaddingY,
    "--font-size-page-title": tightnessMetrics.typography.pageTitleSize,
    "--font-size-section-title": tightnessMetrics.typography.sectionTitleSize,
    "--font-size-body": tightnessMetrics.typography.bodySize,
    "--font-size-body-sm": tightnessMetrics.typography.bodySmSize,
    "--font-size-body-xs": tightnessMetrics.typography.bodyXsSize,
    "--line-height-body": tightnessMetrics.typography.bodyLineHeight,
    "--font-size-markdown-h1": tightnessMetrics.typography.markdownH1Size,
    "--font-size-markdown-h2": tightnessMetrics.typography.markdownH2Size,
    "--font-size-markdown-h3": tightnessMetrics.typography.markdownH3Size,
    "--font-size-markdown-h4": tightnessMetrics.typography.markdownH4Size,
    "--summary-stat-grid-gap": tightnessMetrics.summary.statGridGap,
    "--summary-highlight-gap": tightnessMetrics.summary.highlightGap,
    "--summary-stat-card-padding-x": tightnessMetrics.summary.statCardPaddingX,
    "--summary-stat-card-padding-y": tightnessMetrics.summary.statCardPaddingY,
    "--summary-stat-label-size": tightnessMetrics.summary.statLabelSize,
    "--summary-stat-value-size": tightnessMetrics.summary.statValueSize,
    "--summary-stat-info-size": tightnessMetrics.summary.statInfoSize,
    "--summary-highlight-card-padding-x": tightnessMetrics.summary.highlightCardPaddingX,
    "--summary-highlight-card-padding-y": tightnessMetrics.summary.highlightCardPaddingY,
    "--summary-stat-value-margin-top": tightnessMetrics.summary.statValueMarginTop,
    "--summary-stat-info-margin-top": tightnessMetrics.summary.statInfoMarginTop,
    "--summary-highlight-value-margin-top": tightnessMetrics.summary.highlightValueMarginTop,
    "--summary-highlight-meta-margin-top": tightnessMetrics.summary.highlightMetaMarginTop,
    "--card-nested-border-color": surfaceHierarchyMetrics.nestedCardBorderColor,
    "--card-nested-background": surfaceHierarchyMetrics.nestedCardBackground,
    "--card-nested-shadow": surfaceHierarchyMetrics.nestedCardShadow,
  };
}

export function buildThemeStyleText({
  selector = ":root",
  ...input
}: BuildThemeStyleTextInput) {
  const declarations = Object.entries(buildThemeCssVariableMap(input))
    .map(([property, value]) => `  ${property}: ${value};`)
    .join("\n");

  return `${selector} {\n${declarations}\n}`;
}
