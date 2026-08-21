export type ResourceTableCellAlignment = "left" | "middle" | "center" | "right";

export interface ResourceTableCellClassNameOptions {
  alignment?: ResourceTableCellAlignment;
  className?: string;
  numeric?: boolean;
}

export function getResourceTableCellClassName(
  input: ResourceTableCellClassNameOptions | boolean = {},
  legacyAlignment: ResourceTableCellAlignment = "left",
) {
  const legacySelected = typeof input === "boolean" ? input : false;
  const options = typeof input === "boolean"
    ? { alignment: legacyAlignment }
    : input;
  const alignment = options.alignment ?? "left";
  const className = "className" in options ? options.className : undefined;
  const numeric = "numeric" in options ? options.numeric ?? false : false;
  return [
    "cc-resource-table-cell",
    `cc-resource-table-cell--${alignment}`,
    numeric ? "cc-resource-table-cell--numeric" : null,
    legacySelected ? "cc-resource-table-cell--selected" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
