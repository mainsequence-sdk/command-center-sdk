import { forwardRef, useEffect, useRef } from "react";

export interface ResourceSelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  label?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onChange: () => void;
}

export const ResourceSelectionCheckbox = forwardRef<HTMLInputElement, ResourceSelectionCheckboxProps>(function ResourceSelectionCheckbox({
  ariaLabel,
  checked,
  className,
  disabled = false,
  indeterminate = false,
  label,
  onChange,
}, forwardedRef) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={(element) => {
        inputRef.current = element;
        if (typeof forwardedRef === "function") {
          forwardedRef(element);
        } else if (forwardedRef) {
          forwardedRef.current = element;
        }
      }}
      aria-label={label ?? ariaLabel ?? "Select row"}
      checked={checked}
      className={["cc-resource-selection-checkbox", className].filter(Boolean).join(" ")}
      disabled={disabled}
      type="checkbox"
      onChange={onChange}
    />
  );
});
