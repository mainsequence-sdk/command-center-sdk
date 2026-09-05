import type { ThemePreset } from "../types.js";

const monoStack =
  '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const mainSequenceSpaceTheme: ThemePreset = {
  id: "main-sequence-space",
  label: "Main Sequence",
  description:
    "Main Sequence operational dark theme on warm charcoal, with a dusty indigo brand and teal, rose, and gold signal accents.",
  source: "core",
  mode: "dark",
  tightness: "tight",
  surfaceHierarchy: "soft",
  fonts: {
    mono: monoStack,
    sans: monoStack,
  },
  tokens: {
    background: "#0E0D0C",
    foreground: "#F0EEEA",
    card: "#161514",
    "card-foreground": "#F0EEEA",
    popover: "#1B1A18",
    "popover-foreground": "#F0EEEA",
    sidebar: "#0E0D0C",
    "sidebar-foreground": "#B1ADA2",
    topbar: "#0E0D0C",
    "topbar-foreground": "#F0EEEA",
    muted: "#21201D",
    "muted-foreground": "#8B877D",
    border: "#2E2C29",
    input: "#1B1A18",
    primary: "#8B96C0",
    "primary-foreground": "#0E0D0C",
    secondary: "#21201D",
    "secondary-foreground": "#E9E7E1",
    accent: "#B1ADA2",
    "accent-foreground": "#0E0D0C",
    danger: "#FF6B8A",
    "danger-foreground": "#24020A",
    success: "#5EEAD4",
    "success-foreground": "#031514",
    warning: "#DFA85B",
    "warning-foreground": "#1E1102",
    positive: "#5EEAD4",
    negative: "#FF6B8A",
    ring: "#A3ACD0",
    "chart-grid": "#F0EEEA",
    radius: "4px",
  },
  dataViz: {
    // Pigment set spaced by luminance as well as hue. Teal, rose, and gold are
    // reserved for status tokens, so no series can be mistaken for a signal.
    categorical: [
      "#8B96C0", // indigo · 228°
      "#C2705A", // burnt sienna · 13°
      "#8FB06B", // olive · 89°
      "#CFC8B8", // bone · no hue
      "#9E7FBE", // heliotrope · 270°
      "#5A66A8", // indigo deep · 231°
      "#8A5A44", // umber · 19°
      "#557A3F", // forest · 98°
    ],
    // Scale endpoints are hue-matched on purpose. resolveThemeDataVizPalette
    // interpolates hue in HSL along the shorter arc, so a warm near-black start
    // (#161514, ~30deg) against a cool anchor swings the midtones through unrelated
    // hues -- a mauve in the primary ramp, and a green in positive-negative. Each
    // start and neutral below sits at its own scale's hue so the ramps stay in family.
    sequential: {
      primary: {
        start: "#15161C",
        mid: "#5A66A8",
        end: "#C3C9E4",
      },
      success: {
        start: "#0F1615",
        mid: "#2F9A8C",
        end: "#5EEAD4",
      },
      warning: {
        start: "#1B1A18",
        mid: "#9A6F32",
        end: "#DFA85B",
      },
      neutral: {
        start: "#161514",
        mid: "#5C5952",
        end: "#E9E7E1",
      },
    },
    diverging: {
      default: {
        negative: "#C2705A",
        neutral: "#2A2630",
        positive: "#8B96C0",
      },
      "positive-negative": {
        // Neutral sits at ~321deg rather than a warm or blue near-black: the kept
        // rose is fully saturated, so a longer arc off it produces a hot magenta
        // midtone. This keeps the negative half reading as darker rose.
        negative: "#FF6B8A",
        neutral: "#2E2029",
        positive: "#5EEAD4",
      },
    },
  },
};
