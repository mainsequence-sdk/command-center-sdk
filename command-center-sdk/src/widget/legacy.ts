import type { ComponentType } from "react";

import {
  DEFAULT_WIDGET_SIZE,
  type CommandCenterWidgetApiVersion,
  type RuntimeDataRef,
  type RuntimeDataStore,
  type WidgetAgentContextValue,
  type WidgetAgentSnapshot,
  type WidgetBindingTransformStep,
  type WidgetCanvasEditingMode,
  type WidgetContractId,
  type WidgetExecutionReason,
  type WidgetExecutionRefreshPolicy,
  type WidgetExposedFieldState,
  type WidgetFieldPopConfig,
  type WidgetFieldSection,
  type WidgetInputEffect,
  type WidgetInstanceBindings,
  type WidgetInstancePresentation,
  type WidgetKind,
  type WidgetOrganizationConfigurationContract,
  type WidgetPortBinding,
  type WidgetPortBindingValue,
  type WidgetPublicExecutionContract,
  type WidgetRegistryConfigurationContract,
  type WidgetRegistryConfigurationFieldDescriptor,
  type WidgetRegistryConfigurationFieldSource,
  type WidgetRegistryConfigurationMode,
  type WidgetRegistryContractInput,
  type WidgetRegistryExample,
  type WidgetRegistryIoContract,
  type WidgetRegistryIoMode,
  type WidgetRegistryRefreshPolicy,
  type WidgetRegistryRuntimeContract,
  type WidgetRegistryUsageGuidance,
  type WidgetRuntimeUpdateEnvelope,
  type WidgetValueDescriptor,
  type WidgetWorkspaceRuntimeMode,
} from "../contracts/index.js";

export { DEFAULT_WIDGET_SIZE };
export type {
  RuntimeDataRef,
  RuntimeDataStore,
  WidgetAgentContextValue,
  WidgetAgentSnapshot,
  WidgetBindingTransformStep,
  WidgetCanvasEditingMode,
  WidgetContractId,
  WidgetExecutionReason,
  WidgetExecutionRefreshPolicy,
  WidgetExposedFieldState,
  WidgetFieldPopConfig,
  WidgetFieldSection,
  WidgetInputEffect,
  WidgetInstanceBindings,
  WidgetInstancePresentation,
  WidgetKind,
  WidgetOrganizationConfigurationContract,
  WidgetPortBinding,
  WidgetPortBindingValue,
  WidgetPublicExecutionContract,
  WidgetRegistryConfigurationContract,
  WidgetRegistryConfigurationFieldDescriptor,
  WidgetRegistryConfigurationFieldSource,
  WidgetRegistryConfigurationMode,
  WidgetRegistryContractInput,
  WidgetRegistryExample,
  WidgetRegistryIoContract,
  WidgetRegistryIoMode,
  WidgetRegistryRefreshPolicy,
  WidgetRegistryRuntimeContract,
  WidgetRegistryUsageGuidance,
  WidgetValueDescriptor,
  WidgetWorkspaceRuntimeMode,
};

export interface WidgetRailSummaryComponentProps<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  title: string;
  instanceId?: string;
  props: TProps;
  presentation?: WidgetInstancePresentation;
  runtimeState?: Record<string, unknown>;
}

export interface WidgetIoResolverArgs<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  widgetId: string;
  instanceId?: string;
  props: TProps;
  runtimeState?: Record<string, unknown>;
}

export interface WidgetInputPortDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  label: string;
  accepts: WidgetContractId[];
  acceptedOutputIds?: string[];
  description?: string;
  required?: boolean;
  cardinality?: "one" | "many";
  effects?: WidgetInputEffect[];
}

export interface WidgetOutputResolverArgs<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  widgetId: string;
  instanceId?: string;
  instanceTitle?: string;
  props: TProps;
  presentation?: WidgetInstancePresentation;
  runtimeState?: Record<string, unknown>;
  resolvedInputs?: ResolvedWidgetInputs;
  runtimeDataStore?: RuntimeDataStore | null;
}

