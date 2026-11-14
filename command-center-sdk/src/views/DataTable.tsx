import { useSdkTranslation } from "../localization/react.js";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "../controls/index.js";

import { useCommandCenterViewport, type CommandCenterViewportState } from "../layout/viewport.js";
import {
  isResourceColumnVisibleAt,
  resolveResourceColumnImportance,
  type ResolvedResourceColumn,
} from "../resource/column-presentation.js";
import type {
  ResourceColumnDefinition,
  ResourceId,
  ResourceSort,
  ResourceSortDirection,
} from "../resource/types.js";
import { ResourcePicker } from "./ResourcePicker.js";
import { ResourceSelectionCheckbox } from "./ResourceSelectionCheckbox.js";

export interface ResourceRowAction<T> {
  id: string;
  label: string;
  disabled?: boolean | ((item: T) => boolean);
  tone?: "default" | "danger";
  onSelect: (item: T) => void;
}

/**
 * `table` is the desktop form. `stacked` renders each row as a card built from the same columns:
 * the primary column as the title, secondary columns as label/value pairs, tertiary columns
 * behind a disclosure, and row actions in an overflow menu. `auto` resolves to `stacked` below
 * the `sm` breakpoint.
 */
export type DataTablePresentation = "auto" | "stacked" | "table";
export type ResolvedDataTablePresentation = Exclude<DataTablePresentation, "auto">;

/** Presentation-only grouping of the supplied page; never narrows selection or the query. */
export interface DataTableRowGrouping<T> {
  getGroupId: (item: T) => string;
  /** Receives only current-page rows, never an inferred collection total. */
  renderGroupLabel: (groupId: string, items: readonly T[]) => ReactNode;
}

export interface DataTableProps<T, Id extends ResourceId> {
  columns: readonly ResourceColumnDefinition<T, ReactNode>[];
  emptyContent?: ReactNode;
  getId: (item: T) => Id;
  isSelected?: (id: Id) => boolean;
  isRowSelectable?: (item: T) => boolean;
  items: readonly T[];
  rowGrouping?: DataTableRowGrouping<T>;
  /** Label of the per-row overflow menu. */
  rowActionsLabel?: string;
  rowActions?: readonly ResourceRowAction<T>[];
  /** Label of the tertiary-column disclosure in the stacked form. */
  moreDetailsLabel?: string;
  presentation?: DataTablePresentation;
  selectionLabel?: string;
  someSelected?: boolean;
  allSelected?: boolean;
  sort?: ResourceSort | null;
  onActivateRow?: (item: T) => void;
  onSortChange?: (sort: ResourceSort | null) => void;
  onToggleAll?: () => void;
  onToggleSelection?: (id: Id) => void;
}

/** Resolve the table form for a viewport; shared with `ResourceListPage`. */
export function resolveDataTablePresentation(
  presentation: DataTablePresentation,
  viewport: CommandCenterViewportState,
): ResolvedDataTablePresentation {
  if (presentation !== "auto") return presentation;
  return viewport.breakpoint === "xs" ? "stacked" : "table";
}

function EmptyCell() {
  const { t } = useSdkTranslation();
  return <span aria-label={t("notSet")}>—</span>;
}

function renderValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <EmptyCell />;
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function renderCell<T>(column: ResourceColumnDefinition<T, ReactNode>, item: T) {
  return column.renderCell ? column.renderCell(item) : renderValue(column.getValue?.(item));
}

function nextSortDirection(sort: ResourceSort | null | undefined, key: string) {
  if (sort?.key !== key) {
    return "ascending" satisfies ResourceSortDirection;
  }
  if (sort.direction === "ascending") {
    return "descending" satisfies ResourceSortDirection;
  }
  return null;
}

function isActionDisabled<T>(action: ResourceRowAction<T>, item: T) {
  return typeof action.disabled === "function" ? action.disabled(item) : Boolean(action.disabled);
}

function RowActionMenu<T>({
  actions,
  item,
  label,
}: {
  actions: readonly ResourceRowAction<T>[];
  item: T;
  label: string;
}) {
  return (
    <ResourcePicker
      mode="action"
      ariaLabel={label}
      fitContent
      presentation="auto"
      options={actions.map((action) => ({
        value: action.id,
        label: action.label,
        disabled: isActionDisabled(action, item),
        tone: action.tone === "danger" ? "danger" : "default",
      }))}
      triggerLabel={label}
      onAction={(actionId) => actions.find((action) => action.id === actionId)?.onSelect(item)}
    />
  );
}

