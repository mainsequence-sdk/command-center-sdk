import { Table2 } from "lucide-react";

import {
  CORE_PRO_TABLE_WIDGET_ID,
  CORE_TABLE_WIDGET_ID,
  CORE_TABULAR_FRAME_SOURCE_CONTRACT,
  CORE_VALUE_JSON_CONTRACT,
  TABLE_WIDGET_ACTIVE_CELL_OUTPUT_ID,
  TABLE_WIDGET_ACTIVE_CELL_VALUE_OUTPUT_ID,
  TABLE_WIDGET_ACTIVE_ROW_OUTPUT_ID,
  TABLE_WIDGET_AUTHORING_CONTRACT,
  TABLE_WIDGET_AUTHORING_SCHEMA_ID,
  TABLE_WIDGET_DATASET_OUTPUT_ID,
  TABLE_WIDGET_SELECTED_CELL_VALUES_OUTPUT_ID,
  TABLE_WIDGET_SELECTED_ROWS_OUTPUT_ID,
  TABULAR_FRAME_SOURCE_VALUE_DESCRIPTOR,
  type TableWidgetEdition,
  type TableWidgetProps,
} from "../../../../contracts/index.js";
import {
  defineWidgetModule,
  resolveWidgetDescription,
  resolveWidgetUsageGuidance,
} from "../../../index.js";

import {
  buildPortableTableAgentSnapshot,
  createTableWidgetSettingsComponent,
  TableWidget,
} from "./TableWidget.js";
import {
  proTableWidgetDefaultProps,
  resolveTableWidgetActiveCellOutput,
  resolveTableWidgetActiveCellValueOutput,
  resolveTableWidgetActiveRowOutput,
  resolveTableWidgetDatasetOutput,
  resolveTableWidgetSelectedCellValuesOutput,
  resolveTableWidgetSelectedRowsOutput,
  tableWidgetDefaultProps,
  TABLE_WIDGET_LIVE_UPDATES_INPUT_ID,
  TABLE_WIDGET_SEED_INPUT_ID,
} from "./model.js";
import { tableWidgetUsageGuidance } from "../usage-guidance.js";

const tableWidgetTags = ["tabular", "grid", "formatter", "table", "selection"];
const jsonValueDescriptor = {
  kind: "unknown",
  contract: CORE_VALUE_JSON_CONTRACT,
  description: "JSON value derived from table interaction runtime state.",
} as const;
const jsonValueArrayDescriptor = {
  kind: "array",
  contract: CORE_VALUE_JSON_CONTRACT,
  description: "Ordered JSON values derived from selected table cells.",
  items: jsonValueDescriptor,
} as const;

export const tableWidgetDemoProps: TableWidgetProps = {
  ...tableWidgetDefaultProps,
  tableSourceMode: "manual",
  manualColumns: [
    { key: "symbol", type: "string" },
    { key: "price", type: "number" },
    { key: "status", type: "string" },
  ],
  manualRows: [
    { symbol: "ALPHA", price: 42.5, status: "Ready" },
    { symbol: "BETA", price: 17.25, status: "Watch" },
  ],
  schema: [
    { key: "symbol", label: "Symbol", format: "text" },
    { key: "price", label: "Price", format: "number", decimals: 2 },
    { key: "status", label: "Status", format: "text" },
  ],
};

export const proTableWidgetDemoProps: TableWidgetProps = {
  ...proTableWidgetDefaultProps,
  ...tableWidgetDemoProps,
  formulasEnabled: true,
  manualColumns: [
    { key: "symbol", type: "string" },
    { key: "last", type: "number" },
    { key: "open", type: "number" },
  ],
  manualRows: [
    { symbol: "ALPHA", last: 105, open: 100 },
    { symbol: "BETA", last: 48, open: 50 },
  ],
  schema: [
    { key: "symbol", label: "Symbol", format: "text" },
    { key: "last", label: "Last", format: "number", decimals: 2 },
    { key: "open", label: "Open", format: "number", decimals: 2 },
    {
      key: "changePct",
      label: "Change %",
      format: "formula",
      formulaExpression: "PERCENT_CHANGE([last], [open])",
      formulaResultFormat: "percent",
      decimals: 2,
    },
  ],
};

