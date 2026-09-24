export interface SessionInsightsSession {
  agentId: number | null;
  agentSessionId: string | null;
  lastError: string | null;
  sessionId: string | null;
  startedAt: string | null;
  status: "running" | "completed" | "error";
  threadId: string | null;
  updatedAt: string | null;
}

export interface SessionInsightsModel {
  contextWindow: number | null;
  maxOutputTokens: number | null;
  model: string | null;
  provider: string | null;
  reasoningEffort: string | null;
}

export interface SessionInsightsEditableBooleanField {
  editable: boolean;
  type: "boolean";
}

export interface SessionInsightsEditableNumberField {
  editable: boolean;
  type: "integer" | "number";
  min: number | null;
  max: number | null;
  step: number | null;
  unit: string | null;
}

export interface SessionInsightsEditableConfig {
  compaction: {
    enabled: SessionInsightsEditableBooleanField | null;
    reserveTokens: SessionInsightsEditableNumberField | null;
    thresholdPercent: SessionInsightsEditableNumberField | null;
    thresholdTokens: SessionInsightsEditableNumberField | null;
  } | null;
  model: {
    contextWindow: SessionInsightsEditableNumberField | null;
    maxOutputTokens: SessionInsightsEditableNumberField | null;
    model: SessionInsightsEditableNumberField | SessionInsightsEditableBooleanField | null;
    provider: SessionInsightsEditableNumberField | SessionInsightsEditableBooleanField | null;
    reasoningEffort: SessionInsightsEditableNumberField | SessionInsightsEditableBooleanField | null;
  } | null;
}

export interface SessionInsightsInfoSource {
  kind: "astro_doc" | "pi_doc";
  package: "astro" | "pi-coding-agent" | "pi-ai" | null;
  path: string | null;
  section: string | null;
}

export interface SessionInsightsInfoNode {
  label: string | null;
  description: string | null;
  source: SessionInsightsInfoSource[];
  children: Record<string, SessionInsightsInfoNode>;
}

export interface SessionInsightsTokenTotals {
  cacheRead: number | null;
  cacheWrite: number | null;
  input: number | null;
  output: number | null;
  total: number | null;
}

export interface SessionInsightsUsage {
  assistantMessages: number | null;
  assistantTurns: number | null;
  estimatedCostUsd: number | null;
  tokens: SessionInsightsTokenTotals;
  toolCalls: number | null;
  toolResults: number | null;
  totalMessages: number | null;
  userMessages: number | null;
}

export interface SessionInsightsContext {
  compactionEnabled: boolean | null;
  compactionReserveTokens: number | null;
  compactionThresholdPercent: number | null;
  compactionThresholdTokens: number | null;
  contextWindow: number | null;
  latestCompaction: string | null;
  percentOfContextWindow: number | null;
  source: string | null;
  status: string | null;
  tokens: number | null;
  tokensRemainingBeforeCompaction: number | null;
  tokensRemainingBeforeContextLimit: number | null;
}

export interface SessionInsightsLastTurn {
  completedAt: string | null;
  errorMessage: string | null;
  finishReason: string | null;
  model: {
    model: string | null;
    provider: string | null;
  };
  tokens: SessionInsightsTokenTotals;
}

interface SessionInsightsSnapshotBase {
  hasInsights: boolean;
  agentSessionId: string | null;
  computedAt: string | null;
  reason: string | null;
  updatedAt: string | null;
  config: {
    compaction: {
      enabled: boolean | null;
      reserveTokens: number | null;
      thresholdPercent: number | null;
      thresholdTokens: number | null;
    } | null;
    model: {
      contextWindow: number | null;
      model: string | null;
      provider: string | null;
      reasoningEffort: string | null;
    } | null;
  } | null;
  editable: {
    config: SessionInsightsEditableConfig | null;
  } | null;
  info: Record<string, SessionInsightsInfoNode>;
  context: SessionInsightsContext | null;
  lastTurn: SessionInsightsLastTurn | null;
  model: SessionInsightsModel | null;
  session: SessionInsightsSession;
  usage: SessionInsightsUsage | null;
  version: number;
}

export interface PiSessionInsightsSnapshot extends SessionInsightsSnapshotBase {
  harness: "pi";
  harnessProtocol: "pi-checkpoint-v1";
  harnessVersion: string;
  checkpointVersion: number | null;
  bundleHash: string | null;
  flushedAt: string | null;
}

