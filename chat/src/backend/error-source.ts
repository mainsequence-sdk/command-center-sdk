export type MainSequenceAiErrorSource = string;

const SOURCE_LABELS: Record<string, string> = {
  agent_session_detail: "Main Sequence AgentSession detail API",
  agent_session_history: "Agent runtime session history",
  agent_session_insights: "Main Sequence AgentSession insights API",
  agent_session_selection: "Main Sequence AgentSession selection API",
  agent_session_tools: "Agent runtime session tools",
  agent_tasks: "Main Sequence Agent Tasks API",
  assistant_available_models: "Chat runtime available models",
  assistant_backend_http: "Agent runtime HTTP",
  assistant_runtime_access: "Main Sequence AgentSession runtime access",
  assistant_runtime_stream: "Agent runtime stream",
  frontend: "Command Center",
  frontend_request_not_sent: "Request was never sent",
  frontend_runtime_guard: "Request was never sent",
  frontend_runtime_parser: "Command Center runtime parser",
};

function humanizeSourceKey(value: string) {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatMainSequenceAiErrorSource(source: MainSequenceAiErrorSource | null | undefined) {
  if (!source) {
    return "Unknown source";
  }

  const normalized = source.trim();
  if (!normalized) {
    return "Unknown source";
  }

  return SOURCE_LABELS[normalized] ?? humanizeSourceKey(normalized);
}

export function withMainSequenceAiErrorSource({
  message,
  source,
}: {
  message: string;
  source: MainSequenceAiErrorSource;
}) {
  const normalizedMessage = message.trim() || "Unknown error.";

  if (/^Source:\s+/i.test(normalizedMessage)) {
    return normalizedMessage;
  }

  return `Source: ${formatMainSequenceAiErrorSource(source)}. ${normalizedMessage}`;
}

export class MainSequenceAiError extends Error {
  readonly source: MainSequenceAiErrorSource;
  readonly rawMessage: string;
  readonly code: string | null;
  readonly detail: string | null;
  readonly status: number | null;

  constructor(
    message: string,
    {
      code = null,
      detail = null,
      source,
      status = null,
    }: {
      code?: string | null;
      detail?: string | null;
      source: MainSequenceAiErrorSource;
      status?: number | null;
    },
  ) {
    super(withMainSequenceAiErrorSource({ message, source }));
    this.name = "MainSequenceAiError";
    this.source = source;
    this.rawMessage = message.trim() || "Unknown error.";
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export function toMainSequenceAiError(
  error: unknown,
  {
    fallbackMessage = "Unknown error.",
    source,
  }: {
    fallbackMessage?: string;
    source: MainSequenceAiErrorSource;
  },
) {
  if (error instanceof MainSequenceAiError) {
    return error;
  }

  if (error instanceof Error) {
    return new MainSequenceAiError(error.message, { source });
  }

  return new MainSequenceAiError(fallbackMessage, { source });
}
