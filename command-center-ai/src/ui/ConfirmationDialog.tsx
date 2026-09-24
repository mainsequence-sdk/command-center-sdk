import { useEffect, useState, type ReactNode } from "react";

import { AlertTriangle, Loader2, ShieldAlert, Siren } from "lucide-react";
import { Button, Input } from "@dev-mainsequence/command-center-sdk/controls";

import { cx } from "./class-names.js";
import { Dialog } from "./Dialog.js";

export type ConfirmationDialogTone = "primary" | "warning" | "danger";

const confirmButtonVariant: Record<ConfirmationDialogTone, "primary" | "danger"> = {
  primary: "primary",
  warning: "primary",
  danger: "danger",
};

function ToneIcon({ tone }: { tone: ConfirmationDialogTone }) {
  if (tone === "danger") {
    return <Siren className="ms-chat-icon-md" />;
  }

  if (tone === "warning") {
    return <AlertTriangle className="ms-chat-icon-md" />;
  }

  return <ShieldAlert className="ms-chat-icon-md" />;
}

export interface ConfirmationDialogProps {
  /** The verb the person confirms, quoted in the question. */
  actionLabel: string;
  confirmButtonLabel: string;
  confirmDisabled?: boolean;
  /** The word the person types to enable the confirm button. */
  confirmWord: string;
  description?: ReactNode;
  /** An error to show; the dialog also shows the message of a rejected `onConfirm`. */
  error?: ReactNode;
  isPending?: boolean;
  objectLabel: string;
  objectSummary?: ReactNode;
  onClose: () => void;
  /** Runs the action; the dialog waits for it and shows its error when it rejects. */
  onConfirm: () => Promise<unknown> | unknown;
  open: boolean;
  specialText?: ReactNode;
  title: string;
  tone?: ConfirmationDialogTone;
}

/**
 * Confirms a destructive or consequential action: the person types a confirmation word before
 * the confirm button works. The dialog waits for `onConfirm` and keeps itself open with the error
 * when it rejects; the caller closes it on success.
 */
export function ConfirmationDialog({
  actionLabel,
  confirmButtonLabel,
  confirmDisabled = false,
  confirmWord,
  description,
  error,
  isPending = false,
  objectLabel,
  objectSummary,
  onClose,
  onConfirm,
  open,
  specialText,
  title,
  tone = "danger",
}: ConfirmationDialogProps) {
  const [confirmationValue, setConfirmationValue] = useState("");
  const [internalError, setInternalError] = useState<ReactNode | undefined>();
  const [internalPending, setInternalPending] = useState(false);
  const canConfirm = confirmationValue.trim() === confirmWord;
  const resolvedError = error ?? internalError;
  const resolvedPending = isPending || internalPending;

  useEffect(() => {
    setConfirmationValue("");
    setInternalError(undefined);
    setInternalPending(false);
  }, [confirmWord, open]);

  async function handleConfirm() {
    if (resolvedPending || confirmDisabled || !canConfirm) {
      return;
    }

    setInternalError(undefined);
    setInternalPending(true);

    try {
      await onConfirm();
    } catch (caughtError) {
      setInternalError(
        caughtError instanceof Error
          ? caughtError.message
          : typeof caughtError === "string"
            ? caughtError
            : "Action failed.",
      );
    } finally {
      setInternalPending(false);
    }
  }

  return (
    <Dialog
      title={title}
      open={open}
      onClose={onClose}
      className="ms-chat-confirm"
      headerClassName={`ms-chat-confirm__header--${tone}`}
    >
      <div className="ms-chat-confirm__body">
        <div className="ms-chat-confirm__intro">
          <p className="ms-chat-confirm__question">
            Are you sure you want to <span className="ms-chat-confirm__action">"{actionLabel}"</span>{" "}
            the following {objectLabel}? Confirm by typing{" "}
            <span className="ms-chat-confirm__word">{confirmWord}</span>.
          </p>
          {description ? <div className="ms-chat-confirm__description">{description}</div> : null}
        </div>

        {specialText ? (
          <div className={cx("ms-chat-confirm__note", `ms-chat-confirm__note--${tone}`)}>
            {specialText}
          </div>
        ) : null}

        {objectSummary ? <div className="ms-chat-confirm__summary">{objectSummary}</div> : null}

        <div className="ms-chat-confirm__field">
          <label htmlFor="ms-chat-confirmation-word" className="ms-chat-label">
            Confirmation word
          </label>
          <Input
            id="ms-chat-confirmation-word"
            value={confirmationValue}
            onChange={(event) => setConfirmationValue(event.target.value)}
            placeholder={confirmWord}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="ms-chat-confirm__hint">
            Type <span className="ms-chat-confirm__hint-word">{confirmWord}</span> exactly to continue.
          </div>
        </div>

        {resolvedError ? <div className="ms-chat-confirm__error">{resolvedError}</div> : null}

        <div className="ms-chat-confirm__actions">
          <Button variant="outline" onClick={onClose} disabled={resolvedPending}>
            Cancel
          </Button>
          <Button
            variant={confirmButtonVariant[tone]}
            disabled={resolvedPending || confirmDisabled || !canConfirm}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {resolvedPending ? <Loader2 className="ms-chat-icon-md ms-chat-spin" /> : <ToneIcon tone={tone} />}
            {confirmButtonLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
