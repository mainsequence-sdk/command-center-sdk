import { describe, expect, it, vi } from "vitest";

import { defineResourceApplication } from "./definition.js";
import {
  createHttpResourceAdapter,
  type ResourceHttpClient,
  type ResourceHttpRequest,
} from "./http-adapter.js";
import { createResourcePaginationModel } from "./pagination.js";
import {
  assertSafeBulkActionPath,
  buildAllMatchingBulkSelection,
  buildBulkActionDiscoveryQuery,
  buildExplicitBulkSelection,
  parseBulkActionDiscovery,
  parseBulkActionPreflight,
  parseCollectionControls,
  resolveBulkActionOptions,
  scopeBulkActionQuery,
  scopeBulkActionSelection,
} from "./bulk-actions.js";
import {
  parseResourceDiscovery,
  resolveResourceDiscoveryColumns,
  serializeResourceIdentity,
} from "./discovery.js";

const recordDiscoveryPayload = {
  contract: "command-center.resource_discovery@v1" as const,
  resource: {
    id: "records",
    label: "Records",
    item_label: "record",
    identity: { fields: ["uid"] },
  },
  list: {
    controls: {
      search: { placeholder: "Search records", fields: ["name", "uid"] },
      filters: [],
      ordering: ["name"],
    },
    columns: [
      {
        id: "name",
        header: "Record",
        default_visible: true,
        hideable: false,
        sortable_key: "name",
      },
    ],
  },
  bulk_actions: [],
};

