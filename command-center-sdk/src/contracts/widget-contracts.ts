export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export const COMMAND_CENTER_WIDGET_API_VERSION = "command-center-widget@v1" as const;
export type CommandCenterWidgetApiVersion = typeof COMMAND_CENTER_WIDGET_API_VERSION;

export type WidgetKind = "kpi" | "chart" | "table" | "feed" | "custom";
export type WidgetFieldAnchor = "top" | "right" | "bottom" | "left";
export type WidgetFieldPopMode = "inline" | "chip-group" | "token-list" | "panel";
export type WidgetRailVisibility = "visible" | "hidden";
export const DEFAULT_WIDGET_SIZE = { w: 8, h: 6 } as const;

export interface WidgetExposedFieldState {
  visible: boolean;
  anchor: WidgetFieldAnchor;
  order: number;
  mode?: WidgetFieldPopMode;
  collapsed?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  gridX?: number;
  gridY?: number;
  gridW?: number;
  gridH?: number;
}

export interface WidgetInstancePresentation {
  exposedFields?: Record<string, WidgetExposedFieldState>;
  surfaceMode?: "default" | "transparent";
  placementMode?: "canvas" | "sidebar";
  railVisibility?: WidgetRailVisibility;
}

export interface WidgetFieldSection {
  id: string;
  title: string;
  description?: string;
}

export interface WidgetFieldPopConfig {
  canPop: boolean;
  defaultPopped?: boolean;
  anchor?: WidgetFieldAnchor;
  mode?: WidgetFieldPopMode;
  title?: string;
  defaultWidth?: number;
  defaultHeight?: number;
}

export type WidgetContractId = `${string}@v${number}`;

export interface WidgetPrimitiveValueDescriptor {
  kind: "primitive";
  contract: WidgetContractId;
  primitive: "string" | "number" | "integer" | "boolean" | "null";
  format?: string;
  description?: string;
}

export interface WidgetObjectValueFieldDescriptor {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  value: WidgetValueDescriptor;
}

export interface WidgetObjectValueDescriptor {
  kind: "object";
  contract: WidgetContractId;
  description?: string;
  fields: WidgetObjectValueFieldDescriptor[];
}

export interface WidgetArrayValueDescriptor {
  kind: "array";
  contract: WidgetContractId;
  description?: string;
  items?: WidgetValueDescriptor;
}

export interface WidgetUnknownValueDescriptor {
  kind: "unknown";
  contract: WidgetContractId;
  description?: string;
}

export type WidgetValueDescriptor =
  | WidgetPrimitiveValueDescriptor
  | WidgetObjectValueDescriptor
  | WidgetArrayValueDescriptor
  | WidgetUnknownValueDescriptor;

export type WidgetSelectArrayItemMode = "first" | "last" | "index";

export interface WidgetSelectArrayItemTransformStep {
  id: "select-array-item";
  mode?: WidgetSelectArrayItemMode;
  index?: number;
}

export interface WidgetExtractPathTransformStep {
  id: "extract-path";
  path?: string[];
  contractId?: WidgetContractId;
}

export type WidgetBindingTransformStep =
  | WidgetSelectArrayItemTransformStep
  | WidgetExtractPathTransformStep;

export interface WidgetPortBinding {
  sourceWidgetId: string;
  sourceOutputId: string;
  transformSteps?: WidgetBindingTransformStep[];
  transformId?: string;
  transformPath?: string[];
  transformContractId?: WidgetContractId;
}

export type WidgetPortBindingValue = WidgetPortBinding | WidgetPortBinding[];
export type WidgetInstanceBindings = Record<string, WidgetPortBindingValue>;

export interface WidgetInputEffect {
  kind:
    | "drives-options"
    | "drives-default"
    | "drives-value"
    | "drives-validation"
    | "drives-render";
  sourcePath: string;
  target:
    | { kind: "schema-field"; id: string }
    | { kind: "generated-field"; id: string }
    | { kind: "prop"; path: string }
    | { kind: "render"; id: string };
  description?: string;
}

export type WidgetExecutionReason =
  | "manual-submit"
  | "settings-test"
  | "dashboard-refresh"
  | "manual-recalculate"
  | "upstream-update";

export type WidgetWorkspaceRuntimeMode = "execution-owner" | "consumer" | "local-ui";
export type WidgetCanvasEditingMode = "none" | "inline";
export type WidgetExecutionRefreshPolicy = "manual-only" | "allow-refresh";
export type WidgetRegistryConfigurationMode =
  | "none"
  | "static-schema"
  | "custom-settings"
  | "hybrid";
export type WidgetRegistryIoMode = "none" | "static" | "dynamic" | "consumer";
export type WidgetRegistryRefreshPolicy = WidgetExecutionRefreshPolicy | "not-applicable";
export type WidgetRegistryConfigurationFieldSource =
  | "schema"
  | "custom-settings"
  | "runtime-derived";

