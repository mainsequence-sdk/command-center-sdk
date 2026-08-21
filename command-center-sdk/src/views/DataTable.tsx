import type { KeyboardEvent, ReactNode } from "react";

import type {
  ResourceColumnDefinition,
  ResourceId,
  ResourceSort,
  ResourceSortDirection,
} from "../resource/types.js";
import { ResourceSelectionCheckbox } from "./ResourceSelectionCheckbox.js";

export interface ResourceRowAction<T> {
  id: string;
  label: string;
  disabled?: boolean | ((item: T) => boolean);
  tone?: "default" | "danger";
  onSelect: (item: T) => void;
}

export interface DataTableProps<T, Id extends ResourceId> {
  columns: readonly ResourceColumnDefinition<T, ReactNode>[];
  emptyContent?: ReactNode;
  getId: (item: T) => Id;
  isSelected?: (id: Id) => boolean;
  isRowSelectable?: (item: T) => boolean;
  items: readonly T[];
  rowActions?: readonly ResourceRowAction<T>[];
  selectionLabel?: string;
  someSelected?: boolean;
  allSelected?: boolean;
  sort?: ResourceSort | null;
  onActivateRow?: (item: T) => void;
  onSortChange?: (sort: ResourceSort | null) => void;
  onToggleAll?: () => void;
  onToggleSelection?: (id: Id) => void;
}

function renderValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span aria-label="Not set">—</span>;
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
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

export function DataTable<T, Id extends ResourceId>({
  allSelected = false,
  columns,
  emptyContent = "No results.",
  getId,
  isSelected,
  isRowSelectable,
  items,
  onActivateRow,
  onSortChange,
  onToggleAll,
  onToggleSelection,
  rowActions = [],
  selectionLabel = "Select all visible rows",
  someSelected = false,
  sort,
}: DataTableProps<T, Id>) {
  const selectable = Boolean(isSelected && onToggleAll && onToggleSelection);

  const activateFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, item: T) => {
    if (!onActivateRow || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }
    event.preventDefault();
    onActivateRow(item);
  };

  return (
    <div className="cc-data-table__scroller">
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
            {columns.map((column) => {
              const activeSort = column.sortableKey && sort?.key === column.sortableKey ? sort : null;
              const ariaSort = activeSort?.direction ?? "none";
              return (
                <th key={column.id} aria-sort={column.sortableKey ? ariaSort : undefined} scope="col">
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
            {rowActions.length > 0 ? <th scope="col">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="cc-data-table__empty" colSpan={columns.length + (selectable ? 1 : 0) + (rowActions.length ? 1 : 0)}>
                {emptyContent}
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const id = getId(item);
              const rowSelectable = isRowSelectable ? isRowSelectable(item) : true;
              return (
                <tr
                  key={id}
                  className={onActivateRow ? "cc-data-table__row--interactive" : undefined}
                  tabIndex={onActivateRow ? 0 : undefined}
                  onClick={onActivateRow ? () => onActivateRow(item) : undefined}
                  onKeyDown={(event) => activateFromKeyboard(event, item)}
                >
                  {selectable ? (
                    <td className="cc-data-table__selection-column" onClick={(event) => event.stopPropagation()}>
                      {rowSelectable ? (
                        <ResourceSelectionCheckbox
                          checked={isSelected!(id)}
                          label={`Select ${String(id)}`}
                          onChange={() => onToggleSelection!(id)}
                        />
                      ) : null}
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.id}>
                      {column.renderCell
                        ? column.renderCell(item)
                        : renderValue(column.getValue?.(item))}
                    </td>
                  ))}
                  {rowActions.length > 0 ? (
                    <td className="cc-data-table__actions" onClick={(event) => event.stopPropagation()}>
                      {rowActions.map((action) => {
                        const disabled =
                          typeof action.disabled === "function" ? action.disabled(item) : action.disabled;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            className={action.tone === "danger" ? "cc-resource-button--danger" : undefined}
                            disabled={disabled}
                            onClick={() => action.onSelect(item)}
                          >
                            {action.label}
                          </button>
                        );
                      })}
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
