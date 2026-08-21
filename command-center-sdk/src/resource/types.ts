export type ResourceId = string | number;

export const RESOURCE_COLLECTION_CONTRACT = "command-center.resource_collection@v1" as const;
export const RESOURCE_BULK_ACTION_DISCOVERY_CONTRACT =
  "command-center.bulk_action_discovery@v1" as const;
export const RESOURCE_BULK_ACTION_EXECUTION_CONTRACT =
  "command-center.bulk_action_execution@v1" as const;
export const RESOURCE_BULK_ACTION_PREFLIGHT_CONTRACT =
  "command-center.bulk_action_preflight@v1" as const;
export const RESOURCE_DISCOVERY_CONTRACT = "command-center.resource_discovery@v1" as const;

export type ResourceSortDirection = "ascending" | "descending";

export interface ResourceSort {
  key: string;
  direction: ResourceSortDirection;
}

export interface ResourceListRequest {
  pageIndex: number;
  pageSize: number;
  search?: string;
  filters?: Readonly<Record<string, unknown>>;
  sort?: readonly ResourceSort[];
  signal?: AbortSignal;
}

export interface ResourceListResult<T> {
  items: readonly T[];
  pageInfo: ResourcePageInfo;
  /** @deprecated Canonical lists load controls through ResourceAdapter.discover. */
  controls?: ResourceCollectionControls;
  /** @deprecated Canonical lists load actions through ResourceAdapter.discover. */
  bulkActions?: readonly ResourceBulkActionDefinition[];
}

