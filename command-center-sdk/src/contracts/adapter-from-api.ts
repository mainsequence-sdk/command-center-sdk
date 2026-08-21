export const ADAPTER_FROM_API_CONNECTION_TYPE_ID = "command_center.adapter_from_api" as const;
export const ADAPTER_FROM_API_QUERY_KIND = "api-operation" as const;
export const ADAPTER_FROM_API_WELL_KNOWN_PATH =
  "/.well-known/command-center/connection-contract" as const;
export const ADAPTER_FROM_API_DISCOVERY_CONTRACT =
  "command-center.adapter_from_api.discovery@v1" as const;
export const ADAPTER_FROM_API_QUERY_CONTRACT =
  "command-center.adapter_from_api.query@v1" as const;
export const ADAPTER_FROM_API_PUBLIC_CONFIG_CONTRACT =
  "command-center.adapter_from_api.public_config@v1" as const;
export const ADAPTER_FROM_API_SECURE_CONFIG_CONTRACT =
  "command-center.adapter_from_api.secure_config@v1" as const;

export type AdapterFromApiFieldType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "json"
  | "secret";

export type AdapterFromApiParameterLocation = "path" | "query" | "headers";
export type AdapterFromApiHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type AdapterFromApiCachePolicy = "safe" | "disabled";
export type AdapterFromApiTransportMode = "backend" | "direct";
export type AdapterFromApiCompiledContractSource = "backend" | "direct";

export interface AdapterFromApiFieldOption {
  label: string;
  value: string;
}

