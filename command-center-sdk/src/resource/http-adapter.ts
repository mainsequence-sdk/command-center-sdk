import type {
  ResourceAdapter,
  ResourceBulkActionDefinition,
  ResourceBulkActionDiscoveryResponse,
  ResourceDiscoveryResponse,
  ResourceId,
  ResourceListRequest,
  ResourceListResult,
} from "./types.js";
import {
  assertBulkActionSelectionMode,
  assertSafeBulkActionPath,
  buildBulkActionDiscoveryQuery,
  parseBulkActionDiscovery,
  parseBulkActionPreflight,
  resolveBulkActionOptions,
  serializeBulkActionExecution,
} from "./bulk-actions.js";
import { parseResourceDiscovery } from "./discovery.js";

export type ResourceHttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface ResourceHttpRequest {
  method: ResourceHttpMethod;
  path: string;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ResourceHttpClient {
  request<Response>(request: ResourceHttpRequest): Promise<Response>;
}

export interface ResourceHttpEndpoints<Id extends ResourceId> {
  list: string;
  discovery?: string;
  /** @deprecated Configure discovery for canonical resource-list metadata and actions. */
  bulkActions?: string;
  detail?: (id: Id) => string;
  create?: string;
  update?: (id: Id) => string;
  delete?: string;
}

export interface HttpResourceAdapterOptions<
  T,
  Id extends ResourceId,
  ListResponse,
  ItemResponse = T,
  CreateInput = unknown,
  UpdateInput = unknown,
> {
  client: ResourceHttpClient;
  endpoints: ResourceHttpEndpoints<Id>;
  normalizeList: (
    response: ListResponse,
    request: ResourceListRequest,
  ) => ResourceListResult<T>;
  normalizeItem?: (response: ItemResponse) => T;
  serializeListQuery?: (
    request: ResourceListRequest,
  ) => Readonly<Record<string, unknown>>;
  createMethod?: "POST" | "PUT";
  updateMethod?: "PATCH" | "PUT";
  serializeCreate?: (input: CreateInput) => unknown;
  serializeUpdate?: (input: UpdateInput) => unknown;
  serializeDelete?: (ids: readonly Id[]) => unknown;
}

function buildListQuery(input: ResourceListRequest): Readonly<Record<string, unknown>> {
  return {
    ...(input.filters ?? {}),
    limit: input.pageSize,
    offset: input.pageIndex * input.pageSize,
    ...(input.search ? { search: input.search } : {}),
    ...(input.sort && input.sort.length > 0 ? { sort: input.sort } : {}),
  };
}

/**
 * Creates a normalized resource adapter for conventional request/response APIs.
 * Authentication, base URLs, headers, retries, and error normalization belong to the supplied
 * client rather than this framework helper.
 */
export function createHttpResourceAdapter<
  T,
  Id extends ResourceId,
  ListResponse,
  ItemResponse = T,
  CreateInput = unknown,
  UpdateInput = unknown,
>(
  options: HttpResourceAdapterOptions<
    T,
    Id,
    ListResponse,
    ItemResponse,
    CreateInput,
    UpdateInput
  >,
): ResourceAdapter<T, Id, CreateInput, UpdateInput> {
  const normalizeItem = options.normalizeItem ?? ((response: ItemResponse) => response as unknown as T);
  const adapter: ResourceAdapter<T, Id, CreateInput, UpdateInput> = {
    async list(input) {
      const response = await options.client.request<ListResponse>({
        method: "GET",
        path: options.endpoints.list,
        query: options.serializeListQuery
          ? options.serializeListQuery(input)
          : buildListQuery(input),
        signal: input.signal,
      });

      return options.normalizeList(response, input);
    },
  };

  if (options.endpoints.detail) {
    adapter.get = async (id, requestOptions) => {
      const response = await options.client.request<ItemResponse>({
        method: "GET",
        path: options.endpoints.detail!(id),
        signal: requestOptions?.signal,
      });

      return normalizeItem(response);
    };
  }

  if (options.endpoints.create) {
    adapter.create = async (input, requestOptions) => {
      const response = await options.client.request<ItemResponse>({
        method: options.createMethod ?? "POST",
        path: options.endpoints.create!,
        body: options.serializeCreate ? options.serializeCreate(input) : input,
        signal: requestOptions?.signal,
      });

      return normalizeItem(response);
    };
  }

  if (options.endpoints.update) {
    adapter.update = async (id, input, requestOptions) => {
      const response = await options.client.request<ItemResponse>({
        method: options.updateMethod ?? "PATCH",
        path: options.endpoints.update!(id),
        body: options.serializeUpdate ? options.serializeUpdate(input) : input,
        signal: requestOptions?.signal,
      });

      return normalizeItem(response);
    };
  }

  if (options.endpoints.delete) {
    adapter.delete = async (ids, requestOptions) => {
      await options.client.request<unknown>({
        method: "DELETE",
        path: options.endpoints.delete!,
        body: options.serializeDelete ? options.serializeDelete(ids) : { ids },
        signal: requestOptions?.signal,
      });
    };
  }

  if (options.endpoints.bulkActions) {
    adapter.listBulkActions = async (query, requestOptions) => {
      const response = await options.client.request<ResourceBulkActionDiscoveryResponse>({
        method: "GET",
        path: assertSafeBulkActionPath(options.endpoints.bulkActions!),
        query: buildBulkActionDiscoveryQuery(query),
        signal: requestOptions?.signal,
      });
      return parseBulkActionDiscovery(response).actions;
    };

    adapter.preflightBulkAction = async (action, input) => {
      if (!action.preflight_endpoint) {
        throw new Error(`Bulk action "${action.id}" does not advertise preflight.`);
      }
      assertBulkActionSelectionMode(action, input.selection);
      const response = await options.client.request<unknown>({
        method: action.method,
        path: assertSafeBulkActionPath(action.preflight_endpoint),
        body: serializeBulkActionExecution({
          ...input,
          options: resolveBulkActionOptions(action, input.options),
        }),
        signal: input.signal,
      });
      return parseBulkActionPreflight<Id>(response);
    };

    adapter.executeBulkAction = async (action: ResourceBulkActionDefinition, input) => {
      assertBulkActionSelectionMode(action, input.selection);
      return options.client.request<unknown>({
        method: action.method,
        path: assertSafeBulkActionPath(action.endpoint),
        body: serializeBulkActionExecution({
          ...input,
          options: resolveBulkActionOptions(action, input.options),
        }),
        signal: input.signal,
      });
    };
  }

  if (options.endpoints.discovery) {
    adapter.discover = async (query, requestOptions) => {
      const response = await options.client.request<ResourceDiscoveryResponse>({
        method: "GET",
        path: assertSafeBulkActionPath(options.endpoints.discovery!),
        query: buildBulkActionDiscoveryQuery(query),
        signal: requestOptions?.signal,
      });
      return parseResourceDiscovery(response);
    };

    adapter.preflightBulkAction = async (action, input) => {
      if (!action.preflight_endpoint) {
        throw new Error(`Bulk action "${action.id}" does not advertise preflight.`);
      }
      assertBulkActionSelectionMode(action, input.selection);
      const response = await options.client.request<unknown>({
        method: action.method,
        path: assertSafeBulkActionPath(action.preflight_endpoint),
        body: serializeBulkActionExecution({
          ...input,
          options: resolveBulkActionOptions(action, input.options),
        }),
        signal: input.signal,
      });
      return parseBulkActionPreflight<Id>(response);
    };

    adapter.executeBulkAction = async (action: ResourceBulkActionDefinition, input) => {
      assertBulkActionSelectionMode(action, input.selection);
      return options.client.request<unknown>({
        method: action.method,
        path: assertSafeBulkActionPath(action.endpoint),
        body: serializeBulkActionExecution({
          ...input,
          options: resolveBulkActionOptions(action, input.options),
        }),
        signal: input.signal,
      });
    };
  }

  return adapter;
}