export interface WidgetRegistryConfigurationFieldDescriptor {
  id: string;
  label: string;
  type: string;
  description?: string;
  sectionId?: string;
  required?: boolean;
  source?: WidgetRegistryConfigurationFieldSource;
}

export interface WidgetRegistryConfigurationContract {
  mode: WidgetRegistryConfigurationMode;
  summary: string;
  sections?: WidgetFieldSection[];
  fields?: WidgetRegistryConfigurationFieldDescriptor[];
  dynamicConfigSummary?: string;
  configurationNotes?: string[];
  requiredSetupSteps?: string[];
}

export interface WidgetRegistryRuntimeContract {
  workspaceRuntimeMode: WidgetWorkspaceRuntimeMode;
  canvasEditingMode: WidgetCanvasEditingMode;
  supportsExecution: boolean;
  refreshPolicy: WidgetRegistryRefreshPolicy;
  executionTriggers: WidgetExecutionReason[];
  executionSummary: string;
  notes?: string[];
}

export interface WidgetRegistryIoContract {
  mode: WidgetRegistryIoMode;
  summary: string;
  dynamicIoSummary?: string;
  inputContracts?: WidgetContractId[];
  outputContracts?: WidgetContractId[];
  ioNotes?: string[];
}

export interface WidgetRegistryUsageGuidance {
  buildPurpose: string;
  whenToUse: string[];
  whenNotToUse: string[];
  authoringSteps: string[];
  blockingRequirements?: string[];
  commonPitfalls?: string[];
}

export interface WidgetRegistryExample {
  label: string;
  summary: string;
  props?: Record<string, unknown>;
  notes?: string[];
}

export interface WidgetOrganizationConfigurationContract {
  version: number;
  schema: Record<string, unknown>;
  defaultConfig?: Record<string, unknown>;
}

export interface WidgetRegistryContractInput {
  configuration?: Partial<WidgetRegistryConfigurationContract>;
  runtime?: Partial<
    Omit<
      WidgetRegistryRuntimeContract,
      "workspaceRuntimeMode" | "canvasEditingMode" | "supportsExecution"
    >
  >;
  io?: Partial<WidgetRegistryIoContract>;
  capabilities?: Record<string, unknown>;
  usageGuidance: WidgetRegistryUsageGuidance;
  examples?: WidgetRegistryExample[];
}

export type WidgetAgentSnapshotDisplayKind =
  | "table"
  | "chart"
  | "form"
  | "note"
  | "filter"
  | "graph"
  | "custom";
export type WidgetAgentSnapshotState = "ready" | "loading" | "empty" | "error" | "idle";

export interface WidgetAgentSnapshot {
  displayKind: WidgetAgentSnapshotDisplayKind;
  state: WidgetAgentSnapshotState;
  summary: string;
  data?: Record<string, unknown>;
}

export interface WidgetAgentContextValue {
  contractVersion: "v1";
  widgetId: string;
  instanceId: string;
  title: string;
  snapshot: WidgetAgentSnapshot;
}

export interface WidgetPublicExecutionContract {
  queryUrl?: string;
  streamUrl?: string;
  capability?: string;
  allowedInputs?: unknown;
}

export interface WidgetPackageProvenance {
  extensionId: string;
  packageName: string;
  packageVersion: string;
}

export interface WidgetManifestInput {
  apiVersion?: CommandCenterWidgetApiVersion;
  id: string;
  widgetVersion: string;
  title: string;
  description: string;
  category: string;
  kind: WidgetKind;
  source: string;
  defaultSize?: { w: number; h: number };
  responsive?: { minWidthPx?: number };
  requiredPermissions?: string[];
  tags?: string[];
  propsSchema?: Record<string, unknown>;
  propsVersion?: number;
  userStateVersion?: number;
  workspaceRuntimeMode?: WidgetWorkspaceRuntimeMode;
  canvasEditingMode?: WidgetCanvasEditingMode;
  registryContract: WidgetRegistryContractInput;
  organizationConfiguration?: WidgetOrganizationConfigurationContract;
  provenance?: WidgetPackageProvenance;
}

export interface WidgetManifest extends Omit<WidgetManifestInput, "apiVersion" | "defaultSize"> {
  apiVersion: CommandCenterWidgetApiVersion;
  defaultSize: { w: number; h: number };
}

export function isJsonSerializable(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonSerializable(entry, seen))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value as Record<string, unknown>).every((entry) =>
        isJsonSerializable(entry, seen),
      );
  seen.delete(value);
  return valid;
}

export function assertJsonSerializable(value: unknown, label = "value"): void {
  if (!isJsonSerializable(value)) {
    throw new TypeError(`${label} must contain only finite JSON-safe values.`);
  }
}
