import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  assertBulkActionSelectionMode,
  buildAllMatchingBulkSelection,
  buildExplicitBulkSelection,
  resolveBulkActionOptions,
} from "../resource/bulk-actions.js";
import {
  resolveResourceDiscoveryColumns,
  serializeResourceIdentity,
} from "../resource/discovery.js";
import { useResourceSelection } from "../resource/react/use-resource-selection.js";
import type {
  ResourceApplicationDefinition,
  ResourceBulkActionDefinition,
  ResourceBulkActionPreflightState,
  ResourceBulkActionQuery,
  ResourceBulkSelection,
  ResourceColumnDefinition,
  ResourceDiscoveryResponse,
  ResourceId,
  ResourceListResult,
  ResourceNavigationAdapter,
  ResourceSort,
} from "../resource/types.js";
import { DataTable, type ResourceRowAction } from "./DataTable.js";
import { ResourceCardGrid } from "./ResourceCardGrid.js";
import { ResourceActionConfirmationDialog } from "./ResourceActionConfirmationDialog.js";
import { ResourceBulkActionPicker } from "./ResourceBulkActionPicker.js";
import { ResourcePagination } from "./ResourcePagination.js";
import { ResourcePicker } from "./ResourcePicker.js";
import { ResourceToolbar } from "./ResourceToolbar.js";
import { ResourceTransitionShell } from "./ResourceTransitionShell.js";

export interface ResourcePrimaryAction {
  id: string;
  label: string;
  disabled?: boolean;
  pending?: boolean;
  tone?: "default" | "primary" | "danger";
  onSelect: () => void;
}

export interface ResourceDiscoveredRowAction<T> {
  id: string;
  actionId: string;
  label: string;
  disabled?: boolean | ((item: T) => boolean);
  tone?: "default" | "danger";
}

export interface ResourceSelectFilterDefinition {
  id: string;
  label: string;
  value: string;
  options: readonly {
    label: string;
    value: string;
    subtitle?: string;
    meta?: string;
    disabled?: boolean;
  }[];
  onChange: (value: string) => void;
}

export interface ResourceListPageProps<T, Id extends ResourceId> {
  definition: ResourceApplicationDefinition<T, Id>;
  emptyContent?: ReactNode;
  filterControls?: ReactNode;
  filterDefinitions?: readonly ResourceSelectFilterDefinition[];
  filters?: Readonly<Record<string, unknown>>;
  headerAccessory?: ReactNode;
  initialResult?: ResourceListResult<T>;
  initialSearch?: string;
  initialBulkActions?: readonly ResourceBulkActionDefinition[];
  initialSelectedIds?: readonly Id[];
  embedded?: boolean;
  navigation?: ResourceNavigationAdapter;
  pageSize?: number;
  pollIntervalMs?: number | ((result: ResourceListResult<T>) => number | undefined);
  primaryActions?: readonly ResourcePrimaryAction[];
  refreshable?: boolean;
  refreshLabel?: string;
  refreshKey?: unknown;
  renderCard?: (item: T) => ReactNode;
  renderBulkActionConfirmation?: (
    input: ResourceBulkActionConfirmationRenderProps<T>,
  ) => ReactNode;
  rowActions?: readonly ResourceRowAction<T>[];
  discoveredRowActions?: readonly ResourceDiscoveredRowAction<T>[];
  searchPlaceholder?: string;
  searchable?: boolean;
  toolbarLeading?: ReactNode;
  toolbarTrailing?: ReactNode;
  onBulkActionSuccess?: (action: ResourceBulkActionDefinition, response: unknown) => void;
  onResult?: (result: ResourceListResult<T>) => void;
  onRowActivate?: (item: T) => void;
}

export interface ResourceBulkActionConfirmationRenderProps<T> {
  action: ResourceBulkActionDefinition;
  allMatching: boolean;
  canConfirm: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  onOptionChange: (key: string, value: boolean) => void;
  onRetryPreflight: () => void;
  options: Readonly<Record<string, boolean>>;
  pending: boolean;
  preflight: ResourceBulkActionPreflightState;
  selectedItems: readonly T[];
  selectionCount: number;
}

