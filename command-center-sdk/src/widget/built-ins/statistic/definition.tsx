import { Calculator } from "lucide-react";
import {
  CORE_TABULAR_FRAME_SOURCE_CONTRACT,
  type TabularFrameSourceV1,
} from "../../../contracts/index.js";
import { defineWidgetModule, resolveWidgetDescription, resolveWidgetUsageGuidance } from "../../index.js";

import { buildStatisticCards, resolveStatisticFrame, type StatisticWidgetProps } from "./model.js";
import { StatisticWidget, StatisticWidgetSettings } from "./StatisticWidget.js";
import { statisticWidgetUsageGuidance } from "./usage-guidance.js";

export const CORE_STATISTIC_WIDGET_ID = "core__statistic";
export const statisticDemoFrame: TabularFrameSourceV1 = { status: "ready", columns: ["curve", "yield", "updated_at"], rows: [{ curve: "USD", yield: 4.2, updated_at: "2026-01-01" }, { curve: "EUR", yield: 2.6, updated_at: "2026-01-01" }] };

export const statisticWidgetModule = defineWidgetModule<StatisticWidgetProps>({
  manifest: {
    id: CORE_STATISTIC_WIDGET_ID,
    widgetVersion: "3.0.3",
    title: "Statistic",
    description: resolveWidgetDescription(statisticWidgetUsageGuidance),
    category: "Core",
    kind: "custom",
    source: "core",
    requiredPermissions: ["workspaces:view"],
    tags: ["tabular", "statistic", "kpi"],
    propsVersion: 1,
    userStateVersion: 1,
    workspaceRuntimeMode: "consumer",
    registryContract: {
      configuration: { mode: "custom-settings", summary: "Reduces a bound tabular dataset into statistic cards.", requiredSetupSteps: ["Bind an upstream tabular dataset.", "Choose a statistic mode and value field."] },
      runtime: { refreshPolicy: "not-applicable", executionTriggers: [], executionSummary: "Consumes upstream data without owning execution." },
      io: { mode: "consumer", summary: "Consumes canonical tabular frames." },
      capabilities: { acceptedContracts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT], supportedStatisticModes: ["last", "first", "sum", "mean", "min", "max", "count"], supportsSingleFieldGrouping: true, supportsColumnCount: true, supportsOrderField: true, supportsPrefixSuffixFormatting: true },
      usageGuidance: resolveWidgetUsageGuidance(statisticWidgetUsageGuidance),
    },
  },
  runtime: {
    definition: {
      exampleProps: { statisticSourceMode: "bound", statisticMode: "last" },
      mockProps: { statisticSourceMode: "bound", statisticMode: "last", valueField: "yield", groupField: "curve", suffix: "%", decimals: 2, columnCount: 2 },
      mockResolvedInputs: { seedData: { inputId: "seedData", label: "Seed data", status: "valid", contractId: CORE_TABULAR_FRAME_SOURCE_CONTRACT, value: statisticDemoFrame } },
      io: { inputs: [
        { id: "seedData", label: "Seed data", accepts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT], acceptedOutputIds: ["dataset"], effects: [{ kind: "drives-render", sourcePath: "rows", target: { kind: "render", id: "statistic-cards" } }] },
        { id: "liveUpdates", label: "Live updates", accepts: [CORE_TABULAR_FRAME_SOURCE_CONTRACT], acceptedOutputIds: ["updates"], effects: [{ kind: "drives-render", sourcePath: "rows", target: { kind: "render", id: "statistic-cards" } }] },
      ] },
      workspaceIcon: Calculator,
      buildAgentSnapshot: ({ props, resolvedInputs }) => { const cards = buildStatisticCards(resolveStatisticFrame(resolvedInputs), props); return { displayKind: "custom", state: cards.length ? "ready" : "idle", summary: cards.length ? `${cards.length} statistic cards are available.` : "Statistic is waiting for data.", data: { cards } }; },
      settingsComponent: StatisticWidgetSettings,
      component: StatisticWidget,
    },
  },
});

export const statisticWidget = statisticWidgetModule.runtime.definition;
