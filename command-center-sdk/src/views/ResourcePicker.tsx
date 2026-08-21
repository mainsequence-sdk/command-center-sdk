import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface ResourcePickerOption {
  value: string;
  label: string;
  subtitle?: string;
  meta?: string;
  keywords?: readonly string[];
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "primary" | "warning" | "danger";
}

export interface ResourcePickerHeaderAction {
  label: string;
  onSelect: () => void;
}

export interface ResourcePickerRenderOptionState {
  active: boolean;
  mode: "single" | "multiple" | "action";
  selected: boolean;
}

interface ResourcePickerBaseProps {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  disabled?: boolean;
  emptyMessage?: string;
  fitContent?: boolean;
  fullWidth?: boolean;
  headerAction?: ResourcePickerHeaderAction;
  id?: string;
  loading?: boolean;
  loadingMessage?: string;
  onOpenChange?: (open: boolean) => void;
  onSearchValueChange?: (value: string) => void;
  options: readonly ResourcePickerOption[];
  placeholder?: string;
  placement?: "bottom" | "top";
  renderOption?: (
    option: ResourcePickerOption,
    state: ResourcePickerRenderOptionState,
  ) => ReactNode;
  renderValue?: (selectedOptions: readonly ResourcePickerOption[]) => ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
}

export interface ResourceSinglePickerProps extends ResourcePickerBaseProps {
  mode?: "single";
  value: string | null;
  onValueChange: (value: string) => void;
}

export interface ResourceMultiPickerProps extends ResourcePickerBaseProps {
  mode: "multiple";
  value: readonly string[];
  onValueChange: (value: readonly string[]) => void;
}

export interface ResourceActionPickerProps extends ResourcePickerBaseProps {
  mode: "action";
  triggerLabel: ReactNode;
  onAction: (value: string) => void;
}

export type ResourcePickerProps =
  | ResourceSinglePickerProps
  | ResourceMultiPickerProps
  | ResourceActionPickerProps;

function isActionPicker(props: ResourcePickerProps): props is ResourceActionPickerProps {
  return props.mode === "action";
}

function isMultiPicker(props: ResourcePickerProps): props is ResourceMultiPickerProps {
  return props.mode === "multiple";
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function findEnabledIndex(
  options: readonly ResourcePickerOption[],
  direction: "first" | "last",
) {
  if (direction === "last") {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index]?.disabled) return index;
    }
    return -1;
  }

  return options.findIndex((option) => !option.disabled);
}

function getSearchText(option: ResourcePickerOption) {
  return [
    option.label,
    option.subtitle ?? "",
    option.meta ?? "",
    ...(option.keywords ?? []),
  ].join(" ").toLocaleLowerCase();
}

