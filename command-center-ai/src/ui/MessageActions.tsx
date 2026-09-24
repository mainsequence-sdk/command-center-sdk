import { createContext, useContext, type ReactNode } from "react";

import { ActionBarPrimitive } from "@assistant-ui/react";
import { useAui, useAuiState } from "@assistant-ui/store";
import { Check, Copy, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";

import { cx } from "./class-names.js";

/**
 * The per-message actions of a classical chat, cut to what this transcript can
 * honestly do.
 *
 * The backend owns the canonical history and the send path carries only the
 * newest user message (`useLatestMessageDataStreamRuntime`), so nothing here
 * rewrites or regenerates a message in place: a local branch would be a
 * browser-only fiction that the next history load erases and no other viewer
 * of the session ever sees. Both resend actions therefore write a NEW turn and
 * say so in their labels. Copy is pure clipboard and needs nothing.
 */
export interface MessageActionsValue {
  /** The composer will accept a draft (it may still be locked for sending). */
  canEdit: boolean;
  /** A resend will actually go out now, or join the queue while the agent works. */
  canResend: boolean;
  /** Replace the composer draft with this text and focus it. */
  loadIntoComposer: (text: string) => void;
  /** Send this text as a new turn, or queue it while the agent works. */
  resend: (text: string) => void;
}

const MessageActionsContext = createContext<MessageActionsValue | null>(null);

export function MessageActionsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MessageActionsValue;
}) {
  return (
    <MessageActionsContext.Provider value={value}>{children}</MessageActionsContext.Provider>
  );
}

/** Null outside a provider: copy still works, the resend actions stay out. */
function useMessageActions() {
  return useContext(MessageActionsContext);
}

const ACTION_BUTTON_CLASS = "ms-chat-action-button";

/**
 * The row stays mounted and is revealed by hover or by keyboard focus, so the
 * actions are reachable without a pointer. Unmounting them on hover-out (what
 * `ActionBarPrimitive.Root` autohide does) would take them out of the tab order.
 */
function MessageActionRow({
  align,
  children,
}: {
  align: "start" | "end";
  children: ReactNode;
}) {
  return (
    <div
      className={cx("ms-chat-actions", align === "end" ? "ms-chat-actions--end" : "ms-chat-actions--start")}
      data-message-actions
    >
      {children}
    </div>
  );
}

function CopyMessageButton({ label }: { label: string }) {
  const isCopied = useAuiState((s) => s.message.isCopied);

  return (
    <ActionBarPrimitive.Copy
      aria-label={label}
      className={ACTION_BUTTON_CLASS}
      data-message-action="copy"
      title={label}
    >
      {isCopied ? (
        <Check className="ms-chat-icon-sm ms-chat-icon-success" aria-hidden="true" />
      ) : (
        <Copy className="ms-chat-icon-sm" aria-hidden="true" />
      )}
    </ActionBarPrimitive.Copy>
  );
}

/** True when the message carries text worth copying or sending again. */
function useHasMessageText() {
  return useAuiState((s) =>
    s.message.parts.some(
      (part: { type: string; text?: string }) =>
        part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0,
    ),
  );
}

export function UserMessageActions() {
  const aui = useAui();
  const actions = useMessageActions();
  const hasText = useHasMessageText();

  if (!hasText) {
    return null;
  }

  const messageText = () => aui.message().getCopyText();

  return (
    <MessageActionRow align="end">
      <CopyMessageButton label="Copy message" />
      {actions ? (
        <>
          <Button
            aria-label="Edit and send again"
            data-message-action="edit-resend"
            disabled={!actions.canEdit}
            iconOnly
            onClick={() => actions.loadIntoComposer(messageText())}
            size="small"
            title="Edit and send again — this message stays; your edit goes out as a new one"
            variant="ghost"
          >
            <Pencil className="ms-chat-icon-sm" aria-hidden="true" />
          </Button>
          <Button
            aria-label="Send again"
            data-message-action="resend"
            disabled={!actions.canResend}
            iconOnly
            onClick={() => actions.resend(messageText())}
            size="small"
            title="Send again — this message stays; it goes out again as a new one"
            variant="ghost"
          >
            <RotateCcw className="ms-chat-icon-sm" aria-hidden="true" />
          </Button>
        </>
      ) : null}
    </MessageActionRow>
  );
}

export function AssistantMessageActions() {
  const hasText = useHasMessageText();

  if (!hasText) {
    return null;
  }

  // Copy only. Regenerating this answer in place needs a platform capability
  // this transcript does not have; the retry below the error is the honest
  // client-side version — it sends the prompt again as a new turn.
  return (
    <MessageActionRow align="start">
      <CopyMessageButton label="Copy answer" />
    </MessageActionRow>
  );
}

/**
 * A failed turn used to be a dead end: the error rendered with no action at
 * all. This sends the prompt that produced it again, as a new message.
 */
export function AssistantErrorRetry() {
  const actions = useMessageActions();
  const previousUserText = useAuiState((s) => {
    for (let index = s.message.index - 1; index >= 0; index -= 1) {
      const candidate = s.thread.messages[index];

      if (!candidate) {
        continue;
      }

      if (candidate.role === "user") {
        return candidate.content
          .filter(
            (part): part is { type: "text"; text: string } =>
              part.type === "text" && typeof (part as { text?: unknown }).text === "string",
          )
          .map((part) => part.text)
          .join("\n\n")
          .trim();
      }
    }

    return "";
  });

  if (!actions || !previousUserText) {
    return null;
  }

  return (
    <Button
      className="ms-chat-message__retry"
      data-message-action="retry"
      disabled={!actions.canResend}
      onClick={() => actions.resend(previousUserText)}
      size="small"
      title="Send the message that failed again, as a new message"
      variant="danger"
    >
      <RotateCcw className="ms-chat-icon-sm" aria-hidden="true" />
      Send again
    </Button>
  );
}
