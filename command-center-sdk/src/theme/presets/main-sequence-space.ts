import type { ThemePreset } from "../types.js";

// Linear-derived dark theme: dead-neutral near-black ground, one soft indigo,
// off-white text. Values follow linear.app's public dark-mode CSS.
export const mainSequenceSpaceTheme: ThemePreset = {
  id: "main-sequence-space",
  label: "Main Sequence",
  description:
    "Main Sequence operational dark theme on neutral near-black with a soft indigo brand, after Linear.",
  source: "core",
  mode: "dark",
  tightness: "tight",
  surfaceHierarchy: "soft",
  tokens: {
    background: "#08090A",
    foreground: "#F7F8F8",
    card: "#101012",
    "card-foreground": "#F7F8F8",
    popover: "#191A1B",
    "popover-foreground": "#F7F8F8",
    sidebar: "#08090A",
    "sidebar-foreground": "#D0D6E0",
    topbar: "#08090A",
    "topbar-foreground": "#F7F8F8",
    muted: "#191A1B",
    "muted-foreground": "#8A8F98",
    border: "#23252A",
    input: "#101012",
    primary: "#5E6AD2",
    "primary-foreground": "#FFFFFF",
    secondary: "#191A1B",
    "secondary-foreground": "#F7F8F8",
    accent: "#7170FF",
    "accent-foreground": "#08090A",
    danger: "#EB5757",
    "danger-foreground": "#08090A",
    success: "#4CB782",
    "success-foreground": "#08090A",
    warning: "#F2C94C",
    "warning-foreground": "#08090A",
    positive: "#4CB782",
    negative: "#EB5757",
    ring: "#7170FF",
    "chart-grid": "#F7F8F8",
    radius: "8px",
  },
  dataViz: {
    // Brand indigo first, then Linear's label hues and neutrals. Green, red, and
    // yellow are reserved for status tokens so no series reads as a signal.
    categorical: [
      "#5E6AD2", // indigo
      "#8A8F98", // neutral
      "#BB87FC", // violet
      "#4EA7FC", // sky
      "#F2994A", // orange
      "#D0D6E0", // light neutral
      "#7170FF", // indigo bright
      "#62666D", // dark neutral
    ],
    // Scale starts are hue-matched to their anchor: the palette resolver
    // interpolates hue in HSL along the shorter arc, so a neutral start against
    // a saturated anchor would drag the midtones through unrelated hues.
    sequential: {
      primary: {
        start: "#0D0E17",
        mid: "#5E6AD2",
        end: "#BFC4F5",
      },
      success: {
        start: "#0A1410",
        mid: "#2E7A55",
        end: "#4CB782",
      },
      warning: {
        start: "#171406",
        mid: "#8F7A2E",
        end: "#F2C94C",
      },
      neutral: {
        start: "#101012",
        mid: "#62666D",
        end: "#D0D6E0",
      },
    },
    diverging: {
      default: {
        negative: "#F2994A",
        neutral: "#1B181C",
        positive: "#5E6AD2",
      },
      "positive-negative": {
        // Neutral sits at ~60deg, between red (0deg) and green (150deg), so both
        // halves interpolate directly instead of the red half wrapping through
        // magenta.
        negative: "#EB5757",
        neutral: "#1A1A17",
        positive: "#4CB782",
      },
    },
  },
};
