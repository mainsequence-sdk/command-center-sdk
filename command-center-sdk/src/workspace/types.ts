import type {
  WidgetInstanceBindings,
  WidgetInstancePresentation,
  WidgetPublicExecutionContract,
} from "../contracts/index.js";

export const WORKSPACE_DOCUMENT_CONTRACT = "command-center.workspace_document@v1" as const;
export const WORKSPACE_DOCUMENT_SCHEMA_ID =
  "urn:mainsequence:command-center-sdk:schema:workspace-document:v1" as const;

export interface DashboardGridConfig {
  columns?: number;
  rowHeight?: number;
  gap?: number;
}

export type DashboardLayoutKind = "custom" | "auto-grid";
export type DashboardDefinitionType = "workspace" | "agent-monitor" | "slide-studio";

export interface DashboardAutoGridConfig {
  maxColumns?: number;
  minColumnWidthPx?: number;
  rowHeight?: number;
  fillScreen?: boolean;
}

export type DashboardTimeRangeKey = "15m" | "1h" | "6h" | "24h" | "7d" | "30d" | "90d";

export interface DashboardTimeRangeConfig {
  enabled?: boolean;
  defaultRange?: DashboardTimeRangeKey;
  options?: DashboardTimeRangeKey[];
  selectedRange?: DashboardTimeRangeKey | "custom";
  customStartMs?: number;
  customEndMs?: number;
}

export interface DashboardRefreshConfig {
  enabled?: boolean;
  defaultIntervalMs?: number | null;
  intervals?: Array<number | null>;
  selectedIntervalMs?: number | null;
}

export interface DashboardActionsConfig {
  enabled?: boolean;
  share?: boolean;
  view?: boolean;
}

export interface DashboardControlsConfig {
  enabled?: boolean;
  timeRange?: DashboardTimeRangeConfig;
  refresh?: DashboardRefreshConfig;
  actions?: DashboardActionsConfig;
}

export interface DashboardControlsState {
  timeRangeKey: DashboardTimeRangeKey | "custom";
  rangeStartMs: number;
  rangeEndMs: number;
  refreshIntervalMs: number | null;
}

export interface DashboardWidgetSpan { cols: number; rows: number }
export interface DashboardWidgetPlacement { x?: number; y?: number }
export interface DashboardCanvasItemLayout { x: number; y: number; w: number; h: number }
export interface DashboardWidgetLegacyLayout { x?: number; y?: number; w: number; h: number }
export type DashboardWidgetLayout = DashboardWidgetSpan | DashboardWidgetLegacyLayout;

export interface DashboardCompanionLayoutItem {
  id: string;
  instanceId: string;
  fieldId: string;
  layout: DashboardCanvasItemLayout;
}

export interface DashboardWidgetRowState {
  collapsed?: boolean;
  children?: DashboardWidgetInstance[];
}

export type DashboardSlideRegionId = "header" | "left" | "body" | "right" | "footer";
export interface DashboardWidgetSlidePlacement {
  slideWidgetId: string;
  region: DashboardSlideRegionId;
}

export type DashboardManagedWidgetRole = "embedded-connection-source";
export interface DashboardManagedWidgetOwner {
  ownerInstanceId: string;
  role: DashboardManagedWidgetRole;
}

export interface DashboardWidgetInstance {
  id: string;
  widgetId: string;
  title?: string;
  props?: Record<string, unknown>;
  runtimeState?: Record<string, unknown>;
  publicExecution?: WidgetPublicExecutionContract;
  presentation?: WidgetInstancePresentation;
  bindings?: WidgetInstanceBindings;
  managedBy?: DashboardManagedWidgetOwner;
  slidePlacement?: DashboardWidgetSlidePlacement;
  row?: DashboardWidgetRowState;
  layout: DashboardWidgetLayout;
  position?: DashboardWidgetPlacement;
  requiredPermissions?: string[];
  propsVersion?: number;
  userStateVersion?: number;
  authoredWithWidgetVersion?: string;
}

export interface DashboardDefinition {
  id: string;
  title: string;
  description: string;
  type?: DashboardDefinitionType;
  schemaVersion?: number;
  publicUrl?: string | null;
  labels?: string[];
  category?: string;
  source: string;
  layoutKind?: DashboardLayoutKind;
  autoGrid?: DashboardAutoGridConfig;
  companions?: DashboardCompanionLayoutItem[];
  requiredPermissions?: string[];
  grid?: DashboardGridConfig;
  controls?: DashboardControlsConfig;
  widgets: DashboardWidgetInstance[];
}

export interface ResolvedDashboardGridConfig { columns: number; rowHeight: number; gap: number }
export interface ResolvedDashboardWidgetLayout { x: number; y: number; w: number; h: number }
export interface ResolvedDashboardWidgetInstance extends Omit<DashboardWidgetInstance, "layout"> {
  layout: ResolvedDashboardWidgetLayout;
}
export interface ResolvedDashboardDefinition extends Omit<DashboardDefinition, "grid" | "widgets"> {
  grid: ResolvedDashboardGridConfig;
  widgets: ResolvedDashboardWidgetInstance[];
}
export interface DashboardLayoutIssue { widgetId: string; message: string }
