import { type ChangeEventHandler, type ReactNode } from "react";

import {
  ResourceBulkActionPicker,
  type ResourceBulkActionPickerAction,
} from "./ResourceBulkActionPicker.js";

export type ResourceSearchBulkAction = ResourceBulkActionPickerAction;

export interface ResourceSearchProps {
  actionMenuLabel?: string;
  accessory?: ReactNode;
  bulkActions?: readonly ResourceSearchBulkAction[];
  className?: string;
  clearSelectionLabel?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onClearSelection?: () => void;
  placeholder: string;
  renderSelectionSummary?: (selectionCount: number) => ReactNode;
  searchClassName?: string;
  selectionCount?: number;
  value: string;
}

export function ResourceSearch({
  actionMenuLabel = "Actions",
  accessory,
  bulkActions = [],
  className,
  clearSelectionLabel = "Clear",
  onChange,
  onClearSelection,
  placeholder,
  renderSelectionSummary = (count) => `${count} selected`,
  searchClassName,
  selectionCount = 0,
  value,
}: ResourceSearchProps) {
  return (
    <div className={["cc-resource-search", className].filter(Boolean).join(" ")}>
      <div className="cc-resource-search__selection">
        {selectionCount > 0 ? (
          <>
            <span className="cc-resource-search__summary">{renderSelectionSummary(selectionCount)}</span>
            <ResourceBulkActionPicker actions={bulkActions} label={actionMenuLabel} />
            {onClearSelection ? <button type="button" onClick={onClearSelection}>{clearSelectionLabel}</button> : null}
          </>
        ) : null}
      </div>
      <div className="cc-resource-search__controls">
        {accessory}
        <label className={["cc-resource-search__input", searchClassName].filter(Boolean).join(" ")}>
          <span aria-hidden="true">⌕</span>
          <input type="search" value={value} onChange={onChange} placeholder={placeholder} />
        </label>
      </div>
    </div>
  );
}
