import { useMemo, useState } from "react";
import { Shuffle } from "lucide-react";

import type { WidgetComponentProps, WidgetSettingsComponentProps } from "../../index.js";
import {
  formatFieldListText,
  formatTabularTransformSummary,
  normalizeTabularTransformProps,
  parseFieldListText,
  resolveTabularTransformOutput,
  type TabularFilterRule,
  type TabularTransformComputedColumnConfig,
  type TabularTransformMode,
  type TabularTransformWidgetProps,
} from "./model.js";

function JsonArrayEditor<T>({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: T[]) => void;
  value: T[] | undefined;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? [], null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <label>
      <span>{label}</span>
      <textarea
        disabled={disabled}
        rows={6}
        value={text}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setText(next);
          try {
            const parsed = JSON.parse(next) as unknown;
            if (!Array.isArray(parsed)) throw new Error("Enter a JSON array.");
            setError(null);
            onChange(parsed as T[]);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Enter valid JSON.");
          }
        }}
      />
      {error ? <small className="cc-core-widget__error">{error}</small> : null}
    </label>
  );
}

export function TabularTransformWidget({
  props,
  resolvedInputs,
  runtimeDataStore,
  runtimeState,
}: WidgetComponentProps<TabularTransformWidgetProps>) {
  const frame = useMemo(() => resolveTabularTransformOutput({
    props,
    resolvedInputs,
    runtimeDataStore,
    runtimeState,
  }), [props, resolvedInputs, runtimeDataStore, runtimeState]);

  if (frame.status === "error") {
    return <div className="cc-core-widget cc-core-widget__empty cc-core-widget__error">{frame.error}</div>;
  }
  if (frame.status !== "ready") {
    return <div className="cc-core-widget cc-core-widget__empty">Bind one tabular source to run this transform.</div>;
  }
  return (
    <div className="cc-core-widget cc-core-transform">
      <header className="cc-core-transform__header">
        <Shuffle size={18} aria-hidden="true" />
        <strong>{formatTabularTransformSummary(props)}</strong>
        <span>{frame.rows.length.toLocaleString()} rows</span>
      </header>
      <div className="cc-core-transform__viewport">
        <table>
          <thead><tr>{frame.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {frame.rows.slice(0, 50).map((row, index) => (
              <tr key={index}>{frame.columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TabularTransformWidgetSettings({
  draftProps,
  editable,
  onDraftPropsChange,
}: WidgetSettingsComponentProps<TabularTransformWidgetProps>) {
  const props = normalizeTabularTransformProps(draftProps);
  const update = (patch: Partial<TabularTransformWidgetProps>) => onDraftPropsChange({
    ...draftProps,
    ...patch,
  });
  return (
    <div className="cc-core-widget__settings">
      <label>
        <span>Transform mode</span>
        <select
          disabled={!editable}
          value={props.transformMode}
          onChange={(event) => update({ transformMode: event.currentTarget.value as TabularTransformMode })}
        >
          <option value="none">Pass through</option>
          <option value="filter">Filter</option>
          <option value="aggregate">Aggregate</option>
          <option value="pivot">Pivot</option>
          <option value="unpivot">Unpivot</option>
        </select>
      </label>
      {props.transformMode === "aggregate" ? (
        <label>
          <span>Aggregate mode</span>
          <select disabled={!editable} value={props.aggregateMode} onChange={(event) => update({ aggregateMode: event.currentTarget.value as TabularTransformWidgetProps["aggregateMode"] })}>
            {['first', 'last', 'sum', 'mean', 'min', 'max'].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </label>
      ) : null}
      <label>
        <span>Key fields</span>
        <input disabled={!editable} value={formatFieldListText(props.keyFields)} onChange={(event) => update({ keyFields: parseFieldListText(event.currentTarget.value) })} />
      </label>
      {props.transformMode === "pivot" ? <>
        <label><span>Pivot field</span><input disabled={!editable} value={props.pivotField ?? ""} onChange={(event) => update({ pivotField: event.currentTarget.value })} /></label>
        <label><span>Pivot value field</span><input disabled={!editable} value={props.pivotValueField ?? ""} onChange={(event) => update({ pivotValueField: event.currentTarget.value })} /></label>
      </> : null}
      {props.transformMode === "unpivot" ? (
        <label><span>Unpivot value fields</span><input disabled={!editable} value={formatFieldListText(props.unpivotValueFields)} onChange={(event) => update({ unpivotValueFields: parseFieldListText(event.currentTarget.value) })} /></label>
      ) : null}
      {props.transformMode === "filter" ? (
        <JsonArrayEditor<TabularFilterRule> disabled={!editable} label="Filter rules" value={props.filterRules} onChange={(filterRules) => update({ filterRules })} />
      ) : null}
      <JsonArrayEditor<TabularTransformComputedColumnConfig> disabled={!editable} label="Computed columns" value={props.computedColumns} onChange={(computedColumns) => update({ computedColumns })} />
      <label>
        <span>Published fields</span>
        <input disabled={!editable} value={formatFieldListText(props.projectFields)} onChange={(event) => update({ projectFields: parseFieldListText(event.currentTarget.value) })} />
      </label>
    </div>
  );
}
