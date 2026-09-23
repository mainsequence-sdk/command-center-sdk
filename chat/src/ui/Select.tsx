import * as React from "react";

import {
  ResourcePicker,
  type ResourcePickerOption,
} from "@dev-mainsequence/command-center-sdk/views";

import { cx } from "./class-names.js";

/**
 * A select that keeps the native `<select>` contract (`value`, `onChange`, `<option>` children)
 * and draws the SDK's picker. The native element stays in the DOM, hidden, so forms and tests can
 * read it; the picker is what people use.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  actionLabel?: string;
  actionOnSelect?: () => void;
  emptyMessage?: string;
  fitContent?: boolean;
  listboxPlacement?: "bottom" | "top";
  searchable?: boolean;
  searchPlaceholder?: string;
}

type SelectOptionElementProps = React.OptionHTMLAttributes<HTMLOptionElement> & {
  "data-description"?: string;
  "data-meta"?: string;
};

function flattenOptions(children: React.ReactNode): ResourcePickerOption[] {
  const options: ResourcePickerOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    if (child.type === "option") {
      const props = child.props as SelectOptionElementProps;
      const label = typeof props.children === "string"
        ? props.children
        : React.Children.toArray(props.children).join("").trim();
      options.push({
        disabled: props.disabled,
        label,
        meta: typeof props["data-meta"] === "string" ? props["data-meta"] : undefined,
        subtitle: typeof props["data-description"] === "string"
          ? props["data-description"]
          : undefined,
        value: String(props.value ?? ""),
      });
      return;
    }

    if (child.type === "optgroup") {
      options.push(...flattenOptions((child.props as { children?: React.ReactNode }).children));
    }
  });

  return options;
}

function normalizeSingleValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value === undefined || value === null ? "" : String(value);
}

function normalizeMultipleValue(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

function createSelectChangeEvent(
  name: string | undefined,
  value: string,
  selectedValues: readonly string[],
  options: readonly ResourcePickerOption[],
) {
  const selectedOptions = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => ({ label: option.label, value: option.value }));
  const target = { name, selectedOptions, value } as unknown as HTMLSelectElement;
  return { currentTarget: target, target } as React.ChangeEvent<HTMLSelectElement>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      children,
      className,
      defaultValue,
      disabled = false,
      actionLabel,
      actionOnSelect,
      emptyMessage = "No options matched the search.",
      fitContent = false,
      listboxPlacement = "bottom",
      multiple = false,
      name,
      onChange,
      searchable = false,
      searchPlaceholder = "Search options",
      value,
      ...nativeProps
    },
    forwardedRef,
  ) => {
    const options = React.useMemo(() => flattenOptions(children), [children]);
    const controlled = value !== undefined;
    const [uncontrolledSingleValue, setUncontrolledSingleValue] = React.useState(
      () => normalizeSingleValue(defaultValue),
    );
    const [uncontrolledMultipleValue, setUncontrolledMultipleValue] = React.useState(
      () => normalizeMultipleValue(defaultValue),
    );
    const singleValue = controlled ? normalizeSingleValue(value) : uncontrolledSingleValue;
    const multipleValue = controlled ? normalizeMultipleValue(value) : uncontrolledMultipleValue;
    const ariaLabel = typeof nativeProps["aria-label"] === "string"
      ? nativeProps["aria-label"]
      : undefined;
    const ariaLabelledBy = typeof nativeProps["aria-labelledby"] === "string"
      ? nativeProps["aria-labelledby"]
      : undefined;
    const headerAction = actionLabel && actionOnSelect
      ? { label: actionLabel, onSelect: actionOnSelect }
      : undefined;

    const commitSingleValue = (nextValue: string) => {
      if (!controlled) setUncontrolledSingleValue(nextValue);
      onChange?.(createSelectChangeEvent(name, nextValue, [nextValue], options));
    };

    const commitMultipleValue = (nextValue: readonly string[]) => {
      if (!controlled) setUncontrolledMultipleValue([...nextValue]);
      onChange?.(createSelectChangeEvent(name, nextValue[0] ?? "", nextValue, options));
    };

    return (
      <>
        <select
          {...nativeProps}
          ref={forwardedRef}
          className="ms-chat-sr-only"
          aria-hidden="true"
          disabled={disabled}
          multiple={multiple}
          name={name}
          tabIndex={-1}
          value={multiple ? multipleValue : singleValue}
          onChange={onChange}
        >
          {children}
        </select>

        {multiple ? (
          <ResourcePicker
            mode="multiple"
            ariaLabel={ariaLabel}
            ariaLabelledBy={ariaLabelledBy}
            className={cx("ms-chat-select", className)}
            disabled={disabled}
            emptyMessage={emptyMessage}
            fitContent={fitContent}
            fullWidth={!fitContent}
            headerAction={headerAction}
            options={options}
            placement={listboxPlacement}
            searchable={searchable}
            searchPlaceholder={searchPlaceholder}
            value={multipleValue}
            onValueChange={commitMultipleValue}
          />
        ) : (
          <ResourcePicker
            mode="single"
            ariaLabel={ariaLabel}
            ariaLabelledBy={ariaLabelledBy}
            className={cx("ms-chat-select", className)}
            disabled={disabled}
            emptyMessage={emptyMessage}
            fitContent={fitContent}
            fullWidth={!fitContent}
            headerAction={headerAction}
            options={options}
            placement={listboxPlacement}
            placeholder={singleValue || options[0]?.label || "Select an option"}
            searchable={searchable}
            searchPlaceholder={searchPlaceholder}
            value={singleValue}
            onValueChange={commitSingleValue}
          />
        )}
      </>
    );
  },
);

Select.displayName = "Select";
