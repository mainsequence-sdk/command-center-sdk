import {
  getMessageProvenanceFromMetadata,
  normalizeMessageProvenance,
  type MainSequenceAiMessageProvenance,
} from "../backend/message-provenance.js";

/**
 * Who a message is from, resolved for rendering (ADR-0043 Phase C).
 *
 * The backend history projection stamps every Agent runtime message with the verified
 * caller (`actorKind`, `actorUid`, `actorName`) and the session's agent
 * (`targetAgentUid`). This module turns those fields, plus what the client
 * already knows about the viewer and the session, into the avatar, name and
 * grouping key the thread renders. Nothing here runs on the send path.
 */

export type MessageActorKind = "viewer" | "user" | "agent";

export interface MessageActor {
  /** Stable identity used for grouping and the participants strip. */
  key: string;
  kind: MessageActorKind;
  /** Display name. Falls back to a role label when nothing better is known. */
  name: string;
  /** Whether `name` came from data rather than a fallback label. */
  named: boolean;
  /**
   * Name the monogram is built from. The viewer's label is "You", so their
   * initials come from the profile name instead; null means no monogram and
   * the avatar falls back to an icon.
   */
  initialsName: string | null;
  avatarUrl: string | null;
  uid: string | null;
}

export interface MessageActorContext {
  viewer: {
    uid: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
  sessionAgent: {
    uid: string | null;
    name: string | null;
  };
}

interface ThreadMessageShape {
  role: string;
  metadata?: unknown;
  content?: unknown;
  parts?: unknown;
}

export const VIEWER_ACTOR_LABEL = "You";
const HUMAN_FALLBACK_LABEL = "Teammate";
const AGENT_FALLBACK_LABEL = "Unnamed agent";

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readProvenanceFromParts(parts: unknown): MainSequenceAiMessageProvenance | null {
  if (!Array.isArray(parts)) {
    return null;
  }

  for (const part of parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }

    const candidate = part as Record<string, unknown>;
    const isProvenancePart =
      (candidate.type === "data" && candidate.name === "main_sequence_ai_provenance") ||
      candidate.type === "data-main_sequence_ai_provenance";

    if (isProvenancePart) {
      const provenance = normalizeMessageProvenance(candidate.data);
      if (provenance) {
        return provenance;
      }
    }
  }

  return null;
}

/**
 * Provenance travels both in `metadata.custom` (history reload) and as a
 * data part (kept for messages persisted by older clients); either wins.
 */
export function getMessageProvenance(
  message: ThreadMessageShape,
): MainSequenceAiMessageProvenance | null {
  return (
    getMessageProvenanceFromMetadata(
      message.metadata as Parameters<typeof getMessageProvenanceFromMetadata>[0],
    ) ??
    readProvenanceFromParts(message.content) ??
    readProvenanceFromParts(message.parts)
  );
}

function humanLabelFromName(name: string | null) {
  if (!name) {
    return null;
  }

  // Human actor names come from the gateway username, which the platform
  // stores as the email address. Show the mailbox part as the label so a
  // multi-party thread does not read as a list of addresses; the full
  // value stays available on the avatar tooltip through `title`.
  const atIndex = name.indexOf("@");
  if (atIndex > 0 && !name.includes(" ")) {
    return name.slice(0, atIndex);
  }

  return name;
}

function buildViewerActor(context: MessageActorContext): MessageActor {
  const uid = normalizeString(context.viewer.uid);
  return {
    key: uid ? `user:${uid}` : "viewer",
    kind: "viewer",
    name: VIEWER_ACTOR_LABEL,
    named: true,
    initialsName: normalizeString(context.viewer.name),
    avatarUrl: normalizeString(context.viewer.avatarUrl),
    uid,
  };
}

/** The session's own agent as an actor: every assistant turn defaults to it. */
export function getSessionAgentActor(context: MessageActorContext): MessageActor {
  const uid = normalizeString(context.sessionAgent.uid);
  const name = normalizeString(context.sessionAgent.name);
  return {
    key: uid ? `agent:${uid}` : "session-agent",
    kind: "agent",
    name: name ?? AGENT_FALLBACK_LABEL,
    named: Boolean(name),
    initialsName: name,
    avatarUrl: null,
    uid,
  };
}

/**
 * Resolve the actor of a message.
 *
 * - assistant messages are the session's agent (`targetAgentUid` when the
 *   projection stamped it, the session summary otherwise);
 * - user messages with `actorKind: "agent"` are the calling agent;
 * - user messages whose actor is the viewer, or that carry no verified actor
 *   at all (a message the viewer just sent, or one persisted before ADR-0043),
 *   are the viewer;
 * - any other human is a teammate named by the gateway.
 */