export interface ResourcePageInfo {
  pageIndex: number;
  pageSize: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ResourceGetOptions {
  signal?: AbortSignal;
}

export interface ResourceActionInput<T, Id extends ResourceId> {
  ids: readonly Id[];
  items: readonly T[];
  payload?: unknown;
  signal?: AbortSignal;
}

export interface ResourceBulkActionQuery {
  search?: string;
  filters: Readonly<Record<string, unknown>>;
}

export type ResourceBulkSelection<Id extends ResourceId = ResourceId> =
  | { mode: "explicit"; uids: readonly Id[] }
  | { mode: "all_matching"; query: ResourceBulkActionQuery };

export interface ResourceBulkActionConfirmation {
  title: string;
  word: string;
  button_label: string;
  warning: string;
}

export interface ResourceBulkActionOption {
  key: string;
  type: "boolean";
  default: boolean;
  label: string;
  description: string;
}

export interface ResourceBulkActionDefinition {
  id: string;
  label: string;
  endpoint: string;
  method: "POST";
  tone?: ResourceActionTone;
  selection_modes: readonly ResourceBulkSelection["mode"][];
  confirmation?: ResourceBulkActionConfirmation;
  options: readonly ResourceBulkActionOption[];
  preflight_endpoint?: string;
}

export interface ResourceBulkActionDiscoveryResponse {
  actions: readonly ResourceBulkActionDefinition[];
}

export interface ResourceCollectionSearchControl {
  placeholder: string;
  fields: readonly string[];
}

export interface ResourceCollectionFilterOption {
  value: string | number | boolean;
  label: string;
}

export type ResourceCollectionFilterControl =
  | {
      key: string;
      label: string;
      type: "text" | "boolean";
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: readonly ResourceCollectionFilterOption[];
    };

export interface ResourceCollectionControls {
  search: ResourceCollectionSearchControl | null;
  filters: readonly ResourceCollectionFilterControl[];
  ordering: readonly string[];
}

export type ResourceDiscoveryColumnDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "badge"
  | "list"
  | "json";

export interface ResourceDiscoveryIdentity {
  fields: readonly string[];
}

export interface ResourceDiscoveryResource {
  id: string;
  label: string;
  item_label: string;
  identity: ResourceDiscoveryIdentity;
  extensions?: Readonly<Record<string, unknown>>;
}

export interface ResourceDiscoveryColumn {
  id: string;
  header: string;
  value_path?: string;
  data_type?: ResourceDiscoveryColumnDataType;
  default_visible: boolean;
  hideable: boolean;
  sortable_key?: string;
  filter_key?: string;
  importance?: "primary" | "secondary" | "tertiary";
  align?: "start" | "center" | "end";
  extensions?: Readonly<Record<string, unknown>>;
}

export interface ResourceDiscoveryResponse {
  contract: typeof RESOURCE_DISCOVERY_CONTRACT;
  resource: ResourceDiscoveryResource;
  list: {
    controls: ResourceCollectionControls;
    columns: readonly ResourceDiscoveryColumn[];
  };
  bulk_actions: readonly ResourceBulkActionDefinition[];
  extensions?: Readonly<Record<string, unknown>>;
}

export interface ResourceBulkActionExecutionPayload<Id extends ResourceId = ResourceId> {
  selection: ResourceBulkSelection<Id>;
  options: Readonly<Record<string, unknown>>;
}

export interface ResourceBulkActionExecutionInput<Id extends ResourceId = ResourceId>
  extends ResourceBulkActionExecutionPayload<Id> {
  signal?: AbortSignal;
}

export interface ResourceBulkActionPreflightResponse {
  allowed: boolean;
  detail?: string;
  matched_count?: number;
  blockers?: string[];
  warnings?: string[];
  [key: string]: unknown;
}

export interface ResourceBulkActionPreflightImpact {
  count?: number;
  id?: string;
  message: string;
  tone: "default" | "warning" | "danger";
}

export interface ResourceBulkActionPreflightItem<Id extends ResourceId = ResourceId> {
  id: Id;
  label: string;
  impacts: readonly ResourceBulkActionPreflightImpact[];
}

export interface ResourceBulkActionPreflightResult<Id extends ResourceId = ResourceId> {
  allowed: boolean;
  detail?: string;
  impacts: readonly ResourceBulkActionPreflightImpact[];
  items: readonly ResourceBulkActionPreflightItem<Id>[];
  matchedCount?: number;
  raw: unknown;
}

export type ResourceBulkActionPreflightState<Id extends ResourceId = ResourceId> =
  | { status: "not_required" }
  | { status: "loading" }
  | { status: "allowed" | "blocked"; result: ResourceBulkActionPreflightResult<Id> }
  | { status: "error"; error: string };

export interface ResourceAdapter<
  T,
  Id extends ResourceId = ResourceId,
  CreateInput = unknown,
  UpdateInput = unknown,
> {
  list(input: ResourceListRequest): Promise<ResourceListResult<T>>;
  discover?(
    query: ResourceBulkActionQuery,
    options?: ResourceGetOptions,
  ): Promise<ResourceDiscoveryResponse>;
  get?(id: Id, options?: ResourceGetOptions): Promise<T | null>;
  create?(input: CreateInput, options?: ResourceGetOptions): Promise<T>;
  update?(id: Id, input: UpdateInput, options?: ResourceGetOptions): Promise<T>;
  delete?(ids: readonly Id[], options?: ResourceGetOptions): Promise<void>;
  executeAction?(
    actionId: string,
    input: ResourceActionInput<T, Id>,
  ): Promise<unknown>;
  /** @deprecated Implement discover() for canonical resource-list presentation and actions. */
  listBulkActions?(
    query: ResourceBulkActionQuery,
    options?: ResourceGetOptions,
  ): Promise<readonly ResourceBulkActionDefinition[]>;
  preflightBulkAction?(
    action: ResourceBulkActionDefinition,
    input: ResourceBulkActionExecutionInput<Id>,
  ): Promise<ResourceBulkActionPreflightResult<Id>>;
  executeBulkAction?(
    action: ResourceBulkActionDefinition,
    input: ResourceBulkActionExecutionInput<Id>,
  ): Promise<unknown>;
}

export interface ResourceColumnDefinition<T, Cell = unknown> {
  id: string;
  header: string;
  getValue?: (resource: T) => unknown;
  renderCell?: (resource: T) => Cell;
  sortableKey?: string;
}

export type ResourceActionTone = "default" | "primary" | "warning" | "danger";

export interface ResourceActionDefinition<T, Id extends ResourceId> {
  id: string;
  label: string;
  scope: "global" | "row" | "selection" | "detail";
  tone?: ResourceActionTone;
  requiresConfirmation?: boolean;
  isVisible?: (input: ResourceActionInput<T, Id>) => boolean;
  isDisabled?: (input: ResourceActionInput<T, Id>) => boolean;
}

export interface ResourceDetailSubTabDefinition {
  id: string;
  label: string;
  count?: number;
}

export interface ResourceDetailTabDefinition<T = unknown> {
  id: string;
  label: string;
  count?: number;
  subTabs?: readonly ResourceDetailSubTabDefinition[];
  isVisible?: (resource: T) => boolean;
}

export interface ResourceDetailDefinition<T> {
  tabs?: readonly ResourceDetailTabDefinition<T>[];
}

export interface ResourceBreadcrumbDefinition {
  id: string;
  label: string;
  onSelect?: () => void;
}

export type EntitySummaryTone =
  | "default"
  | "primary"
  | "secondary"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | string;

export interface EntitySummaryEntity {
  id: ResourceId;
  type: string;
  title: string;
}

export interface EntitySummaryBadge {
  key: string;
  label: string;
  tone?: EntitySummaryTone;
  link_url?: string | null;
}

export interface EntitySummaryEditableDescriptor {
  enabled?: boolean;
}

export interface EntitySummaryField {
  key: string;
  label: string;
  value: unknown;
  kind?: string;
  meta?: string;
  icon?: string;
  image?: string;
  image_alt?: string;
  tone?: EntitySummaryTone;
  info?: string;
  link_url?: string | null;
  href?: string;
  iframe?: boolean;
  edit?: EntitySummaryEditableDescriptor;
}

export interface EntitySummaryStat {
  key: string;
  label: string;
  display: string;
  value: unknown;
  kind?: string;
  info?: string;
  link_url?: string | null;
  edit?: EntitySummaryEditableDescriptor;
}

export interface EntitySummaryLabelManagement {
  labels: string[];
  add_label_url?: string | null;
  remove_label_url?: string | null;
}

export interface EntitySummary {
  entity: EntitySummaryEntity;
  badges: EntitySummaryBadge[];
  inline_fields: EntitySummaryField[];
  highlight_fields: EntitySummaryField[];
  stats: EntitySummaryStat[];
  label_management?: EntitySummaryLabelManagement;
  labels?: string[];
  labelable?: boolean;
  summary_warning?: string | null;
  helpers?: unknown;
  extensions?: unknown;
}

export type EntitySummaryItem = EntitySummaryBadge | EntitySummaryField | EntitySummaryStat;

export interface ResourceOpenIntent<Id extends ResourceId = ResourceId> {
  resource: string;
  uid: Id;
}

export interface ResourceActivationOptions {
  signal: AbortSignal;
}

export interface ResourceActivationAdapter<
  T,
  TargetId extends ResourceId = ResourceId,
> {
  resolve(
    resource: T,
    options: ResourceActivationOptions,
  ):
    | ResourceOpenIntent<TargetId>
    | null
    | Promise<ResourceOpenIntent<TargetId> | null>;
}

export interface ResourceNavigationAdapter {
  open(intent: ResourceOpenIntent): void | Promise<void>;
}

export interface ResourceApplicationDefinition<
  T,
  Id extends ResourceId = ResourceId,
  CreateInput = unknown,
  UpdateInput = unknown,
> {
  id: string;
  label: string;
  description?: string;
  itemLabel?: string;
  getId: (resource: T) => Id;
  adapter: ResourceAdapter<T, Id, CreateInput, UpdateInput>;
  activation?: ResourceActivationAdapter<T>;
  columns: readonly ResourceColumnDefinition<T>[];
  actions?: readonly ResourceActionDefinition<T, Id>[];
  detail?: ResourceDetailDefinition<T>;
}
