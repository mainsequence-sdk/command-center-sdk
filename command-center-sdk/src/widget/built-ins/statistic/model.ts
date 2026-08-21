import { normalizeTabularFrameSource, type TabularFrameSourceV1 } from "../../../contracts/index.js";
import type { ResolvedWidgetInput, ResolvedWidgetInputs } from "../../index.js";

export type StatisticMode = "count" | "last" | "first" | "max" | "min" | "sum" | "mean";
export interface StatisticWidgetProps extends Record<string, unknown> {
  statisticSourceMode?: "bound" | "connection" | "connection-stream";
  sourceMode?: "direct" | "filter_widget" | "manual";
  statisticMode?: StatisticMode;
  valueField?: string;
  valueFieldLabel?: string;
  groupField?: string;
  orderField?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  columnCount?: number;
  showSourceLabel?: boolean;
}
export interface StatisticCard { id: string; label?: string; value: number | string | null; formattedValue: string }

function validInput(value: ResolvedWidgetInput | ResolvedWidgetInput[] | undefined) {
  return Array.isArray(value) ? value.find((entry) => entry.status === "valid") : value;
}

export function resolveStatisticFrame(inputs?: ResolvedWidgetInputs): TabularFrameSourceV1 | null {
  const input = validInput(inputs?.liveUpdates) ?? validInput(inputs?.seedData) ?? validInput(inputs?.sourceData);
  return normalizeTabularFrameSource(input?.upstreamBase ?? input?.value);
}

function numeric(values: unknown[]): number[] {
  return values.map(Number).filter(Number.isFinite);
}

function aggregate(rows: Array<Record<string, unknown>>, props: StatisticWidgetProps): number | string | null {
  if (props.statisticMode === "count") return rows.length;
  const ordered = props.orderField ? [...rows].sort((a, b) => String(a[props.orderField!]).localeCompare(String(b[props.orderField!]))) : rows;
  const values = ordered.map((row) => props.valueField ? row[props.valueField] : undefined);
  if (props.statisticMode === "first") return values[0] as string | number | null ?? null;
  if (!props.statisticMode || props.statisticMode === "last") return values.at(-1) as string | number | null ?? null;
  const numbers = numeric(values);
  if (numbers.length === 0) return null;
  if (props.statisticMode === "sum") return numbers.reduce((sum, value) => sum + value, 0);
  if (props.statisticMode === "mean") return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (props.statisticMode === "min") return Math.min(...numbers);
  return Math.max(...numbers);
}

function format(value: number | string | null, props: StatisticWidgetProps): string {
  if (value == null) return "—";
  const formatted = typeof value === "number" ? value.toLocaleString(undefined, { minimumFractionDigits: props.decimals, maximumFractionDigits: props.decimals }) : String(value);
  return `${props.prefix ?? ""}${formatted}${props.suffix ?? ""}`;
}

export function buildStatisticCards(frame: TabularFrameSourceV1 | null, props: StatisticWidgetProps): StatisticCard[] {
  if (!frame || frame.status === "error" || frame.status === "loading") return [];
  const groups = new Map<string, Array<Record<string, unknown>>>();
  if (props.groupField) {
    frame.rows.forEach((row) => {
      const key = String(row[props.groupField!] ?? "Unspecified");
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });
  } else {
    groups.set("value", frame.rows);
  }
  return [...groups].map(([id, rows]) => {
    const value = aggregate(rows, props);
    return { id, label: props.groupField ? id : props.valueFieldLabel ?? props.valueField, value, formattedValue: format(value, props) };
  });
}
