import type { ComponentType } from "react";

import { ResourcePicker } from "./ResourcePicker.js";

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
}

export function ResourceBulkActionPicker({
  actions,
  disabled = false,
  label = "Actions",
}: ResourceBulkActionPickerProps) {
  if (actions.length === 0) return null;

  return (
    <ResourcePicker
      mode="action"
      ariaLabel={label}
      disabled={disabled}
      fitContent
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