export function ResourcePicker(props: ResourcePickerProps) {
  const {
    ariaLabel,
    ariaLabelledBy,
    className,
    disabled = false,
    emptyMessage = "No options match your search.",
    fitContent = false,
    fullWidth = false,
    headerAction,
    id,
    loading = false,
    loadingMessage = "Loading options…",
    onOpenChange,
    onSearchValueChange,
    options,
    placement = "bottom",
    placeholder = "Select an option",
    renderOption,
    renderValue,
    searchable = false,
    searchPlaceholder = "Search options",
    searchValue,
  } = props;
  const mode = props.mode ?? "single";
  const generatedId = useId();
  const triggerId = id ?? `cc-resource-picker-trigger-${generatedId}`;
  const listId = `cc-resource-picker-list-${generatedId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [internalSearchValue, setInternalSearchValue] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const query = searchValue ?? internalSearchValue;

  const selectedValues = useMemo(() => {
    if (isActionPicker(props)) return new Set<string>();
    if (isMultiPicker(props)) return new Set(props.value);
    return new Set(props.value === null ? [] : [props.value]);
  }, [props]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedValues.has(option.value)),
    [options, selectedValues],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = useMemo(
    () => normalizedQuery
      ? options.filter((option) => getSearchText(option).includes(normalizedQuery))
      : options,
    [normalizedQuery, options],
  );

  const updateSearchValue = (value: string) => {
    if (searchValue === undefined) setInternalSearchValue(value);
    onSearchValueChange?.(value);
  };

  const updatePopupPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportPadding = 8;
    const measuredPopupWidth = popupRef.current?.getBoundingClientRect().width ?? 0;
    const desiredWidth = fitContent
      ? Math.max(triggerRect.width, measuredPopupWidth, 224)
      : triggerRect.width;
    const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);
    const resolvedWidth = Math.min(desiredWidth, availableWidth);
    const resolvedLeft = Math.max(
      viewportPadding,
      Math.min(triggerRect.left, viewportWidth - resolvedWidth - viewportPadding),
    );
    const nextStyle: CSSProperties = {
      left: resolvedLeft,
      maxWidth: availableWidth,
      minWidth: Math.min(
        fitContent ? Math.max(triggerRect.width, 224) : triggerRect.width,
        availableWidth,
      ),
      position: "fixed",
      visibility: "visible",
      width: fitContent ? "max-content" : resolvedWidth,
    };

    if (placement === "top") {
      nextStyle.bottom = Math.max(viewportPadding, window.innerHeight - triggerRect.top + 6);
      nextStyle.top = "auto";
    } else {
      nextStyle.bottom = "auto";
      nextStyle.top = Math.min(window.innerHeight - viewportPadding, triggerRect.bottom + 6);
    }

    setPopupStyle(nextStyle);
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    updateSearchValue("");
    setActiveIndex(-1);
    onOpenChange?.(false);
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
  };

  const openPicker = (direction: "first" | "last" = "first") => {
    if (disabled) return;
    setPopupStyle({ visibility: "hidden" });
    setOpen(true);
    setActiveIndex(findEnabledIndex(options, direction));
    onOpenChange?.(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popupRef.current?.contains(target)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    updatePopupPosition();
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updatePopupPosition);
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    if (popupRef.current) resizeObserver?.observe(popupRef.current);
    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
      resizeObserver?.disconnect();
    };
  }, [fitContent, open, placement]);

  useEffect(() => {
    if (!open) return;
    if (searchable) {
      searchRef.current?.focus();
      return;
    }
    optionRefs.current[activeIndex]?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (disabled && open) close();
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(findEnabledIndex(visibleOptions, "first"));
  }, [normalizedQuery]);

  const selectOption = (option: ResourcePickerOption) => {
    if (option.disabled || loading) return;

    if (isActionPicker(props)) {
      props.onAction(option.value);
      close();
      return;
    }

    if (isMultiPicker(props)) {
      const next = selectedValues.has(option.value)
        ? props.value.filter((value) => value !== option.value)
        : [...props.value, option.value];
      props.onValueChange(next);
      return;
    }

    props.onValueChange(option.value);
    close();
  };

  const moveActiveOption = (direction: 1 | -1) => {
    if (visibleOptions.length === 0) return;
    let nextIndex = activeIndex;
    for (let attempts = 0; attempts < visibleOptions.length; attempts += 1) {
      nextIndex = (nextIndex + direction + visibleOptions.length) % visibleOptions.length;
      if (!visibleOptions[nextIndex]?.disabled) {
        setActiveIndex(nextIndex);
        optionRefs.current[nextIndex]?.focus();
        return;
      }
    }
  };

  const handlePopupKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = findEnabledIndex(
        visibleOptions,
        event.key === "Home" ? "first" : "last",
      );
      setActiveIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
      return;
    }
    if (event.key === "Enter" && event.target === searchRef.current) {
      const activeOption = visibleOptions[activeIndex];
      if (activeOption) {
        event.preventDefault();
        selectOption(activeOption);
      }
    }
  };

  let triggerContent: ReactNode = placeholder;
  if (isActionPicker(props)) {
    triggerContent = props.triggerLabel;
  } else if (renderValue) {
    triggerContent = renderValue(selectedOptions);
  } else if (isMultiPicker(props) && selectedOptions.length > 1) {
    triggerContent = `${selectedOptions.length} selected`;
  } else if (selectedOptions[0]) {
    triggerContent = selectedOptions[0].label;
  }

  const popup = open ? (
    <div
      ref={popupRef}
      className={joinClassNames(
        "cc-resource-picker__popup",
        placement === "top" && "cc-resource-picker__popup--top",
      )}
      data-fit-content={fitContent || undefined}
      data-resource-picker-popup={mode}
      style={popupStyle}
      onKeyDown={handlePopupKeyDown}
    >
      {headerAction ? (
        <>
          <button
            type="button"
            className="cc-resource-picker__header-action"
            onClick={() => {
              headerAction.onSelect();
              close();
            }}
          >
            {headerAction.label}
          </button>
          <div className="cc-resource-picker__divider" />
        </>
      ) : null}

      {searchable ? (
        <label className="cc-resource-picker__search">
          <span className="cc-resource-visually-hidden">{searchPlaceholder}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <circle cx="8.5" cy="8.5" r="5.25" />
            <path d="m12.5 12.5 4 4" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => updateSearchValue(event.currentTarget.value)}
          />
        </label>
      ) : null}

      <div
        id={listId}
        role={mode === "action" ? "menu" : "listbox"}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : ariaLabelledBy ?? triggerId}
        aria-multiselectable={mode === "multiple" ? true : undefined}
        className="cc-resource-picker__options"
      >
        {loading ? (
          <div className="cc-resource-picker__empty" role="status">{loadingMessage}</div>
        ) : visibleOptions.length === 0 ? (
          <div className="cc-resource-picker__empty">{emptyMessage}</div>
        ) : null}
        {!loading ? visibleOptions.map((option, index) => {
          const Icon = option.icon;
          const selected = selectedValues.has(option.value);
          const active = index === activeIndex;
          return (
            <button
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role={mode === "action" ? "menuitem" : "option"}
              aria-selected={mode === "action" ? undefined : selected}
              className={joinClassNames(
                "cc-resource-picker__option",
                selected && "cc-resource-picker__option--selected",
                `cc-resource-picker__option--${option.tone ?? "default"}`,
              )}
              disabled={option.disabled}
              tabIndex={active ? 0 : -1}
              onClick={() => selectOption(option)}
              onFocus={() => setActiveIndex(index)}
            >
              {renderOption ? renderOption(option, { active, mode, selected }) : (
                <>
                  {mode !== "action" ? (
                    <span className="cc-resource-picker__check" aria-hidden="true">
                      {selected ? (
                        <svg viewBox="0 0 20 20">
                          <path d="m4.5 10.5 3.25 3.25 7.75-8" />
                        </svg>
                      ) : null}
                    </span>
                  ) : null}
                  {Icon ? (
                    <span className="cc-resource-picker__icon" aria-hidden="true">
                      <Icon />
                    </span>
                  ) : null}
                  <span className="cc-resource-picker__option-copy">
                    <span className="cc-resource-picker__option-label">{option.label}</span>
                    {option.subtitle ? (
                      <span className="cc-resource-picker__option-subtitle">{option.subtitle}</span>
                    ) : null}
                  </span>
                  {option.meta ? (
                    <span className="cc-resource-picker__option-meta">{option.meta}</span>
                  ) : null}
                </>
              )}
            </button>
          );
        }) : null}
      </div>
    </div>
  ) : null;

  return (
    <div
      className={joinClassNames(
        "cc-resource-picker",
        fitContent && "cc-resource-picker--fit-content",
        fullWidth && "cc-resource-picker--full-width",
      )}
      ref={rootRef}
    >
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup={mode === "action" ? "menu" : "listbox"}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={joinClassNames("cc-resource-picker__trigger", className)}
        disabled={disabled}
        onClick={() => (open ? close() : openPicker())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPicker(event.key === "ArrowDown" ? "first" : "last");
          }
        }}
      >
        <span className="cc-resource-picker__value">{triggerContent}</span>
        {loading ? (
          <span className="cc-resource-picker__loading" aria-hidden="true" />
        ) : (
          <svg
            aria-hidden="true"
            className="cc-resource-picker__chevron"
            viewBox="0 0 20 20"
          >
            <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
          </svg>
        )}
      </button>
      {popup && typeof document !== "undefined" ? createPortal(popup, document.body) : null}
    </div>
  );
}