export interface AdapterFromApiValidationRule {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface AdapterFromApiVariableDefinition {
  key: string;
  label: string;
  description?: string;
  type: AdapterFromApiFieldType;
  required?: boolean;
  defaultValue?: unknown;
  example?: unknown;
  renderAs?: string;
  options?: AdapterFromApiFieldOption[];
  validation?: AdapterFromApiValidationRule;
}

export interface AdapterFromApiPublicVariableDefinition
  extends Omit<AdapterFromApiVariableDefinition, "type"> {
  type: Exclude<AdapterFromApiFieldType, "secret">;
}

export interface AdapterFromApiSecretDefinition extends AdapterFromApiVariableDefinition {
  type: "secret";
  injection?: {
    type: "header" | "query" | "basic" | "bearer";
    name?: string;
    template?: string;
  };
}

export interface AdapterFromApiDiscoverySecretDefinitionV1
  extends Omit<AdapterFromApiSecretDefinition, "injection"> {
  injection: NonNullable<AdapterFromApiSecretDefinition["injection"]>;
}

export interface AdapterFromApiLogo {
  url: string;
  altText?: string;
  backgroundColor?: string;
  href?: string;
  source?: "openapi.info.x-logo";
}

export interface AdapterFromApiOpenApiReference {
  url?: string;
  version?: string;
  checksum?: string;
  logo?: AdapterFromApiLogo;
}

export interface AdapterFromApiInfo {
  type?: "adapter-from-api";
  id?: string;
  title?: string;
  description?: string;
  logo?: AdapterFromApiLogo;
}

export interface AdapterFromApiOperationParameter extends AdapterFromApiVariableDefinition {
  key: string;
  name?: string;
}

export interface AdapterFromApiOperationParameterV1
  extends Omit<AdapterFromApiOperationParameter, "type"> {
  type: Exclude<AdapterFromApiFieldType, "secret">;
}

export interface AdapterFromApiHealthDefinition {
  /** References one operation in `availableOperations`; that operation owns the HTTP method/path. */
  operationId: string;
  /** Exact successful HTTP status to require. When omitted, any 2xx status is healthy. */
  expectedStatus?: number;
  /** Maximum provider-call duration for the health probe. */
  timeoutMs?: number;
}

export interface AdapterFromApiOperationDefinition {
  operationId: string;
  label?: string;
  description?: string;
  method: string;
  path: string;
  kind?: "query" | "resource" | "mutation";
  capabilities?: Array<"query" | "resource" | "mutation">;
  requiresTimeRange?: boolean;
  supportsVariables?: boolean;
  supportsMaxRows?: boolean;
  parameters?: Partial<
    Record<AdapterFromApiParameterLocation, AdapterFromApiOperationParameter[]>
  >;
  requestBody?: {
    required?: boolean;
    contentType?: string;
    schema?: unknown;
    description?: string;
  } | null;
  /** Exact contract implemented by the provider response body. */
  responseContract?: string;
  responseModel?: string | null;
  cache?: {
    policy?: AdapterFromApiCachePolicy;
    ttlMs?: number;
    dedupeInFlight?: boolean;
  };
}

export interface AdapterFromApiOperationDefinitionV1
  extends Omit<AdapterFromApiOperationDefinition, "method" | "parameters"> {
  method: AdapterFromApiHttpMethod;
  kind: NonNullable<AdapterFromApiOperationDefinition["kind"]>;
  capabilities: NonNullable<AdapterFromApiOperationDefinition["capabilities"]>;
  parameters?: Partial<
    Record<AdapterFromApiParameterLocation, AdapterFromApiOperationParameterV1[]>
  >;
}

/**
 * Partial working shape used while discovery/editor state is being assembled.
 * It is not the canonical wire payload; persisted v1 snapshots use
 * `AdapterFromApiDiscoveryContractV1`.
 */
export interface AdapterFromApiCompiledContract {
  contractVersion: number | string;
  adapter?: AdapterFromApiInfo;
  openapi?: AdapterFromApiOpenApiReference;
  configVariables?: AdapterFromApiVariableDefinition[];
  secretVariables?: AdapterFromApiSecretDefinition[];
  availableOperations?: AdapterFromApiOperationDefinition[];
  health?: AdapterFromApiHealthDefinition;
  apiBaseUrl?: string;
  checksum?: string;
}

/** Strict provider-owned payload served from the well-known discovery endpoint. */
export interface AdapterFromApiDiscoveryContractV1 {
  contractVersion: 1;
  adapter: AdapterFromApiInfo & {
    type: "adapter-from-api";
    id: string;
    title: string;
    description: string;
  };
  openapi: AdapterFromApiOpenApiReference & { url: string };
  configVariables: AdapterFromApiPublicVariableDefinition[];
  secretVariables: AdapterFromApiDiscoverySecretDefinitionV1[];
  availableOperations: AdapterFromApiOperationDefinitionV1[];
  health: AdapterFromApiHealthDefinition;
  apiBaseUrl?: string;
  checksum?: string;
}

/** Partial application/editor state; not a persisted v1 wire payload. */
export interface AdapterFromApiPublicConfig {
  transportMode?: AdapterFromApiTransportMode;
  contractDefinitionUrl?: string;
  openApiUrl?: string;
  apiBaseUrl?: string;
  debugApiBaseUrl?: string;
  contractVersion?: string;
  configValues?: Record<string, unknown>;
  compiledContract?: AdapterFromApiCompiledContract;
  compiledContractSource?: AdapterFromApiCompiledContractSource;
  compiledContractSourceUrl?: string;
  requestTimeoutMs?: number;
  queryCachePolicy?: AdapterFromApiCachePolicy;
  queryCacheTtlMs?: number;
  dedupeInFlight?: boolean;
}

interface AdapterFromApiPersistedPublicConfigV1Base {
  contractDefinitionUrl: string;
  openApiUrl: string;
  contractVersion?: string;
  configValues: Record<string, unknown>;
  compiledContract: AdapterFromApiDiscoveryContractV1;
  compiledContractSourceUrl: string;
  requestTimeoutMs?: number;
  queryCachePolicy?: AdapterFromApiCachePolicy;
  queryCacheTtlMs?: number;
  dedupeInFlight?: boolean;
}

export interface AdapterFromApiBackendPublicConfigV1
  extends AdapterFromApiPersistedPublicConfigV1Base {
  transportMode: "backend";
  apiBaseUrl: string;
  compiledContractSource: "backend";
}

export interface AdapterFromApiDirectPublicConfigV1
  extends AdapterFromApiPersistedPublicConfigV1Base {
  transportMode: "direct";
  debugApiBaseUrl: string;
  compiledContractSource: "direct";
}

/** Canonical persisted configuration. Editor drafts use `AdapterFromApiPublicConfig`. */
export type AdapterFromApiPublicConfigV1 =
  | AdapterFromApiBackendPublicConfigV1
  | AdapterFromApiDirectPublicConfigV1;

export interface AdapterFromApiSecureConfigV1 {
  secretValues?: Record<string, unknown>;
}

/** Partial query-editor state; not an executable v1 wire payload. */
export interface AdapterFromApiConnectionQuery {
  kind?: typeof ADAPTER_FROM_API_QUERY_KIND;
  operationId?: string;
  parameters?: Partial<
    Record<AdapterFromApiParameterLocation, Record<string, unknown>>
  >;
  body?: unknown;
}

/** Canonical executable query. Editor drafts use `AdapterFromApiConnectionQuery`. */
export interface AdapterFromApiConnectionQueryV1
  extends Omit<AdapterFromApiConnectionQuery, "kind" | "operationId"> {
  kind: typeof ADAPTER_FROM_API_QUERY_KIND;
  operationId: string;
}
