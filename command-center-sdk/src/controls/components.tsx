import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { ActivityIndicator } from "../feedback/components.js";

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function joinIds(...values: Array<string | undefined>) {
  const ids = values.filter((value): value is string => Boolean(value));
  return ids.length ? ids.join(" ") : undefined;
}

function isPresent(value: ReactNode): boolean {
  return value !== undefined && value !== null && value !== false;
}

export type ButtonVariant = "outline" | "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** A square control that holds only an icon. Give it an accessible name through `aria-label`. */
  iconOnly?: boolean;
  /** The action is in flight: the button stays focusable, reports busy, and ignores clicks. */
  pending?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

/** The public action control. Variant, size, touch sizing, focus, hover, and pending state are SDK-owned. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    "aria-disabled": ariaDisabled,
    children,
    className,
    iconOnly = false,
    onClick,
    pending = false,
    size = "medium",
    type = "button",
    variant = "outline",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      aria-busy={pending || undefined}
      aria-disabled={pending ? true : ariaDisabled}
      className={joinClassNames(
        "cc-control",
        "cc-button",
        `cc-button--${variant}`,
        `cc-button--${size}`,
        iconOnly && "cc-button--icon-only",
        className,
      )}
      data-cc-button=""
      data-pending={pending ? "" : undefined}
      data-size={size}
      data-variant={variant}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      ref={ref}
      type={type}
    >
      {pending ? <ActivityIndicator className="cc-button__indicator" size="small" /> : null}
      {children}
    </button>
  );
});

export type BadgeVariant = "neutral" | "primary" | "secondary" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** A static status or category marker. It is not interactive and never carries `cc-control`. */
export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={joinClassNames("cc-badge", `cc-badge--${variant}`, className)}
      data-cc-badge=""
      data-variant={variant}
    />
  );
}

interface FieldControlContextValue {
  controlId: string;
  describedBy?: string;
  disabled: boolean;
  invalid: boolean;
  required: boolean;
}

const FieldControlContext = createContext<FieldControlContextValue | null>(null);

export interface FieldControlProps {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  disabled?: boolean;
  id?: string;
}

export interface UseFieldControlPropsInput {
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
}

/**
 * Resolve the attributes a control needs to belong to the nearest `Field`: the label target `id`,
 * `aria-describedby` for the description and error, `aria-invalid`, `aria-required`, and
 * `disabled`. Explicit values win. Outside a `Field` only the explicit values are returned, so a
 * custom control can call this unconditionally.
 */
export function useFieldControlProps({
  describedBy,
  disabled,
  id,
  invalid,
}: UseFieldControlPropsInput = {}): FieldControlProps {
  const field = useContext(FieldControlContext);
  const resolved: FieldControlProps = {};
  const resolvedId = id ?? field?.controlId;
  const resolvedDescribedBy = joinIds(field?.describedBy, describedBy);
  const resolvedDisabled = disabled ?? field?.disabled;
  if (resolvedId !== undefined) resolved.id = resolvedId;
  if (resolvedDescribedBy !== undefined) resolved["aria-describedby"] = resolvedDescribedBy;
  if (invalid ?? field?.invalid) resolved["aria-invalid"] = true;
  if (field?.required) resolved["aria-required"] = true;
  if (resolvedDisabled) resolved.disabled = true;
  return resolved;
}

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  /** Rendered after the label text when the field is required. `null` or `false` hides it. */
  requiredIndicator?: ReactNode;
}

/** A label for one control. Inside a `Field` it targets the field's control automatically. */
export function Label({
  children,
  className,
  htmlFor,
  required,
  requiredIndicator = "*",
  ...props
}: LabelProps) {
  const field = useContext(FieldControlContext);
  const isRequired = required ?? field?.required ?? false;
  return (
    <label
      {...props}
      className={joinClassNames("cc-label", className)}
      data-cc-label=""
      htmlFor={htmlFor ?? field?.controlId}
    >
      {children}
      {isRequired && isPresent(requiredIndicator) ? (
        <span aria-hidden="true" className="cc-label__required">
          {requiredIndicator}
        </span>
      ) : null}
    </label>
  );
}

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  /** The control's `id`. Generated when omitted. */
  controlId?: string;
  description?: ReactNode;
  disabled?: boolean;
  /** The current validation message. The consumer decides when a value is invalid. */
  error?: ReactNode;
  label: ReactNode;
  required?: boolean;
  requiredIndicator?: ReactNode;
}

/**
 * One labelled control with an optional description and error. The SDK owns the label target,
 * `aria-describedby`, `aria-invalid`, `aria-required`, disabled propagation, and spacing. The
 * consumer owns the value, validation rules, submission, and when an error is shown.
 */
export function Field({
  children,
  className,
  controlId,
  description,
  disabled = false,
  error,
  label,
  required = false,
  requiredIndicator,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  const hasDescription = isPresent(description);
  const hasError = isPresent(error);
  const descriptionId = hasDescription ? `${id}-description` : undefined;
  const errorId = hasError ? `${id}-error` : undefined;
  const context = useMemo<FieldControlContextValue>(
    () => ({
      controlId: id,
      describedBy: joinIds(errorId, descriptionId),
      disabled,
      invalid: hasError,
      required,
    }),
    [descriptionId, disabled, errorId, hasError, id, required],
  );

  return (
    <FieldControlContext.Provider value={context}>
      <div
        {...props}
        className={joinClassNames("cc-field", className)}
        data-cc-field=""
        data-disabled={disabled ? "" : undefined}
        data-invalid={hasError ? "" : undefined}
        data-required={required ? "" : undefined}
      >
        <Label
          className="cc-field__label"
          htmlFor={id}
          required={required}
          requiredIndicator={requiredIndicator}
        >
          {label}
        </Label>
        <div className="cc-field__control">{children}</div>
        {hasError ? (
          <p className="cc-field__error" id={errorId}>
            {error}
          </p>
        ) : null}
        {hasDescription ? (
          <p className="cc-field__description" id={descriptionId}>
            {description}
          </p>
        ) : null}
      </div>
    </FieldControlContext.Provider>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Mark the value invalid outside a `Field`, or ahead of the field's own error. */
  invalid?: boolean;
}

/** The public single-line text control. Inside a `Field` it receives the field's wiring. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { "aria-describedby": describedBy, className, disabled, id, invalid, type = "text", ...props },
  ref,
) {
  const control = useFieldControlProps({ describedBy, disabled, id, invalid });
  return (
    <input
      {...props}
      {...control}
      className={joinClassNames("cc-control", "cc-input", className)}
      data-cc-input=""
      ref={ref}
      type={type}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** The public multi-line text control. Inside a `Field` it receives the field's wiring. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { "aria-describedby": describedBy, className, disabled, id, invalid, ...props },
  ref,
) {
  const control = useFieldControlProps({ describedBy, disabled, id, invalid });
  return (
    <textarea
      {...props}
      {...control}
      className={joinClassNames("cc-control", "cc-textarea", className)}
      data-cc-textarea=""
      ref={ref}
    />
  );
});