export interface TauSessionInsightsSnapshot extends SessionInsightsSnapshotBase {
  harness: "tau";
  harnessProtocol: "tau-session-v1";
  harnessVersion: string;
  entryCount: number | null;
  lastSequence: number | null;
  activeBranchEntryCount: number | null;
  entryTypeCounts: Record<string, number>;
  title: string | null;
}

export interface LegacySessionInsightsSnapshot extends SessionInsightsSnapshotBase {
  harness: null;
  harnessProtocol: null;
  harnessVersion: null;
  checkpointVersion: number | null;
  bundleHash: string | null;
  flushedAt: string | null;
}

export type SessionInsightsSnapshot =
  | PiSessionInsightsSnapshot
  | TauSessionInsightsSnapshot
  | LegacySessionInsightsSnapshot;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : null;
}

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeCountRecord(value: unknown) {
  const candidate = asRecord(value);

  return Object.fromEntries(
    Object.entries(candidate).flatMap(([key, childValue]) => {
      const count = normalizeNumber(childValue);
      return count === null ? [] : [[key, count] as const];
    }),
  );
}

function readCandidateValue(
  candidate: Record<string, unknown>,
  ...keys: readonly string[]
) {
  for (const key of keys) {
    if (key in candidate) {
      return candidate[key];
    }
  }

  return undefined;
}

function normalizeEditableField(value: unknown) {
  const candidate = asRecord(value);

  if (Object.keys(candidate).length === 0) {
    return null;
  }

  const rawType = candidate.type;
  const type =
    rawType === "boolean" || rawType === "integer" || rawType === "number" ? rawType : null;

  if (!type) {
    return null;
  }

  if (type === "boolean") {
    return {
      editable: Boolean(candidate.editable),
      type,
    } satisfies SessionInsightsEditableBooleanField;
  }

  return {
    editable: Boolean(candidate.editable),
    type,
    min: normalizeNumber(candidate.min),
    max: normalizeNumber(candidate.max),
    step: normalizeNumber(candidate.step),
    unit: normalizeString(candidate.unit),
  } satisfies SessionInsightsEditableNumberField;
}

function normalizeTokenTotals(value: unknown): SessionInsightsTokenTotals {
  const candidate = asRecord(value);

  return {
    cacheRead: normalizeNumber(readCandidateValue(candidate, "cacheRead", "cache_read")),
    cacheWrite: normalizeNumber(readCandidateValue(candidate, "cacheWrite", "cache_write")),
    input: normalizeNumber(readCandidateValue(candidate, "input")),
    output: normalizeNumber(readCandidateValue(candidate, "output")),
    total: normalizeNumber(readCandidateValue(candidate, "total")),
  };
}

function normalizeSession(
  value: unknown,
  fallback: {
    agentSessionId?: unknown;
    updatedAt?: unknown;
  } = {},
): SessionInsightsSession {
  const candidate = asRecord(value);
  const rawStatus = candidate.status;

  return {
    agentId: normalizeNumber(readCandidateValue(candidate, "agentId", "agent_id")),
    agentSessionId: normalizeString(
      readCandidateValue(
        candidate,
        "agentSessionId",
        "agent_session_id",
        "agent_session_uid",
      ),
    ) ?? normalizeString(fallback.agentSessionId),
    lastError: normalizeString(readCandidateValue(candidate, "lastError", "last_error")),
    sessionId: normalizeString(readCandidateValue(candidate, "sessionId", "session_id")),
    startedAt: normalizeString(readCandidateValue(candidate, "startedAt", "started_at")),
    status:
      rawStatus === "running" || rawStatus === "completed" || rawStatus === "error"
        ? rawStatus
        : "completed",
    threadId: normalizeString(readCandidateValue(candidate, "threadId", "thread_id")),
    updatedAt:
      normalizeString(readCandidateValue(candidate, "updatedAt", "updated_at")) ??
      normalizeString(fallback.updatedAt),
  };
}

function normalizeModel(value: unknown): SessionInsightsModel | null {
  const candidate = asRecord(value);

  if (Object.keys(candidate).length === 0) {
    return null;
  }

  return {
    contextWindow: normalizeNumber(readCandidateValue(candidate, "contextWindow", "context_window")),
    maxOutputTokens: normalizeNumber(
      readCandidateValue(candidate, "maxOutputTokens", "max_output_tokens"),
    ),
    model: normalizeString(readCandidateValue(candidate, "model")),
    provider: normalizeString(readCandidateValue(candidate, "provider")),
    reasoningEffort: normalizeString(
      readCandidateValue(candidate, "reasoningEffort", "reasoning_effort"),
    ),
  };
}

