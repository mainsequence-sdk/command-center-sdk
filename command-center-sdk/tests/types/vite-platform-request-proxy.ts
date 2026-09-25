import type { PluginOption, UserConfig } from "vite";

import { platformRequestProxy } from "../../src/vite/index.js";

// The plugin goes in a Vite configuration's plugins as it is.
const plugin: PluginOption = platformRequestProxy();
const config: UserConfig = { plugins: [platformRequestProxy({ path: "/__mainsequence__" })] };

// @ts-expect-error The path is a string.
platformRequestProxy({ path: 1 });

void plugin;
void config;
