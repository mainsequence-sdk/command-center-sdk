export type MainSequenceAiErrorSource = string;

const SOURCE_LABELS: Record<string, string> = {
  agent_session_detail: "Loading the session",
  agent_session_history: "Loading the conversation",
  agent_session_insights: "Loading session usage",
  agent_session_selection: "Choosing the session",
  agent_session_tools: "The Agent's tools",
  agent_tasks: "Agent tasks",
  assistant_available_models: "Loading available models",
  assistant_backend_http: "Sending to the Agent",
  assistant_runtime_access: "Connecting to the Agent",
  assistant_runtime_stream: "Receiving the Agent's reply",
  local_agent_runtime: "Local Agent",
  frontend: "Command Center",
  frontend_request_not_sent: "Request was never sent",
  frontend_runtime_guard: "Request was never sent",
  frontend_runtime_parser: "Reading the Agent's reply",
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