function normalizeUsage(value: unknown): SessionInsightsUsage | null {
  const candidate = asRecord(value);

  if (Object.keys(candidate).length === 0) {
    return null;
  }

  return {
    assistantMessages: normalizeNumber(
      readCandidateValue(candidate, "assistantMessages", "assistant_messages"),
    ),
    assistantTurns: normalizeNumber(
      readCandidateValue(candidate, "assistantTurns", "assistant_turns"),
    ),
    estimatedCostUsd: normalizeNumber(
      readCandidateValue(candidate, "estimatedCostUsd", "estimated_cost_usd"),
    ),
    tokens: normalizeTokenTotals(readCandidateValue(candidate, "tokens")),
    toolCalls: normalizeNumber(readCandidateValue(candidate, "toolCalls", "tool_calls")),
    toolResults: normalizeNumber(readCandidateValue(candidate, "toolResults", "tool_results")),
    totalMessages: normalizeNumber(readCandidateValue(candidate, "totalMessages", "total_messages")),
    userMessages: normalizeNumber(readCandidateValue(candidate, "userMessages", "user_messages")),
  };
}

function normalizeContext(value: unknown): SessionInsightsContext | null {
  const candidate = asRecord(value);

  if (Object.keys(candidate).length === 0) {
    return null;
  }

  return {
    compactionEnabled: normalizeBoolean(
      readCandidateValue(candidate, "compactionEnabled", "compaction_enabled"),
    ),
    compactionReserveTokens: normalizeNumber(
      readCandidateValue(candidate, "compactionReserveTokens", "compaction_reserve_tokens"),
    ),
    compactionThresholdPercent: normalizeNumber(
      readCandidateValue(candidate, "compactionThresholdPercent", "compaction_threshold_percent"),
    ),
    compactionThresholdTokens: normalizeNumber(
      readCandidateValue(candidate, "compactionThresholdTokens", "compaction_threshold_tokens"),
    ),
    contextWindow: normalizeNumber(readCandidateValue(candidate, "contextWindow", "context_window")),
    latestCompaction: normalizeString(
      readCandidateValue(candidate, "latestCompaction", "latest_compaction"),
    ),
    percentOfContextWindow: normalizeNumber(
      readCandidateValue(candidate, "percentOfContextWindow", "percent_of_context_window"),
    ),
    source: normalizeString(readCandidateValue(candidate, "source")),
    status: normalizeString(readCandidateValue(candidate, "status")),
    tokens: normalizeNumber(readCandidateValue(candidate, "tokens")),
    tokensRemainingBeforeCompaction: normalizeNumber(
      readCandidateValue(
        candidate,
        "tokensRemainingBeforeCompaction",
        "tokens_remaining_before_compaction",
      ),
    ),
    tokensRemainingBeforeContextLimit: normalizeNumber(
      readCandidateValue(
        candidate,
        "tokensRemainingBeforeContextLimit",
        "tokens_remaining_before_context_limit",
      ),
    ),
  };
}

function normalizeConfig(value: unknown) {
  const candidate = asRecord(value);

  if (Object.keys(candidate).length === 0) {
    return null;
  }

  const compaction = asRecord(candidate.compaction);
  const model = asRecord(candidate.model);

  return {
    compaction:
      Object.keys(compaction).length > 0
        ? {
            enabled: normalizeBoolean(readCandidateValue(compaction, "enabled")),
            reserveTokens: normalizeNumber(
              readCandidateValue(compaction, "reserveTokens", "reserve_tokens"),
            ),
            thresholdPercent: normalizeNumber(
              readCandidateValue(compaction, "thresholdPercent", "threshold_percent"),
            ),
            thresholdTokens: normalizeNumber(
              readCandidateValue(compaction, "thresholdTokens", "threshold_tokens"),
            ),
          }
        : null,
    model:
      Object.keys(model).length > 0
        ? {
            contextWindow: normalizeNumber(
              readCandidateValue(model, "contextWindow", "context_window"),
            ),
            maxOutputTokens: normalizeNumber(
              readCandidateValue(model, "maxOutputTokens", "max_output_tokens"),
            ),
            model: normalizeString(readCandidateValue(model, "model")),
            provider: normalizeString(readCandidateValue(model, "provider")),
            reasoningEffort: normalizeString(
              readCandidateValue(model, "reasoningEffort", "reasoning_effort"),
            ),
          }
        : null,
  };
}

