import { defineExtension } from "../index.js";

import { markdownNoteWidgetModule } from "./markdown/definition.js";
import { statisticWidgetModule } from "./statistic/definition.js";
import { appComponentWidgetModule } from "./app-component/definition.js";
import { tabularTransformWidgetModule } from "./tabular-transform/definition.js";
import { tableWidgetModule } from "./table/table/definition.js";
import { proTableWidgetModule } from "./table/pro-table/definition.js";

export * from "./app-component/index.js";
export * from "./markdown/definition.js";
export * from "./markdown/MarkdownWidget.js";
export * from "./statistic/definition.js";
export * from "./statistic/model.js";
export * from "./statistic/StatisticWidget.js";
export * from "./table/index.js";
export * from "./tabular-transform/index.js";

export const coreWidgetsExtension = defineExtension({
  id: "core-widgets",
  title: "Command Center Core Widgets",
  packageName: "@dev-mainsequence/command-center-sdk",
  packageVersion: "0.1.0",
  widgets: [
    markdownNoteWidgetModule,
    statisticWidgetModule,
    appComponentWidgetModule,
    tabularTransformWidgetModule,
    tableWidgetModule,
    proTableWidgetModule,
  ],
});