export interface WidgetOutputPortDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  label: string;
  contract: WidgetContractId;
  description?: string;
  valueDescriptor?: WidgetValueDescriptor;
  resolveValue?: (args: WidgetOutputResolverArgs<TProps>) => unknown;
}

export interface WidgetIoDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  inputs?: WidgetInputPortDefinition<TProps>[];
  outputs?: WidgetOutputPortDefinition<TProps>[];
}

export type WidgetInputResolutionStatus =
  | "valid"
  | "unbound"
  | "missing-source"
  | "missing-output"
  | "contract-mismatch"
  | "self-reference-blocked"
  | "transform-invalid";

export interface ResolvedWidgetInput {
  inputId: string;
  label: string;
  status: WidgetInputResolutionStatus;
  sourceWidgetId?: string;
  sourceOutputId?: string;
  contractId?: WidgetContractId;
  binding?: WidgetPortBinding;
  value?: unknown;
  valueRef?: RuntimeDataRef;
  upstreamBase?: unknown;
  upstreamBaseRef?: RuntimeDataRef;
  upstreamDelta?: unknown;
  upstreamDeltaRef?: RuntimeDataRef;
  upstreamUpdate?: WidgetRuntimeUpdateEnvelope;
  valueDescriptor?: WidgetValueDescriptor;
  effects?: WidgetInputEffect[];
}

export type ResolvedWidgetInputs = Record<
  string,
  ResolvedWidgetInput | ResolvedWidgetInput[] | undefined
>;

export interface WidgetExecutionDashboardState {
  timeRangeKey: string;
  rangeStartMs: number;
  rangeEndMs: number;
  refreshIntervalMs: number | null;
}

export interface WidgetAgentSnapshotContext<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  widgetId: string;
  instanceId: string;
  title: string;
  snapshotProfile: "agent";
  props: TProps;
  presentation?: WidgetInstancePresentation;
  runtimeState?: Record<string, unknown>;
  resolvedInputs?: ResolvedWidgetInputs;
  runtimeDataStore?: RuntimeDataStore | null;
  dashboardState?: WidgetExecutionDashboardState;
  domTextContent?: string;
  resolveWidgetRuntimeState?: (instanceId: string | undefined) => Record<string, unknown> | undefined;
}

export interface WidgetExecutionTargetOverrides<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  props?: TProps;
  bindings?: WidgetInstanceBindings;
  runtimeState?: Record<string, unknown>;
  draftValues?: Record<string, string>;
}

export type WidgetExecutionSurface = "private-dashboard" | "public-workspace";

export interface WidgetExecutionContext<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  scopeId?: string;
  executionSurface: WidgetExecutionSurface;
  publicWorkspaceToken?: string;
  widgetId: string;
  instanceId: string;
  reason: WidgetExecutionReason;
  props: TProps;
  runtimeState?: Record<string, unknown>;
  publicExecution?: WidgetPublicExecutionContract;
  resolvedInputs?: ResolvedWidgetInputs;
  dashboardState?: WidgetExecutionDashboardState;
  runtimeDataStore?: RuntimeDataStore | null;
  targetOverrides?: WidgetExecutionTargetOverrides<TProps>;
  refreshCycleId?: string;
  signal?: AbortSignal;
}

export interface WidgetExecutionResult {
  status: "success" | "error" | "skipped";
  runtimeStatePatch?: Record<string, unknown>;
  error?: string;
}

export type WidgetExecutionReadiness =
  | { status: "ready" }
  | { status: "waiting" | "error"; reason?: string };

export interface WidgetExecutionDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  canExecute?: (context: WidgetExecutionContext<TProps>) => boolean;
  getExecutionReadiness?: (context: WidgetExecutionContext<TProps>) => WidgetExecutionReadiness;
  getExecutionBlockedReason?: (context: WidgetExecutionContext<TProps>) => string | undefined;
  execute: (context: WidgetExecutionContext<TProps>) => Promise<WidgetExecutionResult>;
  getRefreshPolicy?: (context: WidgetExecutionContext<TProps>) => WidgetExecutionRefreshPolicy;
  getExecutionKey?: (context: WidgetExecutionContext<TProps>) => string;
}

