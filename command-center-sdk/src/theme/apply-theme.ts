import { buildThemeCssVariableMap } from "./css-vars.js";
import {
  type ThemeFontStacks,
  type ThemePreset,
  type ThemeSurfaceHierarchy,
  type ThemeTightness,
  type ThemeTokens,
} from "./types.js";

export interface ApplyThemePresetToRootInput {
  fonts?: ThemeFontStacks;
  theme: ThemePreset;
  resolvedTokens?: ThemeTokens;
  tightness?: ThemeTightness;
  surfaceHierarchy?: ThemeSurfaceHierarchy;
}

export function applyThemePresetToRoot(
  root: HTMLElement,
  input: ApplyThemePresetToRootInput,
) {
  const { surfaceHierarchy = input.theme.surfaceHierarchy, theme, tightness = input.theme.tightness } = input;

  root.dataset.theme = theme.id;
  root.dataset.commandCenterThemeRoot = "true";
  root.classList.toggle("dark", theme.mode === "dark");

  Object.entries(buildThemeCssVariableMap(input)).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });

  root.dataset.tightness = tightness;
  root.dataset.surfaceHierarchy = surfaceHierarchy;
}
