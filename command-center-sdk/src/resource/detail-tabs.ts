import type { ResourceDetailSubTabDefinition, ResourceDetailTabDefinition } from "./types.js";

export interface ResourceDetailTabSelection<T = unknown> {
  /** The requested primary tab, usually read from the host's URL. */
  activeTabId?: string | null;
  /** The requested secondary tab of the active primary tab. */
  activeSubTabId?: string | null;
  /**
   * The loaded record. `isVisible` and function-valued `disabled` run only when it is neither
   * `null` nor `undefined`, so a deep link keeps its tab while the record is still loading.
   */
  resource?: T | null;
}

export interface ResolvedResourceDetailTabs<T = unknown> {
  /** Visible tabs in declaration order, each with `disabled` resolved to a boolean. */
  tabs: readonly ResourceDetailTabDefinition<T>[];
  /** The requested tab when it is visible and enabled, otherwise the first enabled tab. */
  activeTab: ResourceDetailTabDefinition<T> | undefined;
  /** Sub-tabs of the active tab, each with `disabled` resolved to a boolean. */
  subTabs: readonly ResourceDetailSubTabDefinition<T>[];
  /** The requested sub-tab when it is enabled, otherwise the first enabled sub-tab. */
  activeSubTab: ResourceDetailSubTabDefinition<T> | undefined;
  /** True when a requested tab or sub-tab id was not honoured. */
  fallback: boolean;
}

function isRequested(id: string | null | undefined): id is string {
  return typeof id === "string" && id !== "";
}

function resolveDisabled<T>(
  disabled: boolean | ((resource: T) => boolean) | undefined,
  loaded: boolean,
  resource: T | null | undefined,
) {
  if (typeof disabled === "function") return loaded ? disabled(resource as T) : false;
  return disabled === true;
}

function pickActive<Tab extends { id: string; disabled?: unknown }>(
  tabs: readonly Tab[],
  requestedId: string | null | undefined,
) {
  const requested = isRequested(requestedId)
    ? tabs.find((tab) => tab.id === requestedId && tab.disabled !== true)
    : undefined;
  return requested ?? tabs.find((tab) => tab.disabled !== true);
}

/**
 * Resolve a detail's tabs once per render. Pass the result's `tabs`, `activeTab.id`, and
 * `activeSubTab.id` to `ResourceDetailShell` and switch the tab body on the same result, so the
 * highlighted tab and the rendered body always agree. Never rewrite the URL on fallback.
 */
export function resolveResourceDetailTabs<T = unknown>(
  tabs: readonly ResourceDetailTabDefinition<T>[] | undefined,
  selection: ResourceDetailTabSelection<T> = {},
): ResolvedResourceDetailTabs<T> {
  const { activeSubTabId, activeTabId, resource } = selection;
  const loaded = resource !== null && resource !== undefined;
  const visibleTabs = (tabs ?? [])
    .filter((tab) => !loaded || !tab.isVisible || tab.isVisible(resource as T))
    .map((tab): ResourceDetailTabDefinition<T> => {
      const resolved: ResourceDetailTabDefinition<T> = {
        ...tab,
        disabled: resolveDisabled(tab.disabled, loaded, resource),
      };
      if (tab.subTabs) {
        resolved.subTabs = tab.subTabs.map((subTab) => ({
          ...subTab,
          disabled: resolveDisabled(subTab.disabled, loaded, resource),
        }));
      }
      return resolved;
    });
  const activeTab = pickActive(visibleTabs, activeTabId);
  const subTabs = activeTab?.subTabs ?? [];
  const activeSubTab = pickActive(subTabs, activeSubTabId);
  const tabFallback = isRequested(activeTabId) && activeTab?.id !== activeTabId;
  const subTabFallback = isRequested(activeSubTabId)
    && subTabs.length > 0
    && activeSubTab?.id !== activeSubTabId;

  return {
    activeSubTab,
    activeTab,
    fallback: tabFallback || subTabFallback,
    subTabs,
    tabs: visibleTabs,
  };
}
