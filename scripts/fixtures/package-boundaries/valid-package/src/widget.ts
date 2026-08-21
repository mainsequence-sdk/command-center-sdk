import type { ThemePreset } from "@dev-mainsequence/command-center-sdk/theme";
import type { ComponentType } from "react";

import type { LocalProps } from "./model";

export type ValidWidgetFixture = {
  component: ComponentType<LocalProps>;
  theme: ThemePreset;
};