export function DataTable<T, Id extends ResourceId>({
  allSelected = false,
  columns,
  emptyContent: emptyContentProp,
  getId,
  isSelected,
  isRowSelectable,
  items,
  rowGrouping,
  moreDetailsLabel: moreDetailsLabelProp,
  onActivateRow,
  onSortChange,
  onToggleAll,
  onToggleSelection,
  presentation = "table",
  rowActions = [],
  rowActionsLabel: rowActionsLabelProp,
  selectionLabel: selectionLabelProp,
  someSelected = false,
  sort,
}: DataTableProps<T, Id>) {
  const { t } = useSdkTranslation();
  const emptyContent = emptyContentProp ?? t("noTableResults");
  const moreDetailsLabel = moreDetailsLabelProp ?? t("moreDetails");
  const rowActionsLabel = rowActionsLabelProp ?? t("actions");
  const selectionLabel = selectionLabelProp ?? t(rowGrouping ? "selectAllPageRows" : "selectAllRows");

  const viewport = useCommandCenterViewport();
  const resolvedPresentation = resolveDataTablePresentation(presentation, viewport);
  const selectable = Boolean(isSelected && onToggleAll && onToggleSelection);
  const resolvedColumns = resolveResourceColumnImportance(columns);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  type Entry = { kind: "row"; item: T } | { kind: "group"; id: string; items: readonly T[] };
  const entries: Entry[] = [];
  if (rowGrouping) {
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const id = rowGrouping.getGroupId(item);
      const group = groups.get(id) ?? [];
      group.push(item);
      groups.set(id, group);
    }
    for (const [id, groupItems] of groups) {
      entries.push({ kind: "group", id, items: groupItems });
      if (!collapsedGroups.has(id)) entries.push(...groupItems.map((item) => ({ kind: "row" as const, item })));
    }
  } else {
    entries.push(...items.map((item) => ({ kind: "row" as const, item })));
  }
  const renderGroupToggle = (entry: Extract<Entry, { kind: "group" }>) => (
    <Button
      type="button"
      variant="ghost"
      className="cc-data-table__group-toggle"
      aria-expanded={!collapsedGroups.has(entry.id)}
      onClick={() => setCollapsedGroups((current) => {
        const next = new Set(current);
        if (next.has(entry.id)) next.delete(entry.id);
        else next.add(entry.id);
        return next;
      })}
    >
      {collapsedGroups.has(entry.id) ? <ChevronRight aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
      {rowGrouping!.renderGroupLabel(entry.id, entry.items)}
    </Button>
  );

  const activateFromKeyboard = (event: KeyboardEvent<HTMLElement>, item: T) => {
    if (!onActivateRow || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    onActivateRow(item);
  };

  if (resolvedPresentation === "stacked") {
    const primary = resolvedColumns.find((column) => column.importance === "primary")!;
    const secondary = resolvedColumns.filter((column) => column.importance === "secondary");
    const tertiary = resolvedColumns.filter((column) => column.importance === "tertiary");
    const renderFields = (fields: readonly ResolvedResourceColumn<T, ReactNode>[], item: T) => (
      <dl className="cc-data-table__stacked-fields">
        {fields.map((column) => (
          <div className="cc-data-table__stacked-field" key={column.id}>
            <dt>{column.header}</dt>
            <dd>{renderCell(column, item)}</dd>
          </div>
        ))}
      </dl>
    );

    return (
      <div
        className="cc-data-table cc-data-table--stacked"
        data-cc-data-table=""
        data-cc-presentation="stacked"
      >
        {selectable && items.length > 0 ? (
          <div className="cc-data-table__stacked-toolbar">
            <label className="cc-data-table__stacked-select-all">
              <ResourceSelectionCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                label={selectionLabel}
                onChange={onToggleAll!}
              />
              <span aria-hidden="true">{selectionLabel}</span>
            </label>
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="cc-data-table__empty">{emptyContent}</div>
        ) : (
          <ol className="cc-data-table__stack">
            {entries.map((entry) => {
              if (entry.kind === "group") return (
                <li key={`group:${entry.id}`} className="cc-data-table__group" data-cc-data-table-group={entry.id}>
                  {renderGroupToggle(entry)}
                </li>
              );
              const item = entry.item;
              const id = getId(item);
              const rowSelectable = isRowSelectable ? isRowSelectable(item) : true;
              return (
                <li
                  key={`row:${id}`}
                  className={`cc-data-table__stacked-row${onActivateRow ? " cc-data-table__row--interactive" : ""}`}
                  data-cc-data-table-row=""
                  tabIndex={onActivateRow ? 0 : undefined}
                  onClick={onActivateRow ? () => onActivateRow(item) : undefined}
                  onKeyDown={(event) => activateFromKeyboard(event, item)}
                >
                  {selectable ? (
                    <div
                      className="cc-data-table__stacked-select"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {rowSelectable ? (
                        <ResourceSelectionCheckbox
                          checked={isSelected!(id)}
                          label={t("selectItem", { id: String(id) })}
                          onChange={() => onToggleSelection!(id)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="cc-data-table__stacked-body">
                    <div className="cc-data-table__stacked-title" data-cc-column-importance="primary">
                      {renderCell(primary, item)}
                    </div>
                    {secondary.length > 0 ? renderFields(secondary, item) : null}
                    {tertiary.length > 0 ? (
                      <details
                        className="cc-data-table__stacked-more"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <summary>{moreDetailsLabel}</summary>
                        {renderFields(tertiary, item)}
                      </details>
                    ) : null}
                  </div>
                  {rowActions.length > 0 ? (
                    <div
                      className="cc-data-table__stacked-actions"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <RowActionMenu actions={rowActions} item={item} label={rowActionsLabel} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  const visibleColumns = resolvedColumns.filter((column) =>
    isResourceColumnVisibleAt(column, viewport.breakpoint),
  );
  const actionsAsMenu = rowActions.length > 2 || viewport.coarsePointer;

  return (
    <div className="cc-data-table__scroller" data-cc-data-table="" data-cc-presentation="table">
      <table className="cc-data-table">
        <thead>
          <tr>
            {selectable ? (
              <th className="cc-data-table__selection-column" scope="col">
                <ResourceSelectionCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  label={selectionLabel}
                  onChange={onToggleAll!}
                />
              </th>
            ) : null}
            {visibleColumns.map((column) => {
              const activeSort = column.sortableKey && sort?.key === column.sortableKey ? sort : null;
              const ariaSort = activeSort?.direction ?? "none";
              return (
                <th
                  key={column.id}
                  aria-sort={column.sortableKey ? ariaSort : undefined}
                  data-cc-column-importance={column.importance}
                  scope="col"
                >
                  {column.sortableKey && onSortChange ? (
                    <button
                      type="button"
                      className="cc-data-table__sort"
                      onClick={() => {
                        const direction = nextSortDirection(sort, column.sortableKey!);
                        onSortChange(direction ? { key: column.sortableKey!, direction } : null);
                      }}
                    >
                      {column.header}
                      <span aria-hidden="true">
                        {activeSort?.direction === "ascending"
                          ? " ↑"
                          : activeSort?.direction === "descending"
                            ? " ↓"
                            : " ↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
            {rowActions.length > 0 ? <th scope="col">{rowActionsLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="cc-data-table__empty" colSpan={visibleColumns.length + (selectable ? 1 : 0) + (rowActions.length ? 1 : 0)}>
                {emptyContent}
              </td>
            </tr>
          ) : (
            entries.map((entry) => {
              if (entry.kind === "group") return (
                <tr key={`group:${entry.id}`} className="cc-data-table__group" data-cc-data-table-group={entry.id}>
                  <td colSpan={visibleColumns.length + (selectable ? 1 : 0) + (rowActions.length ? 1 : 0)}>
                    {renderGroupToggle(entry)}
                  </td>
                </tr>
              );
              const item = entry.item;
              const id = getId(item);
              const rowSelectable = isRowSelectable ? isRowSelectable(item) : true;
              return (
                <tr
                  key={`row:${id}`}
                  className={onActivateRow ? "cc-data-table__row--interactive" : undefined}
                  data-cc-data-table-row=""
                  tabIndex={onActivateRow ? 0 : undefined}
                  onClick={onActivateRow ? () => onActivateRow(item) : undefined}
                  onKeyDown={(event) => activateFromKeyboard(event, item)}
                >
                  {selectable ? (
                    <td className="cc-data-table__selection-column" onClick={(event) => event.stopPropagation()}>
                      {rowSelectable ? (
                        <ResourceSelectionCheckbox
                          checked={isSelected!(id)}
                          label={t("selectItem", { id: String(id) })}
                          onChange={() => onToggleSelection!(id)}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => (
                    <td key={column.id} data-cc-column-importance={column.importance}>
                      {renderCell(column, item)}
                    </td>
                  ))}
                  {rowActions.length > 0 ? (
                    <td
                      className="cc-data-table__actions"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {actionsAsMenu ? (
                        <RowActionMenu actions={rowActions} item={item} label={rowActionsLabel} />
                      ) : (
                        rowActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            className={action.tone === "danger" ? "cc-resource-button--danger" : undefined}
                            disabled={isActionDisabled(action, item)}
                            onClick={() => action.onSelect(item)}
                          >
                            {action.label}
                          </button>
                        ))
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