describe("defineResourceApplication", () => {
  it("accepts a normalized resource definition", () => {
    const definition = defineResourceApplication({
      id: "example-services",
      label: "Services",
      getId: (service: { uid: string }) => service.uid,
      adapter: {
        list: async () => ({
          items: [],
          pageInfo: {
            pageIndex: 0,
            pageSize: 25,
            totalItems: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      },
      columns: [{ id: "uid", header: "UID", getValue: (service) => service.uid }],
      detail: { tabs: [{ id: "overview", label: "Overview" }] },
    });

    expect(definition.id).toBe("example-services");
  });

  it("rejects duplicate stable contribution identifiers", () => {
    expect(() =>
      defineResourceApplication({
        id: "services",
        label: "Services",
        getId: (service: { uid: string }) => service.uid,
        adapter: {
          list: async () => ({
            items: [],
            pageInfo: {
              pageIndex: 0,
              pageSize: 25,
              totalItems: 0,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          }),
        },
        columns: [
          { id: "uid", header: "UID" },
          { id: "uid", header: "Duplicate UID" },
        ],
      }),
    ).toThrow(/duplicate identifier "uid"/);
  });
});

describe("collection controls", () => {
  it("parses curated search, filter, and ordering metadata", () => {
    expect(
      parseCollectionControls({
        search: {
          placeholder: "Search by service name or UID",
          fields: ["service_name", "uid"],
        },
        filters: [
          { key: "service_name__contains", label: "Service name", type: "text" },
          {
            key: "class_type",
            label: "Class type",
            type: "select",
            options: [
              { value: "", label: "All types" },
              { value: "duck_db", label: "Duck DB" },
            ],
          },
        ],
        ordering: [],
      }),
    ).toEqual({
      search: {
        placeholder: "Search by service name or UID",
        fields: ["service_name", "uid"],
      },
      filters: [
        { key: "service_name__contains", label: "Service name", type: "text" },
        {
          key: "class_type",
          label: "Class type",
          type: "select",
          options: [
            { value: "", label: "All types" },
            { value: "duck_db", label: "Duck DB" },
          ],
        },
      ],
      ordering: [],
    });
  });

  it("rejects duplicate user-visible filter keys", () => {
    expect(() =>
      parseCollectionControls({
        search: null,
        filters: [
          { key: "name", label: "Name", type: "text" },
          { key: "name", label: "Duplicate name", type: "text" },
        ],
        ordering: [],
      }),
    ).toThrow(/duplicate filter keys/i);
  });

  it("requires an explicit nullable search capability", () => {
    expect(() =>
      parseCollectionControls({ filters: [], ordering: [] }),
    ).toThrow(/invalid search definition/i);
    expect(
      parseCollectionControls({ search: null, filters: [], ordering: [] }),
    ).toEqual({ search: null, filters: [], ordering: [] });
  });
});

describe("canonical resource discovery", () => {
  it("parses identity, controls, ordered columns, and actions", () => {
    expect(parseResourceDiscovery(recordDiscoveryPayload)).toEqual(recordDiscoveryPayload);
  });

  it("rejects unknown fields and inconsistent column capabilities", () => {
    expect(() => parseResourceDiscovery({
      ...recordDiscoveryPayload,
      resource: { ...recordDiscoveryPayload.resource, route: "/consumer-owned/records/" },
    })).toThrow(/unsupported field/i);
    expect(() => parseResourceDiscovery({
      ...recordDiscoveryPayload,
      list: {
        ...recordDiscoveryPayload.list,
        columns: [{
          ...recordDiscoveryPayload.list.columns[0],
          sortable_key: "undeclared",
        }],
      },
    })).toThrow(/undeclared sortable key/i);
  });

  it("serializes compound UI identity as a JSON tuple", () => {
    expect(serializeResourceIdentity(
      { namespace: "default", name: "api" },
      { fields: ["namespace", "name"] },
    )).toBe('["default","api"]');
  });

  it("resolves trusted local renderers and safe generic columns", () => {
    const discovery = parseResourceDiscovery({
      ...recordDiscoveryPayload,
      list: {
        ...recordDiscoveryPayload.list,
        columns: [
          ...recordDiscoveryPayload.list.columns,
          {
            id: "uid",
            header: "UID",
            value_path: "uid",
            data_type: "text",
            default_visible: true,
            hideable: false,
          },
        ],
      },
    });
    const columns = resolveResourceDiscoveryColumns(discovery, [{
      id: "name",
      header: "Old record heading",
      renderCell: (record: { name: string }) => record.name.toUpperCase(),
    }]);
    expect(columns.map((column) => column.header)).toEqual(["Record", "UID"]);
    expect(columns[0]?.renderCell?.({ name: "alpha" })).toBe("ALPHA");
    expect(columns[1]?.getValue?.({ name: "alpha", uid: "record-1" })).toBe("record-1");
  });
});

describe("createHttpResourceAdapter", () => {
  it("normalizes conventional paginated requests without owning authentication", async () => {
    const request = vi.fn(async (_input: ResourceHttpRequest) => ({
      count: 1,
      results: [{ uid: "service-1" }],
    }));
    const client: ResourceHttpClient = {
      async request<Response>(input: ResourceHttpRequest) {
        return await request(input) as unknown as Response;
      },
    };
    const adapter = createHttpResourceAdapter({
      client,
      endpoints: { list: "/services/" },
      normalizeList: (response: { count: number; results: { uid: string }[] }) => ({
        items: response.results,
        pageInfo: {
          pageIndex: 2,
          pageSize: 25,
          totalItems: response.count,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      }),
    });

    await expect(
      adapter.list({ pageIndex: 2, pageSize: 25, search: "alpha" }),
    ).resolves.toEqual({
      items: [{ uid: "service-1" }],
      pageInfo: {
        pageIndex: 2,
        pageSize: 25,
        totalItems: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/services/",
      query: { limit: 25, offset: 50, search: "alpha" },
      signal: undefined,
    });
  });

  it("discovers and executes canonical server-defined bulk actions", async () => {
    const action = {
      id: "delete",
      label: "Delete services",
      endpoint: "/api/v1/services/bulk-delete/",
      method: "POST" as const,
      selection_modes: ["explicit", "all_matching"] as const,
      options: [],
    };
    const request = vi.fn(async (input: ResourceHttpRequest) =>
      input.method === "GET" ? { actions: [action] } : { deleted_count: 2 },
    );
    const adapter = createHttpResourceAdapter({
      client: { request: request as ResourceHttpClient["request"] },
      endpoints: {
        list: "/api/v1/services/",
        bulkActions: "/api/v1/services/bulk-actions/",
      },
      normalizeList: () => ({
        items: [] as { uid: string }[],
        pageInfo: {
          pageIndex: 0,
          pageSize: 25,
          totalItems: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });

    const actions = await adapter.listBulkActions!({
      search: "alpha",
      filters: { owner_uid: "owner-1" },
    });
    await adapter.executeBulkAction!(actions[0], {
      selection: buildExplicitBulkSelection(["service-1", "service-2"]),
      options: {},
    });

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path: "/api/v1/services/bulk-actions/",
      query: { owner_uid: "owner-1", search: "alpha" },
      signal: undefined,
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: action.endpoint,
      body: {
        selection: { mode: "explicit", uids: ["service-1", "service-2"] },
        options: {},
      },
      signal: undefined,
    });
  });

  it("loads canonical resource discovery without pagination parameters", async () => {
    const request = vi.fn(async () => recordDiscoveryPayload);
    const adapter = createHttpResourceAdapter({
      client: { request: request as ResourceHttpClient["request"] },
      endpoints: {
        list: "/records/",
        discovery: "/records/discovery/",
      },
      normalizeList: () => ({
        items: [] as { uid: string }[],
        pageInfo: {
          pageIndex: 0,
          pageSize: 25,
          totalItems: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });

    await expect(adapter.discover!({
      search: "alpha",
      filters: { archived: false },
    })).resolves.toMatchObject({ contract: "command-center.resource_discovery@v1" });
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: "/records/discovery/",
      query: { archived: false, search: "alpha" },
      signal: undefined,
    });
  });
});

describe("bulk action contracts", () => {
  it("normalizes the generic preflight result without discarding warnings", () => {
    const payload = {
      allowed: true,
      detail: "Deletion is allowed with impact.",
      matched_count: 3,
      warnings: ["Three pointers will be cleared."],
    };

    expect(parseBulkActionPreflight(payload)).toEqual({
      allowed: true,
      detail: "Deletion is allowed with impact.",
      impacts: [{ message: "Three pointers will be cleared.", tone: "warning" }],
      items: [],
      matchedCount: 3,
      raw: payload,
    });
  });

  it("preflights through the discovered endpoint with the canonical execution payload", async () => {
    const request = vi.fn(async () => ({
      allowed: true,
      matched_count: 1,
      warnings: [],
    }));
    const adapter = createHttpResourceAdapter({
      client: { request: request as ResourceHttpClient["request"] },
      endpoints: {
        list: "/api/v1/rows/",
        bulkActions: "/api/v1/rows/bulk-actions/",
      },
      normalizeList: () => ({
        items: [] as { uid: string }[],
        pageInfo: {
          pageIndex: 0,
          pageSize: 25,
          totalItems: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });
    const action = parseBulkActionDiscovery({
      actions: [{
        id: "delete",
        label: "Delete rows",
        endpoint: "/api/v1/rows/bulk-delete/",
        preflight_endpoint: "/api/v1/rows/bulk-delete/preflight/",
        method: "POST",
        selection_modes: ["explicit"],
        options: [],
      }],
    }).actions[0]!;
    const controller = new AbortController();

    await expect(adapter.preflightBulkAction!(action, {
      selection: buildExplicitBulkSelection(["row-1"]),
      options: {},
      signal: controller.signal,
    })).resolves.toMatchObject({ allowed: true, matchedCount: 1 });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/rows/bulk-delete/preflight/",
      body: {
        selection: { mode: "explicit", uids: ["row-1"] },
        options: {},
      },
      signal: controller.signal,
    });
  });

  it("keeps selected, filtered-all, and overall-all scopes distinct", () => {
    expect(buildExplicitBulkSelection([" one ", "one"])).toEqual({
      mode: "explicit",
      uids: ["one"],
    });
    expect(buildAllMatchingBulkSelection({ search: "active", filters: {} })).toEqual({
      mode: "all_matching",
      query: { search: "active", filters: {} },
    });
    expect(buildAllMatchingBulkSelection({ filters: {} })).toEqual({
      mode: "all_matching",
      query: { search: "", filters: {} },
    });
  });

  it("preserves hidden host scope for discovery and all-matching execution", () => {
    const scope = { tenant_id: "tenant-1" };

    expect(
      scopeBulkActionQuery(
        { search: "active", filters: { status: "ready", tenant_id: "wrong" } },
        scope,
      ),
    ).toEqual({
      search: "active",
      filters: { status: "ready", tenant_id: "tenant-1" },
    });
    expect(
      scopeBulkActionSelection(
        buildAllMatchingBulkSelection({ search: "active", filters: { status: "ready" } }),
        scope,
      ),
    ).toEqual({
      mode: "all_matching",
      query: {
        search: "active",
        filters: { status: "ready", tenant_id: "tenant-1" },
      },
    });
    const explicit = buildExplicitBulkSelection(["job-1"]);
    expect(scopeBulkActionSelection(explicit, scope)).toBe(explicit);
  });

  it("rejects empty explicit selections and presentation state in semantic queries", () => {
    expect(() => buildExplicitBulkSelection([" "])).toThrow(/at least one UID/);
    expect(() =>
      buildBulkActionDiscoveryQuery({
        search: "active",
        filters: { limit: 25 },
      }),
    ).toThrow(/pagination or presentation/);
  });

  it("rejects absolute, cross-origin, and protocol-relative action paths", () => {
    expect(() => assertSafeBulkActionPath("https://evil.invalid/delete")).toThrow();
    expect(() => assertSafeBulkActionPath("//evil.invalid/delete")).toThrow();
    expect(() => assertSafeBulkActionPath("/safe/#fragment")).toThrow();
  });

  it("derives option defaults from discovery and rejects unavailable options", () => {
    const [action] = parseBulkActionDiscovery({
      actions: [
        {
          id: "delete",
          label: "Delete rows",
          endpoint: "/api/v1/rows/bulk-delete/",
          method: "POST",
          selection_modes: ["explicit", "all_matching"],
          options: [
            {
              key: "override_protection",
              type: "boolean",
              default: false,
              label: "Override protection",
              description: "Delete protected rows.",
            },
          ],
        },
      ],
    }).actions;

    expect(resolveBulkActionOptions(action, {})).toEqual({ override_protection: false });
    expect(resolveBulkActionOptions(action, { override_protection: true })).toEqual({
      override_protection: true,
    });
    expect(() => resolveBulkActionOptions(action, { legacy_override: true })).toThrow();
  });

  it("rejects unsupported discovery tones", () => {
    expect(() =>
      parseBulkActionDiscovery({
        actions: [
          {
            id: "refresh",
            label: "Refresh",
            endpoint: "/api/v1/rows/bulk-refresh/",
            method: "POST",
            tone: "neutral",
            selection_modes: ["explicit"],
            options: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate discovered action IDs and duplicate selection modes", () => {
    const action = {
      id: "delete",
      label: "Delete rows",
      endpoint: "/api/v1/rows/bulk-delete/",
      method: "POST",
      selection_modes: ["explicit"],
      options: [],
    };

    expect(() => parseBulkActionDiscovery({ actions: [action, action] })).toThrow(
      /duplicate action IDs/,
    );
    expect(() =>
      parseBulkActionDiscovery({
        actions: [{ ...action, selection_modes: ["explicit", "explicit"] }],
      }),
    ).toThrow(/duplicate selection modes/);
  });

  it("does not execute a selection mode the action did not advertise", async () => {
    const request = vi.fn();
    const adapter = createHttpResourceAdapter({
      client: { request: request as ResourceHttpClient["request"] },
      endpoints: {
        list: "/api/v1/rows/",
        bulkActions: "/api/v1/rows/bulk-actions/",
      },
      normalizeList: () => ({
        items: [] as { uid: string }[],
        pageInfo: {
          pageIndex: 0,
          pageSize: 25,
          totalItems: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });
    const action = parseBulkActionDiscovery({
      actions: [
        {
          id: "delete",
          label: "Delete rows",
          endpoint: "/api/v1/rows/bulk-delete/",
          method: "POST",
          selection_modes: ["explicit"],
          options: [],
        },
      ],
    }).actions[0]!;

    await expect(
      adapter.executeBulkAction!(action, {
        selection: buildAllMatchingBulkSelection({ filters: {} }),
        options: {},
      }),
    ).rejects.toThrow(/does not support all_matching/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("createResourcePaginationModel", () => {
  it("preserves open-ended server pagination", () => {
    const model = createResourcePaginationModel({
      count: 20,
      hasNextPage: true,
      pageIndex: 1,
      pageSize: 10,
    });

    expect(model.hasOpenEndedNext).toBe(true);
    expect(model.minimumTotalCount).toBe(21);
    expect(model.tokens.at(-1)).toEqual({ kind: "open-ended" });
  });

  it("builds a compact known-total page window", () => {
    const model = createResourcePaginationModel({
      count: 200,
      pageIndex: 10,
      pageSize: 10,
    });

    expect(model.tokens).toContainEqual({ kind: "ellipsis", position: "end" });
    expect(model.tokens).toContainEqual({ kind: "page", pageIndex: 10 });
  });
});
