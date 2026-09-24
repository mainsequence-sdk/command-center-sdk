/**
 * Session creation with a model fallback.
 *
 * An Agent may have no default model. The platform then refuses to create a
 * session unless the request names one (`AgentSessionModelRequiredError`).
 * Every path that creates a session goes through this helper: it tries the
 * normal creation, and only when that one error comes back it asks the person
 * for a model and creates the session again with it. Any other failure, and a
 * second refusal, pass through unchanged.
 */

import { AgentSessionModelRequiredError } from "../backend/agent-sessions-api.js";

/** A session waiting for the person to choose a model, shown by the chat surfaces. */
export interface SessionModelSelectionRequest {
  id: number;
  agentLabel: string | null;
  agentUid: string | null;
}

export interface SessionModelChoice {
  provider: string;
  model: string;
  thinking?: string | null;
}

export const SESSION_MODEL_NEEDED_MESSAGE = "A model is needed to start this session. Choose one to continue.";

export class SessionModelSelectionCancelledError extends Error {
  constructor(message = SESSION_MODEL_NEEDED_MESSAGE) {
    super(message);
    this.name = "SessionModelSelectionCancelledError";
  }
}

export async function createSessionWithModelFallback<T>({
  attempt,
  requestModel,
  retryWithModel,
}: {
  attempt: () => Promise<T>;
  requestModel: (error: AgentSessionModelRequiredError) => Promise<SessionModelChoice>;
  retryWithModel: (choice: SessionModelChoice) => Promise<T>;
}): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof AgentSessionModelRequiredError)) {
      throw error;
    }
    const choice = await requestModel(error);
    return retryWithModel(choice);
  }
}

/**
 * A fresh handle for a session created through get-or-create because the
 * plain creation endpoint cannot carry a model. Slug-safe and unique enough
 * per person and Agent: a prefix, the time in base 36 and a random suffix.
 */
export function createFreshSessionHandleId(now: number = Date.now(), random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, "0");
  return `cc-session-${Math.max(0, Math.floor(now)).toString(36)}-${suffix}`;
}
