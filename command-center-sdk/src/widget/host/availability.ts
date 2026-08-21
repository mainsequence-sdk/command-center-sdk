import type { WidgetRegistry } from "./registry.js";

export type WidgetAvailabilityStatus =
  | "available"
  | "missing-runtime"
  | "backend-inactive"
  | "permission-denied";

export interface WidgetAvailability {
  status: WidgetAvailabilityStatus;
  widgetId: string;
  message?: string;
}

export function resolveWidgetAvailability(input: {
  widgetId: string;
  registry: Pick<WidgetRegistry, "getWidget">;
  activeBackendWidgetIds?: ReadonlySet<string> | null;
  grantedPermissions?: ReadonlySet<string>;
}): WidgetAvailability {
  const widget = input.registry.getWidget(input.widgetId);
  if (!widget) {
    return { status: "missing-runtime", widgetId: input.widgetId, message: "Widget package is not installed in this deployment." };
  }
  if (input.activeBackendWidgetIds && !input.activeBackendWidgetIds.has(widget.id)) {
    return { status: "backend-inactive", widgetId: widget.id, message: "Widget metadata is not active in the backend registry." };
  }
  const missingPermission = (widget.requiredPermissions ?? []).find(
    (permission) => !input.grantedPermissions?.has(permission),
  );
  if (missingPermission) {
    return { status: "permission-denied", widgetId: widget.id, message: `Missing permission ${missingPermission}.` };
  }
  return { status: "available", widgetId: widget.id };
}
