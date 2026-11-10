/** BCP 47 language, optional script, and optional region. Variants/extensions are not supported. */
const localePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?$/;

/** Framework-neutral locale and message contract. Applications own catalogs and persistence. */
export function normalizeCommandCenterLocale(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 128 || !localePattern.test(value)) return null;
  try { return Intl.getCanonicalLocales(value)[0] ?? null; } catch { return null; }
}

/** Exact supported locale, its base language, then the application's English fallback. */
export function resolveCommandCenterLocale(value: unknown, supported: readonly string[], fallback = "en"): string {
  const locale = normalizeCommandCenterLocale(value);
  const fallbackLocale = normalizeCommandCenterLocale(fallback) ?? "en";
  if (!locale) return fallbackLocale;
  const candidates = supported.map(normalizeCommandCenterLocale);
  return candidates.find((candidate) => candidate === locale)
    ?? candidates.find((candidate) => candidate === locale.split("-")[0])
    ?? fallbackLocale;
}

export const sdkEnglishMessages = {
  "navigationMenu": "Navigation menu",
  "openApplicationNavigation": "Open application navigation",
  "expandApplicationNavigation": "Expand application navigation",
  "collapseApplicationNavigation": "Collapse application navigation",
  "expandNavigation": "Expand navigation",
  "collapseNavigation": "Collapse navigation",
  "openNavigation": "Open navigation menu",
  "closeNavigation": "Close navigation menu",
  "applications": "Applications",
  "back": "Back",
  "progress": "Progress",
  "progressEmpty": "Preparing progress details…",
  "applicationProgress": "Application progress",
  "stagePending": "Waiting",
  "stageActive": "In progress",
  "stageComplete": "Complete",
  "stageError": "Failed",
  "stage": "Stage",
  "stageDetails": "{{label}} details",
  "elapsedSeconds": "{{seconds}}s",
  "elapsedMinutes": "{{minutes}}m {{seconds}}s",
  "detailSections": "Detail sections",
  "breadcrumb": "Breadcrumb",
  "loadingDetails": "Loading details…",
  "loadingResource": "Loading the selected resource.",
  "opening": "Opening…",
  "preparingResource": "Preparing the selected resource.",
  "more": "More",
  "moreSections": "More {{label}}, {{count}} hidden",
  "subSections": "{{label}} sections",
  "detail": "Detail",
  "newLabel": "New label",
  "typeLabel": "Type a label",
  "addLabel": "Add label",
  "removeLabel": "Remove {{label}} label",
  "editItem": "Edit {{label}}",
  "aboutItem": "About {{label}}",
  "notAvailable": "Not available",

  "selectItem": "Select {{id}}",
  "actionCompleted": "{{actionLabel}} completed.",
  "actionContractChanged": "The action contract changed. Review the refreshed preflight before continuing.",
  "preflightUnsupported": "The adapter does not implement the advertised preflight request.",
  "transferAdded": "{{label}} added.",
  "transferRemoved": "{{label}} removed.",
  "transferAddedCount": "{{count}} {{itemLabel}} added.",
  "transferRemovedCount": "{{count}} {{itemLabel}} removed.",
  "transferCount": "{{shown}} of {{count}}",
  "actions": "Actions",
  "clear": "Clear",
  "retry": "Retry",
  "refresh": "Refresh",
  "cancel": "Cancel",
  "search": "Search",
  "sort": "Sort",
  "defaultOrder": "Default order",
  "results": "results",
  "previous": "Previous",
  "next": "Next",
  "morePages": "More pages available",
  "skippedPages": "Skipped pages",
  "paginationLabel": "{{itemLabel}} pagination",
  "noResults": "No {{itemLabel}}",
  "paginationSummary": "{{start}}-{{end}} of {{count}} {{itemLabel}}",
  "paginationMinimumSummary": "{{start}}-{{end}} of at least {{count}} {{itemLabel}}",
  "pageSummary": "Page {{page}} of {{pages}}",
  "openPageSummary": "Page {{page}}",
  "selectionCount": "{{count}} selected",
  "selectionPage": "{{count}} selected on this page.",
  "selectionAll": "All {{count}} matching {{itemLabel}} selected.",
  "selectAllMatching": "Select all {{count}} matching {{itemLabel}}",
  "selectRow": "Select row",
  "selectAllRows": "Select all visible rows",
  "loadingActions": "Loading actions",
  "loadingItems": "Loading {{itemLabel}}…",
  "emptyItems": "No {{itemLabel}} yet.",
  "noMatchingItems": "No {{itemLabel}} match the current search and filters.",
  "searchItems": "Search {{itemLabel}}",
  "resultCount": "{{count}} {{itemLabel}}",
  "listLoadError": "The resource list could not be loaded.",
  "activationError": "The selected resource could not be opened.",
  "noOptions": "No options match your search.",
  "loadingOptions": "Loading options…",
  "selectOption": "Select an option",
  "searchOptions": "Search options",
  "noTableResults": "No results.",
  "moreDetails": "More details",
  "notSet": "Not set",
  "closeDialog": "Close dialog",
  "actionBlocked": "Action blocked",
  "checking": "Checking…",
  "preflightUnavailable": "Preflight unavailable",
  "working": "Working…",
  "confirmAction": "Are you sure you want to run “{{actionLabel}}”?",
  "confirmTyping": "Confirm by typing {{word}}.",
  "confirmationWord": "Confirmation word",
  "typeExactly": "Type {{word}} exactly to continue.",
  "preflightChecking": "Checking dependencies and impact",
  "preflightWait": "The action will remain disabled until preflight finishes.",
  "preflightError": "Preflight could not be completed",
  "preflightPassed": "Preflight passed",
  "preflightMatched": "{{count}} matched",
  "preflightGuidance": "Resolve the blocking dependencies or remove the blocked items from the selection.",
  "preflightBlocked": "Preflight blocked this action.",
  "preflightPending": "Wait for preflight to finish before continuing.",
  "actionUnavailable": "This action is no longer available.",
  "selectionUnavailable": "The action selection is no longer available.",
  "available": "Available",
  "selected": "Selected",
  "allSelected": "All {{itemLabel}} are selected.",
  "noneSelected": "No {{itemLabel}} selected.",
  "noSearchMatches": "No {{itemLabel}} match this search.",
  "transferHeading": "{{heading}} {{itemLabel}}",
  "transferSearch": "Search {{heading}} {{itemLabel}}",
  "moveItems": "Move {{itemLabel}}",
  "addSelected": "Add selected {{itemLabel}}",
  "addAllShown": "Add all shown {{itemLabel}}",
  "removeSelected": "Remove selected {{itemLabel}}",
  "removeAllShown": "Remove all shown {{itemLabel}}"
} as const;

export type SdkMessageKey = keyof typeof sdkEnglishMessages;
export type SdkMessageValues = Readonly<Record<string, string | number>>;
/** Return undefined for a missing translation; the SDK then uses its complete English message. */
export type TranslateSdkMessage = (key: SdkMessageKey, values: SdkMessageValues) => string | undefined;

export function formatSdkEnglishMessage(key: SdkMessageKey, values: SdkMessageValues = {}): string {
  return sdkEnglishMessages[key].replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""));
}
