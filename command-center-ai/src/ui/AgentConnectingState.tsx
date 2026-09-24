import { useAuiState } from "@assistant-ui/react";
import { Check, Loader2, Sparkles } from "lucide-react";

import { Button } from "@dev-mainsequence/command-center-sdk/controls";

import { useChatEngine } from "../engine/ChatEngineProvider.js";
import { AgentIcon } from "./AgentIcon.js";

export type AgentConnectionStep = "runtime" | "session" | "history";

export interface AgentConnectionStepSpec {
  key: AgentConnectionStep;
  label: string;
  detail: string;
}

export function buildAgentConnectionSteps(agentName: string): ReadonlyArray<AgentConnectionStepSpec> {
  return [
    {
      key: "runtime",
      label: `Starting ${agentName}`,
      detail: `Starting ${agentName}. This can take a moment after an update.`,
    },
    {
      key: "session",
      label: "Opening your session",
      detail: `Connecting to your conversation with ${agentName}.`,
    },
    {
      key: "history",
      label: "Loading the conversation",
      detail: "Fetching the latest messages.",
    },
  ];
}

export const AGENT_CONNECTION_STEPS = buildAgentConnectionSteps("Agent");

export interface AgentConnectingStateModel {
  showConnectingState: boolean;
  activeStep: AgentConnectionStep;
  hasBlockingIssue: boolean;
}

/**
 * Shared derivation for the rail and expanded chat connecting stage. The stage
 * remains visible until the selected session and its runtime can accept input.
 * Existing conversation history stays readable while a runtime restarts.
 */
export function useAgentConnectingState({
  surface,
}: {
  surface: "overlay" | "page";
}): AgentConnectingStateModel {
  const {
    activeSessionReadiness,
    currentSessionId,
    isActiveSessionReady,
    isAssistantRuntimeStarting,
    isDirectLaunchSession,
  } = useChatEngine();
  const hasBlockingIssue =
    activeSessionReadiness.status === "error" || activeSessionReadiness.status === "not_found";
  const isIdleSelection =
    surface === "page" &&
    activeSessionReadiness.status === "idle" &&
    !activeSessionReadiness.sessionId;
  const hasMessages = useAuiState((state) => state.thread.messages.length > 0);
  const showConnectingState =
    !isDirectLaunchSession &&
    !hasBlockingIssue &&
    !isIdleSelection &&
    (!isActiveSessionReady || (isAssistantRuntimeStarting && !hasMessages));
  const activeStep: AgentConnectionStep = isAssistantRuntimeStarting
    ? "runtime"
    : !currentSessionId || !activeSessionReadiness.detailReady
      ? "session"
      : "history";

  return { showConnectingState, activeStep, hasBlockingIssue };
}

export interface AgentRuntimeStatus {
  message: string | null;
  detail: string | null;
  elapsedSeconds: number | null;
  overdue: boolean;
  onCheckAgain?: () => void;
}

export const AGENT_RUNTIME_EXPECTATION = "Usually one to three minutes.";
export const AGENT_RUNTIME_OVERDUE_MESSAGE = "This is taking longer than expected.";

export function formatElapsedSeconds(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) {
    return `${whole}s`;
  }
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function AgentRuntimeStatusLines({ status }: { status: AgentRuntimeStatus }) {
  return (
    <div className="ms-chat-runtime-status" data-runtime-status>
      {status.message ? <div>{status.message}</div> : null}
      {status.detail && status.detail !== status.message ? (
        <div data-runtime-presence-detail>{status.detail}</div>
      ) : null}
      <div className="ms-chat-runtime-status__timing">
        {status.elapsedSeconds !== null ? (
          <span data-runtime-elapsed>{formatElapsedSeconds(status.elapsedSeconds)}</span>
        ) : null}
        <span>{status.overdue ? AGENT_RUNTIME_OVERDUE_MESSAGE : AGENT_RUNTIME_EXPECTATION}</span>
      </div>
      {status.overdue && status.onCheckAgain ? (
        <Button
          type="button"
          size="small"
          variant="outline"
          className="ms-chat-runtime-status__action"
          onClick={status.onCheckAgain}
          data-runtime-check-again
        >
          Check again
        </Button>
      ) : null}
    </div>
  );
}

export function AgentConnectingState({
  activeStep,
  agentName = "Agent",
  agentUid = null,
  runtimeStatus = null,
}: {
  activeStep: AgentConnectionStep;
  agentName?: string | null;
  agentUid?: string | null;
  runtimeStatus?: AgentRuntimeStatus | null;
}) {
  const resolvedAgentName = agentName?.trim() || "Agent";
  const steps = buildAgentConnectionSteps(resolvedAgentName);
  const activeIndex = steps.findIndex((step) => step.key === activeStep);

  return (
    <div
      className="ms-chat-connecting"
      data-agent-connecting-state
      data-active-step={activeStep}
    >
      <div className="ms-chat-state__badge">
        <AgentIcon agentUid={agentUid} className="ms-chat-icon-2xl" fallback={<Sparkles className="ms-chat-icon-lg" />} />
      </div>
      <div className="ms-chat-state__title">
        Connecting to {resolvedAgentName}
      </div>
      <div className="ms-chat-connecting__steps">
        {steps.map((step, index) => {
          const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";

          return (
            <div key={step.key} className="ms-chat-connecting__step" data-step={step.key} data-state={state}>
              <div
                className={`ms-chat-connecting__marker ms-chat-connecting__marker--${state}`}
              >
                {state === "done" ? (
                  <Check className="ms-chat-icon-xs" />
                ) : state === "active" ? (
                  <Loader2 className="ms-chat-icon-md ms-chat-spin" />
                ) : (
                  <span className="ms-chat-connecting__dot" />
                )}
              </div>
              <div className="ms-chat-connecting__text">
                <div
                  className={
                    state === "pending"
                      ? "ms-chat-connecting__label ms-chat-connecting__label--pending"
                      : "ms-chat-connecting__label"
                  }
                >
                  {step.label}
                </div>
                {state === "active" && step.key === "runtime" && runtimeStatus ? (
                  <AgentRuntimeStatusLines status={runtimeStatus} />
                ) : state === "active" ? (
                  <div className="ms-chat-connecting__detail">{step.detail}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
