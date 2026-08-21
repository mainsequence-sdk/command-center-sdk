import { useMemo, useState } from "react";

import type {
  TableWidgetProps,
  TableWidgetSelectionMode,
  TableWidgetSelectionState,
} from "../../../../contracts/index.js";
import type { WidgetComponentProps, WidgetSettingsComponentProps } from "../../../index.js";

import {
  buildTableWidgetSelectionState,
  getTableWidgetSelectionState,
  resolveTableWidgetFrame,
} from "./model.js";

function displayValue(value: unknown, props: TableWidgetProps, columnKey: string) {
  if (value === null || value === undefined) return "—";
  const override = props.columnOverrides?.[columnKey];
  const schema = props.schema?.find((column) => column.key === columnKey);
  const decimals = override?.decimals ?? schema?.decimals;
  if (typeof value === "number" && decimals !== undefined) {
    return `${override?.prefix ?? schema?.prefix ?? ""}${value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${override?.suffix ?? schema?.suffix ?? ""}`;
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function TableWidget({
  props,
  resolvedInputs,
  runtimeState,
  onRuntimeStateChange,
}: WidgetComponentProps<TableWidgetProps>) {
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const frame = resolveTableWidgetFrame(props, resolvedInputs);
  const columns = useMemo(
    () => (frame?.columns ?? []).filter((key) => props.columnOverrides?.[key]?.visible !== false),
    [frame?.columns, props.columnOverrides],
  );
  const rows = useMemo(() => {
    const source = (frame?.rows ?? []).map((row, sourceIndex) => ({ row, sourceIndex }));
    if (!query.trim()) return source;
    const needle = query.trim().toLowerCase();
    return source.filter(({ row }) =>
      columns.some((column) => String(row[column] ?? "").toLowerCase().includes(needle)),
    );
  }, [columns, frame?.rows, query]);

  if (!frame) {
    return (
      <div className="cc-core-widget cc-core-widget__empty">
        Bind this table to a canonical tabular source or switch to manual rows.
      </div>
    );
  }
  if (frame.status === "error") {
    return (
      <div className="cc-core-widget cc-core-widget__empty">
        {frame.error ?? "The table source failed."}
      </div>
    );
  }
  if (frame.status === "loading") {
    return <div className="cc-core-widget cc-core-widget__empty">Loading table…</div>;
  }

  const selectionMode = props.selectionMode ?? "none";
  const selection = getTableWidgetSelectionState(runtimeState);
  const pageSize = props.pagination === false ? rows.length : Math.max(1, props.pageSize ?? 25);
  const pageCount = props.pagination === false ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const visiblePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleRows = props.pagination === false
    ? rows
    : rows.slice(visiblePageIndex * pageSize, (visiblePageIndex + 1) * pageSize);

  return (
    <div
      className={`cc-core-widget cc-core-table cc-core-table--${props.density ?? "comfortable"}`}
    >
      {props.showToolbar !== false && props.showSearch !== false ? (
        <div className="cc-core-table__toolbar">
          <input
            aria-label="Search table"
            placeholder="Search rows"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPageIndex(0);
            }}
          />
        </div>
      ) : null}
      <div className="cc-core-table__viewport">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>
                  {props.columnOverrides?.[column]?.label ??
                    props.schema?.find((entry) => entry.key === column)?.label ??
                    column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ row, sourceIndex }) => (
              <tr
                key={sourceIndex}
                data-selected={selection?.selectedRowIndices.includes(sourceIndex) || undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column}
                    onClick={() => {
                      if (!onRuntimeStateChange || selectionMode === "none") return;
                      const nextSelection = buildTableWidgetSelectionState({
                        columnKey: column,
                        current: selection,
                        mode: selectionMode,
                        row,
                        rowIndex: sourceIndex,
                        selectionKeyFields:
                          props.selectionKeyFields ?? props.uniqueIdentifierList,
                        value: row[column],
                      });
                      onRuntimeStateChange({
                        ...(runtimeState ?? {}),
                        interaction: { selection: nextSelection },
                      });
                    }}
                  >
                    {displayValue(row[column], props, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleRows.length === 0 ? (
        <div className="cc-core-widget__empty">No rows are available.</div>
      ) : null}
      {props.pagination !== false && rows.length > 0 ? (
        <div className="cc-core-table__pagination">
          <span>
            Page {visiblePageIndex + 1} of {pageCount}
          </span>
          <div>
            <button
              type="button"
              disabled={visiblePageIndex === 0}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={visiblePageIndex >= pageCount - 1}
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const selectionModes: TableWidgetSelectionMode[] = ["none", "single-row", "multi-row", "cell"];

export function createTableWidgetSettingsComponent(options: { supportsFormulas: boolean }) {
  return function TableWidgetSettings({
    draftProps,
    editable,
    onDraftPropsChange,
  }: WidgetSettingsComponentProps<TableWidgetProps>) {
    const update = (patch: Partial<TableWidgetProps>) =>
      onDraftPropsChange({ ...draftProps, ...patch });
    return (
      <div className="cc-core-widget__settings">
        <label>
          Source mode
          <select
            disabled={!editable}
            value={draftProps.tableSourceMode ?? "bound"}
            onChange={(event) => update({
              tableSourceMode: event.target.value as TableWidgetProps["tableSourceMode"],
            })}
          >
            <option value="bound">Bound dataset</option>
            <option value="manual">Manual rows</option>
          </select>
        </label>
        <label>
          Density
          <select
            disabled={!editable}
            value={draftProps.density ?? "comfortable"}
            onChange={(event) => update({
              density: event.target.value as TableWidgetProps["density"],
            })}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label>
          Page size
          <input
            disabled={!editable}
            type="number"
            min={1}
            max={1000}
            value={draftProps.pageSize ?? 25}
            onChange={(event) => update({
              pageSize: Math.max(1, Number(event.target.value) || 25),
            })}
          />
        </label>
        <label>
          Selection
          <select
            disabled={!editable}
            value={draftProps.selectionMode ?? "none"}
            onChange={(event) => update({
              selectionMode: event.target.value as TableWidgetSelectionMode,
              publishSelectionOutputs: event.target.value !== "none",
            })}
          >
            {selectionModes.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
        </label>
        {options.supportsFormulas ? (
          <label>
            <span>Formula authoring</span>
            <input
              disabled={!editable}
              type="checkbox"
              checked={draftProps.formulasEnabled !== false}
              onChange={(event) => update({ formulasEnabled: event.target.checked })}
            />
          </label>
        ) : null}
        <label>
          Manual rows (JSON)
          <textarea
            disabled={!editable || draftProps.tableSourceMode !== "manual"}
            rows={8}
            value={JSON.stringify(draftProps.manualRows ?? [], null, 2)}
            onChange={(event) => {
              try {
                const rows = JSON.parse(event.target.value);
                if (Array.isArray(rows)) update({ manualRows: rows });
              } catch {
                // Preserve the last valid draft while editing JSON.
              }
            }}
          />
        </label>
      </div>
    );
  };
}

export function buildPortableTableAgentSnapshot(input: {
  props: TableWidgetProps;
  resolvedInputs?: WidgetComponentProps<TableWidgetProps>["resolvedInputs"];
}) {
  const frame = resolveTableWidgetFrame(input.props, input.resolvedInputs);
  const columns = frame?.columns.filter((key) => input.props.columnOverrides?.[key]?.visible !== false) ?? [];
  return {
    displayKind: "table" as const,
    state: !frame ? "idle" as const : frame.status === "error" ? "error" as const : frame.status === "loading" ? "loading" as const : frame.rows.length ? "ready" as const : "empty" as const,
    summary: frame ? `${frame.rows.length.toLocaleString()} rows across ${columns.length.toLocaleString()} visible columns.` : "Table is waiting for a canonical tabular frame.",
    data: frame ? { widgetRole: "presentation", contentType: "table", rowCount: frame.rows.length, columnCount: columns.length, columns, rows: frame.rows.slice(0, 25) } : undefined,
  };
}
