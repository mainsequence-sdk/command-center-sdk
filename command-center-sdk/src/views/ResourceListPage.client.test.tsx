// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ResourceApplicationDefinition,
  ResourceBulkActionDefinition,
  ResourceBulkActionPreflightResult,
} from "../resource/types.js";
import { ResourceListPage } from "./ResourceListPage.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

type Bucket = { name: string; uid: string };

const page = {
  items: [{ name: "Artifacts", uid: "bucket-uid" }],
  pageInfo: {
    pageIndex: 0,
    pageSize: 25,
    totalItems: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

const deleteAction: ResourceBulkActionDefinition = {
  id: "delete",
  label: "Delete bucket",
  endpoint: "/buckets/bulk-delete/",
  method: "POST",
  tone: "danger",
  selection_modes: ["explicit", "all_matching"],
  options: [],
};

const preflightDeleteAction: ResourceBulkActionDefinition = {
  ...deleteAction,
  preflight_endpoint: "/buckets/bulk-delete/preflight/",
};

const allowedPreflight: ResourceBulkActionPreflightResult<string> = {
  allowed: true,
  detail: "Deletion is allowed after reviewing one warning.",
  impacts: [{ message: "One pointer will be cleared.", tone: "warning" }],
  items: [],
  matchedCount: 1,
  raw: {},
};

describe("ResourceListPage discovered row actions", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
  });

  it("reloads through the framework-owned refresh control", async () => {
    const list = vi.fn().mockResolvedValue(page);
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: { list },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage definition={definition} initialResult={page} refreshable />,
      );
    });
    list.mockClear();

    const refreshButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Refresh",
    );
    expect(refreshButton).toBeTruthy();
    await act(async () => refreshButton!.click());

    expect(list).toHaveBeenCalledOnce();
  });

  it("uses inline collection metadata without rendering filters as controls", async () => {
    const inlinePage = {
      ...page,
      controls: {
        search: {
          placeholder: "Search by bucket name or UID",
          fields: ["name", "uid"],
        },
        filters: [
          { key: "name__contains", label: "Bucket name", type: "text" as const },
        ],
        ordering: [],
      },
      bulkActions: [deleteAction],
    };
    const listBulkActions = vi.fn().mockResolvedValue([deleteAction]);
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue(inlinePage),
        listBulkActions,
        executeBulkAction: vi.fn(),
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage definition={definition} initialResult={inlinePage} />,
      );
    });

    expect(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="Search by bucket name or UID"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Bucket name"]'),
    ).toBeNull();
    expect(container.querySelectorAll('input[type="search"]')).toHaveLength(1);
    expect(listBulkActions).not.toHaveBeenCalled();
  });

  it("uses canonical discovery as the authority for controls, columns, identity, and actions", async () => {
    const discover = vi.fn().mockResolvedValue({
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "buckets",
        label: "Storage Buckets",
        item_label: "bucket",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: { placeholder: "Find a storage bucket", fields: ["name", "uid"] },
          filters: [{ key: "name", label: "Exact name", type: "text" }],
          ordering: [],
        },
        columns: [{
          id: "uid",
          header: "Bucket UID",
          default_visible: true,
          hideable: false,
        }],
      },
      bulk_actions: [deleteAction],
    });
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue(page),
        discover,
        executeBulkAction: vi.fn(),
      },
      columns: [
        { id: "name", header: "Local name", getValue: (bucket) => bucket.name },
        { id: "uid", header: "Local UID", getValue: (bucket) => bucket.uid },
      ],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ResourceListPage definition={definition} initialResult={page} />);
    });

    expect(container.querySelector("h1")?.textContent).toBe("Storage Buckets");
    expect(container.querySelector<HTMLInputElement>(
      'input[placeholder="Find a storage bucket"]',
    )).toBeTruthy();
    expect(container.querySelector<HTMLInputElement>(
      'input[aria-label="Exact name"]',
    )).toBeNull();
    expect(container.querySelectorAll('input[type="search"]')).toHaveLength(1);
    expect(Array.from(container.querySelectorAll("th")).map((cell) => cell.textContent)).toContain(
      "Bucket UID",
    );
    expect(container.textContent).not.toContain("Local name");
    expect(discover).toHaveBeenCalledWith(
      { search: "", filters: {} },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not refetch stable discovery when only pagination changes", async () => {
    const pagedResult = {
      ...page,
      pageInfo: { ...page.pageInfo, totalItems: 30, hasNextPage: true },
    };
    const list = vi.fn().mockResolvedValue(pagedResult);
    const discover = vi.fn().mockResolvedValue({
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "buckets",
        label: "Buckets",
        item_label: "bucket",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: { search: null, filters: [], ordering: [] },
        columns: [{ id: "name", header: "Name", default_visible: true, hideable: false }],
      },
      bulk_actions: [],
    });
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: { list, discover },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ResourceListPage definition={definition} initialResult={pagedResult} />);
    });
    const next = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Next"),
    );
    await act(async () => next!.click());

    expect(list).toHaveBeenCalledTimes(2);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it("executes a row action through the discovered bulk contract with one explicit UID", async () => {
    const executeBulkAction = vi.fn().mockResolvedValue([]);
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue(page),
        listBulkActions: vi.fn().mockResolvedValue([deleteAction]),
        executeBulkAction,
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage
          definition={definition}
          discoveredRowActions={[{
            id: "delete-bucket",
            actionId: "delete",
            label: "Delete",
            tone: "danger",
          }]}
          initialResult={page}
        />,
      );
    });

    const rowDeleteButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete");
    expect(rowDeleteButton).toBeTruthy();

    await act(async () => rowDeleteButton!.click());
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.classList.contains("cc-resource-dialog")).toBe(true);

    const confirmButton = Array.from(dialog!.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete bucket");
    expect(confirmButton).toBeTruthy();
    await act(async () => confirmButton!.click());

    expect(executeBulkAction).toHaveBeenCalledWith(
      deleteAction,
      expect.objectContaining({
        selection: { mode: "explicit", uids: ["bucket-uid"] },
        options: {},
      }),
    );
  });

  it("runs advertised preflight when confirmation opens and executes only after it passes", async () => {
    let resolvePreflight: ((result: ResourceBulkActionPreflightResult<string>) => void) | undefined;
    const preflightBulkAction = vi.fn(() => new Promise<ResourceBulkActionPreflightResult<string>>(
      (resolve) => { resolvePreflight = resolve; },
    ));
    const executeBulkAction = vi.fn().mockResolvedValue({ deleted_count: 1 });
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue({ ...page, bulkActions: [preflightDeleteAction] }),
        preflightBulkAction,
        executeBulkAction,
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => root.render(
      <ResourceListPage
        definition={definition}
        initialResult={{ ...page, bulkActions: [preflightDeleteAction] }}
      />,
    ));
    await act(async () => container.querySelector<HTMLInputElement>(
      'input[aria-label="Select bucket-uid"]',
    )!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Actions"),
    )!.click());
    await act(async () => Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete bucket",
    )!.click());

    expect(preflightBulkAction).toHaveBeenCalledOnce();
    expect(preflightBulkAction).toHaveBeenCalledWith(
      preflightDeleteAction,
      expect.objectContaining({
        selection: { mode: "explicit", uids: ["bucket-uid"] },
        options: {},
        signal: expect.any(AbortSignal),
      }),
    );
    expect(document.body.textContent).toContain("Checking dependencies and impact");
    const confirmWhileLoading = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Checking…",
    );
    expect(confirmWhileLoading?.disabled).toBe(true);
    expect(executeBulkAction).not.toHaveBeenCalled();

    await act(async () => resolvePreflight!(allowedPreflight));
    expect(document.body.textContent).toContain("Preflight passed");
    expect(document.body.textContent).toContain("One pointer will be cleared.");
    const confirm = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete bucket",
    );
    expect(confirm?.disabled).toBe(false);
    await act(async () => confirm!.click());

    expect(executeBulkAction).toHaveBeenCalledOnce();
    expect(preflightBulkAction).toHaveBeenCalledOnce();
  });

  it("reruns option-dependent preflight and ignores the stale response", async () => {
    const resolvers: Array<(result: ResourceBulkActionPreflightResult<string>) => void> = [];
    const action: ResourceBulkActionDefinition = {
      ...preflightDeleteAction,
      options: [{
        key: "cascade",
        type: "boolean",
        default: false,
        label: "Cascade",
        description: "Also delete downstream resources.",
      }],
    };
    const preflightBulkAction = vi.fn(() => new Promise<ResourceBulkActionPreflightResult<string>>(
      (resolve) => { resolvers.push(resolve); },
    ));
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue({ ...page, bulkActions: [action] }),
        preflightBulkAction,
        executeBulkAction: vi.fn(),
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => root.render(
      <ResourceListPage definition={definition} initialResult={{ ...page, bulkActions: [action] }} />,
    ));
    await act(async () => container.querySelector<HTMLInputElement>(
      'input[aria-label="Select bucket-uid"]',
    )!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Actions"),
    )!.click());
    await act(async () => Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete bucket",
    )!.click());
    expect(preflightBulkAction).toHaveBeenCalledTimes(1);

    const cascade = document.body.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => cascade!.click());
    expect(preflightBulkAction).toHaveBeenCalledTimes(2);
    expect(preflightBulkAction.mock.calls[1]?.[1].options).toEqual({ cascade: true });

    await act(async () => resolvers[0]!(allowedPreflight));
    expect(document.body.textContent).toContain("Checking dependencies and impact");
    await act(async () => resolvers[1]!({
      allowed: false,
      detail: "Cascade deletion is blocked.",
      impacts: [{ message: "A protected resource blocks deletion.", tone: "danger" }],
      items: [],
      matchedCount: 1,
      raw: {},
    }));
    expect(document.body.textContent).toContain("Action blocked");
    expect(document.body.textContent).toContain("A protected resource blocks deletion.");
    const confirm = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Action blocked",
    );
    expect(confirm?.disabled).toBe(true);
  });

  it("rejects a blocked action even when a host renderer invokes its callback", async () => {
    const action: ResourceBulkActionDefinition = {
      ...preflightDeleteAction,
      confirmation: {
        title: "Delete buckets",
        word: "DELETE BUCKETS",
        button_label: "Delete buckets",
        warning: "This cannot be undone.",
      },
    };
    const preflightBulkAction = vi.fn().mockResolvedValue({
      allowed: false,
      detail: "A protected dependency blocks deletion.",
      impacts: [],
      items: [],
      matchedCount: 1,
      raw: {},
    } satisfies ResourceBulkActionPreflightResult<string>);
    const executeBulkAction = vi.fn();
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue({ ...page, bulkActions: [action] }),
        preflightBulkAction,
        executeBulkAction,
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => root.render(
      <ResourceListPage
        definition={definition}
        initialResult={{ ...page, bulkActions: [action] }}
        renderBulkActionConfirmation={(input) => (
          <section data-testid="blocked-host-confirmation">
            <span>{String(input.canConfirm)}</span>
            <button
              type="button"
              onClick={() => void input.onConfirm().catch(() => undefined)}
            >
              Force host confirm
            </button>
          </section>
        )}
      />,
    ));
    await act(async () => container.querySelector<HTMLInputElement>(
      'input[aria-label="Select bucket-uid"]',
    )!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Actions"),
    )!.click());
    await act(async () => Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete bucket",
    )!.click());
    await act(async () => Promise.resolve());

    expect(container.querySelector('[data-testid="blocked-host-confirmation"]')?.textContent)
      .toContain("false");
    const forceConfirm = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Force host confirm",
    );
    await act(async () => forceConfirm!.click());
    expect(executeBulkAction).not.toHaveBeenCalled();
  });

  it("switches from current-page selection to an all-matching query without loading more rows", async () => {
    const executeBulkAction = vi.fn().mockResolvedValue([]);
    const allMatchingPage = {
      ...page,
      pageInfo: { ...page.pageInfo, totalItems: 3 },
    };
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue(allMatchingPage),
        listBulkActions: vi.fn().mockResolvedValue([deleteAction]),
        executeBulkAction,
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage definition={definition} initialResult={allMatchingPage} />,
      );
    });

    const selectPage = container.querySelector<HTMLInputElement>(
      'input[aria-label="Select all visible rows"]',
    );
    expect(selectPage).toBeTruthy();
    await act(async () => selectPage!.click());

    const selectAllMatching = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Select all 3 matching buckets");
    expect(selectAllMatching).toBeTruthy();
    await act(async () => selectAllMatching!.click());

    const actionPicker = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Actions"));
    expect(actionPicker).toBeTruthy();
    await act(async () => actionPicker!.click());

    const openAction = Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete bucket");
    expect(openAction).toBeTruthy();
    await act(async () => openAction!.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    const confirmAction = Array.from(dialog!.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete bucket");
    await act(async () => confirmAction!.click());

    expect(executeBulkAction).toHaveBeenCalledWith(
      deleteAction,
      expect.objectContaining({
        selection: {
          mode: "all_matching",
          query: { search: "", filters: {} },
        },
        options: {},
      }),
    );
  });

  it("keeps the header checkbox page-scoped until all matching is explicitly requested", async () => {
    const executeBulkAction = vi.fn().mockResolvedValue([]);
    const visiblePage = {
      items: [
        { name: "Artifacts", uid: "bucket-one" },
        { name: "Models", uid: "bucket-two" },
      ],
      pageInfo: {
        pageIndex: 0,
        pageSize: 2,
        totalItems: 306,
        hasNextPage: true,
        hasPreviousPage: false,
      },
      bulkActions: [deleteAction],
    };
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue(visiblePage),
        listBulkActions: vi.fn().mockResolvedValue([deleteAction]),
        executeBulkAction,
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ResourceListPage definition={definition} initialResult={visiblePage} />);
    });

    const selectPage = container.querySelector<HTMLInputElement>(
      'input[aria-label="Select all visible rows"]',
    );
    await act(async () => selectPage!.click());

    expect(container.textContent).toContain("2 selected on this page.");
    expect(container.textContent).toContain("Select all 306 matching buckets");
    expect(container.textContent).not.toContain("All 306 matching buckets selected.");

    const actionPicker = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Actions"));
    await act(async () => actionPicker!.click());

    const openAction = Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete bucket");
    await act(async () => openAction!.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    const confirmAction = Array.from(dialog!.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete bucket");
    await act(async () => confirmAction!.click());

    expect(executeBulkAction).toHaveBeenCalledWith(
      deleteAction,
      expect.objectContaining({
        selection: {
          mode: "explicit",
          uids: ["bucket-one", "bucket-two"],
        },
        options: {},
      }),
    );
  });

  it("delegates confirmed actions to the host modal renderer", async () => {
    const confirmedDeleteAction: ResourceBulkActionDefinition = {
      ...deleteAction,
      confirmation: {
        title: "Delete buckets",
        word: "DELETE BUCKETS",
        button_label: "Delete buckets",
        warning: "This cannot be undone.",
      },
    };
    const executeBulkAction = vi.fn().mockResolvedValue({ deleted_count: 1 });
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: {
        list: vi.fn().mockResolvedValue({ ...page, bulkActions: [confirmedDeleteAction] }),
        executeBulkAction,
      },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage
          definition={definition}
          initialBulkActions={[confirmedDeleteAction]}
          initialResult={{ ...page, bulkActions: [confirmedDeleteAction] }}
          renderBulkActionConfirmation={(input) => (
            <section data-testid="host-confirmation">
              <span>{input.selectedItems[0]?.name}</span>
              <button type="button" onClick={() => void input.onConfirm()}>
                Host confirm
              </button>
            </section>
          )}
        />,
      );
    });

    const selectBucket = container.querySelector<HTMLInputElement>(
      'input[aria-label="Select bucket-uid"]',
    );
    await act(async () => selectBucket!.click());
    const actionsTrigger = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Actions"));
    await act(async () => actionsTrigger!.click());
    const deleteMenuItem = Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent === "Delete bucket");
    await act(async () => deleteMenuItem!.click());

    expect(container.querySelector('[data-testid="host-confirmation"]')?.textContent).toContain(
      "Artifacts",
    );
    expect(document.body.querySelector(".cc-resource-dialog")).toBeNull();
    const hostConfirm = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Host confirm");
    await act(async () => hostConfirm!.click());

    expect(executeBulkAction).toHaveBeenCalledWith(
      confirmedDeleteAction,
      expect.objectContaining({
        selection: { mode: "explicit", uids: ["bucket-uid"] },
      }),
    );
  });

  it("resolves row activation through the resource adapter and delegates the intent to the host", async () => {
    const resolve = vi.fn().mockResolvedValue({ resource: "project", uid: "project-uid" });
    const open = vi.fn();
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: { list: vi.fn().mockResolvedValue(page) },
      activation: { resolve },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage definition={definition} initialResult={page} navigation={{ open }} />,
      );
    });

    await act(async () => container.querySelector<HTMLTableRowElement>("tbody tr")!.click());

    expect(resolve).toHaveBeenCalledWith(
      page.items[0],
      { signal: expect.any(AbortSignal) },
    );
    expect(open).toHaveBeenCalledWith({ resource: "project", uid: "project-uid" });
  });

  it("keeps an explicit row callback as the override for custom activation workflows", async () => {
    const resolve = vi.fn();
    const open = vi.fn();
    const onRowActivate = vi.fn();
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: { list: vi.fn().mockResolvedValue(page) },
      activation: { resolve },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage
          definition={definition}
          initialResult={page}
          navigation={{ open }}
          onRowActivate={onRowActivate}
        />,
      );
    });

    await act(async () => container.querySelector<HTMLTableRowElement>("tbody tr")!.click());

    expect(onRowActivate).toHaveBeenCalledWith(page.items[0]);
    expect(resolve).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("renders adapter failures without navigating or removing the list", async () => {
    const resolve = vi.fn().mockRejectedValue(new Error("Project target could not be resolved."));
    const open = vi.fn();
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: { list: vi.fn().mockResolvedValue(page) },
      activation: { resolve },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage definition={definition} initialResult={page} navigation={{ open }} />,
      );
    });
    await act(async () => container.querySelector<HTMLTableRowElement>("tbody tr")!.click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Project target could not be resolved.",
    );
    expect(container.querySelector("tbody tr")).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });

  it("aborts stale target resolution and opens only the latest activated row", async () => {
    const twoRowPage = {
      ...page,
      items: [
        { name: "First", uid: "first-uid" },
        { name: "Second", uid: "second-uid" },
      ],
      pageInfo: { ...page.pageInfo, totalItems: 2 },
    };
    let resolveFirst!: (intent: { resource: string; uid: string }) => void;
    let resolveSecond!: (intent: { resource: string; uid: string }) => void;
    const firstIntent = new Promise<{ resource: string; uid: string }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondIntent = new Promise<{ resource: string; uid: string }>((resolve) => {
      resolveSecond = resolve;
    });
    const signals: AbortSignal[] = [];
    const resolve = vi.fn((bucket: Bucket, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return bucket.uid === "first-uid" ? firstIntent : secondIntent;
    });
    const open = vi.fn();
    const definition: ResourceApplicationDefinition<Bucket, string> = {
      id: "buckets",
      label: "Buckets",
      getId: (bucket) => bucket.uid,
      adapter: { list: vi.fn().mockResolvedValue(twoRowPage) },
      activation: { resolve },
      columns: [{ id: "name", header: "Name", getValue: (bucket) => bucket.name }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ResourceListPage
          definition={definition}
          initialResult={twoRowPage}
          navigation={{ open }}
        />,
      );
    });
    const rows = container.querySelectorAll<HTMLTableRowElement>("tbody tr");
    await act(async () => {
      rows[0]!.click();
      rows[1]!.click();
    });

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Opening");
    expect(container.querySelector("table")).toBeNull();

    await act(async () => {
      resolveFirst({ resource: "project", uid: "first-project-uid" });
      resolveSecond({ resource: "project", uid: "second-project-uid" });
      await Promise.all([firstIntent, secondIntent]);
    });

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({
      resource: "project",
      uid: "second-project-uid",
    });
    expect(container.querySelector("table")).toBeTruthy();
  });
});
