import { CORE_TABLE_WIDGET_ID } from "../../../../contracts/index.js";

import {
  defineTableWidgetModule,
  tableWidgetDemoProps,
} from "../shared/definition-factory.js";

export const tableWidgetModule = defineTableWidgetModule({
  edition: "community",
  id: CORE_TABLE_WIDGET_ID,
  title: "Table",
  widgetVersion: "3.6.4",
  supportsFormulas: false,
  props: tableWidgetDemoProps,
});

export const tableWidget = tableWidgetModule.runtime.definition;

export { CORE_TABLE_WIDGET_ID } from "../../../../contracts/index.js";
export type { TableWidgetProps } from "../../../../contracts/index.js";
