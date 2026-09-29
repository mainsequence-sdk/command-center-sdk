import type { ReactNode } from "react";

import type {
  ResourcePickerOption,
  ResourceTransferChange,
  ResourceTransferListPresentation,
  ResourceTransferListProps,
  ResourceTransferListRenderOptionState,
} from "../../src/views/index.js";

const options: readonly ResourcePickerOption[] = [
  { label: "Ada Lovelace", subtitle: "ada@example.test", value: "ada" },
  { disabled: true, label: "Linus Torvalds", meta: "Always has access", value: "linus" },
];

const onValueChange = (value: readonly string[], change: ResourceTransferChange) => {
  const added: string[] = change.added;
  const removed: string[] = change.removed;
  void [value, added, removed];
};

const renderOption = (option: ResourcePickerOption, state: ResourceTransferListRenderOptionState): ReactNode =>
  `${state.side}:${state.highlighted ? "marked" : "idle"}:${option.label}`;

const presentation: ResourceTransferListPresentation = "auto";
// @ts-expect-error presentation is auto, columns, or stacked
const invalidPresentation: ResourceTransferListPresentation = "grid";

const props: ResourceTransferListProps = {
  description: "Chosen users can view this object.",
  itemLabel: "users",
  onValueChange,
  options,
  presentation,
  renderOption,
  value: ["linus"],
};

// @ts-expect-error itemLabel names the options and is required
const missingItemLabel: ResourceTransferListProps = { onValueChange, options, value: [] };

void [invalidPresentation, missingItemLabel, props];
