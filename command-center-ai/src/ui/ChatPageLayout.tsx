import { useMemo, useState, type ReactNode } from "react";

import {
  Eye,
  Loader2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import { ApplicationCard } from "@dev-mainsequence/command-center-sdk/layout";

import { useChatEngine, useChatRunStatus, type ChatRunStatus } from "../engine/ChatEngineProvider.js";
import { AgentSessionExplorer, type AgentSessionExplorerProps } from "./AgentSessionExplorer.js";
import { cx } from "./class-names.js";

// The SDK's `lg` breakpoint: from here the explorer is a column; below it, an overlay.
const EXPLORER_COLUMN_MEDIA_QUERY = "(min-width: 1024px)";

export interface ChatPageLayoutProps {
  /** The conversation, usually `<ChatThread surface="page" />`. */
  children: ReactNode;
  /** The session explorer at the left; omit it for a page without one. */
  explorer?: Omit<AgentSessionExplorerProps, "headerActions"> | null;
  /** Shows the Minimize button, which returns to the rail. */
  onMinimize?: () => void;
  /** Called after New session starts a session, for example to drop `?session=` from the URL. */
  onCreateSession?: () => void;
  /** Shows the button and card with the view context the engine sends. Default true. */
  showContext?: boolean;
  /** Shown in place of the whole page, for example while the default session cannot open. */
  blockingState?: ReactNode;
  className?: string;
}

function getRunStatusLabel(status: ChatRunStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "thinking":
      return "Thinking";
    case "responding":
      return "Responding";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function getRunStatusTone(status: ChatRunStatus) {
  switch (status) {
    case "thinking":
    case "responding":
      return "primary";
    case "complete":
      return "success";
    case "error":
      return "danger";
    case "queued":
      return "warning";
    default:
      return "neutral";
  }
}

/**
 * Command Center's expanded rail: the session explorer at the left (a column from the SDK's `lg`
 * breakpoint, an overlay with a scrim below it), a header with the Agent, the session, and the run
 * status, and the conversation in a centred column. It fills its parent's height; give the parent
 * the height below the application's top bar.
 */
export function ChatPageLayout({
  blockingState,
  children,
  className,
  explorer = null,
  onCreateSession,
  onMinimize,
  showContext = true,
}: ChatPageLayoutProps) {
  const {
    activeSessionSummary,
    agentSessions,
    createAgentSession,
    currentSessionId,
    hasActiveChatStream,
    isActiveSessionLoading,
    isCreatingAgentSession,
    viewContext,
  } = useChatEngine();
  const { runStatus } = useChatRunStatus();
  const [contextOpen, setContextOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? true
      : window.matchMedia(EXPLORER_COLUMN_MEDIA_QUERY).matches,
  );
  const busy = hasActiveChatStream || isActiveSessionLoading || isCreatingAgentSession;
  const displayedRunStatus: ChatRunStatus =
    activeSessionSummary?.working && (runStatus === "idle" || runStatus === "complete")
      ? "thinking"
      : runStatus;
  const runStatusLabel = activeSessionSummary?.working
    ? "Working"
    : getRunStatusLabel(displayedRunStatus);
  const activeSession = useMemo(
    () => agentSessions.find((session) => session.id === currentSessionId) ?? null,
    [agentSessions, currentSessionId],
  );
  const activeAgentName = activeSession?.agent?.name?.trim() || "No agent selected";
  const activeSessionTitle =
    activeSession?.title?.trim() || activeSession?.preview?.trim() || "Choose a session to begin";
  const hasExplorer = Boolean(explorer);

  if (blockingState) {
    return <div className={cx("ms-chat-page", className)}>{blockingState}</div>;
  }

  const headerActions = (
    <>
      <Button
        variant="ghost"
        iconOnly
        className="ms-chat-page__action"
        aria-label="New session"
        title="New session"
        disabled={busy}
        onClick={() => {
          createAgentSession();
          onCreateSession?.();
        }}
      >
        <Plus className="ms-chat-icon-md" />
      </Button>
      {showContext ? (
        <Button
          variant="ghost"
          iconOnly
          className={cx("ms-chat-page__action", contextOpen && "ms-chat-page__action--active")}
          aria-expanded={contextOpen}
          aria-label={contextOpen ? "Hide context" : "Show context"}
          title={contextOpen ? "Hide context" : "Show context"}
          onClick={() => {
            setContextOpen((current) => !current);
          }}
        >
          <Eye className="ms-chat-icon-md" />
        </Button>
      ) : null}
      {hasExplorer ? (
        <Button
          variant="ghost"
          iconOnly
          className="ms-chat-page__action"
          aria-label="Collapse Agents"
          title="Collapse Agents"
          onClick={() => {
            setExplorerOpen(false);
          }}
        >
          <PanelLeftClose className="ms-chat-icon-md" />
        </Button>
      ) : null}
      {onMinimize ? (
        <Button
          variant="ghost"
          iconOnly
          className="ms-chat-page__action"
          aria-label="Minimize to rail"
          title="Minimize to rail"
          onClick={onMinimize}
        >
          <Minimize2 className="ms-chat-icon-md" />
        </Button>
      ) : null}
    </>
  );

  return (
    <div className={cx("ms-chat-page", className)} data-chat-page>
      {explorer && explorerOpen ? (
        <>
          <button
            type="button"
            className="ms-chat-page__scrim"
            aria-label="Close Agents"
            onClick={() => {
              setExplorerOpen(false);
            }}
          />
          <aside className="ms-chat-page__explorer" aria-label="Agents">
            <AgentSessionExplorer {...explorer} headerActions={headerActions} />
          </aside>
        </>
      ) : null}

      <section className="ms-chat-page__main">
        <div className="ms-chat-page__header">
          <div className="ms-chat-page__header-inner">
            {hasExplorer && !explorerOpen ? (
              <Button
                variant="ghost"
                iconOnly
                className="ms-chat-page__action"
                aria-label="Open Agents"
                title="Open Agents"
                onClick={() => {
                  setExplorerOpen(true);
                }}
              >
                <PanelLeftOpen className="ms-chat-icon-md" />
              </Button>
            ) : null}
            {!hasExplorer ? <div className="ms-chat-page__inline-actions">{headerActions}</div> : null}
            <div className="ms-chat-page__heading">
              <div className="ms-chat-page__agent">{activeAgentName}</div>
              <div className="ms-chat-page__session">{activeSessionTitle}</div>
            </div>
            <div
              className={cx(
                "ms-chat-page__status",
                `ms-chat-page__status--${getRunStatusTone(displayedRunStatus)}`,
              )}
              title={runStatusLabel}
              aria-label={runStatusLabel}
              data-run-status={displayedRunStatus}
            >
              {busy ? (
                <Loader2 className="ms-chat-icon-sm ms-chat-spin" />
              ) : (
                <Sparkles className="ms-chat-icon-sm" />
              )}
              {runStatusLabel}
            </div>
          </div>
        </div>

        <div className="ms-chat-page__thread">{children}</div>

        {showContext && contextOpen ? (
          <div className="ms-chat-page__context">
            <ApplicationCard
              className="ms-chat-page__context-card"
              header={
                <div className="ms-chat-page__context-header">
                  <div className="ms-chat-page__context-heading">
                    <h3>Visible Context</h3>
                    <p>Raw context payload currently sent with chat requests.</p>
                  </div>
                  <Button
                    variant="ghost"
                    iconOnly
                    className="ms-chat-page__action"
                    onClick={() => {
                      setContextOpen(false);
                    }}
                    aria-label="Close context"
                  >
                    <X className="ms-chat-icon-md" />
                  </Button>
                </div>
              }
            >
              <pre className="ms-chat-page__context-payload">
                <code>{JSON.stringify(viewContext ?? null, null, 2)}</code>
              </pre>
            </ApplicationCard>
          </div>
        ) : null}
      </section>
    </div>
  );
}
