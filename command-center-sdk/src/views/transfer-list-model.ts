/** Internal, pure rules for `ResourceTransferList`. Not part of the public entrypoint. */

export interface TransferOption {
  value: string;
  disabled?: boolean;
}

/** What one move changed, in the order the values moved. */
export interface ResourceTransferChange {
  added: string[];
  removed: string[];
}

export interface TransferPanes<Option extends TransferOption> {
  /** Options not chosen, in option order. */
  available: Option[];
  /** Chosen options, in `value` order. Chosen values without an option are not listed. */
  selected: Option[];
}

export interface TransferResult {
  value: string[];
  change: ResourceTransferChange;
}

function uniqueValues(values: readonly string[]) {
  return Array.from(new Set(values));
}

function indexOptions<Option extends TransferOption>(options: readonly Option[]) {
  const byValue = new Map<string, Option>();
  for (const option of options) {
    if (!byValue.has(option.value)) byValue.set(option.value, option);
  }
  return byValue;
}

export function splitTransferOptions<Option extends TransferOption>(
  options: readonly Option[],
  value: readonly string[],
): TransferPanes<Option> {
  const byValue = indexOptions(options);
  const chosen = uniqueValues(value);
  const chosenSet = new Set(chosen);
  return {
    available: Array.from(byValue.values()).filter((option) => !chosenSet.has(option.value)),
    selected: chosen.flatMap((entry) => {
      const option = byValue.get(entry);
      return option ? [option] : [];
    }),
  };
}

/**
 * Append `values` to the selection in option order. Disabled options, values already chosen, and
 * values without an option are skipped.
 */
export function addToTransferSelection<Option extends TransferOption>(
  options: readonly Option[],
  value: readonly string[],
  values: readonly string[],
): TransferResult {
  const current = uniqueValues(value);
  const currentSet = new Set(current);
  const requested = new Set(values);
  const added = Array.from(indexOptions(options).values())
    .filter((option) => requested.has(option.value) && !option.disabled && !currentSet.has(option.value))
    .map((option) => option.value);
  return { change: { added, removed: [] }, value: [...current, ...added] };
}

/**
 * Remove `values` from the selection. Disabled options stay chosen, and chosen values without an
 * option are never removed: the list cannot show them, so it never asks to.
 */
export function removeFromTransferSelection<Option extends TransferOption>(
  options: readonly Option[],
  value: readonly string[],
  values: readonly string[],
): TransferResult {
  const byValue = indexOptions(options);
  const requested = new Set(values);
  const current = uniqueValues(value);
  const removed = current.filter((entry) => {
    const option = byValue.get(entry);
    return Boolean(option) && !option?.disabled && requested.has(entry);
  });
  const removedSet = new Set(removed);
  return {
    change: { added: [], removed },
    value: current.filter((entry) => !removedSet.has(entry)),
  };
}
