import { useMemo, useState } from "react";

import {
  buildAllMatchingBulkSelection,
  buildExplicitBulkSelection,
} from "../bulk-actions.js";
import type {
  ResourceBulkActionQuery,
  ResourceBulkSelection,
  ResourceId,
} from "../types.js";

export function useResourceBulkSelection<Id extends ResourceId = string>() {
  const [selection, setSelection] = useState<ResourceBulkSelection<Id> | null>(null);
  const explicitIds = selection?.mode === "explicit" ? selection.uids : [];
  const explicitIdSet = useMemo(() => new Set(explicitIds), [explicitIds]);

  return {
    selection,
    explicitIds,
    isAllMatching: selection?.mode === "all_matching",
    isSelected: (id: Id) => selection?.mode === "all_matching" || explicitIdSet.has(id),
    clearSelection: () => setSelection(null),
    setExplicitSelection: (ids: readonly Id[]) =>
      setSelection(ids.length > 0 ? buildExplicitBulkSelection(ids) : null),
    selectAllMatching: (query: ResourceBulkActionQuery) =>
      setSelection(buildAllMatchingBulkSelection(query) as ResourceBulkSelection<Id>),
  };
}