export interface WidgetControllerArgs<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  props: TProps;
  runtimeState?: Record<string, unknown>;
  instanceId?: string;
  resolvedInputs?: ResolvedWidgetInputs;
  mode: "settings" | "canvas" | "render" | "preview";
}

export interface WidgetController<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown,
> {
  normalizeProps?: (props: TProps) => TProps;
  useContext?: (args: WidgetControllerArgs<TProps>) => TContext;
}

export interface WidgetFieldVisibilityContext<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown,
> {
  widget: WidgetDefinition<TProps>;
  props: TProps;
  editable: boolean;
  context: TContext;
}

export interface WidgetFieldSettingsRendererProps<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown,
> {
  field: WidgetFieldDefinition<TProps, TContext>;
  widget: WidgetDefinition<TProps>;
  draftProps: TProps;
  onDraftPropsChange: (props: TProps) => void;
  draftPresentation: WidgetInstancePresentation;
  onDraftPresentationChange: (presentation: WidgetInstancePresentation) => void;
  editable: boolean;
  context: TContext;
}

export interface WidgetFieldCanvasRendererProps<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown,
> {
  field: WidgetFieldDefinition<TProps, TContext>;
  widget: WidgetDefinition<TProps>;
  props: TProps;
  onPropsChange: (props: TProps) => void;
  fieldState: WidgetExposedFieldState;
  runtimeState?: Record<string, unknown>;
  onRuntimeStateChange?: (state: Record<string, unknown> | undefined) => void;
  editable: boolean;
  context: TContext;
}

export interface WidgetFieldDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown,
> {
  id: string;
  label: string;
  description?: string;
  sectionId: string;
  settingsColumnSpan?: 1 | 2;
  category?: string;
  tags?: string[];
  pop?: WidgetFieldPopConfig;
  isVisible?: (context: WidgetFieldVisibilityContext<TProps, TContext>) => boolean;
  renderSettings?: ComponentType<WidgetFieldSettingsRendererProps<TProps, TContext>>;
  renderCanvas?: ComponentType<WidgetFieldCanvasRendererProps<TProps, TContext>>;
}

export interface WidgetSettingsSchema<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown,
> {
  sections: WidgetFieldSection[];
  fields: WidgetFieldDefinition<TProps, TContext>[];
}

export interface WidgetDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  widgetVersion: string;
  apiVersion?: CommandCenterWidgetApiVersion;
  propsSchema?: Record<string, unknown>;
  propsVersion?: number;
  userStateVersion?: number;
  title: string;
  description: string;
  category: string;
  kind: WidgetKind;
  source: string;
  defaultSize: { w: number; h: number };
  responsive?: { minWidthPx?: number };
  requiredPermissions?: string[];
  tags?: string[];
  exampleProps?: TProps;
  mockProps?: TProps;
  mockTitle?: string;
  mockPresentation?: WidgetInstancePresentation;
  mockResolvedInputs?: ResolvedWidgetInputs;
  mockRuntimeState?: Record<string, unknown>;
  defaultPresentation?: WidgetInstancePresentation;
  fixedPlacementMode?: WidgetInstancePresentation["placementMode"];
  bodyMode?: "default" | "none";
  schema?: WidgetSettingsSchema<TProps, any>;
  settingsSchemaPlacement?: "auto" | "custom";
  settingsPreviewMode?: "default" | "demo-only" | "none";
  controller?: WidgetController<TProps, any>;
  headerComponent?: ComponentType<WidgetHeaderComponentProps<TProps>>;
  headerActions?: ComponentType<WidgetHeaderActionsProps<TProps>>;
  settingsComponent?: ComponentType<WidgetSettingsComponentProps<TProps>>;
  showRawPropsEditor?: boolean;
  io?: WidgetIoDefinition<TProps>;
  resolveIo?: (args: WidgetIoResolverArgs<TProps>) => WidgetIoDefinition<TProps> | undefined;
  execution?: WidgetExecutionDefinition<TProps>;
  workspaceRuntimeMode?: WidgetWorkspaceRuntimeMode;
  canvasEditing?: { mode?: WidgetCanvasEditingMode };
  registryContract?: WidgetRegistryContractInput;
  organizationConfiguration?: WidgetOrganizationConfigurationContract;
  workspaceIcon?: ComponentType<{ className?: string }>;
  railIcon?: ComponentType<{ className?: string }>;
  railSummaryComponent?: ComponentType<WidgetRailSummaryComponentProps<TProps>>;
  buildAgentSnapshot?: (
    context: WidgetAgentSnapshotContext<TProps>,
  ) => WidgetAgentSnapshot | Promise<WidgetAgentSnapshot>;
  component: ComponentType<WidgetComponentProps<TProps>>;
}

