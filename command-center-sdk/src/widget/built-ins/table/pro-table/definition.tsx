import { CORE_PRO_TABLE_WIDGET_ID } from "../../../../contracts/index.js";

import {
  defineTableWidgetModule,
  proTableWidgetDemoProps,
} from "../shared/definition-factory.js";

export const proTableWidgetModule = defineTableWidgetModule({
  edition: "pro",
  id: CORE_PRO_TABLE_WIDGET_ID,
  title: "Pro Table",
  widgetVersion: "1.1.4",
  supportsFormulas: true,
  props: proTableWidgetDemoProps,
});

export const proTableWidget = proTableWidgetModule.runtime.definition;

export { CORE_PRO_TABLE_WIDGET_ID } from "../../../../contracts/index.js";
export type { TableWidgetProps } from "../../../../contracts/index.js";
