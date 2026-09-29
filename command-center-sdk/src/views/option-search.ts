/** Internal: the one search rule for SDK option lists (the picker and the transfer list). */

export interface SearchableOption {
  label: string;
  subtitle?: string;
  meta?: string;
  keywords?: readonly string[];
}

export function getOptionSearchText(option: SearchableOption) {
  return [
    option.label,
    option.subtitle ?? "",
    option.meta ?? "",
    ...(option.keywords ?? []),
  ].join(" ").toLocaleLowerCase();
}

/** Normalize a typed query once, then test options against it. */
export function normalizeOptionQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

export function matchesOptionQuery(option: SearchableOption, normalizedQuery: string) {
  return !normalizedQuery || getOptionSearchText(option).includes(normalizedQuery);
}
