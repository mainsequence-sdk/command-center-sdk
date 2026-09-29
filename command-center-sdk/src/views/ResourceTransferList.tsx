import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button, Input, Label } from "../controls/components.js";
import { useCommandCenterViewport } from "../layout/viewport.js";
import { matchesOptionQuery, normalizeOptionQuery } from "./option-search.js";
import type { ResourcePickerOption } from "./ResourcePicker.js";
import {
  addToTransferSelection,
  removeFromTransferSelection,
  splitTransferOptions,
  type ResourceTransferChange,
  type TransferResult,
} from "./transfer-list-model.js";

export type { ResourceTransferChange } from "./transfer-list-model.js";

/**
 * `columns` puts Available and Selected side by side with the move buttons between them; `stacked`
 * puts Available above Selected; `auto` stacks below `sm`.
 */
export type ResourceTransferListPresentation = "auto" | "columns" | "stacked";

export type ResourceTransferListSide = "available" | "selected";

export interface ResourceTransferListRenderOptionState {
  /** Marked in its list, waiting to be moved. */
  highlighted: boolean;
  side: ResourceTransferListSide;
}

export interface ResourceTransferListProps {
  /** Every item that can be chosen. Options are the picker's model. */
  options: readonly ResourcePickerOption[];
  /**
   * The chosen values, in order. Values without an option stay in the value and are not shown, so
   * the list never removes what it cannot display.
   */
  value: readonly string[];
  onValueChange: (value: readonly string[], change: ResourceTransferChange) => void;
  /** What the options are, as a plural noun ("users"). It names the lists, searches, and buttons. */
  itemLabel: string;
  /** Heading of the unchosen list. Defaults to "Available". */
  availableLabel?: string;
  /** Heading of the chosen list. Defaults to "Selected". */
  selectedLabel?: string;
  /** Helper text shown under both lists and announced with them. */
  description?: ReactNode;
  /** Read only: the lists can be browsed and searched, and nothing moves. */
  disabled?: boolean;
  /**
   * A change is being saved: both lists are marked busy and nothing moves until it clears. People
   * can still browse, search, and mark items.
   */
  pending?: boolean;
  presentation?: ResourceTransferListPresentation;
  /** Replaces an option's content. The row keeps its selection state and styling. */
  renderOption?: (option: ResourcePickerOption, state: ResourceTransferListRenderOptionState) => ReactNode;
  /** Shown when every option is chosen. */
  emptyAvailableMessage?: ReactNode;
  /** Shown when nothing is chosen. */
  emptySelectedMessage?: ReactNode;
  id?: string;
}

interface PendingFocus {
  side: ResourceTransferListSide;
  /** The option to focus once the move lands: the next one that stays in the list. */
  value: string | undefined;
}

