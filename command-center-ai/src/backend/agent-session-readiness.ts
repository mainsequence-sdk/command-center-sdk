export type AgentSessionInteractionReadinessStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "not_found";

export interface AgentSessionInteractionReadiness {
  sessionId: string | null;
  status: AgentSessionInteractionReadinessStatus;
  detailReady: boolean;
  insightsReady: boolean;
  historyReady: boolean;
  error: string | null;
}

export function createIdleAgentSessionReadiness(
  sessionId: string | null = null,
): AgentSessionInteractionReadiness {
  return {
    sessionId,
    status: "idle",
    detailReady: false,
    insightsReady: false,
    historyReady: false,
    error: null,
  };
}

export function createLoadingAgentSessionReadiness({
  detailReady = false,
  historyReady = false,
  insightsReady = false,
  sessionId,
}: {
  detailReady?: boolean;
  historyReady?: boolean;
  insightsReady?: boolean;
  sessionId: string | null;
}): AgentSessionInteractionReadiness {
  return {
    sessionId,
    status: "loading",
    detailReady,
    insightsReady,
    historyReady,
    error: null,
  };
}

export function createReadyAgentSessionReadiness(
  sessionId: string,
): AgentSessionInteractionReadiness {
  return {
    sessionId,
    status: "ready",
    detailReady: true,
    insightsReady: true,
    historyReady: true,
    error: null,
  };
}

export function createErrorAgentSessionReadiness({
  detailReady = false,
  error,
  historyReady = false,
  insightsReady = false,
  sessionId,
  status = "error",
}: {
  detailReady?: boolean;
  error: string;
  historyReady?: boolean;
  insightsReady?: boolean;
  sessionId: string | null;
  status?: Extract<AgentSessionInteractionReadinessStatus, "error" | "not_found">;
}): AgentSessionInteractionReadiness {
  return {
    sessionId,
    status,
    detailReady,
    insightsReady,
    historyReady,
    error,
  };
}
