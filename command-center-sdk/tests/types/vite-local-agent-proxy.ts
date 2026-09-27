import type { PluginOption, UserConfig } from "vite";

import { localAgentProxy, platformRequestProxy } from "../../src/vite/index.js";

// The plugin goes in a Vite configuration's plugins as it is, next to the platform proxy.
const plugin: PluginOption = localAgentProxy();
const config: UserConfig = {
  plugins: [platformRequestProxy(), localAgentProxy({ target: "http://127.0.0.1:8787", path: "/__agent__" })],
};

// @ts-expect-error The target is a string.
localAgentProxy({ target: 8787 });

void plugin;
void config;
