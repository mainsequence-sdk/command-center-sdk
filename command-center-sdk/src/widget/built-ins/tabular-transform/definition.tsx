import { Shuffle } from "lucide-react";

import {
  CORE_TABULAR_FRAME_SOURCE_CONTRACT,
  CORE_TABULAR_TRANSFORM_WIDGET_ID,
  TABULAR_TRANSFORM_AUTHORING_SCHEMA_ID,
  TABULAR_FRAME_SOURCE_VALUE_DESCRIPTOR,
  projectWidgetRuntimeUpdateOutput,
} from "../../../contracts/index.js";
import {
  defineWidgetModule,
  resolveWidgetDescription,
  resolveWidgetUsageGuidance,
} from "../../index.js";
import { TabularTransformWidget, TabularTransformWidgetSettings } from "./TabularTransformWidget.js";
import {
  TABULAR_TRANSFORM_DATASET_OUTPUT_ID,
  TABULAR_TRANSFORM_LIVE_INPUT_ID,
  TABULAR_TRANSFORM_SEED_INPUT_ID,
  TABULAR_TRANSFORM_UPDATES_OUTPUT_ID,
  normalizeTabularTransformProps,
  resolveTabularTransformChannelOutput,
  resolveTabularTransformOutput,
  type TabularTransformWidgetProps,
} from "./model.js";
import { tabularTransformWidgetUsageGuidance } from "./usage-guidance.js";

export { CORE_TABULAR_TRANSFORM_WIDGET_ID } from "../../../contracts/index.js";

