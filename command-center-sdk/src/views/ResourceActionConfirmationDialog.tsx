import { useId, useRef, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle, ShieldAlert, Siren, X } from "lucide-react";
import { createPortal } from "react-dom";

import { useOverlayBehavior } from "../layout/overlay.js";
import { useCommandCenterViewport } from "../layout/viewport.js";

import type { ResourceActionTone } from "../resource/types.js";
import type { ResourceBulkActionPreflightState } from "../resource/types.js";
import { ResourceBulkActionPreflightPanel } from "./ResourceBulkActionPreflightPanel.js";

/** `dialog` is centered; `sheet` is bottom-anchored with stacked actions. `auto` sheets below `sm`. */
export type ResourceActionConfirmationPresentation = "auto" | "dialog" | "sheet";

export interface ResourceActionConfirmationDialogProps {
  actionLabel: string;
  children?: ReactNode;
  confirmationValue: string;
  confirmationWord?: string;
  confirmButtonLabel: string;
  confirmDisabled?: boolean;
  description?: ReactNode;
  error?: ReactNode;
  open?: boolean;
  pending?: boolean;
  preflight?: ResourceBulkActionPreflightState;
  presentation?: ResourceActionConfirmationPresentation;
  selectionLabel?: ReactNode;
  title: string;
  tone?: ResourceActionTone;
  warning?: ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  onConfirmationValueChange: (value: string) => void;
  onRetryPreflight?: () => void;
}

function ToneIcon({ tone }: { tone: ResourceActionTone }) {
  if (tone === "danger") return <Siren aria-hidden="true" />;
  if (tone === "warning") return <AlertTriangle aria-hidden="true" />;
  return <ShieldAlert aria-hidden="true" />;
}

export function ResourceActionConfirmationDialog({
  actionLabel,
  children,
  confirmationValue,
  confirmationWord,
  confirmButtonLabel,
  confirmDisabled = false,
  description,
  error,
  onClose,
  onConfirm,
  onConfirmationValueChange,
  open = true,
  pending = false,
  preflight,
  presentation = "dialog",
  selectionLabel,
  title,
  tone = "default",
  warning,
  onRetryPreflight,
}: ResourceActionConfirmationDialogProps) {
  const generatedId = useId();
  const titleId = `cc-resource-action-confirmation-title-${generatedId}`;
  const preflightAllowsConfirmation =
    !preflight || preflight.status === "not_required" || preflight.status === "allowed";
  const preflightButtonLabel =
    preflight?.status === "blocked"
      ? "Action blocked"
      : preflight?.status === "loading"
        ? "Checking…"
        : preflight?.status === "error"
          ? "Preflight unavailable"
          : confirmButtonLabel;
  const canConfirm =
    !confirmDisabled &&
    preflightAllowsConfirmation &&
    (!confirmationWord || confirmationValue === confirmationWord);

  const viewport = useCommandCenterViewport();
  const sheet = presentation === "sheet" || (presentation === "auto" && viewport.breakpoint === "xs");
  const containerRef = useRef<HTMLElement>(null);

  useOverlayBehavior({
    containerRef,
    dismissOnOutsidePointer: false,
    onDismiss: () => {
      if (!pending) onClose();
    },
    open,
  });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`cc-resource-dialog-backdrop${sheet ? " cc-resource-dialog-backdrop--sheet" : ""}`}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`cc-resource-dialog cc-resource-dialog--${tone}${sheet ? " cc-resource-dialog--sheet" : ""}`}
        data-cc-presentation={sheet ? "sheet" : "dialog"}
        data-tone={tone}
        ref={containerRef}
        role="dialog"
      >
        <header className="cc-resource-dialog__header">
          <span className="cc-resource-dialog__tone-icon">
            <ToneIcon tone={tone} />
          </span>
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label="Close dialog"
            className="cc-resource-dialog__close"
            disabled={pending}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="cc-resource-dialog__body">
          <div className="cc-resource-dialog__introduction">
            <p>
              Are you sure you want to run <strong>“{actionLabel}”</strong>?
              {confirmationWord && preflightAllowsConfirmation ? (
                <>
                  {" "}Confirm by typing <code>{confirmationWord}</code>.
                </>
              ) : null}
            </p>
            {description ? <div className="cc-resource-dialog__description">{description}</div> : null}
          </div>

          {warning ? (
            <div className="cc-resource-dialog__notice">
              <ToneIcon tone={tone} />
              <div>{warning}</div>
            </div>
          ) : null}

          {selectionLabel ? (
            <div className="cc-resource-dialog__summary">{selectionLabel}</div>
          ) : null}

          {preflight ? (
            <ResourceBulkActionPreflightPanel
              state={preflight}
              onRetry={onRetryPreflight}
            />
          ) : null}

          {children}

          {confirmationWord && preflightAllowsConfirmation ? (
            <label className="cc-resource-dialog__confirmation">
              <span>Confirmation word</span>
              <input
                aria-label="Confirmation word"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                autoFocus
                placeholder={confirmationWord}
                spellCheck={false}
                value={confirmationValue}
                onChange={(event) => onConfirmationValueChange(event.currentTarget.value)}
              />
              <small>
                Type <code>{confirmationWord}</code> exactly to continue.
              </small>
            </label>
          ) : null}

          {error ? <div className="cc-resource-dialog__error">{error}</div> : null}

          <div className="cc-resource-dialog__actions">
            <button type="button" disabled={pending} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={
                tone === "danger"
                  ? "cc-resource-button--danger cc-resource-dialog__confirm"
                  : "cc-resource-button--primary cc-resource-dialog__confirm"
              }
              disabled={pending || !canConfirm}
              onClick={() => {
                if (pending || !canConfirm) return;
                void onConfirm();
              }}
            >
              {pending ? <LoaderCircle aria-hidden="true" className="cc-resource-dialog__spinner" /> : <ToneIcon tone={tone} />}
              {pending ? "Working…" : preflightButtonLabel}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
