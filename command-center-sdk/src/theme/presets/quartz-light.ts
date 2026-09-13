import type { ThemePreset } from "../types.js";

// Linear-derived light theme: white canvas, dead-neutral grey surfaces, soft
// charcoal text, and the same indigo as the dark sibling (main-sequence-space).
// Surfaces and text follow linear.app's public [data-theme=light] CSS. Linear's
// light status colors are fills and fail WCAG AA as text on white, so each one
// is darkened along its own hue until it clears 4.5:1; the SDK paints cells and
// pills with these tokens as text.
export const quartzLightTheme: ThemePreset = {
  id: "quartz-light",
  label: "Main Sequence Light",
  description:
    "Main Sequence light mode on white with neutral grey surfaces and the indigo brand, after Linear.",
  source: "core",
  mode: "light",
  tightness: "tight",
  surfaceHierarchy: "flat",
  tokens: {
    background: "#FFFFFF",
    foreground: "#282A30",
    card: "#FFFFFF",
    "card-foreground": "#282A30",
    popover: "#FFFFFF",
    "popover-foreground": "#282A30",
    sidebar: "#F8F8F8",
    "sidebar-foreground": "#3C4149",
    topbar: "#FFFFFF",
    "topbar-foreground": "#282A30",
    muted: "#F4F4F4",
    "muted-foreground": "#6F6E77",
    border: "#E9E8EA",
    input: "#FFFFFF",
    primary: "#5E6AD2",
    "primary-foreground": "#FFFFFF",
    secondary: "#F0F0F0",
    "secondary-foreground": "#282A30",
    accent: "#5F5EFF",
    "accent-foreground": "#FFFFFF",
    danger: "#E42020",
    "danger-foreground": "#FFFFFF",
    success: "#1F8536",
    "success-foreground": "#FFFFFF",
    warning: "#8D7000",
    "warning-foreground": "#FFFFFF",
    positive: "#1F8536",
    negative: "#E42020",
    ring: "#7170FF",
    "chart-grid": "#282A30",
    radius: "8px",
  },
  dataViz: {
    // Series clear 3:1 as marks on white. Linear's light chart hues are fills at
    // 2.5-2.7:1, so series 3-6 are darkened along their own hue to the bar.
    // Green, red, and yellow are reserved for status tokens.
    categorical: [
      "#5E6AD2", // indigo
      "#6F6E77", // neutral
      "#B176FC", // violet
      "#2B96FB", // sky
      "#FB611F", // orange
      "#B38E00", // gold
      "#5F5EFF", // indigo bright
      "#3C4149", // dark neutral
    ],
    // Light mode runs pale to saturated. Starts are hue-matched to their anchor
    // because the palette resolver interpolates hue in HSL along the shorter arc.
    sequential: {
      primary: {
        start: "#EEEFFB",
        mid: "#9FA7E6",
        end: "#5E6AD2",
      },
      success: {
        start: "#EAF5EC",
        mid: "#7DBD8C",
        end: "#1F8536",
      },
      warning: {
        start: "#F7F3E3",
        mid: "#C4B26A",
        end: "#8D7000",
      },
      neutral: {
        start: "#F4F4F4",
        mid: "#A9A9AE",
        end: "#3C4149",
      },
    },
    diverging: {
      // A pure grey neutral is HSL hue 0deg, so the indigo half passes through
      // pale lavender near the center. Tinted neutrals at 260-315deg were tested
      // and each pushed the orange half to pink instead; grey drifts least.
      default: {
        negative: "#FB611F",
        neutral: "#F0F0F0",
        positive: "#5E6AD2",
      },
      // Neutral sits at ~60deg, between red and green, so both halves
      // interpolate directly and never wrap through magenta.
      "positive-negative": {
        negative: "#E42020",
        neutral: "#F4F4F0",
        positive: "#1F8536",
      },
    },
  },
};
