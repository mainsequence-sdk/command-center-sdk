import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assertWidgetPreviewFixture, validateWidgetManifest } from "../testing/index.js";
import { tableWidgetUsageGuidance } from "./table/usage-guidance.js";

import {
  buildStatisticCards,
  buildTableWidgetSelectionState,
  appComponentWidgetModule,
  executePortableAppComponent,
  CORE_APP_COMPONENT_WIDGET_ID,
  CORE_PRO_TABLE_WIDGET_ID,
  CORE_TABLE_WIDGET_ID,
  CORE_TABULAR_TRANSFORM_WIDGET_ID,
  coreWidgetsExtension,
  markdownNoteWidgetModule,
  normalizeAppComponentProps,
  normalizeTabularTransformProps,
  proTableWidgetModule,
  resolveTableWidgetActiveCellOutput,
  resolveTableWidgetDatasetOutput,
  statisticDemoFrame,
  tabularTransformWidgetModule,
  tableWidgetDemoProps,
  tableWidgetModule,
  TableWidget,
} from "./index.js";

describe("core widget package", () => {
  it("contains independently authorable modules with complete previews", () => {
    expect(coreWidgetsExtension.widgets.map((widget) => widget.manifest.id)).toEqual([
      "core__markdown-note",
      "core__statistic",
      CORE_APP_COMPONENT_WIDGET_ID,
      CORE_TABULAR_TRANSFORM_WIDGET_ID,
      CORE_TABLE_WIDGET_ID,
      CORE_PRO_TABLE_WIDGET_ID,
    ]);
    coreWidgetsExtension.widgets.forEach((widget) => {
      expect(validateWidgetManifest(widget.manifest)).toEqual([]);
      expect(() => assertWidgetPreviewFixture(widget)).not.toThrow();
    });
  });

  it("executes Mock JSON inside AppComponent without a transport call", async () => {
    const result = await executePortableAppComponent({
      executionSurface: "private-dashboard",
      widgetId: CORE_APP_COMPONENT_WIDGET_ID,
      instanceId: "mock-app",
      reason: "manual-submit",
      props: appComponentWidgetModule.runtime.definition.mockProps ?? {},
    }, {
      execute: async () => { throw new Error("Mock JSON must not invoke transport."); },
    });

    expect(result.status).toBe("success");
    expect(result.runtimeStatePatch).toMatchObject({
      lastResponseStatus: 200,
      lastResponseBody: { ok: true, message: "Mock response" },
      publishedOutputs: { "response:body": { ok: true, message: "Mock response" } },
    });
  });

  it("keeps AppComponent and Tabular Transform authoring fixtures aligned with runtime normalization", () => {
    const appFixture = JSON.parse(readFileSync(
      new URL("../../../contracts/fixtures/valid/app-component-authoring-v1.mock-json.json", import.meta.url),
      "utf8",
    )) as { props: Record<string, unknown> };
    const transformFixture = JSON.parse(readFileSync(
      new URL("../../../contracts/fixtures/valid/tabular-transform-authoring-v1.filter.json", import.meta.url),
      "utf8",
    )) as { props: Record<string, unknown> };

    expect(normalizeAppComponentProps(appFixture.props)).toMatchObject(appFixture.props);
    expect(normalizeTabularTransformProps(transformFixture.props)).toMatchObject(transformFixture.props);
    expect(appComponentWidgetModule.manifest.propsSchema?.$ref).toContain("app-component-authoring:v1#/$defs/props");
    expect(tabularTransformWidgetModule.manifest.propsSchema?.$ref).toContain("tabular-transform-authoring:v1#/$defs/props");
  });

  it("ships a portable Tabular Transform execution owner", async () => {
    const result = await tabularTransformWidgetModule.runtime.definition.execution?.execute({
      executionSurface: "private-dashboard",
      widgetId: CORE_TABULAR_TRANSFORM_WIDGET_ID,
      instanceId: "transform",
      reason: "manual-recalculate",
      props: { transformMode: "filter", filterRules: [{ field: "active", value: true }] },
      resolvedInputs: {
        seedData: {
          inputId: "seedData",
          label: "Seed data",
          status: "valid",
          value: { status: "ready", columns: ["name", "active"], rows: [{ name: "A", active: true }, { name: "B", active: false }] },
        },
      },
    });
    expect(result).toMatchObject({ status: "success", runtimeStatePatch: { rows: [{ name: "A", active: true }] } });
  });

  it("reduces canonical tabular frames without application runtime imports", () => {
    expect(buildStatisticCards(statisticDemoFrame, { statisticMode: "last", valueField: "yield", groupField: "curve", decimals: 1 })).toEqual([
      { id: "USD", label: "USD", value: 4.2, formattedValue: "4.2" },
      { id: "EUR", label: "EUR", value: 2.6, formattedValue: "2.6" },
    ]);
  });

  it("publishes Markdown source through the legacy-compatible definition", () => {
    const output = markdownNoteWidgetModule.runtime.definition.io?.outputs?.[0]?.resolveValue?.({
      widgetId: "core__markdown-note",
      props: { content: "# Hello" },
    });
    expect(output).toBe("# Hello");
  });

  it("publishes portable manual tables and evaluates Pro Table formulas", () => {
    expect(resolveTableWidgetDatasetOutput(tableWidgetDemoProps).rows).toHaveLength(2);
    const output = proTableWidgetModule.runtime.definition.io?.outputs
      ?.find((entry) => entry.id === "dataset")
      ?.resolveValue?.({
        widgetId: CORE_PRO_TABLE_WIDGET_ID,
        props: proTableWidgetModule.runtime.definition.mockProps ?? {},
      });
    expect(output).toMatchObject({
      status: "ready",
      columns: ["symbol", "last", "open", "changePct"],
      rows: [{ changePct: 5 }, { changePct: -4 }],
    });
  });

  it("keeps executable Table guidance identical to the shipped human source", () => {
    const markdown = readFileSync(
      new URL("./table/USAGE_GUIDANCE.md", import.meta.url),
      "utf8",
    );
    expect(tableWidgetUsageGuidance.trim()).toBe(markdown.trim());
  });

  it("toggles portable multi-row selection and gates published interaction values", () => {
    const first = buildTableWidgetSelectionState({
      columnKey: "symbol",
      mode: "multi-row",
      row: { symbol: "ALPHA" },
      rowIndex: 0,
      selectionKeyFields: ["symbol"],
      value: "ALPHA",
    });
    const second = buildTableWidgetSelectionState({
      columnKey: "symbol",
      current: first,
      mode: "multi-row",
      row: { symbol: "ALPHA" },
      rowIndex: 0,
      selectionKeyFields: ["symbol"],
      value: "ALPHA",
    });

    expect(first.selectedRowIndices).toEqual([0]);
    expect(second.selectedRowIndices).toEqual([]);
    expect(resolveTableWidgetActiveCellOutput(
      { publishSelectionOutputs: false },
      { interaction: { selection: first } },
    )).toBeNull();
    expect(resolveTableWidgetActiveCellOutput(
      { publishSelectionOutputs: true },
      { interaction: { selection: first } },
    )).toMatchObject({ columnKey: "symbol", rowIndex: 0, value: "ALPHA" });
  });

  it("renders a usable portable Table page without host grid dependencies", () => {
    const html = renderToStaticMarkup(createElement(TableWidget, {
      widget: tableWidgetModule.runtime.definition,
      props: {
        ...tableWidgetDemoProps,
        pageSize: 1,
      },
    }));

    expect(html).toContain("Search rows");
    expect(html).toContain("ALPHA");
    expect(html).not.toContain("BETA");
    expect(html).toContain("Page 1 of 2");
    expect(html).toContain("Next");
  });
});