export interface TableModuleOptions {
  edition: TableWidgetEdition;
  id: typeof CORE_TABLE_WIDGET_ID | typeof CORE_PRO_TABLE_WIDGET_ID;
  title: string;
  widgetVersion: string;
  supportsFormulas: boolean;
  props: TableWidgetProps;
}

export function defineTableWidgetModule(options: TableModuleOptions) {
  const settingsComponent = createTableWidgetSettingsComponent({
    supportsFormulas: options.supportsFormulas,
  });
  return defineWidgetModule<TableWidgetProps>({
    manifest: {
      id: options.id,
      widgetVersion: options.widgetVersion,
      title: options.title,
      description: resolveWidgetDescription(
        tableWidgetUsageGuidance,
        options.edition === "pro" ? "pro-table" : "table",
      ),
      category: "Core",
      kind: "table",
      source: "core",
      requiredPermissions: ["workspaces:view"],
      tags: [
        ...tableWidgetTags,
        options.edition,
        ...(options.edition === "pro" ? ["enterprise", "formula"] : []),
      ],
      propsSchema: { $ref: `${TABLE_WIDGET_AUTHORING_SCHEMA_ID}#/$defs/props` },
      propsVersion: 1,
      userStateVersion: 1,
      workspaceRuntimeMode: "consumer",
      registryContract: {
        configuration: {
          mode: "custom-settings",
          summary: options.supportsFormulas
            ? "Authors an Enterprise-capable table with shared canonical IO and optional formula columns."
            : "Authors a reusable Community table for bound or manual canonical tabular data.",
          requiredSetupSteps: [
            "Bind seedData to a canonical tabular dataset or choose manual rows.",
            "Configure columns, formatting, controls, and selection.",
            ...(options.supportsFormulas
              ? ["Optionally add formula columns with bracketed field references."]
              : []),
          ],
        },
        runtime: {
          refreshPolicy: "not-applicable",
          executionTriggers: [],
          executionSummary: "Consumes upstream data or saved manual rows without owning backend execution.",
        },
        io: {
          mode: "static",
          summary: "Consumes canonical tabular frames and publishes the dataset plus optional selection outputs.",
          inputContracts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
          outputContracts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT, CORE_VALUE_JSON_CONTRACT],
          ioNotes: [
            "Display-only formatting does not mutate dataset.",
            "Table and Pro Table share the same input and output port IDs.",
          ],
        },
        capabilities: {
          authoringContract: TABLE_WIDGET_AUTHORING_CONTRACT,
          gridEdition: options.edition === "pro" ? "enterprise" : "community",
          acceptedContracts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
          publishesContract: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
          supportedSourceModes: ["bound", "manual"],
          hostExtensionSourceModes: ["connection", "connection-stream"],
          formulas: options.supportsFormulas ? ["columnLevelFormulas", "settingsOnlyAuthoring"] : [],
          interactionOutputs: [
            TABLE_WIDGET_SELECTED_ROWS_OUTPUT_ID,
            TABLE_WIDGET_ACTIVE_ROW_OUTPUT_ID,
            TABLE_WIDGET_ACTIVE_CELL_OUTPUT_ID,
            TABLE_WIDGET_ACTIVE_CELL_VALUE_OUTPUT_ID,
            TABLE_WIDGET_SELECTED_CELL_VALUES_OUTPUT_ID,
          ],
        },
        usageGuidance: resolveWidgetUsageGuidance(
          tableWidgetUsageGuidance,
          options.edition === "pro" ? "pro-table" : "table",
        ),
        examples: [{
          label: `${options.title} manual rows`,
          summary: "Renders a JSON-safe manual table without a host data source.",
          props: options.props,
        }],
      },
    },
    runtime: {
      definition: {
        exampleProps: options.edition === "pro" ? proTableWidgetDefaultProps : tableWidgetDefaultProps,
        mockProps: options.props,
        io: {
          inputs: [
            {
              id: TABLE_WIDGET_SEED_INPUT_ID,
              label: "Seed data",
              accepts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
              acceptedOutputIds: ["dataset"],
              effects: [{
                kind: "drives-render",
                sourcePath: "rows",
                target: { kind: "render", id: options.id },
              }],
            },
            {
              id: TABLE_WIDGET_LIVE_UPDATES_INPUT_ID,
              label: "Live updates",
              accepts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
              acceptedOutputIds: ["updates"],
              effects: [{
                kind: "drives-render",
                sourcePath: "rows",
                target: { kind: "render", id: options.id },
              }],
            },
          ],
          outputs: [
            {
              id: TABLE_WIDGET_DATASET_OUTPUT_ID,
              label: "Dataset",
              contract: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
              valueDescriptor: TABULAR_FRAME_SOURCE_VALUE_DESCRIPTOR,
              resolveValue: ({ props, resolvedInputs }) =>
                resolveTableWidgetDatasetOutput(props, resolvedInputs),
            },
            {
              id: TABLE_WIDGET_SELECTED_ROWS_OUTPUT_ID,
              label: "Selected rows",
              contract: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
              valueDescriptor: TABULAR_FRAME_SOURCE_VALUE_DESCRIPTOR,
              resolveValue: ({ props, resolvedInputs, runtimeState }) =>
                resolveTableWidgetSelectedRowsOutput(props, resolvedInputs, runtimeState),
            },
            {
              id: TABLE_WIDGET_ACTIVE_ROW_OUTPUT_ID,
              label: "Active row",
              contract: CORE_VALUE_JSON_CONTRACT,
              valueDescriptor: jsonValueDescriptor,
              resolveValue: ({ props, resolvedInputs, runtimeState }) =>
                resolveTableWidgetActiveRowOutput(props, resolvedInputs, runtimeState),
            },
            {
              id: TABLE_WIDGET_ACTIVE_CELL_OUTPUT_ID,
              label: "Active cell",
              contract: CORE_VALUE_JSON_CONTRACT,
              valueDescriptor: jsonValueDescriptor,
              resolveValue: ({ props, runtimeState }) =>
                resolveTableWidgetActiveCellOutput(props, runtimeState),
            },
            {
              id: TABLE_WIDGET_ACTIVE_CELL_VALUE_OUTPUT_ID,
              label: "Active cell value",
              contract: CORE_VALUE_JSON_CONTRACT,
              valueDescriptor: jsonValueDescriptor,
              resolveValue: ({ props, runtimeState }) =>
                resolveTableWidgetActiveCellValueOutput(props, runtimeState),
            },
            {
              id: TABLE_WIDGET_SELECTED_CELL_VALUES_OUTPUT_ID,
              label: "Selected cell values",
              contract: CORE_VALUE_JSON_CONTRACT,
              valueDescriptor: jsonValueArrayDescriptor,
              resolveValue: ({ props, runtimeState }) =>
                resolveTableWidgetSelectedCellValuesOutput(props, runtimeState),
            },
          ],
        },
        workspaceIcon: Table2,
        buildAgentSnapshot: ({ props, resolvedInputs }) =>
          buildPortableTableAgentSnapshot({ props, resolvedInputs }),
        settingsComponent,
        component: TableWidget,
      },
    },
  });
}

export const tableWidgetAuthoringContract = {
  contract: TABLE_WIDGET_AUTHORING_CONTRACT,
  schemaId: TABLE_WIDGET_AUTHORING_SCHEMA_ID,
  widgetIds: [CORE_TABLE_WIDGET_ID, CORE_PRO_TABLE_WIDGET_ID],
  inputPorts: [TABLE_WIDGET_SEED_INPUT_ID, TABLE_WIDGET_LIVE_UPDATES_INPUT_ID],
  outputPorts: [
    TABLE_WIDGET_DATASET_OUTPUT_ID,
    TABLE_WIDGET_SELECTED_ROWS_OUTPUT_ID,
    TABLE_WIDGET_ACTIVE_ROW_OUTPUT_ID,
    TABLE_WIDGET_ACTIVE_CELL_OUTPUT_ID,
    TABLE_WIDGET_ACTIVE_CELL_VALUE_OUTPUT_ID,
    TABLE_WIDGET_SELECTED_CELL_VALUES_OUTPUT_ID,
  ],
} as const;

export { CORE_PRO_TABLE_WIDGET_ID, CORE_TABLE_WIDGET_ID } from "../../../../contracts/index.js";
export type { TableWidgetProps } from "../../../../contracts/index.js";
