import type { ThemeSurfaceHierarchy } from "./types.js";

export interface ThemeSurfaceHierarchyMetrics {
  nestedCardBorderColor: string;
  nestedCardBackground: string;
  nestedCardShadow: string;
}

const surfaceHierarchyMetrics: Record<ThemeSurfaceHierarchy, ThemeSurfaceHierarchyMetrics> = {
  framed: {
    nestedCardBorderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
    nestedCardBackground: "color-mix(in srgb, var(--background) 80%, var(--card) 20%)",
    nestedCardShadow: "none",
  },
  soft: {
    nestedCardBorderColor: "color-mix(in srgb, var(--border) 42%, transparent)",
    nestedCardBackground: "color-mix(in srgb, var(--background) 90%, var(--card) 10%)",
    nestedCardShadow: "none",
  },
  flat: {
    nestedCardBorderColor: "transparent",
    nestedCardBackground: "transparent",
    nestedCardShadow: "none",
  },
};

export function getThemeSurfaceHierarchyMetrics(surfaceHierarchy: ThemeSurfaceHierarchy) {
  return surfaceHierarchyMetrics[surfaceHierarchy];
}
