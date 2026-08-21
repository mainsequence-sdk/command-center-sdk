import { withAlpha } from "./color.js";
import type {
  ResolvedThemeDataVizDivergingScale,
  ResolvedThemeDataVizPalette,
  ResolvedThemeDataVizSequentialScale,
  ThemeDataVizColorReference,
  ThemeDataVizDivergingScaleKey,
  ThemeDataVizPaletteSpec,
  ThemeDataVizSequentialScaleKey,
  ThemePreset,
  ThemeTokens,
} from "./types.js";

type RgbColor = {
  b: number;
  g: number;
  r: number;
};

type HslColor = {
  h: number;
  l: number;
  s: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(hex: string) {
  const clean = hex.trim().replace("#", "");

  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return clean
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase();
  }

  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return clean.toUpperCase();
  }

  return null;
}

function parseHexColor(value: string) {
  const normalized = normalizeHex(value);

  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  } satisfies RgbColor;
}

function toHexColor({ b, g, r }: RgbColor) {
  return `#${[r, g, b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function rgbToHsl({ b, g, r }: RgbColor): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation =
    lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min);

  let hue = 0;

  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return {
    h: hue / 6,
    s: saturation,
    l: lightness,
  };
}

function hueToRgb(p: number, q: number, t: number) {
  let next = t;

  if (next < 0) {
    next += 1;
  }

  if (next > 1) {
    next -= 1;
  }

  if (next < 1 / 6) {
    return p + (q - p) * 6 * next;
  }

  if (next < 1 / 2) {
    return q;
  }

  if (next < 2 / 3) {
    return p + (q - p) * (2 / 3 - next) * 6;
  }

  return p;
}

function hslToRgb({ h, l, s }: HslColor): RgbColor {
  if (s === 0) {
    const value = Math.round(l * 255);
    return { r: value, g: value, b: value };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

function interpolateHue(start: number, end: number, ratio: number) {
  let delta = end - start;

  if (Math.abs(delta) > 0.5) {
    delta -= Math.sign(delta);
  }

  const value = start + delta * ratio;

  if (value < 0) {
    return value + 1;
  }

  if (value > 1) {
    return value - 1;
  }

  return value;
}

function interpolateHexColor(start: string, end: string, ratio: number) {
  const startRgb = parseHexColor(start);
  const endRgb = parseHexColor(end);

  if (!startRgb || !endRgb) {
    return ratio >= 0.5 ? end : start;
  }

  const startHsl = rgbToHsl(startRgb);
  const endHsl = rgbToHsl(endRgb);

  return toHexColor(
    hslToRgb({
      h: interpolateHue(startHsl.h, endHsl.h, ratio),
      s: startHsl.s + (endHsl.s - startHsl.s) * ratio,
      l: startHsl.l + (endHsl.l - startHsl.l) * ratio,
    }),
  );
}

function mixHexColor(start: string, end: string, amount: number) {
  return interpolateHexColor(start, end, clamp(amount, 0, 1));
}

function resolveColorReference(
  reference: ThemeDataVizColorReference | undefined,
  tokens: ThemeTokens,
  fallback: string,
) {
  if (!reference) {
    return fallback;
  }

  if (typeof reference === "string") {
    if (reference.startsWith("$theme.")) {
      const tokenKey = reference.slice("$theme.".length) as keyof ThemeTokens;
      const resolved = tokens[tokenKey];
      return typeof resolved === "string" && resolved.trim() ? resolved : fallback;
    }

    return reference;
  }

  const tokenValue = tokens[reference.token] ?? fallback;

  if (
    typeof reference.alpha === "number" &&
    Number.isFinite(reference.alpha) &&
    normalizeHex(tokenValue)
  ) {
    return withAlpha(tokenValue, reference.alpha);
  }

  return tokenValue;
}

function resolveHexColorReference(
  reference: ThemeDataVizColorReference | undefined,
  tokens: ThemeTokens,
  fallback: string,
) {
  const resolved = resolveColorReference(reference, tokens, fallback);
  return normalizeHex(resolved) ? resolved : fallback;
}

function colorSaturation(value: string) {
  const parsed = parseHexColor(value);
  return parsed ? rgbToHsl(parsed).s : 0;
}

function rotateHue(value: string, degrees: number, lightnessDelta = 0, saturationDelta = 0) {
  const parsed = parseHexColor(value);

  if (!parsed) {
    return value;
  }

  const hsl = rgbToHsl(parsed);

  return toHexColor(
    hslToRgb({
      h: (hsl.h + degrees / 360 + 1) % 1,
      s: clamp(hsl.s + saturationDelta, 0.22, 0.92),
      l: clamp(hsl.l + lightnessDelta, 0.28, 0.76),
    }),
  );
}

function chooseExpressiveBrandColor(tokens: ThemeTokens) {
  return colorSaturation(tokens.primary) >= 0.18 ? tokens.primary : tokens.accent;
}

function deriveDefaultCategoricalPalette(tokens: ThemeTokens, mode: ThemePreset["mode"]) {
  const brand = chooseExpressiveBrandColor(tokens);
  const accent = tokens.accent;
  const base = [
    accent,
    brand,
    tokens.success,
    tokens.warning,
    tokens.danger,
    rotateHue(accent, 48, mode === "dark" ? 0.05 : -0.03, 0.06),
    rotateHue(accent, -54, mode === "dark" ? 0.04 : -0.02, 0.02),
    rotateHue(tokens.success, -34, mode === "dark" ? 0.02 : -0.02, 0.01),
  ];
  const unique = new Set<string>();

  return base.filter((value) => {
    const normalized = normalizeHex(value) ?? value.trim().toUpperCase();

    if (unique.has(normalized)) {
      return false;
    }

    unique.add(normalized);
    return true;
  });
}

function buildSequentialScale(
  scale: ResolvedThemeDataVizSequentialScale,
  steps: number,
) {
  const safeSteps = Math.max(2, Math.floor(steps));

  if (!scale.mid) {
    return Array.from({ length: safeSteps }, (_, index) =>
      interpolateHexColor(scale.start, scale.end, index / (safeSteps - 1)),
    );
  }

  return Array.from({ length: safeSteps }, (_, index) => {
    const ratio = index / (safeSteps - 1);

    if (ratio <= 0.5) {
      return interpolateHexColor(scale.start, scale.mid!, ratio * 2);
    }

    return interpolateHexColor(scale.mid!, scale.end, (ratio - 0.5) * 2);
  });
}

function buildDivergingScale(
  scale: ResolvedThemeDataVizDivergingScale,
  steps: number,
) {
  const safeSteps = Math.max(3, Math.floor(steps));

  return Array.from({ length: safeSteps }, (_, index) => {
    const ratio = index / (safeSteps - 1);

    if (ratio <= 0.5) {
      return interpolateHexColor(scale.negative, scale.neutral, ratio * 2);
    }

    return interpolateHexColor(scale.neutral, scale.positive, (ratio - 0.5) * 2);
  });
}

function resolveSequentialScale(
  spec: ThemeDataVizPaletteSpec | undefined,
  key: ThemeDataVizSequentialScaleKey,
  tokens: ThemeTokens,
  mode: ThemePreset["mode"],
) {
  const brand = chooseExpressiveBrandColor(tokens);
  const anchorByKey: Record<ThemeDataVizSequentialScaleKey, string> = {
    primary: brand,
    success: tokens.success,
    warning: tokens.warning,
    neutral: mixHexColor(tokens.muted, tokens.foreground, mode === "dark" ? 0.48 : 0.3),
  };
  const baseAnchor = anchorByKey[key];
  const defaultStart = mixHexColor(
    mode === "dark" ? tokens.card : tokens.background,
    baseAnchor,
    mode === "dark" ? 0.16 : 0.1,
  );
  const override = spec?.sequential?.[key];

  return {
    start: resolveHexColorReference(override?.start, tokens, defaultStart),
    mid: override?.mid
      ? resolveHexColorReference(override.mid, tokens, mixHexColor(defaultStart, baseAnchor, 0.5))
      : undefined,
    end: resolveHexColorReference(override?.end, tokens, baseAnchor),
  } satisfies ResolvedThemeDataVizSequentialScale;
}

function resolveDivergingScale(
  spec: ThemeDataVizPaletteSpec | undefined,
  key: ThemeDataVizDivergingScaleKey,
  tokens: ThemeTokens,
  mode: ThemePreset["mode"],
) {
  const defaultNeutral = mixHexColor(
    mode === "dark" ? tokens.muted : tokens.card,
    mode === "dark" ? tokens.foreground : tokens.muted,
    mode === "dark" ? 0.22 : 0.12,
  );
  const defaultSpec: Record<ThemeDataVizDivergingScaleKey, ResolvedThemeDataVizDivergingScale> = {
    default: {
      negative: tokens.negative,
      neutral: defaultNeutral,
      positive: tokens.positive,
    },
    "positive-negative": {
      negative: tokens.danger,
      neutral: defaultNeutral,
      positive: tokens.success,
    },
  };
  const override = spec?.diverging?.[key];
  const base = defaultSpec[key];

  return {
    negative: resolveHexColorReference(override?.negative, tokens, base.negative),
    neutral: resolveHexColorReference(override?.neutral, tokens, base.neutral),
    positive: resolveHexColorReference(override?.positive, tokens, base.positive),
  } satisfies ResolvedThemeDataVizDivergingScale;
}

export function resolveThemeDataVizPalette(
  theme: Pick<ThemePreset, "dataViz" | "mode">,
  tokens: ThemeTokens,
): ResolvedThemeDataVizPalette {
  const defaultCategorical = deriveDefaultCategoricalPalette(tokens, theme.mode);
  const categoricalOverrides = theme.dataViz?.categorical?.map((entry, index) =>
    resolveColorReference(entry, tokens, defaultCategorical[index % defaultCategorical.length]),
  );

  return {
    categorical: categoricalOverrides?.length ? categoricalOverrides : defaultCategorical,
    sequential: {
      primary: resolveSequentialScale(theme.dataViz, "primary", tokens, theme.mode),
      success: resolveSequentialScale(theme.dataViz, "success", tokens, theme.mode),
      warning: resolveSequentialScale(theme.dataViz, "warning", tokens, theme.mode),
      neutral: resolveSequentialScale(theme.dataViz, "neutral", tokens, theme.mode),
    },
    diverging: {
      default: resolveDivergingScale(theme.dataViz, "default", tokens, theme.mode),
      "positive-negative": resolveDivergingScale(theme.dataViz, "positive-negative", tokens, theme.mode),
    },
  };
}

export function getThemeCategoricalPalette(
  palette: ResolvedThemeDataVizPalette,
  count?: number,
) {
  if (!count || count <= palette.categorical.length) {
    return palette.categorical.slice(0, count ?? palette.categorical.length);
  }

  return Array.from({ length: count }, (_, index) => palette.categorical[index % palette.categorical.length]);
}

export function getThemeCategoricalColor(
  palette: ResolvedThemeDataVizPalette,
  index: number,
) {
  const safeIndex = Math.max(0, Math.floor(index));
  return palette.categorical[safeIndex % palette.categorical.length] ?? palette.categorical[0] ?? "#888888";
}

export function getThemeSequentialScale(
  palette: ResolvedThemeDataVizPalette,
  key: ThemeDataVizSequentialScaleKey = "primary",
  steps = 7,
) {
  return buildSequentialScale(palette.sequential[key], steps);
}

export function getThemeDivergingScale(
  palette: ResolvedThemeDataVizPalette,
  key: ThemeDataVizDivergingScaleKey = "default",
  steps = 7,
) {
  return buildDivergingScale(palette.diverging[key], steps);
}
