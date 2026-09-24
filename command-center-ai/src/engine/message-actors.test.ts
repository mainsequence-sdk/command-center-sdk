import { describe, expect, it } from "vitest";

import {
  buildThreadParticipantsKey,
  collectThreadParticipants,
  findThreadTargetAgentUid,
  getActorInitials,
  getMessageProvenance,
  getSessionAgentActor,
  parseThreadParticipantsKey,
  resolveMessageActor,
  type MessageActorContext,
} from "./message-actors.js";
import {
  buildMessageProvenanceMetadata,
  normalizeMessageProvenance,
} from "../backend/message-provenance.js";

const context: MessageActorContext = {
  viewer: {
    uid: "6e0d0d6c-4b8a-4a4a-9f3e-1c2d3e4f5a6b",
    name: "Ada Lovelace",
    avatarUrl: "https://example.test/jose.png",
  },
  sessionAgent: {
    uid: "e49e23e5-d7a6-4ebc-912e-d5257252945f",
    name: "Research Orchestrator",
  },
};

function userMessage(provenance: Record<string, unknown> | null) {
  const normalized = provenance ? normalizeMessageProvenance(provenance) : null;
  return {
    role: "user",
    content: [{ type: "text", text: "hello" }],
    ...(normalized ? { metadata: buildMessageProvenanceMetadata(normalized) } : {}),
  };
}

function assistantMessage(provenance: Record<string, unknown> | null) {
  const normalized = provenance ? normalizeMessageProvenance(provenance) : null;
  return {
    role: "assistant",
    content: [{ type: "text", text: "hi" }],
    ...(normalized ? { metadata: buildMessageProvenanceMetadata(normalized) } : {}),
  };
}

describe("resolveMessageActor", () => {
  it("treats a user message without a verified actor as the viewer", () => {
    // A message the viewer just sent, or one persisted before ADR-0043.
    const actor = resolveMessageActor(userMessage(null), context);

    expect(actor).toMatchObject({
      key: `user:${context.viewer.uid}`,
      kind: "viewer",
      name: "You",
      avatarUrl: "https://example.test/jose.png",
    });
  });

  it("recognises the viewer by the verified actor uid", () => {
    const actor = resolveMessageActor(
      userMessage({
        origin: "user",
        channel: "command-center",
        actorKind: "user",
        actorUid: context.viewer.uid,
        actorName: "ada@example.com",
      }),
      context,
    );

    expect(actor.kind).toBe("viewer");
    expect(actor.name).toBe("You");
  });

  it("labels another human by the mailbox part of the gateway username", () => {
    const actor = resolveMessageActor(
      userMessage({
        origin: "user",
        channel: "command-center",
        actorKind: "user",
        actorUid: "0f3f6b2a-1d2e-4c3b-8a9f-0b1c2d3e4f5a",
        actorName: "grace@example.com",
      }),
      context,
    );

    expect(actor).toMatchObject({
      key: "user:0f3f6b2a-1d2e-4c3b-8a9f-0b1c2d3e4f5a",
      kind: "user",
      name: "grace",
      named: true,
      avatarUrl: null,
    });
  });

  it("keeps a full display name untouched", () => {
    const actor = resolveMessageActor(
      userMessage({
        origin: "user",
        actorKind: "user",
        actorUid: "0f3f6b2a-1d2e-4c3b-8a9f-0b1c2d3e4f5a",
        actorName: "Grace Hopper",
      }),
      context,
    );

    expect(actor.name).toBe("Grace Hopper");
  });

  it("falls back to a role label for a human without a name", () => {
    const actor = resolveMessageActor(
      userMessage({
        origin: "user",
        actorKind: "user",
        actorUid: "0f3f6b2a-1d2e-4c3b-8a9f-0b1c2d3e4f5a",
      }),
      context,
    );

    expect(actor).toMatchObject({ kind: "user", name: "Teammate", named: false });
  });

  it("names a calling agent from the projected actorName", () => {
    const actor = resolveMessageActor(
      userMessage({
        origin: "agent",
        channel: "a2a",
        actorKind: "agent",
        actorUid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        actorName: "Code Repository Executor",
        callerAgentName: "code-repository-executor",
      }),
      context,
    );

    expect(actor).toMatchObject({
      key: "agent:7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      kind: "agent",
      name: "Code Repository Executor",
      named: true,
    });
  });

  it("falls back to the legacy callerAgentName for pre-cutover agent turns", () => {
    const actor = resolveMessageActor(
      userMessage({
        origin: "agent",
        channel: "a2a",
        callerAgentName: "research-orchestrator",
      }),
      context,
    );

    expect(actor).toMatchObject({
      key: "agent-name:research-orchestrator",
      kind: "agent",
      name: "research-orchestrator",
      named: true,
      uid: null,
    });
  });

  it("uses the session agent for assistant messages", () => {
    const actor = resolveMessageActor(
      assistantMessage({
        origin: "user",
        actorKind: "user",
        actorUid: context.viewer.uid,
        targetAgentUid: context.sessionAgent.uid,
      }),
      context,
    );

    expect(actor).toEqual(getSessionAgentActor(context));
    expect(actor.name).toBe("Research Orchestrator");
  });

  it("keeps an assistant message on a different target agent apart from the session agent", () => {
    const actor = resolveMessageActor(
      assistantMessage({
        origin: "user",
        targetAgentUid: "11111111-2222-4333-8444-555555555555",
      }),
      context,
    );

    expect(actor.key).toBe("agent:11111111-2222-4333-8444-555555555555");
    expect(actor.named).toBe(false);
    expect(actor.name).toBe("Unnamed agent");
  });

  it("reads provenance from a data part when metadata is absent", () => {
    const provenance = getMessageProvenance({
      role: "user",
      content: [
        {
          type: "data-main_sequence_ai_provenance",
          data: { origin: "agent", channel: "a2a", callerAgentName: "research-orchestrator" },
        },
        { type: "text", text: "hello" },
      ],
    });

    expect(provenance?.callerAgentName).toBe("research-orchestrator");
  });
});

