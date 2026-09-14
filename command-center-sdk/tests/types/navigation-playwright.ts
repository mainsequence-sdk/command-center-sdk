import type { Page } from "@playwright/test";

import {
  assertCommandCenterApplicationShell,
  type CommandCenterApplicationShellBrowserPage,
} from "../../src/navigation/testing/index.js";

declare const playwrightPage: Page;

const compatiblePage: CommandCenterApplicationShellBrowserPage = playwrightPage;

void assertCommandCenterApplicationShell(compatiblePage, {
  navigationDepth: 1,
  phase: "ready",
});
void assertCommandCenterApplicationShell(playwrightPage, {
  navigationDepth: 2,
  phase: "startup",
});
