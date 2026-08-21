import { useEffect, useMemo, useState } from "react";

import type { ResourceId } from "../types.js";

function sameIds<Id extends ResourceId>(left: readonly Id[], right: readonly Id[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const defaultGetResourceId = (item: { id: ResourceId }) => item.id;

export function useResourceSelection<T, Id extends ResourceId = number>(
  items: readonly T[],
  getId: (item: T) => Id = defaultGetResourceId as unknown as (item: T) => Id,
  initialSelectedIds: readonly Id[] = [],
) {
  const [selectedIds, setSelectedIds] = useState<Id[]>(() => [...initialSelectedIds]);

  useEffect(() => {
    const visibleIds = new Set(items.map((item) => getId(item)));

    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return sameIds(current, next) ? current : next;
    });
  }, [getId, items]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = items.filter((item) => selectedIdSet.has(getId(item)));
  const allSelected = items.length > 0 && items.every((item) => selectedIdSet.has(getId(item)));
  const someSelected = !allSelected && items.some((item) => selectedIdSet.has(getId(item)));

  return {
    allSelected,
    someSelected,
    selectedCount: selectedIds.length,
    selectedIds,
    selectedItems,
    clearSelection: () => setSelectedIds([]),
    isSelected: (id: Id) => selectedIdSet.has(id),
    setSelection: (ids: readonly Id[]) => setSelectedIds(Array.from(new Set(ids))),
    toggleAll: () =>
      setSelectedIds((current) => {
        const currentSet = new Set(current);

        if (items.length > 0 && items.every((item) => currentSet.has(getId(item)))) {
          return [];
        }

        return items.map((item) => getId(item));
      }),
    toggleSelection: (id: Id) =>
      setSelectedIds((current) => {
        const currentSet = new Set(current);

        if (currentSet.has(id)) {
          currentSet.delete(id);
        } else {
          currentSet.add(id);
        }

        return Array.from(currentSet);
      }),
  };
}
