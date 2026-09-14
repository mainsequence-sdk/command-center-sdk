import {
  isCommandCenterBreakpointAtLeast,
  type CommandCenterBreakpoint,
} from "../theme/breakpoints.js";
import type {
  ResourceColumnDefinition,
  ResourceColumnHideBelow,
  ResourceColumnImportance,
} from "./types.js";

export interface ResolvedResourceColumn<T, Cell = unknown>
  extends ResourceColumnDefinition<T, Cell> {
  importance: ResourceColumnImportance;
}

/**
 * Resolve every column's importance deterministically: exactly one primary column (the first
 * declared primary, otherwise the first column), every other undeclared column secondary, and any
 * extra declared primary demoted to secondary. Column order is preserved.
 */
export function resolveResourceColumnImportance<T, Cell = unknown>(
  columns: readonly ResourceColumnDefinition<T, Cell>[],
): readonly ResolvedResourceColumn<T, Cell>[] {
  const declaredPrimaryIndex = columns.findIndex((column) => column.importance === "primary");
  const primaryIndex = declaredPrimaryIndex >= 0 ? declaredPrimaryIndex : 0;
  return columns.map((column, index) => ({
    ...column,
    importance: index === primaryIndex
      ? "primary"
      : column.importance === "primary" || column.importance === undefined
        ? "secondary"
        : column.importance,
  }));
}

const importanceMinimumBreakpoint: Record<ResourceColumnImportance, CommandCenterBreakpoint> = {
  primary: "xs",
  secondary: "sm",
  tertiary: "md",
};

/** Whether a column is shown in the table form at the given breakpoint band. */
export function isResourceColumnVisibleAt(
  column: { hideBelow?: ResourceColumnHideBelow; importance: ResourceColumnImportance },
  breakpoint: CommandCenterBreakpoint,
) {
  const minimum = column.hideBelow ?? importanceMinimumBreakpoint[column.importance];
  return isCommandCenterBreakpointAtLeast(breakpoint, minimum);
}

/** The columns rendered in the table form at a breakpoint, in declared order. */
export function selectResourceColumnsAt<T, Cell = unknown>(
  columns: readonly ResourceColumnDefinition<T, Cell>[],
  breakpoint: CommandCenterBreakpoint,
): readonly ResolvedResourceColumn<T, Cell>[] {
  return resolveResourceColumnImportance(columns).filter((column) =>
    isResourceColumnVisibleAt(column, breakpoint),
  );
}
