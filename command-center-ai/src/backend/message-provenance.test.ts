import { describe, expect, it } from "vitest";

import { normalizeMessageProvenance } from "./message-provenance.js";

describe("normalizeMessageProvenance", () => {
  it("carries the verified actor fields from the platform's history", () => {
    const provenance = normalizeMessageProvenance({
      origin: "agent",
      channel: "a2a",
      actorKind: "agent",
      actorUid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      actorName: "Code Repository Executor",
      callerAgentSessionUid: "session-uid-52",
      targetAgentUid: "agent-uid-25",
    });

    expect(provenance).toEqual({
      origin: "agent",
      channel: "a2a",
      actorKind: "agent",
      actorUid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      actorName: "Code Repository Executor",
      callerAgentName: null,
      handleUniqueId: null,
      callerAgentSessionUid: "session-uid-52",
      targetAgentUid: "agent-uid-25",
    });
  });

  it("drops actor fields without a recognised kind", () => {
    const provenance = normalizeMessageProvenance({
      origin: "user",
      actorKind: "service",
      actorUid: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      actorName: "Nobody",
    });

    expect(provenance).toMatchObject({ actorKind: null, actorUid: null, actorName: null });
  });

  it("drops the actor name when the actor uid is missing", () => {
    const provenance = normalizeMessageProvenance({
      origin: "user",
      actorKind: "User",
      actorName: "ada@example.com",
    });

    expect(provenance).toMatchObject({ actorKind: "user", actorUid: null, actorName: null });
  });

  it("leaves pre-cutover payloads with null actor fields", () => {
    const provenance = normalizeMessageProvenance({
      origin: "agent",
      channel: "a2a",
      callerAgentName: "research-assistant",
    });

    expect(provenance).toMatchObject({
      origin: "agent",
      callerAgentName: "research-assistant",
      actorKind: null,
      actorUid: null,
      actorName: null,
    });
  });

  it("returns null without an origin", () => {
    expect(normalizeMessageProvenance({ actorKind: "user" })).toBeNull();
    expect(normalizeMessageProvenance(null)).toBeNull();
  });
});
