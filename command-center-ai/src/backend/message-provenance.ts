import type { ThreadMessageLike } from "@assistant-ui/react";

export type MainSequenceAiProvenanceActorKind = "user" | "agent";

export interface MainSequenceAiMessageProvenance {
  origin: string;
  channel: string | null;
  /**
   * Verified caller of the turn, as the platform's history records it.
   * `actorName` is the agent's name for agents and the person's username for
   * humans; absent on older messages.
   */
  actorKind: MainSequenceAiProvenanceActorKind | null;
  actorUid: string | null;
  actorName: string | null;
  callerAgentName: string | null;
  handleUniqueId: string | null;
  callerAgentSessionUid: string | null;
  targetAgentUid: string | null;
}

type ThreadMessageMetadata = ThreadMessageLike["metadata"];

const MAIN_SEQUENCE_AI_CUSTOM_METADATA_KEY = "mainSequenceAi";
export const MAIN_SEQUENCE_AI_PROVENANCE_DATA_PART = "main_sequence_ai_provenance";

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIdLikeString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeString(value);
}

function normalizeActorKind(value: unknown): MainSequenceAiProvenanceActorKind | null {
  const normalized = normalizeString(value)?.toLowerCase();
  return normalized === "user" || normalized === "agent" ? normalized : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeMessageProvenance(value: unknown): MainSequenceAiMessageProvenance | null {
  const candidate = asRecord(value);
  const origin = normalizeString(candidate.origin);

  if (!origin) {
    return null;
  }

  const actorKind = normalizeActorKind(candidate.actorKind);
  // The actor uid and name are only meaningful with a recognised kind; the
  // platform's history applies the same rule before it emits them.
  const actorUid = actorKind ? normalizeIdLikeString(candidate.actorUid) : null;
  const actorName = actorKind && actorUid ? normalizeString(candidate.actorName) : null;

  return {
    origin,
    channel: normalizeString(candidate.channel),
    actorKind,
    actorUid,
    actorName,
    callerAgentName: normalizeString(candidate.callerAgentName),
    handleUniqueId: normalizeString(candidate.handleUniqueId),
    // The backend provenance payload carries ...Uid names; the legacy ...Id
    // names are kept as fallbacks for payloads persisted before the rename.
    callerAgentSessionUid:
      normalizeIdLikeString(candidate.callerAgentSessionUid) ??
      normalizeIdLikeString(candidate.callerAgentSessionId),
    targetAgentUid:
      normalizeIdLikeString(candidate.targetAgentUid) ??
      normalizeIdLikeString(candidate.targetAgentId),
  };
}

export function buildMessageProvenanceMetadata(
  provenance: MainSequenceAiMessageProvenance,
): ThreadMessageMetadata {
  return {
    custom: {
      [MAIN_SEQUENCE_AI_CUSTOM_METADATA_KEY]: {
        provenance,
      },
    },
  };
}

export function buildMessageProvenanceDataPart(
  provenance: MainSequenceAiMessageProvenance,
) {
  return {
    type: `data-${MAIN_SEQUENCE_AI_PROVENANCE_DATA_PART}` as const,
    data: provenance,
  };
}

export function getMessageProvenanceFromMetadata(
  metadata: ThreadMessageMetadata | undefined,
): MainSequenceAiMessageProvenance | null {
  const custom = asRecord(metadata?.custom);
  const namespace = asRecord(custom[MAIN_SEQUENCE_AI_CUSTOM_METADATA_KEY]);
  return normalizeMessageProvenance(namespace.provenance);
}

export function isAgentOriginMessageMetadata(metadata: ThreadMessageMetadata | undefined) {
  return getMessageProvenanceFromMetadata(metadata)?.origin === "agent";
}

export function hasAgentOriginProvenancePart(parts: unknown) {
  if (!Array.isArray(parts)) {
    return false;
  }

  return parts.some((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      return false;
    }

    const candidate = part as Record<string, unknown>;
    return (
      candidate.type === "data" &&
      candidate.name === MAIN_SEQUENCE_AI_PROVENANCE_DATA_PART &&
      normalizeMessageProvenance(candidate.data)?.origin === "agent"
    );
  });
}
