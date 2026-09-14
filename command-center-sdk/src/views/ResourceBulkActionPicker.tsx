import type { ComponentType } from "react";

import { ResourcePicker, type ResourcePickerPresentation } from "./ResourcePicker.js";

export interface ResourceBulkActionPickerAction {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  tone?: "default" | "primary" | "warning" | "danger";
  disabled?: boolean;
}

export interface ResourceBulkActionPickerProps {
  actions: readonly ResourceBulkActionPickerAction[];
  disabled?: boolean;
  label?: string;
  presentation?: ResourcePickerPresentation;
}

export function ResourceBulkActionPicker({
  actions,
  disabled = false,
  label = "Actions",
  presentation = "auto",
}: ResourceBulkActionPickerProps) {
  if (actions.length === 0) return null;

  return (
    <ResourcePicker
      mode="action"
      ariaLabel={label}
      disabled={disabled}
      fitContent
      presentation={presentation}
      options={actions.map((action) => ({
        value: action.id,
        label: action.label,
        icon: action.icon,
        tone: action.tone,
        disabled: action.disabled,
      }))}
      triggerLabel={label}
      onAction={(actionId) => actions.find((action) => action.id === actionId)?.onSelect()}
    />
  );
}