function lowerFirst(text: string) {
  return /^[A-Z][a-z]/u.test(text) ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function OptionContent({ option }: { option: ResourcePickerOption }) {
  const Icon = option.icon;
  return (
    <>
      {Icon ? (
        <span aria-hidden="true" className="cc-resource-transfer__icon">
          <Icon />
        </span>
      ) : null}
      <span className="cc-resource-transfer__option-copy">
        <span className="cc-resource-transfer__option-label">{option.label}</span>
        {option.subtitle ? <span className="cc-resource-transfer__option-subtitle">{option.subtitle}</span> : null}
      </span>
      {option.meta ? <span className="cc-resource-transfer__option-meta">{option.meta}</span> : null}
    </>
  );
}

function CheckMark() {
  return (
    <span aria-hidden="true" className="cc-resource-transfer__check">
      <svg viewBox="0 0 20 20">
        <path d="m4.5 10.5 3.25 3.25 7.75-8" />
      </svg>
    </span>
  );
}

/**
 * Choose many items side by side: unchosen items on one side, chosen items on the other, each list
 * searchable, with buttons to move the marked items or every shown item across. Controlled; the
 * application owns what a choice means and when it is saved.
 */
export function ResourceTransferList({
  availableLabel = "Available",
  description,
  disabled = false,
  emptyAvailableMessage,
  emptySelectedMessage,
  id,
  itemLabel,
  onValueChange,
  options,
  pending = false,
  presentation = "auto",
  renderOption,
  selectedLabel = "Selected",
  value,
}: ResourceTransferListProps) {
  const generatedId = useId();
  const baseId = id ?? `cc-resource-transfer-${generatedId}`;
  const viewport = useCommandCenterViewport();
  const resolvedPresentation = presentation === "auto"
    ? (viewport.breakpoint === "xs" ? "stacked" : "columns")
    : presentation;
  const [queries, setQueries] = useState<Record<ResourceTransferListSide, string>>({ available: "", selected: "" });
  const [highlighted, setHighlighted] = useState<Record<ResourceTransferListSide, string[]>>({
    available: [],
    selected: [],
  });
  const [focusIndexes, setFocusIndexes] = useState<Record<ResourceTransferListSide, number>>({
    available: 0,
    selected: 0,
  });
  const [announcement, setAnnouncement] = useState("");
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const optionRefs = useRef<Record<ResourceTransferListSide, Array<HTMLButtonElement | null>>>({
    available: [],
    selected: [],
  });

  const panes = useMemo(() => splitTransferOptions(options, value), [options, value]);
  const shown = useMemo(() => {
    const filter = (side: ResourceTransferListSide) => {
      const query = normalizeOptionQuery(queries[side]);
      return panes[side].filter((option) => matchesOptionQuery(option, query));
    };
    return { available: filter("available"), selected: filter("selected") };
  }, [panes, queries]);
  // Only marks on shown options count, so a search never moves what the person cannot see.
  const marked = {
    available: highlighted.available.filter((entry) => shown.available.some((option) => option.value === entry)),
    selected: highlighted.selected.filter((entry) => shown.selected.some((option) => option.value === entry)),
  };
  const lowerItemLabel = lowerFirst(itemLabel);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const refs = optionRefs.current;
    const list = shown[pending.side];
    if (list.length > 0) {
      const found = pending.value === undefined ? -1 : list.findIndex((option) => option.value === pending.value);
      const index = found >= 0 ? found : Math.min(focusIndexes[pending.side], list.length - 1);
      setFocusIndexes((current) => ({ ...current, [pending.side]: index }));
      refs[pending.side][index]?.focus();
      return;
    }
    // The list emptied: continue in the other list, where the items went.
    const other: ResourceTransferListSide = pending.side === "available" ? "selected" : "available";
    if (shown[other].length > 0) refs[other][Math.min(focusIndexes[other], shown[other].length - 1)]?.focus();
  }, [value]);

  function announce(result: TransferResult, side: ResourceTransferListSide) {
    const values = side === "available" ? result.change.added : result.change.removed;
    const verb = side === "available" ? "added" : "removed";
    if (values.length === 1) {
      const option = options.find((candidate) => candidate.value === values[0]);
      setAnnouncement((current) => {
        const next = `${option?.label ?? values[0]} ${verb}.`;
        return current === next ? `${next} ` : next;
      });
    } else if (values.length > 1) {
      setAnnouncement((current) => {
        const next = `${values.length} ${lowerItemLabel} ${verb}.`;
        return current === next ? `${next} ` : next;
      });
    }
  }

  function move(side: ResourceTransferListSide, values: readonly string[], focusAfter?: PendingFocus) {
    if (disabled || pending || values.length === 0) return;
    const result = side === "available"
      ? addToTransferSelection(options, value, values)
      : removeFromTransferSelection(options, value, values);
    const changed = result.change.added.length + result.change.removed.length;
    if (changed === 0) return;
    setHighlighted((current) => ({ ...current, [side]: [] }));
    if (focusAfter) pendingFocusRef.current = focusAfter;
    announce(result, side);
    onValueChange(result.value, result.change);
  }

  function focusAfterMove(side: ResourceTransferListSide, from: number, moving: readonly string[]): PendingFocus {
    const list = shown[side];
    const leaving = new Set(moving);
    const after = list.slice(from).find((option) => !leaving.has(option.value));
    const before = list.slice(0, from).reverse().find((option) => !leaving.has(option.value));
    return { side, value: (after ?? before)?.value };
  }

  function movable(side: ResourceTransferListSide, entries: readonly string[]) {
    return entries.filter((entry) => {
      const option = panes[side].find((candidate) => candidate.value === entry);
      return option && !option.disabled;
    });
  }

  function toggle(side: ResourceTransferListSide, option: ResourcePickerOption) {
    if (disabled || option.disabled) return;
    setHighlighted((current) => {
      const list = current[side];
      return {
        ...current,
        [side]: list.includes(option.value)
          ? list.filter((entry) => entry !== option.value)
          : [...list, option.value],
      };
    });
  }

  function focusOption(side: ResourceTransferListSide, index: number) {
    setFocusIndexes((current) => ({ ...current, [side]: index }));
    optionRefs.current[side][index]?.focus();
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>, side: ResourceTransferListSide) {
    const list = shown[side];
    if (list.length === 0) return;
    const current = Math.min(focusIndexes[side], list.length - 1);
    const command = event.ctrlKey || event.metaKey;

    if (command && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      if (disabled) return;
      const enabled = list.filter((option) => !option.disabled).map((option) => option.value);
      const allMarked = enabled.every((entry) => marked[side].includes(entry));
      setHighlighted((state) => ({ ...state, [side]: allMarked ? [] : enabled }));
      return;
    }
    if (event.altKey || command) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(Math.max(current + (event.key === "ArrowDown" ? 1 : -1), 0), list.length - 1);
      focusOption(side, next);
      const option = list[next];
      if (event.shiftKey && option && !option.disabled && !disabled && !marked[side].includes(option.value)) {
        setHighlighted((state) => ({ ...state, [side]: [...state[side], option.value] }));
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusOption(side, event.key === "Home" ? 0 : list.length - 1);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      // Enter moves; Space keeps the button's own activation, which marks the option.
      event.preventDefault();
      const focused = list[current];
      const values = movable(
        side,
        marked[side].length > 0 ? marked[side] : focused && !focused.disabled ? [focused.value] : [],
      );
      move(side, values, focusAfterMove(side, current, values));
    }
  }

  const noun = lowerItemLabel;
  const counts = (side: ResourceTransferListSide) =>
    queries[side].trim() ? `${shown[side].length} of ${panes[side].length}` : `${panes[side].length}`;
  const addMarked = movable("available", marked.available);
  const addShown = movable("available", shown.available.map((option) => option.value));
  const removeMarked = movable("selected", marked.selected);
  const removeShown = movable("selected", shown.selected.map((option) => option.value));
  const descriptionId = description ? `${baseId}-description` : undefined;

  const renderPane = (side: ResourceTransferListSide) => {
    const heading = side === "available" ? availableLabel : selectedLabel;
    const labelId = `${baseId}-${side}-label`;
    const searchId = `${baseId}-${side}-search`;
    const list = shown[side];
    const tabStop = Math.min(focusIndexes[side], Math.max(list.length - 1, 0));
    const empty = panes[side].length === 0
      ? (side === "available"
        ? emptyAvailableMessage ?? `All ${noun} are selected.`
        : emptySelectedMessage ?? `No ${noun} selected.`)
      : `No ${noun} match this search.`;
    optionRefs.current[side] = [];

    return (
      <div className="cc-resource-transfer__pane" data-side={side}>
        <div className="cc-resource-transfer__pane-header" id={labelId}>
          <span className="cc-resource-transfer__pane-label">{`${heading} ${noun}`}</span>{" "}
          <span className="cc-resource-transfer__count">({counts(side)})</span>
        </div>
        <Label className="cc-resource-visually-hidden" htmlFor={searchId}>
          {`Search ${lowerFirst(heading)} ${noun}`}
        </Label>
        <Input
          className="cc-resource-transfer__search"
          id={searchId}
          onChange={(event) => {
            const query = event.currentTarget.value;
            setQueries((current) => ({ ...current, [side]: query }));
            setFocusIndexes((current) => ({ ...current, [side]: 0 }));
          }}
          placeholder="Search"
          type="search"
          value={queries[side]}
        />
        <div className="cc-resource-transfer__frame">
          <div
            aria-busy={pending || undefined}
            aria-describedby={descriptionId}
            aria-labelledby={labelId}
            aria-multiselectable="true"
            className="cc-resource-transfer__list"
            onKeyDown={(event) => handleListKeyDown(event, side)}
            role="listbox"
          >
            {list.map((option, index) => {
              const isMarked = marked[side].includes(option.value);
              const inert = disabled || option.disabled === true;
              return (
                <button
                  aria-disabled={inert || undefined}
                  aria-selected={isMarked}
                  className={`cc-resource-transfer__option cc-resource-transfer__option--${option.tone ?? "default"}`}
                  data-value={option.value}
                  key={option.value}
                  onClick={() => {
                    setFocusIndexes((current) => ({ ...current, [side]: index }));
                    toggle(side, option);
                  }}
                  onDoubleClick={() => {
                    if (!inert) move(side, [option.value], focusAfterMove(side, index, [option.value]));
                  }}
                  ref={(node) => {
                    optionRefs.current[side][index] = node;
                  }}
                  role="option"
                  tabIndex={index === tabStop ? 0 : -1}
                  type="button"
                >
                  {renderOption ? renderOption(option, { highlighted: isMarked, side }) : (
                    <>
                      <CheckMark />
                      <OptionContent option={option} />
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {list.length === 0 ? <p className="cc-resource-transfer__empty">{empty}</p> : null}
        </div>
      </div>
    );
  };

  return (
    <div
      className="cc-resource-transfer"
      data-cc-presentation={resolvedPresentation}
      aria-busy={pending || undefined}
      data-disabled={disabled || undefined}
      data-pending={pending || undefined}
      id={baseId}
    >
      {renderPane("available")}
      <div aria-label={`Move ${noun}`} className="cc-resource-transfer__actions" role="group">
        <Button
          aria-disabled={disabled || pending || addMarked.length === 0 || undefined}
          aria-label={`Add selected ${noun}`}
          iconOnly
          onClick={() => move("available", addMarked)}
          type="button"
        >
          <ChevronRight />
        </Button>
        <Button
          aria-disabled={disabled || pending || addShown.length === 0 || undefined}
          aria-label={`Add all shown ${noun}`}
          iconOnly
          onClick={() => move("available", addShown)}
          type="button"
        >
          <ChevronsRight />
        </Button>
        <Button
          aria-disabled={disabled || pending || removeMarked.length === 0 || undefined}
          aria-label={`Remove selected ${noun}`}
          iconOnly
          onClick={() => move("selected", removeMarked)}
          type="button"
        >
          <ChevronLeft />
        </Button>
        <Button
          aria-disabled={disabled || pending || removeShown.length === 0 || undefined}
          aria-label={`Remove all shown ${noun}`}
          iconOnly
          onClick={() => move("selected", removeShown)}
          type="button"
        >
          <ChevronsLeft />
        </Button>
      </div>
      {renderPane("selected")}
      {description ? <p className="cc-resource-transfer__description" id={descriptionId}>{description}</p> : null}
      <div aria-live="polite" className="cc-resource-visually-hidden" role="status">{announcement}</div>
    </div>
  );
}