function normalizeEditable(value: unknown) {
  const candidate = asRecord(value);

  if (Object.keys(candidate).length === 0) {
    return null;
  }

  const config = asRecord(candidate.config);
  const compaction = asRecord(config.compaction);
  const model = asRecord(config.model);

  return {
    config:
      Object.keys(config).length > 0
        ? {
            compaction:
              Object.keys(compaction).length > 0
                ? {
                    enabled: normalizeEditableField(
                      readCandidateValue(compaction, "enabled"),
                    ) as SessionInsightsEditableBooleanField | null,
                    reserveTokens: normalizeEditableField(
                      readCandidateValue(compaction, "reserveTokens", "reserve_tokens"),
                    ) as SessionInsightsEditableNumberField | null,
                    thresholdPercent: normalizeEditableField(
                      readCandidateValue(compaction, "thresholdPercent", "threshold_percent"),
                    ) as SessionInsightsEditableNumberField | null,
                    thresholdTokens: normalizeEditableField(
                      readCandidateValue(compaction, "thresholdTokens", "threshold_tokens"),
                    ) as SessionInsightsEditableNumberField | null,
                  }
                : null,
            model:
              Object.keys(model).length > 0
                ? {
                    contextWindow: normalizeEditableField(
                      readCandidateValue(model, "contextWindow", "context_window"),
                    ) as SessionInsightsEditableNumberField | null,
                    maxOutputTokens: normalizeEditableField(
                      readCandidateValue(model, "maxOutputTokens", "max_output_tokens"),
                    ) as SessionInsightsEditableNumberField | null,
                    model: normalizeEditableField(readCandidateValue(model, "model")),
                    provider: normalizeEditableField(readCandidateValue(model, "provider")),
                    reasoningEffort: normalizeEditableField(
                      readCandidateValue(model, "reasoningEffort", "reasoning_effort"),
                    ),
                  }
                : null,
          }
        : null,
  };
}

function normalizeInfoSource(value: unknown): SessionInsightsInfoSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;

  if (kind !== "astro_doc" && kind !== "pi_doc") {
    return null;
  }

  const packageName = candidate.package;

  return {
    kind,
    package:
      packageName === "astro" || packageName === "pi-coding-agent" || packageName === "pi-ai"
        ? packageName
        : null,
    path: normalizeString(candidate.path),
    section: normalizeString(candidate.section),
  };
}

function normalizeInfoNode(value: unknown): SessionInsightsInfoNode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const childrenCandidate = asRecord(candidate.children);
  const childrenEntries = Object.entries(childrenCandidate)
    .map(([key, child]) => {
      const normalizedChild = normalizeInfoNode(child);
      return normalizedChild ? ([key, normalizedChild] as const) : null;
    })
    .filter((entry): entry is readonly [string, SessionInsightsInfoNode] => Boolean(entry));

  return {
    label: normalizeString(candidate.label),
    description: normalizeString(candidate.description),
    source: Array.isArray(candidate.source)
      ? candidate.source
          .map((entry) => normalizeInfoSource(entry))
          .filter((entry): entry is SessionInsightsInfoSource => Boolean(entry))
      : [],
    children: Object.fromEntries(childrenEntries),
  };
}

function normalizeInfoTree(value: unknown) {
  const candidate = asRecord(value);
  const entries = Object.entries(candidate)
    .map(([key, node]) => {
      const normalizedNode = normalizeInfoNode(node);
      return normalizedNode ? ([key, normalizedNode] as const) : null;
    })
    .filter((entry): entry is readonly [string, SessionInsightsInfoNode] => Boolean(entry));

  return Object.fromEntries(entries) as Record<string, SessionInsightsInfoNode>;
}

function normalizeLastTurn(value: unknown): SessionInsightsLastTurn | null {
  const candidate = asRecord(value);

  if (Object.keys(candidate).length === 0) {
    return null;
  }

  const model = asRecord(candidate.model);

  return {
    completedAt: normalizeString(readCandidateValue(candidate, "completedAt", "completed_at")),
    errorMessage: normalizeString(readCandidateValue(candidate, "errorMessage", "error_message")),
    finishReason: normalizeString(readCandidateValue(candidate, "finishReason", "finish_reason")),
    model: {
      model: normalizeString(readCandidateValue(model, "model")),
      provider: normalizeString(readCandidateValue(model, "provider")),
    },
    tokens: normalizeTokenTotals(readCandidateValue(candidate, "tokens")),
  };
}

