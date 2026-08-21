import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from "react";

import {
  WidgetRuntimeProvider,
  type RuntimeDataStore,
  type WidgetDefinition,
} from "../../widget/index.js";
import type {
  DashboardDefinition,
  DashboardWidgetInstance,
} from "../index.js";

export interface WorkspaceRuntimeAdapters {
  resolveWidget: (widgetId: string) => WidgetDefinition<any> | undefined;
  hasPermission?: (permission: string) => boolean;
  runtimeDataStore?: RuntimeDataStore | null;
  capabilities?: Readonly<Record<string, unknown>>;
  theme?: Readonly<Record<string, string>>;
  locale?: string;
  onRuntimeStateChange?: (
    instanceId: string,
    state: Record<string, unknown> | undefined,
  ) => void;
  onNavigate?: (target: string) => void;
  onTelemetry?: (event: {
    type: "widget-render" | "widget-unavailable" | "widget-error";
    widgetId: string;
    instanceId: string;
    detail?: string;
  }) => void;
  renderWidget?: (input: {
    definition: WidgetDefinition<any>;
    instance: DashboardWidgetInstance;
    runtimeDataStore?: RuntimeDataStore | null;
  }) => ReactNode;
}

export function UnavailableWidget({ instance, reason }: {
  instance: DashboardWidgetInstance;
  reason: string;
}) {
  return (
    <div role="status" data-widget-unavailable={instance.widgetId} style={{ padding: 16 }}>
      <strong>{instance.title?.trim() || instance.widgetId}</strong>
      <div>{reason}</div>
    </div>
  );
}

class WidgetErrorBoundary extends Component<{
  children: ReactNode;
  instance: DashboardWidgetInstance;
  onError?: (error: Error) => void;
}, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onError?.(error); }
  render() {
    return this.state.error
      ? <UnavailableWidget instance={this.props.instance} reason={this.state.error.message} />
      : this.props.children;
  }
}

function widgetStyle(instance: DashboardWidgetInstance, columns: number): CSSProperties {
  const layout = instance.layout as unknown as Record<string, number | undefined>;
  const width = Math.max(1, layout.w ?? layout.cols ?? 1);
  const height = Math.max(1, layout.h ?? layout.rows ?? 1);
  const x = Math.max(0, layout.x ?? instance.position?.x ?? 0);
  const y = Math.max(0, layout.y ?? instance.position?.y ?? 0);
  return {
    gridColumn: `${Math.min(columns, x + 1)} / span ${Math.min(columns, width)}`,
    gridRow: `${y + 1} / span ${height}`,
    minWidth: 0,
    minHeight: 0,
  };
}

export function WorkspaceRenderer({ workspace, adapters, className }: {
  workspace: DashboardDefinition;
  adapters: WorkspaceRuntimeAdapters;
  className?: string;
}) {
  const columns = Math.max(1, workspace.grid?.columns ?? 48);
  const rowHeight = Math.max(1, workspace.grid?.rowHeight ?? 15);
  const gap = Math.max(0, workspace.grid?.gap ?? 8);

  return (
    <div
      className={className}
      data-command-center-workspace={workspace.id}
      style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: rowHeight, gap }}
    >
      {workspace.widgets.map((instance) => {
        const definition = adapters.resolveWidget(instance.widgetId);
        if (!definition) {
          adapters.onTelemetry?.({ type: "widget-unavailable", widgetId: instance.widgetId, instanceId: instance.id, detail: "missing-runtime" });
          return <div key={instance.id} style={widgetStyle(instance, columns)}><UnavailableWidget instance={instance} reason="Widget runtime is not installed in this host." /></div>;
        }
        const missingPermission = [...(definition.requiredPermissions ?? []), ...(instance.requiredPermissions ?? [])]
          .find((permission) => adapters.hasPermission && !adapters.hasPermission(permission));
        if (missingPermission) {
          adapters.onTelemetry?.({ type: "widget-unavailable", widgetId: definition.id, instanceId: instance.id, detail: `permission:${missingPermission}` });
          return <div key={instance.id} style={widgetStyle(instance, columns)}><UnavailableWidget instance={instance} reason={`Missing permission ${missingPermission}.`} /></div>;
        }

        const rendered = adapters.renderWidget
          ? adapters.renderWidget({ definition, instance, runtimeDataStore: adapters.runtimeDataStore })
          : <definition.component
              widget={definition}
              instanceId={instance.id}
              instanceTitle={instance.title}
              props={instance.props ?? {}}
              presentation={instance.presentation}
              runtimeState={instance.runtimeState}
              runtimeDataStore={adapters.runtimeDataStore}
              onRuntimeStateChange={(state) => adapters.onRuntimeStateChange?.(instance.id, state)}
            />;
        adapters.onTelemetry?.({ type: "widget-render", widgetId: definition.id, instanceId: instance.id });
        return (
          <div key={instance.id} style={widgetStyle(instance, columns)}>
            <WidgetErrorBoundary
              instance={instance}
              onError={(error) => adapters.onTelemetry?.({ type: "widget-error", widgetId: definition.id, instanceId: instance.id, detail: error.message })}
            >
              <WidgetRuntimeProvider
                value={{
                  capabilities: adapters.capabilities ?? {},
                  theme: adapters.theme ?? {},
                  locale: adapters.locale ?? "en",
                  runtimeDataStore: adapters.runtimeDataStore,
                }}
              >
                {rendered}
              </WidgetRuntimeProvider>
            </WidgetErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
