export { applyThemePresetToRoot, type ApplyThemePresetToRootInput } from "./apply-theme.js";
export {
  getThemeCategoricalColor,
  getThemeCategoricalPalette,
  getThemeDivergingScale,
  getThemeSequentialScale,
  resolveThemeDataVizPalette,
} from "./chart-palettes.js";
export {
  buildThemeCssVariableMap,
  buildThemeStyleText,
  type BuildThemeCssVariablesInput,
  type BuildThemeStyleTextInput,
  type ThemeCssVariableMap,
} from "./css-vars.js";
export {
  getThemeSurfaceHierarchyMetrics,
  type ThemeSurfaceHierarchyMetrics,
} from "./surface-hierarchy.js";
export { getThemeTightnessMetrics, type ThemeTightnessMetrics } from "./tightness.js";
export * from "./types.js";
export {
  cyberpunkTheme,
  draculaTheme,
  grandpaTheme,
  graphiteTheme,
  mainSequenceTheme,
  mainSequenceSpaceTheme,
  neonMintTheme,
  pandaTruenoTheme,
  quartzLightTheme,
  sakuraTheme,
} from "./presets/index.js";

import {
  cyberpunkTheme,
  draculaTheme,
  grandpaTheme,
  graphiteTheme,
  mainSequenceTheme,
  mainSequenceSpaceTheme,
  neonMintTheme,
  pandaTruenoTheme,
  quartzLightTheme,
  sakuraTheme,
} from "./presets/index.js";

export const commandCenterThemes = [
  mainSequenceSpaceTheme,
  mainSequenceTheme,
  cyberpunkTheme,
  neonMintTheme,
  draculaTheme,
  grandpaTheme,
  graphiteTheme,
  pandaTruenoTheme,
  sakuraTheme,
  quartzLightTheme,
] as const;

export function resolveCommandCenterThemeById(themeId: string) {
  return commandCenterThemes.find((theme) => theme.id === themeId);
}
