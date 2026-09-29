import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { useCommandCenterViewport } from "../layout/viewport.js";
import type { ResourceDetailSubTabDefinition, ResourceDetailTabDefinition } from "../resource/types.js";
import { fitDetailTabs, scrollDeltaForTab } from "./detail-tab-layout.js";
import { ResourcePicker } from "./ResourcePicker.js";

/**
 * How `ResourceDetailShell` reaches tabs that do not fit on one row. `menu` moves them into a
 * trailing "More" menu; `scroll` keeps one row that scrolls sideways; `auto` uses `menu` with a
 * fine pointer and `scroll` with a coarse (touch) pointer.
 */
export type ResourceDetailTabsOverflow = "auto" | "menu" | "scroll";

/** What `ResourceDetailShell.renderTabLead` receives for each tab it renders. */
export type ResourceDetailTabLeadContext<T = unknown> =
  | {
      level: "primary";
      tab: ResourceDetailTabDefinition<T>;
      active: boolean;
      disabled: boolean;
    }
  | {
      level: "secondary";
      tab: ResourceDetailSubTabDefinition<T>;
      parent: ResourceDetailTabDefinition<T>;
      active: boolean;
      disabled: boolean;
    };

interface DetailTabStripItem {
  count?: number;
  disabled: boolean;
  id: string;
  label: string;
  lead: ReactNode;
}

interface DetailTabStripMeasurement {
  available: number;
  gap: number;
  moreWidth: number;
  widths: Readonly<Record<string, number>>;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
/** Room kept clear of the strip's edge fades when a tab scrolls into view. */
const scrollEdgePadding = 24;

function tabId(prefix: string, index: number) {
  return `${prefix}-tab-${index}`;
}

function tabLabelId(prefix: string, index: number) {
  return `${tabId(prefix, index)}-label`;
}

function lowerLead(text: string) {
  return /^[A-Z][a-z]/u.test(text) ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function isRightToLeft(element: HTMLElement) {
  const dir = element.closest("[dir]")?.getAttribute("dir");
  if (dir === "rtl" || dir === "ltr") return dir === "rtl";
  return typeof getComputedStyle === "function" && getComputedStyle(element).direction === "rtl";
}

function sameMeasurement(left: DetailTabStripMeasurement, right: DetailTabStripMeasurement) {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const leftIds = Object.keys(left.widths);
  return near(left.available, right.available)
    && near(left.gap, right.gap)
    && near(left.moreWidth, right.moreWidth)
    && leftIds.length === Object.keys(right.widths).length
    && leftIds.every((id) => near(left.widths[id] ?? -1, right.widths[id] ?? -1));
}

function TabContent({ item, labelId }: { item: DetailTabStripItem; labelId?: string }) {
  return (
    <>
      {item.lead === null || item.lead === undefined || item.lead === false ? null : (
        <span aria-hidden="true" className="cc-resource-detail-tabs__lead">{item.lead}</span>
      )}
      <span className="cc-resource-detail-tabs__label" id={labelId}>{item.label}</span>
      {item.count !== undefined ? <span className="cc-resource-detail-tabs__count">{item.count}</span> : null}
    </>
  );
}

interface DetailTabStripProps {
  activeId: string | undefined;
  ariaLabel: string;
  idPrefix: string;
  items: readonly DetailTabStripItem[];
  level: "primary" | "secondary";
  onSelect?: (id: string) => void;
  overflow: ResourceDetailTabsOverflow;
  panelId: string;
}

function DetailTabStrip({
  activeId,
  ariaLabel,
  idPrefix,
  items,
  level,
  onSelect,
  overflow,
  panelId,
}: DetailTabStripProps) {
  const viewport = useCommandCenterViewport();
  const requestedMode = overflow === "auto" ? (viewport.coarsePointer ? "scroll" : "menu") : overflow;
  const frameRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuOpenRef = useRef(false);
  const remeasureAfterMenuRef = useRef(false);
  const pendingFocusRef = useRef<string | null>(null);
  const lastActiveRef = useRef(activeId);
  const scrolledRef = useRef(false);
  const [measurement, setMeasurement] = useState<DetailTabStripMeasurement | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const moreId = `${idPrefix}-more`;
  const itemsKey = items
    .map((item) => [item.id, item.label, item.count ?? "", item.disabled ? 1 : 0].join("\u0000"))
    .join("\u0001");

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const row = measureRef.current;
    if (!frame || !row) return;
    if (menuOpenRef.current) {
      // Never refit under an open menu; its trigger could unmount with the popup still open.
      remeasureAfterMenuRef.current = true;
      return;
    }
    const widths: Record<string, number> = {};
    row.querySelectorAll<HTMLElement>("[data-cc-measure-tab]").forEach((node) => {
      widths[node.dataset.ccMeasureTab ?? ""] = node.getBoundingClientRect().width;
    });
    const more = row.querySelector<HTMLElement>("[data-cc-measure-more]");
    const frameStyle = getComputedStyle(frame);
    const listStyle = listRef.current ? getComputedStyle(listRef.current) : null;
    const next: DetailTabStripMeasurement = {
      available: frame.clientWidth
        - (Number.parseFloat(frameStyle.paddingLeft) || 0)
        - (Number.parseFloat(frameStyle.paddingRight) || 0),
      gap: Number.parseFloat(listStyle?.columnGap ?? "") || 0,
      moreWidth: more?.getBoundingClientRect().width ?? 0,
      widths,
    };
    setMeasurement((current) => (current && sameMeasurement(current, next) ? current : next));
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (requestedMode === "menu") measure();
  }, [itemsKey, measure, requestedMode]);

