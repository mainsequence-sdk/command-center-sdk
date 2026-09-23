export interface AgentSessionModelRequestBody {
  model: string;
  provider?: string | null;
  runConfig?: {
    reasoning_effort?: string | null;
  } | null;
  source: string;
}

export interface AgentSessionRunConfigRequestBody {
  reasoning_effort?: string | null;
}

interface AgentSessionRequestBodyFragmentOptions {
  context?: unknown;
  model?: AgentSessionModelRequestBody | null;
  newChat?: boolean;
  runConfig?: AgentSessionRunConfigRequestBody | null;
  runtimeSessionUid?: string | number | null;
  session?: Record<string, unknown> | null;
  threadId?: string | null;
  userUid?: string | number | null;
}

export interface AgentSessionLiveRequestOptions extends AgentSessionRequestBodyFragmentOptions {
  input: string;
}

function normalizeNonEmptyString(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeSessionPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function buildAgentSessionRequestBodyFragment({
  context,
  model,
  newChat = false,
  runConfig,
  runtimeSessionUid,
  session,
  threadId,
  userUid,
}: AgentSessionRequestBodyFragmentOptions) {
  const normalizedRuntimeSessionUid = normalizeNonEmptyString(runtimeSessionUid);
  const normalizedThreadId = normalizeNonEmptyString(threadId);
  const normalizedUserUid = normalizeNonEmptyString(userUid);
  const normalizedModelSource =
    model === null ? null : normalizeNonEmptyString(model?.source);
  const normalizedModelValue =
    model === null ? null : normalizeNonEmptyString(model?.model);
  const normalizedModelProvider =
    model === null ? null : normalizeNonEmptyString(model?.provider);
  const normalizedReasoningEffort =
    model === null
      ? null
      : normalizeNonEmptyString(model?.runConfig?.reasoning_effort);
  const normalizedRunConfigReasoningEffort = normalizeNonEmptyString(runConfig?.reasoning_effort);
  const normalizedSession = normalizeSessionPayload(session);

  return {
    ...(newChat ? { newChat: true } : {}),
    ...(model === null
      ? { model: null }
      : normalizedModelSource && normalizedModelValue
        ? {
            model: {
              source: normalizedModelSource,
              model: normalizedModelValue,
              ...(normalizedModelProvider ? { provider: normalizedModelProvider } : {}),
              ...(normalizedReasoningEffort
                ? {
                    runConfig: {
                      reasoning_effort: normalizedReasoningEffort,
                    },
                  }
                : {}),
            },
          }
        : {}),
    ...(normalizedRunConfigReasoningEffort
      ? {
          runConfig: {
            reasoning_effort: normalizedRunConfigReasoningEffort,
          },
        }
      : {}),
    ...(normalizedUserUid ? { user_uid: normalizedUserUid } : {}),
    ...(normalizedThreadId ? { threadId: normalizedThreadId } : {}),
    ...(normalizedRuntimeSessionUid
      ? {
          runtime_session_uid: normalizedRuntimeSessionUid,
        }
      : {}),
    ...(normalizedSession ? { session: normalizedSession } : {}),
    ...(context !== undefined ? { context } : {}),
  };
}

export function buildAgentSessionLiveRequestBody({
  input,
  ...fragmentOptions
}: AgentSessionLiveRequestOptions) {
  const normalizedInput = input.trim();

  if (!normalizedInput) {
    throw new Error("Agent session requests require a non-empty input.");
  }

  return {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: normalizedInput }],
      },
    ],
    tools: {},
    ...buildAgentSessionRequestBodyFragment(fragmentOptions),
  };
}
