import type { WidgetContractId } from "./widget-contracts.js";

export const APP_COMPONENT_AUTHORING_CONTRACT =
  "command-center.app_component_authoring@v1" as const;
export const APP_COMPONENT_AUTHORING_SCHEMA_ID =
  "urn:mainsequence:command-center-sdk:schema:app-component-authoring:v1" as const;
export const CORE_APP_COMPONENT_WIDGET_ID = "core__app-component" as const;

export const TABULAR_TRANSFORM_AUTHORING_CONTRACT =
  "command-center.tabular_transform_authoring@v1" as const;
export const TABULAR_TRANSFORM_AUTHORING_SCHEMA_ID =
  "urn:mainsequence:command-center-sdk:schema:tabular-transform-authoring:v1" as const;
export const CORE_TABULAR_TRANSFORM_WIDGET_ID = "core__tabular-transform" as const;

export type AppComponentHttpMethod =
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head";
export type AppComponentAuthMode = "session-jwt" | "none";
export type AppComponentApiTargetMode = "manual" | "mock-json" | (string & {});
export type AppComponentFieldLocation = "path" | "query" | "header" | "body";
export type AppComponentGeneratedFieldKind =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "date-time"
  | "enum"
  | "json";

export interface AppComponentServiceHeader {
  name: string;
  value: string;
}

export interface AppComponentOpenApiReference { $ref: string }
export interface AppComponentOpenApiSchema {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  enum?: unknown[];
  nullable?: boolean;
  properties?: Record<string, AppComponentOpenApiSchema | AppComponentOpenApiReference>;
  required?: string[];
  items?: AppComponentOpenApiSchema | AppComponentOpenApiReference;
  additionalProperties?: boolean | AppComponentOpenApiSchema | AppComponentOpenApiReference;
  [key: string]: unknown;
}
export interface AppComponentOpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema?: AppComponentOpenApiSchema | AppComponentOpenApiReference;
  example?: unknown;
  [key: string]: unknown;
}

export interface AppComponentMockJsonDefinition {
  version: 1;
  operation: {
    method?: AppComponentHttpMethod;
    path?: string;
    summary?: string;
    description?: string;
    ui?: Record<string, unknown>;
  };
  request?: {
    parameters?: AppComponentOpenApiParameter[];
    bodySchema?: AppComponentOpenApiSchema;
    bodyRequired?: boolean;
    bodyDescription?: string;
    bodyContentType?: string;
  };
  response: {
    status?: number;
    description?: string;
    contentType?: string;
    body?: unknown;
    schema?: AppComponentOpenApiSchema;
    ui?: Record<string, unknown>;
  };
}

export interface AppComponentBindingInputPortSpec {
  id: string;
  fieldKey: string;
  label: string;
  description?: string;
  required: boolean;
  location: AppComponentFieldLocation;
  kind: AppComponentGeneratedFieldKind;
  accepts: WidgetContractId[];
}
export interface AppComponentBindingOutputPortSpec {
  id: string;
  label: string;
  description?: string;
  kind: AppComponentGeneratedFieldKind;
  contract: WidgetContractId;
  responsePath: string[];
  statusCode: string;
  contentType: string | null;
}
export interface AppComponentBindingSpec {
  version: 1;
  operationKey: string;
  requestPorts: AppComponentBindingInputPortSpec[];
  responsePorts: AppComponentBindingOutputPortSpec[];
  requestForm?: Record<string, unknown>;
}
export interface AppComponentRequestInputMap {
  version: 1;
  operationKey: string;
  fields: Record<string, { visibleOnCard?: boolean; label?: string; prefillValue?: string }>;
}

export interface AppComponentAuthoringPropsV1 extends Record<string, unknown> {
  apiTargetMode?: AppComponentApiTargetMode;
  mockJson?: AppComponentMockJsonDefinition;
  apiBaseUrl?: string;
  serviceHeaders?: AppComponentServiceHeader[];
  authMode?: AppComponentAuthMode;
  method?: AppComponentHttpMethod;
  path?: string;
  requestBodyContentType?: string;
  bindingSpec?: AppComponentBindingSpec;
  requestInputMap?: AppComponentRequestInputMap;
  compactCardLayout?: "one-column" | "two-columns" | "three-columns";
  showHeader?: boolean;
  showResponse?: boolean;
  hideRequestButton?: boolean;
  requestButtonLabel?: string;
  refreshOnDashboardRefresh?: boolean;
}

export interface AppComponentAuthoringContractV1 {
  contract: typeof APP_COMPONENT_AUTHORING_CONTRACT;
  widgetId: typeof CORE_APP_COMPONENT_WIDGET_ID;
  props: AppComponentAuthoringPropsV1;
}

export type TabularTransformMode = "none" | "filter" | "aggregate" | "pivot" | "unpivot";
export type TabularAggregateMode = "first" | "last" | "sum" | "mean" | "min" | "max";
export type TabularFilterCombineMode = "all" | "any";
export type TabularTransformRowMergeMode = "passthrough" | "latest";
export type TabularFilterOperator =
  | "equals"
  | "not-equals"
  | "in"
  | "not-in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is-empty"
  | "is-not-empty";

export interface TabularFilterRule {
  field?: string;
  operator?: TabularFilterOperator;
  value?: unknown;
}
export interface TabularTransformComputedColumnConfig {
  key?: string;
  label?: string;
  type?: "number" | "string" | "boolean" | "json";
  formulaExpression?: string;
}
export interface TabularTransformMergeKeyMapping {
  seedField: string;
  liveField: string;
}
export interface TabularTransformAuthoringPropsV1 extends Record<string, unknown> {
  transformMode?: TabularTransformMode;
  aggregateMode?: TabularAggregateMode;
  computedColumns?: TabularTransformComputedColumnConfig[];
  filterCombineMode?: TabularFilterCombineMode;
  filterRules?: TabularFilterRule[];
  keyFields?: string[];
  pivotField?: string;
  pivotValueField?: string;
  projectFields?: string[];
  rowMergeKeyFields?: string[];
  rowMergeKeyMappings?: TabularTransformMergeKeyMapping[];
  rowMergeMode?: TabularTransformRowMergeMode;
  unpivotFieldName?: string;
  unpivotValueFieldName?: string;
  unpivotValueFields?: string[];
}
export interface TabularTransformAuthoringContractV1 {
  contract: typeof TABULAR_TRANSFORM_AUTHORING_CONTRACT;
  widgetId: typeof CORE_TABULAR_TRANSFORM_WIDGET_ID;
  props: TabularTransformAuthoringPropsV1;
}