  useEffect(() => {
    if (requestedMode !== "menu" || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure());
    if (frameRef.current) observer.observe(frameRef.current);
    measureRef.current
      ?.querySelectorAll("[data-cc-measure-tab], [data-cc-measure-more]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [itemsKey, measure, requestedMode]);

  const activeIndex = items.findIndex((item) => item.id === activeId);
  const focusedIndex = focusedId === null ? -1 : items.findIndex((item) => item.id === focusedId);
  // Until the first measurement (and always on the server) the strip keeps its scroll styling,
  // so no tab is ever clipped out of reach.
  const menuMode = requestedMode === "menu" && measurement !== null && measurement.available > 0;
  const fit = menuMode && measurement
    ? fitDetailTabs({
        available: measurement.available,
        gap: measurement.gap,
        moreWidth: measurement.moreWidth,
        pinned: [activeIndex, focusedIndex].filter((index) => index >= 0),
        widths: items.map((item) => measurement.widths[item.id] ?? 0),
      })
    : null;
  const visibleIndexes = fit ? fit.visible : items.map((_, index) => index);
  const overflowIndexes = fit ? fit.overflow : [];
  const moreShown = overflowIndexes.length > 0;
  const tabStopId = activeIndex >= 0 && visibleIndexes.includes(activeIndex)
    ? activeId
    : items[visibleIndexes[0] ?? -1]?.id;

  useEffect(() => {
    if (moreShown || !menuOpenRef.current) return;
    menuOpenRef.current = false;
    if (remeasureAfterMenuRef.current) {
      remeasureAfterMenuRef.current = false;
      measure();
    }
  }, [measure, moreShown]);

  // A tab picked from More gets focus once the host makes it active, unless focus moved on.
  useEffect(() => {
    const previous = lastActiveRef.current;
    lastActiveRef.current = activeId;
    const pending = pendingFocusRef.current;
    if (!pending) return;
    if (activeId !== pending) {
      if (activeId !== previous) pendingFocusRef.current = null;
      return;
    }
    pendingFocusRef.current = null;
    if (typeof document === "undefined") return;
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.id !== moreId) return;
    tabRefs.current.get(pending)?.focus();
  }, [activeId, moreId]);

  // Scroll mode keeps the active tab in view by scrolling the strip only, never the page.
  useEffect(() => {
    if (menuMode) return;
    const list = listRef.current;
    const tab = activeId ? tabRefs.current.get(activeId) : undefined;
    if (!list || !tab) return;
    const initial = !scrolledRef.current;
    scrolledRef.current = true;
    const listRect = list.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const delta = scrollDeltaForTab({
      padding: scrollEdgePadding,
      tabEnd: tabRect.right - listRect.left,
      tabStart: tabRect.left - listRect.left,
      viewportWidth: list.clientWidth,
    });
    if (delta === 0) return;
    if (typeof list.scrollBy === "function") {
      list.scrollBy({ behavior: initial || viewport.reducedMotion ? "auto" : "smooth", left: delta });
    } else {
      list.scrollLeft += delta;
    }
  }, [activeId, menuMode, viewport.reducedMotion]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const order = visibleIndexes.map((index) => items[index]!.id);
    const position = order.indexOf(id);
    if (position < 0) return;
    let next: string | undefined;
    if (event.key === "Home") {
      next = order[0];
    } else if (event.key === "End") {
      next = order[order.length - 1];
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const forward = (event.key === "ArrowRight") !== isRightToLeft(event.currentTarget);
      next = order[(position + (forward ? 1 : -1) + order.length) % order.length];
    } else {
      return;
    }
    event.preventDefault();
    if (next) tabRefs.current.get(next)?.focus();
  };

  const modifier = `cc-resource-detail-tabs__tab cc-resource-detail-tabs__tab--${level}`;
  const overflowAttribute = menuMode ? "menu" : "scroll";
  const hasOverflowLeads = overflowIndexes.some((index) => {
    const lead = items[index]?.lead;
    return lead !== null && lead !== undefined && lead !== false;
  });

  return (
    <div
      className={`cc-resource-detail-tabs__viewport cc-resource-detail-tabs__viewport--${level}`}
      data-overflow={overflowAttribute}
      ref={frameRef}
    >
      <div
        aria-label={ariaLabel}
        className={`cc-resource-detail-tabs${level === "secondary" ? " cc-resource-detail-tabs--secondary" : ""}`}
        data-overflow={overflowAttribute}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedId(null);
        }}
        onFocus={(event) => {
          const id = (event.target as HTMLElement).dataset?.ccTabId;
          if (id !== undefined) setFocusedId(id);
        }}
        ref={listRef}
        role="tablist"
      >
        {visibleIndexes.map((index) => {
          const item = items[index]!;
          const active = item.id === activeId;
          return (
            <button
              aria-controls={panelId}
              aria-disabled={item.disabled || undefined}
              aria-selected={active}
              className={`${modifier}${active ? " cc-resource-detail-tabs__tab--active" : ""}`}
              data-cc-tab-id={item.id}
              data-state={active ? "active" : "inactive"}
              id={tabId(idPrefix, index)}
              key={item.id}
              onClick={() => {
                if (!item.disabled) onSelect?.(item.id);
              }}
              onKeyDown={(event) => handleKeyDown(event, item.id)}
              ref={(node) => {
                if (node) tabRefs.current.set(item.id, node);
                else tabRefs.current.delete(item.id);
              }}
              role="tab"
              tabIndex={item.id === tabStopId ? 0 : -1}
              type="button"
            >
              <TabContent item={item} labelId={tabLabelId(idPrefix, index)} />
            </button>
          );
        })}
      </div>
      {moreShown ? (
        <ResourcePicker
          ariaLabel={`More ${lowerLead(ariaLabel)}, ${overflowIndexes.length} hidden`}
          className="cc-resource-detail-tabs__more"
          fitContent
          id={moreId}
          mode="action"
          onAction={(id) => {
            if (typeof document !== "undefined") document.getElementById(moreId)?.focus();
            pendingFocusRef.current = id;
            onSelect?.(id);
          }}
          onOpenChange={(open) => {
            menuOpenRef.current = open;
            if (!open && remeasureAfterMenuRef.current) {
              remeasureAfterMenuRef.current = false;
              measure();
            }
          }}
          options={overflowIndexes.map((index) => {
            const item = items[index]!;
            return {
              disabled: item.disabled,
              label: item.label,
              value: item.id,
              ...(item.count === undefined ? {} : { meta: String(item.count) }),
            };
          })}
          presentation="auto"
          renderOption={hasOverflowLeads ? (option) => {
            const item = items.find((candidate) => candidate.id === option.value);
            const lead = item?.lead;
            return (
              <>
                {lead === null || lead === undefined || lead === false ? null : (
                  <span aria-hidden="true" className="cc-resource-picker__icon">{lead}</span>
                )}
                <span className="cc-resource-picker__option-copy">
                  <span className="cc-resource-picker__option-label">{option.label}</span>
                </span>
                {option.meta ? <span className="cc-resource-picker__option-meta">{option.meta}</span> : null}
              </>
            );
          } : undefined}
          triggerLabel="More"
        />
      ) : null}
      {requestedMode === "menu" ? (
        <div aria-hidden="true" className="cc-resource-detail-tabs__measure" ref={measureRef}>
          <div className="cc-resource-detail-tabs__measure-row">
            {items.map((item) => (
              <button
                className={`${modifier} cc-resource-detail-tabs__tab--active`}
                data-cc-measure-tab={item.id}
                key={item.id}
                tabIndex={-1}
                type="button"
              >
                <TabContent item={item} />
              </button>
            ))}
            <div className="cc-resource-picker cc-resource-picker--fit-content" data-cc-measure-more="">
              <button className="cc-resource-picker__trigger cc-resource-detail-tabs__more" tabIndex={-1} type="button">
                <span className="cc-resource-picker__value">More</span>
                <svg aria-hidden="true" className="cc-resource-picker__chevron" viewBox="0 0 20 20">
                  <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface ResourceDetailTabsCardProps<T> {
  accessory?: ReactNode;
  activeSubTab: ResourceDetailSubTabDefinition<T> | undefined;
  activeTab: ResourceDetailTabDefinition<T> | undefined;
  children?: ReactNode;
  contentVariant: "card" | "plain";
  onSubTabChange?: (id: string) => void;
  onTabChange?: (id: string) => void;
  overflow: ResourceDetailTabsOverflow;
  renderTabLead?: (context: ResourceDetailTabLeadContext<T>) => ReactNode;
  subTabs: readonly ResourceDetailSubTabDefinition<T>[];
  tabs: readonly ResourceDetailTabDefinition<T>[];
  tabsLabel: string;
}

/**
 * Internal to `ResourceDetailShell`: the tab strips and the tab panel they control. It owns every
 * hook of the tabbed detail, because the shell returns early while `loading`.
 */
export function ResourceDetailTabsCard<T>({
  accessory,
  activeSubTab,
  activeTab,
  children,
  contentVariant,
  onSubTabChange,
  onTabChange,
  overflow,
  renderTabLead,
  subTabs,
  tabs,
  tabsLabel,
}: ResourceDetailTabsCardProps<T>) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const primaryPrefix = `${baseId}-primary`;
  const secondaryPrefix = `${baseId}-secondary`;
  const showSubTabs = Boolean(activeTab) && subTabs.length > 1;
  const primaryItems = tabs.map((tab): DetailTabStripItem => {
    const active = tab.id === activeTab?.id;
    const disabled = tab.disabled === true;
    return {
      disabled,
      id: tab.id,
      label: tab.label,
      lead: renderTabLead?.({ active, disabled, level: "primary", tab }),
      ...(tab.count === undefined ? {} : { count: tab.count }),
    };
  });
  const secondaryItems = showSubTabs && activeTab
    ? subTabs.map((subTab): DetailTabStripItem => {
        const active = subTab.id === activeSubTab?.id;
        const disabled = subTab.disabled === true;
        return {
          disabled,
          id: subTab.id,
          label: subTab.label,
          lead: renderTabLead?.({ active, disabled, level: "secondary", parent: activeTab, tab: subTab }),
          ...(subTab.count === undefined ? {} : { count: subTab.count }),
        };
      })
    : [];
  const primaryIndex = tabs.findIndex((tab) => tab.id === activeTab?.id);
  const secondaryIndex = showSubTabs ? subTabs.findIndex((subTab) => subTab.id === activeSubTab?.id) : -1;
  const labelledBy = [
    primaryIndex >= 0 ? tabLabelId(primaryPrefix, primaryIndex) : null,
    secondaryIndex >= 0 ? tabLabelId(secondaryPrefix, secondaryIndex) : null,
  ].filter(Boolean).join(" ");

  return (
    <div className="cc-resource-detail-shell__card">
      <div className="cc-resource-detail-shell__tabs-header">
        <div className="cc-resource-detail-shell__tabs-row">
          <DetailTabStrip
            activeId={activeTab?.id}
            ariaLabel={tabsLabel}
            idPrefix={primaryPrefix}
            items={primaryItems}
            level="primary"
            onSelect={onTabChange}
            overflow={overflow}
            panelId={panelId}
          />
          {accessory ? <div className="cc-resource-detail-shell__tabs-accessory">{accessory}</div> : null}
        </div>
        {showSubTabs ? (
          <DetailTabStrip
            activeId={activeSubTab?.id}
            ariaLabel={`${activeTab?.label ?? "Detail"} sections`}
            idPrefix={secondaryPrefix}
            items={secondaryItems}
            key={activeTab?.id}
            level="secondary"
            onSelect={onSubTabChange}
            overflow={overflow}
            panelId={panelId}
          />
        ) : null}
      </div>
      <div
        aria-labelledby={labelledBy || undefined}
        className={`cc-resource-detail-shell__content cc-resource-detail-shell__content--${contentVariant}`}
        id={panelId}
        role="tabpanel"
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
