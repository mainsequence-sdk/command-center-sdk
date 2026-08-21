import type { ReactNode } from "react";

export interface ResourceToolbarProps {
  count: number;
  filterControls?: ReactNode;
  itemLabel?: string;
  leading?: ReactNode;
  searchPlaceholder?: string;
  searchable?: boolean;
  searchValue: string;
  trailing?: ReactNode;
  onSearchChange: (value: string) => void;
}

export function ResourceToolbar({
  count,
  filterControls,
  itemLabel = "results",
  leading,
  searchPlaceholder = "Search",
  searchable = true,
  searchValue,
  trailing,
  onSearchChange,
}: ResourceToolbarProps) {
  return (
    <div className="cc-resource-toolbar">
      {leading ? <div className="cc-resource-toolbar__leading">{leading}</div> : null}
      {searchable ? <label className="cc-resource-toolbar__search">
        <span className="cc-resource-visually-hidden">{searchPlaceholder}</span>
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label> : null}
      {filterControls ? (
        <div className="cc-resource-toolbar__filters">{filterControls}</div>
      ) : null}
      <span className="cc-resource-toolbar__count">
        {count} {itemLabel}
      </span>
      {trailing ? <div className="cc-resource-toolbar__trailing">{trailing}</div> : null}
    </div>
  );
}