describe("collectThreadParticipants", () => {
  const otherHuman = userMessage({
    origin: "user",
    actorKind: "user",
    actorUid: "0f3f6b2a-1d2e-4c3b-8a9f-0b1c2d3e4f5a",
    actorName: "grace@example.com",
  });
  const callingAgent = userMessage({
    origin: "agent",
    channel: "a2a",
    actorKind: "agent",
    actorUid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    actorName: "Code Repository Executor",
  });

  it("is not multi-party for a plain viewer and session-agent exchange", () => {
    const participants = collectThreadParticipants(
      [userMessage(null), assistantMessage(null), userMessage(null)],
      context,
    );

    expect(participants.multiParty).toBe(false);
    expect(participants.actors.map((actor) => actor.name)).toEqual(["You", "Research Orchestrator"]);
  });

  it("becomes multi-party when a calling agent or another human took part", () => {
    const participants = collectThreadParticipants(
      [callingAgent, assistantMessage(null), otherHuman, assistantMessage(null), userMessage(null)],
      context,
    );

    expect(participants.multiParty).toBe(true);
    expect(participants.actors.map((actor) => [actor.kind, actor.name])).toEqual([
      ["agent", "Code Repository Executor"],
      ["agent", "Research Orchestrator"],
      ["user", "grace"],
      ["viewer", "You"],
    ]);
  });

  it("keeps one entry per identity and prefers the named one", () => {
    const unnamed = userMessage({
      origin: "user",
      actorKind: "user",
      actorUid: "0f3f6b2a-1d2e-4c3b-8a9f-0b1c2d3e4f5a",
    });
    const participants = collectThreadParticipants([unnamed, otherHuman], context);

    expect(participants.actors).toHaveLength(1);
    expect(participants.actors[0]).toMatchObject({ name: "grace", named: true });
  });

  it("round-trips through the string key used by the store selector", () => {
    const messages = [callingAgent, assistantMessage(null), userMessage(null)];
    const key = buildThreadParticipantsKey(messages, context);
    const parsed = parseThreadParticipantsKey(key);
    const direct = collectThreadParticipants(messages, context);

    expect(key).toBe(buildThreadParticipantsKey(messages, context));
    expect(parsed.multiParty).toBe(direct.multiParty);
    expect(parsed.actors.map((actor) => [actor.key, actor.kind, actor.name, actor.avatarUrl])).toEqual(
      direct.actors.map((actor) => [actor.key, actor.kind, actor.name, actor.avatarUrl]),
    );
    expect(parseThreadParticipantsKey("not json")).toEqual({ actors: [], multiParty: false });
  });
});

describe("findThreadTargetAgentUid", () => {
  it("returns the first stamped target agent uid, or null before the cutover", () => {
    expect(findThreadTargetAgentUid([userMessage(null), assistantMessage(null)])).toBeNull();
    expect(
      findThreadTargetAgentUid([
        userMessage(null),
        assistantMessage({ origin: "user", targetAgentUid: context.sessionAgent.uid }),
      ]),
    ).toBe(context.sessionAgent.uid);
  });
});

describe("getActorInitials", () => {
  it("builds a two-letter monogram", () => {
    expect(getActorInitials("Research Orchestrator")).toBe("RO");
    expect(getActorInitials("grace")).toBe("GR");
    expect(getActorInitials("  ")).toBe("");
  });
});