export const tabularTransformWidgetModule = defineWidgetModule<TabularTransformWidgetProps>({
  manifest: {
    id: CORE_TABULAR_TRANSFORM_WIDGET_ID,
    widgetVersion: "1.3.5",
    title: "Tabular Transform",
    description: resolveWidgetDescription(tabularTransformWidgetUsageGuidance),
    category: "Core",
    kind: "custom",
    source: "core",
    requiredPermissions: ["workspaces:view"],
    tags: ["tabular", "transform", "filter", "aggregate", "pivot", "unpivot", "projection", "formula"],
    propsSchema: { $ref: `${TABULAR_TRANSFORM_AUTHORING_SCHEMA_ID}#/$defs/props` },
    propsVersion: 1,
    userStateVersion: 1,
    workspaceRuntimeMode: "execution-owner",
    registryContract: {
      configuration: {
        mode: "custom-settings",
        summary: "Configures a sidebar-only transform over one canonical tabular seed or live-update input.",
        requiredSetupSteps: [
          "Bind either seedData or liveUpdates, but not both.",
          "Select and configure a transform mode.",
          "Bind downstream consumers to the output matching the active source role.",
        ],
        configurationNotes: [
          "Computed columns run after the selected transform and before projection.",
          "The active output is dataset for seedData and updates for liveUpdates.",
        ],
      },
      runtime: {
        refreshPolicy: "allow-refresh",
        executionTriggers: ["dashboard-refresh", "manual-recalculate", "upstream-update"],
        executionSummary: "Transforms the resolved upstream frame and publishes the resulting runtime-state frame.",
      },
      io: {
        mode: "static",
        summary: "Consumes one canonical tabular source role and publishes the matching transformed output channel.",
        inputContracts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
        outputContracts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
      },
      capabilities: {
        acceptedContracts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
        publishesContract: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
        supportedTransformModes: ["none", "filter", "aggregate", "pivot", "unpivot"],
        supportedAggregateModes: ["first", "last", "sum", "mean", "min", "max"],
        supportsComputedColumns: true,
        supportsLatestRowMerge: true,
        supportsProjection: true,
      },
      usageGuidance: resolveWidgetUsageGuidance(tabularTransformWidgetUsageGuidance),
      examples: [{
        label: "Aggregate rows",
        summary: "Groups rows by category and publishes mean values.",
        props: { transformMode: "aggregate", aggregateMode: "mean", keyFields: ["category"] },
      }],
    },
  },
  runtime: {
    definition: {
      exampleProps: { transformMode: "none", aggregateMode: "last" },
      mockProps: {
        transformMode: "aggregate",
        aggregateMode: "mean",
        keyFields: ["category"],
        computedColumns: [{ key: "value_x10", label: "Value x10", type: "number", formulaExpression: "[value] * 10" }],
      },
      mockResolvedInputs: {
        [TABULAR_TRANSFORM_SEED_INPUT_ID]: {
          inputId: TABULAR_TRANSFORM_SEED_INPUT_ID,
          label: "Seed data",
          status: "valid",
          contractId: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
          sourceWidgetId: "preview-source",
          sourceOutputId: "dataset",
          value: {
            status: "ready",
            columns: ["category", "value"],
            rows: [
              { category: "A", value: 1 },
              { category: "A", value: 3 },
              { category: "B", value: 8 },
            ],
          },
        },
      },
      defaultPresentation: { placementMode: "sidebar" },
      fixedPlacementMode: "sidebar",
      workspaceIcon: Shuffle,
      io: {
        inputs: [
          {
            id: TABULAR_TRANSFORM_SEED_INPUT_ID,
            label: "Seed data",
            accepts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
            acceptedOutputIds: [TABULAR_TRANSFORM_DATASET_OUTPUT_ID],
            effects: [{ kind: "drives-render", sourcePath: "rows", target: { kind: "render", id: "transform" } }],
          },
          {
            id: TABULAR_TRANSFORM_LIVE_INPUT_ID,
            label: "Live updates",
            accepts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT],
            acceptedOutputIds: [TABULAR_TRANSFORM_UPDATES_OUTPUT_ID],
            effects: [{ kind: "drives-render", sourcePath: "rows", target: { kind: "render", id: "transform" } }],
          },
        ],
        outputs: [
          {
            id: TABULAR_TRANSFORM_DATASET_OUTPUT_ID,
            label: "Dataset",
            contract: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
            valueDescriptor: TABULAR_FRAME_SOURCE_VALUE_DESCRIPTOR,
            resolveValue: ({ props, resolvedInputs, runtimeDataStore, runtimeState }) =>
              resolveTabularTransformChannelOutput({
                outputChannel: "dataset",
                props,
                resolvedInputs,
                runtimeDataStore,
                runtimeState,
              }),
          },
          {
            id: TABULAR_TRANSFORM_UPDATES_OUTPUT_ID,
            label: "Live updates",
            contract: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
            valueDescriptor: TABULAR_FRAME_SOURCE_VALUE_DESCRIPTOR,
            resolveValue: ({ props, resolvedInputs, runtimeDataStore, runtimeState }) =>
              projectWidgetRuntimeUpdateOutput(
                resolveTabularTransformChannelOutput({
                  outputChannel: "updates",
                  props,
                  resolvedInputs,
                  runtimeDataStore,
                  runtimeState,
                }),
                {
                  outputContractId: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
                  sourceOutputId: TABULAR_TRANSFORM_UPDATES_OUTPUT_ID,
                },
              ),
          },
        ],
      },
      execution: {
        getExecutionReadiness: (context) => {
          const output = resolveTabularTransformOutput({
            props: normalizeTabularTransformProps(context.targetOverrides?.props ?? context.props),
            resolvedInputs: context.resolvedInputs,
            runtimeDataStore: context.runtimeDataStore,
            runtimeState: context.targetOverrides?.runtimeState ?? context.runtimeState,
          });
          if (output.status === "error") return { status: "error", reason: output.error };
          if (output.status === "idle" || output.status === "loading") return { status: "waiting", reason: "Tabular Transform is waiting for one source frame." };
          return { status: "ready" };
        },
        execute: async (context) => {
          const output = resolveTabularTransformOutput({
            props: normalizeTabularTransformProps(context.targetOverrides?.props ?? context.props),
            resolvedInputs: context.resolvedInputs,
            runtimeDataStore: context.runtimeDataStore,
            runtimeState: context.targetOverrides?.runtimeState ?? context.runtimeState,
          });
          return output.status === "error"
            ? { status: "error", error: output.error, runtimeStatePatch: { ...output } }
            : { status: "success", runtimeStatePatch: { ...output } };
        },
        getRefreshPolicy: () => "allow-refresh",
        getExecutionKey: (context) => "tabular-transform:" + context.instanceId,
      },
      buildAgentSnapshot: ({ props, resolvedInputs, runtimeDataStore, runtimeState }) => {
        const output = resolveTabularTransformOutput({ props, resolvedInputs, runtimeDataStore, runtimeState });
        return {
          displayKind: "custom",
          state: output.status === "ready" ? "ready" : output.status === "error" ? "error" : "idle",
          summary: output.status === "ready"
            ? "Tabular Transform published " + output.rows.length.toLocaleString() + " rows."
            : output.error ?? "Tabular Transform is waiting for data.",
          data: { widgetRole: "transformer", status: output.status, rowCount: output.rows.length, columns: output.columns },
        };
      },
      settingsComponent: TabularTransformWidgetSettings,
      component: TabularTransformWidget,
    },
  },
});

export const tabularTransformWidget = tabularTransformWidgetModule.runtime.definition;