const emptyPageInfo = {
  pageIndex: 0,
  pageSize: 25,
  totalItems: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};
const emptyFilters: Readonly<Record<string, unknown>> = {};
const emptyFilterDefinitions: readonly ResourceSelectFilterDefinition[] = [];
const emptyPrimaryActions: readonly ResourcePrimaryAction[] = [];

interface InternalBulkActionPreflightState<Id extends ResourceId> {
  requestKey: string;
  state: ResourceBulkActionPreflightState<Id>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The resource list could not be loaded.";
}

function getActivationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The selected resource could not be opened.";
}

function createFilterControls(definitions: readonly ResourceSelectFilterDefinition[]) {
  return definitions.map((filter) => (
    <div key={filter.id} className="cc-resource-filter">
      <span className="cc-resource-visually-hidden">{filter.label}</span>
      <ResourcePicker
        mode="single"
        ariaLabel={filter.label}
        fitContent
        options={filter.options}
        searchable={filter.options.length > 8}
        value={filter.value}
        onValueChange={filter.onChange}
      />
    </div>
  ));
}

export function ResourceListPage<T, Id extends ResourceId>({
  definition,
  discoveredRowActions = [],
  emptyContent,
  filterControls,
  filterDefinitions = emptyFilterDefinitions,
  filters = emptyFilters,
  headerAccessory,
  initialResult,
  initialSearch = "",
  initialBulkActions = [],
  initialSelectedIds = [],
  embedded = false,
  navigation,
  onBulkActionSuccess,
  onResult,
  onRowActivate,
  pageSize = 25,
  pollIntervalMs,
  primaryActions = emptyPrimaryActions,
  refreshable = false,
  refreshLabel = "Refresh",
  refreshKey,
  renderBulkActionConfirmation,
  renderCard,
  rowActions = [],
  searchPlaceholder,
  searchable = true,
  toolbarLeading,
  toolbarTrailing,
}: ResourceListPageProps<T, Id>) {
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch.trim());
  const [pageIndex, setPageIndex] = useState(initialResult?.pageInfo.pageIndex ?? 0);
  const [sort, setSort] = useState<ResourceSort | null>(null);
  const [result, setResult] = useState<ResourceListResult<T>>(
    initialResult ?? { items: [], pageInfo: { ...emptyPageInfo, pageSize } },
  );
  const [discovery, setDiscovery] = useState<ResourceDiscoveryResponse | null>(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(Boolean(definition.adapter.discover));
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialResult);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [bulkActions, setBulkActions] = useState<readonly ResourceBulkActionDefinition[]>(
    initialResult?.bulkActions ?? initialBulkActions,
  );
  const [bulkActionsLoading, setBulkActionsLoading] = useState(false);
  const [allMatching, setAllMatching] = useState(false);
  const [activeBulkAction, setActiveBulkAction] = useState<ResourceBulkActionDefinition | null>(null);
  const [activeExplicitIds, setActiveExplicitIds] = useState<readonly Id[] | null>(null);
  const [bulkOptions, setBulkOptions] = useState<Record<string, boolean>>({});
  const [confirmationWord, setConfirmationWord] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [bulkPreflightRetryToken, setBulkPreflightRetryToken] = useState(0);
  const [bulkPreflightRequest, setBulkPreflightRequest] = useState<
    InternalBulkActionPreflightState<Id>
  >({ requestKey: "", state: { status: "not_required" } });
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationPendingId, setActivationPendingId] = useState<Id | null>(null);
  const activationController = useRef<AbortController | null>(null);
  const preflightSequence = useRef(0);
  const discoverySequence = useRef(0);
  const requestSequence = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const controls = discovery?.list.controls ?? result.controls;
  // Discovery filter entries describe accepted query capabilities. They never
  // create toolbar inputs; only host-authored filter definitions render UI.
  const nextActiveFilters = {
    ...filters,
    ...Object.fromEntries(
      filterDefinitions
        .filter((definition) => definition.value !== "")
        .map((definition) => [definition.id, definition.value]),
    ),
  };
  const filterSignature = JSON.stringify(nextActiveFilters);
  const activeFiltersRef = useRef({
    signature: filterSignature,
    value: nextActiveFilters as Readonly<Record<string, unknown>>,
  });
  if (activeFiltersRef.current.signature !== filterSignature) {
    activeFiltersRef.current = { signature: filterSignature, value: nextActiveFilters };
  }
  const activeFilters = activeFiltersRef.current.value;
  const bulkQuery = useMemo<ResourceBulkActionQuery>(
    () => ({ search, filters: activeFilters }),
    [activeFilters, search],
  );
  const getPresentationId = useMemo<(item: T) => ResourceId>(
    () => discovery
      ? (item: T) => serializeResourceIdentity(item, discovery.resource.identity)
      : definition.getId,
    [definition.getId, discovery],
  );
  const selection = useResourceSelection<T, ResourceId>(
    result.items,
    getPresentationId,
    initialSelectedIds,
  );
  const selectedActionIds = useMemo(
    () => {
      const selectedPresentationIds = new Set(selection.selectedIds);
      return result.items
        .filter((item) => selectedPresentationIds.has(getPresentationId(item)))
        .map(definition.getId);
    }, [definition.getId, getPresentationId, result.items, selection.selectedIds],
  );
  const activeBulkSelection = useMemo<ResourceBulkSelection<Id> | null>(() => {
    if (!activeBulkAction) return null;
    if (activeExplicitIds) return buildExplicitBulkSelection<Id>(activeExplicitIds);
    if (allMatching) return buildAllMatchingBulkSelection<Id>(bulkQuery);
    return buildExplicitBulkSelection<Id>(selectedActionIds);
  }, [activeBulkAction, activeExplicitIds, allMatching, bulkQuery, selectedActionIds]);
  const activeBulkOptionValues = useMemo<Readonly<Record<string, unknown>> | null>(
    () => activeBulkAction ? resolveBulkActionOptions(activeBulkAction, bulkOptions) : null,
    [activeBulkAction, bulkOptions],
  );
  const activePreflightRequestKey =
    activeBulkAction?.preflight_endpoint && activeBulkSelection && activeBulkOptionValues
      ? JSON.stringify({
          actionId: activeBulkAction.id,
          endpoint: activeBulkAction.preflight_endpoint,
          options: activeBulkOptionValues,
          selection: activeBulkSelection,
        })
      : "";
  const bulkPreflight: ResourceBulkActionPreflightState<Id> =
    !activeBulkAction?.preflight_endpoint
      ? { status: "not_required" }
      : activePreflightRequestKey && bulkPreflightRequest.requestKey !== activePreflightRequestKey
        ? { status: "loading" }
        : bulkPreflightRequest.state;
  const selectionCount = allMatching ? result.pageInfo.totalItems : selection.selectedCount;
  const hasBulkSelection = bulkActions.length > 0;
  const canSelectAllMatching = bulkActions.some((action) =>
    action.selection_modes.includes("all_matching"),
  );
  const showAllMatchingOffer =
    !allMatching &&
    canSelectAllMatching &&
    selection.allSelected &&
    result.items.length > 0 &&
    result.pageInfo.totalItems > result.items.length;
  const hasActiveQuery = Boolean(search || Object.keys(activeFilters).length);

  useEffect(() => {
    const action = activeBulkAction;
    if (!action?.preflight_endpoint) {
      setBulkPreflightRequest({ requestKey: "", state: { status: "not_required" } });
      return undefined;
    }
    if (!activeBulkSelection || !activeBulkOptionValues || !activePreflightRequestKey) {
      return undefined;
    }
    if (!definition.adapter.preflightBulkAction) {
      setBulkPreflightRequest({
        requestKey: activePreflightRequestKey,
        state: {
          status: "error",
          error: "The adapter does not implement the advertised preflight request.",
        },
      });
      return undefined;
    }

    const controller = new AbortController();
    const sequence = ++preflightSequence.current;
    setBulkPreflightRequest({
      requestKey: activePreflightRequestKey,
      state: { status: "loading" },
    });

    void definition.adapter.preflightBulkAction(action, {
      selection: activeBulkSelection,
      options: activeBulkOptionValues,
      signal: controller.signal,
    }).then((result) => {
      if (sequence !== preflightSequence.current || controller.signal.aborted) return;
      setBulkPreflightRequest({
        requestKey: activePreflightRequestKey,
        state: { status: result.allowed ? "allowed" : "blocked", result },
      });
    }).catch((error: unknown) => {
      if (sequence !== preflightSequence.current || controller.signal.aborted) return;
      setBulkPreflightRequest({
        requestKey: activePreflightRequestKey,
        state: { status: "error", error: getErrorMessage(error) },
      });
    });

    return () => controller.abort();
  }, [
    activeBulkAction,
    activeBulkOptionValues,
    activeBulkSelection,
    activePreflightRequestKey,
    bulkPreflightRetryToken,
    definition.adapter,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPageIndex(0);
      setAllMatching(false);
      selection.clearSelection();
    }, 250);
    return () => window.clearTimeout(timeout);
    // Selection callbacks intentionally stay outside dependencies: the query value is the reset boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    setPageIndex(0);
    setAllMatching(false);
    selection.clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setLoadError(null);
    if (!definition.adapter.discover) {
      setBulkActionsLoading(Boolean(definition.adapter.listBulkActions));
    }

    void definition.adapter.list({
        pageIndex,
        pageSize,
        search: search || undefined,
        filters: activeFilters,
        sort: sort ? [sort] : undefined,
        signal: controller.signal,
      })
      .then(async (nextResult) => {
        if (sequence !== requestSequence.current) {
          return;
        }
        setResult(nextResult);
        onResultRef.current?.(nextResult);
        if (definition.adapter.discover) {
          return;
        }
        if (nextResult.bulkActions !== undefined) {
          setBulkActions(nextResult.bulkActions);
          setBulkActionsLoading(false);
          return;
        }
        if (!definition.adapter.listBulkActions) {
          setBulkActions([]);
          setBulkActionsLoading(false);
          return;
        }
        try {
          const actions = await definition.adapter.listBulkActions(bulkQuery, {
            signal: controller.signal,
          });
          if (sequence === requestSequence.current) {
            setBulkActions(actions);
          }
        } catch (error) {
          if (!controller.signal.aborted && sequence === requestSequence.current) {
            setBulkActions([]);
            setBulkFeedback({ tone: "error", text: getErrorMessage(error) });
          }
        } finally {
          if (sequence === requestSequence.current) {
            setBulkActionsLoading(false);
          }
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && sequence === requestSequence.current) {
          setLoadError(getErrorMessage(error));
          if (!definition.adapter.discover) {
            setBulkActions([]);
            setBulkActionsLoading(false);
          }
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeFilters, bulkQuery, definition.adapter, pageIndex, pageSize, refreshKey, reloadToken, search, sort]);

  useEffect(() => {
    if (!definition.adapter.discover) {
      setDiscovery(null);
      setDiscoveryError(null);
      setDiscoveryLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const sequence = ++discoverySequence.current;
    setDiscoveryError(null);
    setDiscoveryLoading(true);
    setBulkActionsLoading(true);

    void definition.adapter.discover(bulkQuery, { signal: controller.signal })
      .then((nextDiscovery) => {
        if (controller.signal.aborted || sequence !== discoverySequence.current) return;
        // Resolve eagerly so a backend/local renderer mismatch becomes a list load error,
        // rather than an uncaught render error.
        resolveResourceDiscoveryColumns(nextDiscovery, definition.columns);
        setDiscovery(nextDiscovery);
        setBulkActions(nextDiscovery.bulk_actions);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== discoverySequence.current) return;
        setDiscovery(null);
        setBulkActions([]);
        setDiscoveryError(getErrorMessage(error));
      })
      .finally(() => {
        if (sequence === discoverySequence.current) {
          setDiscoveryLoading(false);
          setBulkActionsLoading(false);
        }
      });

    return () => controller.abort();
  }, [bulkQuery, definition.adapter, definition.columns, refreshKey, reloadToken]);

  useEffect(() => {
    const intervalMs = typeof pollIntervalMs === "function" ? pollIntervalMs(result) : pollIntervalMs;
    if (!intervalMs || intervalMs <= 0) {
      return;
    }
    const interval = window.setInterval(() => {
      setReloadToken((current) => current + 1);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [pollIntervalMs, result]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const lastPageIndex = Math.max(
      0,
      Math.ceil(result.pageInfo.totalItems / result.pageInfo.pageSize) - 1,
    );
    if (pageIndex > lastPageIndex) {
      setPageIndex(lastPageIndex);
    }
  }, [loading, pageIndex, result.pageInfo.pageSize, result.pageInfo.totalItems]);

  useEffect(() => {
    return () => {
      const controller = activationController.current;
      activationController.current = null;
      controller?.abort();
    };
  }, []);

  const activateResource = definition.activation && navigation
    ? (item: T) => {
        activationController.current?.abort();
        const controller = new AbortController();
        activationController.current = controller;
        setActivationError(null);
        setActivationPendingId(definition.getId(item));

        void Promise.resolve()
          .then(() => definition.activation!.resolve(item, { signal: controller.signal }))
          .then((intent) => {
            if (!controller.signal.aborted && intent) {
              return navigation.open(intent);
            }
          })
          .catch((error: unknown) => {
            if (!controller.signal.aborted) {
              setActivationError(getActivationErrorMessage(error));
            }
          })
          .finally(() => {
            if (activationController.current === controller) {
              activationController.current = null;
              setActivationPendingId(null);
            }
          });
      }
    : undefined;
  const resolvedRowActivation = onRowActivate ?? activateResource;

  const clearSelection = () => {
    setAllMatching(false);
    selection.clearSelection();
  };

  const toggleVisibleSelection = () => {
    if (allMatching) {
      clearSelection();
      return;
    }

    // The table header owns loaded-page selection only. Moving to the query-wide
    // selection mode must remain a separate, explicit user action.
    selection.toggleAll();
  };

  const selectAllMatching = () => {
    if (!showAllMatchingOffer) {
      return;
    }
    setAllMatching(true);
  };

  const toggleSelection = (id: ResourceId) => {
    if (allMatching) {
      setAllMatching(false);
      selection.setSelection(
        result.items.map(getPresentationId).filter((candidate) => candidate !== id),
      );
      return;
    }
    selection.toggleSelection(id);
  };

  const openBulkAction = (
    action: ResourceBulkActionDefinition,
    explicitIds: readonly Id[] | null = null,
  ) => {
    setBulkFeedback(null);
    setBulkPreflightRetryToken(0);
    setConfirmationWord("");
    setActiveExplicitIds(explicitIds);
    setBulkOptions(
      Object.fromEntries(action.options.map((option) => [option.key, option.default])),
    );
    setActiveBulkAction(action);
  };

  const executeBulkAction = async (throwOnError = false) => {
    if (!activeBulkAction || !definition.adapter.executeBulkAction) {
      return;
    }
    if (activeBulkAction.preflight_endpoint && bulkPreflight.status !== "allowed") {
      const error = new Error(
        bulkPreflight.status === "blocked"
          ? bulkPreflight.result.detail ?? "Preflight blocked this action."
          : bulkPreflight.status === "error"
            ? bulkPreflight.error
            : "Wait for preflight to finish before continuing.",
      );
      if (throwOnError) throw error;
      return;
    }
    setBulkPending(true);
    setBulkFeedback(null);
    try {
      const discoveredActions = definition.adapter.discover
        ? (await definition.adapter.discover(bulkQuery)).bulk_actions
        : definition.adapter.listBulkActions
          ? await definition.adapter.listBulkActions(bulkQuery)
        : bulkActions;
      const action = discoveredActions.find((candidate) => candidate.id === activeBulkAction.id);
      if (!action) {
        throw new Error("This action is no longer available.");
      }
      if (!activeBulkSelection) {
        throw new Error("The action selection is no longer available.");
      }
      const actionSelection = activeBulkSelection;
      assertBulkActionSelectionMode(action, actionSelection);
      const options = resolveBulkActionOptions(action, bulkOptions);
      if (
        action.endpoint !== activeBulkAction.endpoint ||
        action.preflight_endpoint !== activeBulkAction.preflight_endpoint ||
        JSON.stringify(action.options) !== JSON.stringify(activeBulkAction.options)
      ) {
        setActiveBulkAction(action);
        setBulkOptions(Object.fromEntries(action.options.map((option) => [
          option.key,
          typeof bulkOptions[option.key] === "boolean"
            ? bulkOptions[option.key]
            : option.default,
        ])));
        throw new Error(
          "The action contract changed. Review the refreshed preflight before continuing.",
        );
      }
      const response = await definition.adapter.executeBulkAction(action, {
        selection: actionSelection,
        options,
      });
      setActiveBulkAction(null);
      setActiveExplicitIds(null);
      clearSelection();
      setBulkFeedback({ tone: "success", text: `${action.label} completed.` });
      setReloadToken((current) => current + 1);
      onBulkActionSuccess?.(action, response);
    } catch (error) {
      setBulkFeedback({ tone: "error", text: getErrorMessage(error) });
      if (throwOnError) throw error;
    } finally {
      setBulkPending(false);
    }
  };

  const selectedBulkActionItems = activeExplicitIds
    ? result.items.filter((item) => activeExplicitIds.includes(definition.getId(item)))
    : selection.selectedItems;
  const presentationLoading = loading || (
    Boolean(definition.adapter.discover) && discoveryLoading && !discovery
  );
  const presentationError = discoveryError ?? loadError;

  if (activationPendingId !== null) {
    return <ResourceTransitionShell embedded={embedded} />;
  }

  const renderedFilterControls = (
    <>
      {createFilterControls(filterDefinitions)}
      {filterControls}
    </>
  );
  const columns = (discovery
    ? resolveResourceDiscoveryColumns<T, ReactNode>(
        discovery,
        definition.columns as readonly ResourceColumnDefinition<T, ReactNode>[],
      )
    : definition.columns) as readonly ResourceColumnDefinition<T, ReactNode>[];
  const itemLabel = discovery?.resource.item_label
    ?? definition.itemLabel
    ?? definition.label.toLocaleLowerCase();
  const renderedRowActions = [
    ...rowActions,
    ...discoveredRowActions.map<ResourceRowAction<T>>((rowAction) => ({
      id: rowAction.id,
      label: rowAction.label,
      tone: rowAction.tone,
      disabled: (item) => {
        const disabled = typeof rowAction.disabled === "function"
          ? rowAction.disabled(item)
          : rowAction.disabled;
        return Boolean(disabled) || !bulkActions.some((action) =>
          action.id === rowAction.actionId && action.selection_modes.includes("explicit"),
        );
      },
      onSelect: (item) => {
        const action = bulkActions.find((candidate) =>
          candidate.id === rowAction.actionId && candidate.selection_modes.includes("explicit"),
        );
        if (action) {
          openBulkAction(action, [definition.getId(item)]);
        }
      },
    })),
  ];

  const TitleElement = embedded ? "h2" : "h1";
  const renderedToolbarTrailing = (
    <>
      {toolbarTrailing}
      {refreshable ? (
        <button
          type="button"
          className="cc-resource-button cc-resource-button--default"
          disabled={loading || discoveryLoading}
          onClick={() => setReloadToken((current) => current + 1)}
        >
          {loading || discoveryLoading ? `${refreshLabel}…` : refreshLabel}
        </button>
      ) : null}
    </>
  );

  return (
    <section
      className={`cc-resource-list-page${embedded ? " cc-resource-list-page--embedded" : ""}`}
      aria-labelledby={`${definition.id}-title`}
    >
      <header className="cc-resource-list-page__header">
        <div>
          <TitleElement id={`${definition.id}-title`}>
            {discovery?.resource.label ?? definition.label}
          </TitleElement>
          {definition.description ? <p>{definition.description}</p> : null}
        </div>
        <div className="cc-resource-list-page__header-actions">
          {headerAccessory}
          {primaryActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`cc-resource-button cc-resource-button--${action.tone ?? "primary"}`}
              disabled={action.disabled || action.pending}
              onClick={action.onSelect}
            >
              {action.pending ? `${action.label}…` : action.label}
            </button>
          ))}
        </div>
      </header>

      <div className="cc-resource-list-page__card">
        <ResourceToolbar
          count={result.pageInfo.totalItems}
          filterControls={
            filterDefinitions.length > 0 || filterControls
              ? renderedFilterControls
              : undefined
          }
          itemLabel={itemLabel}
          leading={toolbarLeading}
          searchPlaceholder={
            controls?.search?.placeholder ?? searchPlaceholder ?? `Search ${itemLabel}`
          }
          searchable={
            searchable &&
            (definition.adapter.discover ? discovery?.list.controls.search !== null : controls?.search !== null)
          }
          searchValue={searchInput}
          trailing={renderedToolbarTrailing}
          onSearchChange={setSearchInput}
        />

        {selectionCount > 0 ? (
          <div className="cc-resource-selection-bar">
            <span>
              {allMatching
                ? `All ${selectionCount} matching ${itemLabel} selected.`
                : `${selectionCount} selected on this page.`}
            </span>
            {showAllMatchingOffer ? (
              <button type="button" onClick={selectAllMatching}>
                Select all {result.pageInfo.totalItems} matching {itemLabel}
              </button>
            ) : null}
            <div className="cc-resource-selection-bar__actions">
              <ResourceBulkActionPicker
                actions={bulkActions
                  .filter((action) =>
                    action.selection_modes.includes(allMatching ? "all_matching" : "explicit"),
                  )
                  .map((action) => ({
                    id: action.id,
                    label: action.label,
                    disabled: bulkPending,
                    onSelect: () => openBulkAction(action),
                  }))}
                disabled={bulkPending}
                label="Actions"
              />
              <button type="button" onClick={clearSelection}>Clear</button>
            </div>
          </div>
        ) : null}

        {bulkFeedback ? (
          <div className={`cc-resource-feedback cc-resource-feedback--${bulkFeedback.tone}`} role="status">
            {bulkFeedback.text}
          </div>
        ) : null}
        {activationError ? (
          <div className="cc-resource-feedback cc-resource-feedback--error" role="alert">
            {activationError}
          </div>
        ) : null}
        {presentationError ? (
          <div className="cc-resource-state cc-resource-state--error" role="alert">
            <p>{presentationError}</p>
            <button type="button" onClick={() => setReloadToken((current) => current + 1)}>Retry</button>
          </div>
        ) : presentationLoading && result.items.length === 0 ? (
          <div className="cc-resource-state" role="status">Loading {itemLabel}…</div>
        ) : (
          renderCard ? (
            <ResourceCardGrid
              emptyContent={
                emptyContent ??
                (hasActiveQuery ? `No ${itemLabel} match the current search and filters.` : `No ${itemLabel} yet.`)
              }
              getId={getPresentationId}
              items={result.items}
              renderCard={renderCard}
            />
          ) : <DataTable
            allSelected={allMatching || selection.allSelected}
            columns={columns}
            emptyContent={
              emptyContent ??
              (hasActiveQuery ? `No ${itemLabel} match the current search and filters.` : `No ${itemLabel} yet.`)
            }
            getId={getPresentationId}
            isSelected={hasBulkSelection ? (id) => allMatching || selection.isSelected(id) : undefined}
            items={result.items}
            rowActions={renderedRowActions}
            someSelected={!allMatching && selection.someSelected}
            sort={sort}
            onActivateRow={resolvedRowActivation}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              setPageIndex(0);
              clearSelection();
            }}
            onToggleAll={hasBulkSelection ? toggleVisibleSelection : undefined}
            onToggleSelection={hasBulkSelection ? toggleSelection : undefined}
          />
        )}

        {bulkActionsLoading ? <span className="cc-resource-visually-hidden">Loading actions</span> : null}
        <ResourcePagination
          count={result.pageInfo.totalItems}
          hasNextPage={result.pageInfo.hasNextPage}
          hasPreviousPage={result.pageInfo.hasPreviousPage}
          itemLabel={itemLabel}
          pageIndex={result.pageInfo.pageIndex}
          pageSize={result.pageInfo.pageSize}
          onPageChange={(nextPage) => {
            setPageIndex(nextPage);
            if (!allMatching) {
              selection.clearSelection();
            }
          }}
        />
      </div>

      {activeBulkAction && renderBulkActionConfirmation && activeBulkAction.confirmation
        ? renderBulkActionConfirmation({
            action: activeBulkAction,
            allMatching,
            canConfirm:
              !activeBulkAction.preflight_endpoint || bulkPreflight.status === "allowed",
            onCancel: () => {
              setActiveBulkAction(null);
              setActiveExplicitIds(null);
            },
            onConfirm: () => executeBulkAction(true),
            onOptionChange: (key, value) => {
              setBulkOptions((current) => ({ ...current, [key]: value }));
            },
            onRetryPreflight: () => setBulkPreflightRetryToken((current) => current + 1),
            options: bulkOptions,
            pending: bulkPending,
            preflight: bulkPreflight,
            selectedItems: selectedBulkActionItems,
            selectionCount,
          })
        : activeBulkAction ? (
        <ResourceActionConfirmationDialog
          actionLabel={activeBulkAction.label}
          confirmationValue={confirmationWord}
          confirmationWord={activeBulkAction.confirmation?.word}
          confirmButtonLabel={activeBulkAction.confirmation?.button_label ?? activeBulkAction.label}
          confirmDisabled={
            Boolean(activeBulkAction.preflight_endpoint) && bulkPreflight.status !== "allowed"
          }
          error={bulkFeedback?.tone === "error" ? bulkFeedback.text : undefined}
          pending={bulkPending}
          preflight={bulkPreflight}
          selectionLabel={
            allMatching
              ? `Matching ${itemLabel}: ${selectionCount}`
              : `Selected ${itemLabel}: ${selectionCount}`
          }
          title={activeBulkAction.confirmation?.title ?? activeBulkAction.label}
          tone={activeBulkAction.tone ?? "default"}
          warning={activeBulkAction.confirmation?.warning}
          onClose={() => {
            setActiveBulkAction(null);
            setActiveExplicitIds(null);
          }}
          onConfirm={executeBulkAction}
          onConfirmationValueChange={setConfirmationWord}
          onRetryPreflight={() => setBulkPreflightRetryToken((current) => current + 1)}
        >
          {activeBulkAction.options.length > 0 ? (
            <div className="cc-resource-dialog__options">
              {activeBulkAction.options.map((option) => (
                <label key={option.key} className="cc-resource-dialog__option">
                  <input
                    type="checkbox"
                    checked={bulkOptions[option.key] ?? option.default}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setBulkOptions((current) => ({
                        ...current,
                        [option.key]: checked,
                      }));
                    }}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </ResourceActionConfirmationDialog>
      ) : null}
    </section>
  );
}