export type WidgetDefinitionInput<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> = Omit<WidgetDefinition<TProps>, "buildAgentSnapshot" | "defaultSize"> & {
  buildAgentSnapshot?: WidgetDefinition<TProps>["buildAgentSnapshot"];
  defaultSize?: WidgetDefinition<TProps>["defaultSize"];
};

function resolveDefaultWidgetAgentSnapshotDisplayKind(
  kind: WidgetKind,
): WidgetAgentSnapshot["displayKind"] {
  if (kind === "chart") return "chart";
  if (kind === "table") return "table";
  return "custom";
}

function buildDefaultWidgetAgentSnapshot<TProps extends Record<string, unknown>>(
  definition: Pick<WidgetDefinitionInput<TProps>, "kind" | "title">,
): WidgetDefinition<TProps>["buildAgentSnapshot"] {
  return ({ domTextContent }) => {
    const renderedText = domTextContent?.trim();
    return {
      displayKind: resolveDefaultWidgetAgentSnapshotDisplayKind(definition.kind),
      state: renderedText ? "ready" : "idle",
      summary: renderedText || `${definition.title} does not provide a widget-specific agent snapshot.`,
      data: renderedText ? { renderedText } : undefined,
    } satisfies WidgetAgentSnapshot;
  };
}

/** @deprecated Prefer defineWidgetModule for new external packages. */
export function defineWidget<
  TProps extends Record<string, unknown> = Record<string, unknown>,
>(definition: WidgetDefinitionInput<TProps>): WidgetDefinition<TProps> {
  return {
    ...definition,
    buildAgentSnapshot:
      definition.buildAgentSnapshot ?? buildDefaultWidgetAgentSnapshot(definition),
    defaultSize: definition.defaultSize ?? { ...DEFAULT_WIDGET_SIZE },
  };
}

export interface WidgetComponentProps<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  widget: WidgetDefinition<TProps>;
  instanceId?: string;
  props: TProps;
  instanceTitle?: string;
  editable?: boolean;
  presentation?: WidgetInstancePresentation;
  runtimeState?: Record<string, unknown>;
  resolvedInputs?: ResolvedWidgetInputs;
  runtimeDataStore?: RuntimeDataStore | null;
  onPropsChange?: (props: TProps) => void;
  onRuntimeStateChange?: (state: Record<string, unknown> | undefined) => void;
}

export interface WidgetHeaderActionsProps<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  widget: WidgetDefinition<TProps>;
  props: TProps;
  runtimeState?: Record<string, unknown>;
  onRuntimeStateChange?: (state: Record<string, unknown> | undefined) => void;
}

export interface WidgetHeaderComponentProps<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  widget: WidgetDefinition<TProps>;
  props: TProps;
  instanceTitle?: string;
  runtimeState?: Record<string, unknown>;
  onRuntimeStateChange?: (state: Record<string, unknown> | undefined) => void;
}

export interface WidgetSettingsComponentProps<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  widget: WidgetDefinition<TProps>;
  instanceId: string;
  draftProps: TProps;
  onDraftPropsChange: (props: TProps) => void;
  draftPresentation: WidgetInstancePresentation;
  onDraftPresentationChange: (presentation: WidgetInstancePresentation) => void;
  resolvedInputs?: ResolvedWidgetInputs;
  controllerContext?: unknown;
  instanceTitle: string;
  onInstanceTitleChange: (title: string) => void;
  editable: boolean;
}