export function normalizeSessionInsightsSnapshot(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Session insights response is not an object.");
  }

  const rootCandidate = payload as Record<string, unknown>;
  const wrappedInsights = asRecord(readCandidateValue(rootCandidate, "insights"));
  const candidate =
    Object.keys(wrappedInsights).length > 0 ? wrappedInsights : rootCandidate;
  const config = normalizeConfig(readCandidateValue(candidate, "config"));
  const editable = normalizeEditable(readCandidateValue(candidate, "editable"));
  const model = normalizeModel(readCandidateValue(candidate, "model"));
  const context = normalizeContext(readCandidateValue(candidate, "context"));
  const info = normalizeInfoTree(readCandidateValue(candidate, "info"));
  const lastTurn = normalizeLastTurn(readCandidateValue(candidate, "lastTurn", "last_turn"));
  const usage = normalizeUsage(readCandidateValue(candidate, "usage"));
  const explicitHasInsights = normalizeBoolean(
    readCandidateValue(rootCandidate, "hasInsights", "has_insights"),
  );
  const hasNormalizedInsightContent =
    Boolean(config) ||
    Boolean(editable) ||
    Boolean(model) ||
    Boolean(context) ||
    Boolean(lastTurn) ||
    Boolean(usage) ||
    Object.keys(info).length > 0;
  const hasInsights = explicitHasInsights ?? hasNormalizedInsightContent;
  const agentSessionId =
    normalizeString(
      readCandidateValue(
        rootCandidate,
        "agentSessionId",
        "agent_session_id",
        "agent_session_uid",
      ),
    ) ?? null;
  const computedAt = normalizeString(
    readCandidateValue(rootCandidate, "computedAt", "computed_at"),
  );
  const reason = normalizeString(readCandidateValue(rootCandidate, "reason"));
  const updatedAt = normalizeString(
    readCandidateValue(rootCandidate, "updatedAt", "updated_at"),
  );
  const rawHarness = normalizeString(readCandidateValue(rootCandidate, "harness"));
  const harness =
    rawHarness === "pi" || rawHarness === "tau"
      ? rawHarness
      : rawHarness === null
        ? null
        : (() => {
            throw new Error(
              `Session insights response has unsupported harness ${JSON.stringify(rawHarness)}.`,
            );
          })();
  const rawHarnessProtocol = normalizeString(
    readCandidateValue(rootCandidate, "harnessProtocol", "harness_protocol"),
  );
  const harnessVersionValue = readCandidateValue(
    rootCandidate,
    "harnessVersion",
    "harness_version",
  );
  const harnessVersion =
    typeof harnessVersionValue === "string" ? harnessVersionValue.trim() : null;

  const normalizedSnapshot = {
    hasInsights,
    agentSessionId,
    computedAt,
    reason,
    updatedAt,
    config,
    editable,
    info,
    context:
      context || config?.compaction || config?.model
        ? {
            compactionEnabled: context?.compactionEnabled ?? config?.compaction?.enabled ?? null,
            compactionReserveTokens:
              context?.compactionReserveTokens ?? config?.compaction?.reserveTokens ?? null,
            compactionThresholdPercent:
              context?.compactionThresholdPercent ?? config?.compaction?.thresholdPercent ?? null,
            compactionThresholdTokens:
              context?.compactionThresholdTokens ?? config?.compaction?.thresholdTokens ?? null,
            contextWindow: context?.contextWindow ?? config?.model?.contextWindow ?? null,
            latestCompaction: context?.latestCompaction ?? null,
            percentOfContextWindow: context?.percentOfContextWindow ?? null,
            source: context?.source ?? null,
            status: context?.status ?? null,
            tokens: context?.tokens ?? null,
            tokensRemainingBeforeCompaction: context?.tokensRemainingBeforeCompaction ?? null,
            tokensRemainingBeforeContextLimit: context?.tokensRemainingBeforeContextLimit ?? null,
          }
        : null,
    lastTurn,
    model:
      model || config?.model
        ? {
            contextWindow: model?.contextWindow ?? config?.model?.contextWindow ?? null,
            maxOutputTokens: model?.maxOutputTokens ?? config?.model?.maxOutputTokens ?? null,
            model: model?.model ?? config?.model?.model ?? null,
            provider: model?.provider ?? config?.model?.provider ?? null,
            reasoningEffort: model?.reasoningEffort ?? config?.model?.reasoningEffort ?? null,
          }
        : null,
    session: normalizeSession(readCandidateValue(candidate, "session"), {
      agentSessionId,
      updatedAt,
    }),
    usage,
    version:
      typeof readCandidateValue(candidate, "version") === "number" &&
      Number.isFinite(readCandidateValue(candidate, "version"))
        ? (readCandidateValue(candidate, "version") as number)
        : 1,
  } satisfies SessionInsightsSnapshotBase;

  if (harness === "pi") {
    if (rawHarnessProtocol !== "pi-checkpoint-v1") {
      throw new Error(
        "Pi session insights response must use harness_protocol=pi-checkpoint-v1.",
      );
    }

    return {
      ...normalizedSnapshot,
      harness,
      harnessProtocol: rawHarnessProtocol,
      harnessVersion: harnessVersion ?? "",
      checkpointVersion: normalizeNumber(
        readCandidateValue(rootCandidate, "checkpointVersion", "checkpoint_version"),
      ),
      bundleHash: normalizeString(
        readCandidateValue(rootCandidate, "bundleHash", "bundle_hash"),
      ),
      flushedAt: normalizeString(
        readCandidateValue(rootCandidate, "flushedAt", "flushed_at"),
      ),
    } satisfies PiSessionInsightsSnapshot;
  }

  if (harness === "tau") {
    if (rawHarnessProtocol !== "tau-session-v1") {
      throw new Error(
        "Tau session insights response must use harness_protocol=tau-session-v1.",
      );
    }

    return {
      ...normalizedSnapshot,
      harness,
      harnessProtocol: rawHarnessProtocol,
      harnessVersion: harnessVersion ?? "",
      entryCount: normalizeNumber(
        readCandidateValue(rootCandidate, "entryCount", "entry_count"),
      ),
      lastSequence: normalizeNumber(
        readCandidateValue(rootCandidate, "lastSequence", "last_sequence"),
      ),
      activeBranchEntryCount: normalizeNumber(
        readCandidateValue(
          rootCandidate,
          "activeBranchEntryCount",
          "active_branch_entry_count",
        ),
      ),
      entryTypeCounts: normalizeCountRecord(
        readCandidateValue(rootCandidate, "entryTypeCounts", "entry_type_counts"),
      ),
      title: normalizeString(readCandidateValue(rootCandidate, "title")),
    } satisfies TauSessionInsightsSnapshot;
  }

  return {
    ...normalizedSnapshot,
    harness: null,
    harnessProtocol: null,
    harnessVersion: null,
    checkpointVersion: normalizeNumber(
      readCandidateValue(rootCandidate, "checkpointVersion", "checkpoint_version"),
    ),
    bundleHash: normalizeString(
      readCandidateValue(rootCandidate, "bundleHash", "bundle_hash"),
    ),
    flushedAt: normalizeString(
      readCandidateValue(rootCandidate, "flushedAt", "flushed_at"),
    ),
  } satisfies LegacySessionInsightsSnapshot;
}

export function createEmptySessionInsightsSnapshot({
  sessionId,
  checkpointVersion = null,
  bundleHash = null,
  computedAt = null,
  flushedAt = null,
  reason = null,
  updatedAt = null,
}: {
  sessionId: string | number;
  checkpointVersion?: number | null;
  bundleHash?: string | null;
  computedAt?: string | null;
  flushedAt?: string | null;
  reason?: string | null;
  updatedAt?: string | null;
}) {
  return normalizeSessionInsightsSnapshot({
    has_insights: false,
    agent_session_uid: String(sessionId),
    checkpoint_version: checkpointVersion,
    bundle_hash: bundleHash,
    computed_at: computedAt,
    flushed_at: flushedAt,
    reason,
    insights: {},
    updated_at: updatedAt,
  });
}

export function getSessionInsightsInfoNode(
  snapshot: SessionInsightsSnapshot | null,
  path: readonly string[],
) {
  if (!snapshot || path.length === 0) {
    return null;
  }

  let current: SessionInsightsInfoNode | null = snapshot.info[path[0]] ?? null;

  for (let index = 1; index < path.length; index += 1) {
    if (!current) {
      return null;
    }

    current = current.children[path[index]] ?? null;
  }

  return current;
}