export function resolveMessageActor(
  message: ThreadMessageShape,
  context: MessageActorContext,
): MessageActor {
  const provenance = getMessageProvenance(message);

  if (message.role === "assistant") {
    const targetAgentUid = normalizeString(provenance?.targetAgentUid);
    const sessionAgentUid = normalizeString(context.sessionAgent.uid);
    if (targetAgentUid && sessionAgentUid && targetAgentUid !== sessionAgentUid) {
      return {
        key: `agent:${targetAgentUid}`,
        kind: "agent",
        name: AGENT_FALLBACK_LABEL,
        named: false,
        initialsName: null,
        avatarUrl: null,
        uid: targetAgentUid,
      };
    }

    return getSessionAgentActor(context);
  }

  if (message.role !== "user") {
    return getSessionAgentActor(context);
  }

  const actorKind = provenance?.actorKind ?? null;
  const actorUid = normalizeString(provenance?.actorUid);
  const isAgentOrigin = actorKind === "agent" || provenance?.origin === "agent";

  if (isAgentOrigin) {
    // Backend-resolved name first, the legacy caller name next, then the
    // handle the call came through; a generic "Agent" is never shown.
    const name =
      normalizeString(provenance?.actorName) ??
      normalizeString(provenance?.callerAgentName) ??
      normalizeString(provenance?.handleUniqueId);
    return {
      key: actorUid ? `agent:${actorUid}` : `agent-name:${name ?? "unknown"}`,
      kind: "agent",
      name: name ?? AGENT_FALLBACK_LABEL,
      named: Boolean(name),
      initialsName: name,
      avatarUrl: null,
      uid: actorUid,
    };
  }

  const viewerUid = normalizeString(context.viewer.uid);
  if (!actorUid || (viewerUid && actorUid === viewerUid)) {
    return buildViewerActor(context);
  }

  const name = humanLabelFromName(normalizeString(provenance?.actorName));
  return {
    key: `user:${actorUid}`,
    kind: "user",
    name: name ?? HUMAN_FALLBACK_LABEL,
    named: Boolean(name),
    initialsName: name,
    avatarUrl: null,
    uid: actorUid,
  };
}

/**
 * The session's agent uid as stamped by the projection (`targetAgentUid` on
 * every Agent runtime message). The active session summary carries the agent's label
 * and numeric id but not its uid, so the thread supplies it.
 */
export function findThreadTargetAgentUid(messages: readonly ThreadMessageShape[]) {
  for (const message of messages) {
    const targetAgentUid = normalizeString(getMessageProvenance(message)?.targetAgentUid);
    if (targetAgentUid) {
      return targetAgentUid;
    }
  }

  return null;
}

export interface ThreadParticipants {
  actors: MessageActor[];
  /**
   * True when someone other than the viewer and the session's agent took
   * part: a calling agent or another human. Name labels and the participants
   * strip render only then, so a plain one-to-one chat keeps today's look.
   */
  multiParty: boolean;
}

export function collectThreadParticipants(
  messages: readonly ThreadMessageShape[],
  context: MessageActorContext,
): ThreadParticipants {
  const byKey = new Map<string, MessageActor>();

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    const actor = resolveMessageActor(message, context);
    const existing = byKey.get(actor.key);
    // Prefer the first entry that carries a real name for the same identity.
    if (!existing || (!existing.named && actor.named)) {
      byKey.set(actor.key, actor);
    }
  }

  const actors = Array.from(byKey.values());
  const sessionAgentKey = getSessionAgentActor(context).key;
  const viewerKey = buildViewerActor(context).key;
  const multiParty = actors.some(
    (actor) => actor.key !== sessionAgentKey && actor.key !== viewerKey,
  );

  return { actors, multiParty };
}

/**
 * Stable string form of the participants, cheap to compare in a store
 * selector so the thread does not re-render on every streaming delta.
 */
export function buildThreadParticipantsKey(
  messages: readonly ThreadMessageShape[],
  context: MessageActorContext,
) {
  const { actors, multiParty } = collectThreadParticipants(messages, context);
  return JSON.stringify({
    multiParty,
    actors: actors.map((actor) => [
      actor.key,
      actor.kind,
      actor.name,
      actor.avatarUrl,
      actor.initialsName,
    ]),
  });
}

export function parseThreadParticipantsKey(key: string): ThreadParticipants {
  try {
    const parsed = JSON.parse(key) as {
      multiParty?: unknown;
      actors?: unknown;
    };
    const actors: MessageActor[] = Array.isArray(parsed.actors)
      ? parsed.actors.flatMap((entry) => {
          if (!Array.isArray(entry) || entry.length < 3) {
            return [];
          }
          const [actorKey, kind, name, avatarUrl, initialsName] = entry as unknown[];
          if (typeof actorKey !== "string" || typeof name !== "string") {
            return [];
          }
          const normalizedKind: MessageActorKind =
            kind === "viewer" || kind === "user" || kind === "agent" ? kind : "user";
          return [
            {
              key: actorKey,
              kind: normalizedKind,
              name,
              named: true,
              initialsName: typeof initialsName === "string" ? initialsName : null,
              avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
              uid: actorKey.includes(":") ? actorKey.slice(actorKey.indexOf(":") + 1) : null,
            },
          ];
        })
      : [];

    return { actors, multiParty: parsed.multiParty === true };
  } catch {
    return { actors: [], multiParty: false };
  }
}

export function getActorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join("").toUpperCase();
  }

  const first = Array.from(parts[0])[0] ?? "";
  const last = Array.from(parts.at(-1) ?? "")[0] ?? "";
  return `${first}${last}`.toUpperCase();
}
