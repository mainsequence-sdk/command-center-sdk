import type { Page } from "@playwright/test";

import {
  assertCommandCenterPageLayout,
  type CommandCenterLayoutBrowserPage,
} from "../../src/layout/testing/index.js";

declare const playwrightPage: Page;

const compatiblePage: CommandCenterLayoutBrowserPage = playwrightPage;

void assertCommandCenterPageLayout(compatiblePage);
void assertCommandCenterPageLayout(playwrightPage);
