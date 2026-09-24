import { describe, expect, it } from "vitest";

import {
  buildAgentSessionLiveRequestBody,
  buildAgentSessionRequestBodyFragment,
} from "./agent-session-request.js";

describe("agent session request envelope", () => {
  it("uses uid fields for existing session requests", () => {
    const fragment = buildAgentSessionRequestBodyFragment({
      runtimeSessionUid: "9555e9b6-06bf-481e-ac8e-f3d49038ef5e",
      userUid: "e2a4f38a-1b5f-40a3-974f-70bc8f065b3f",
    });

    expect(fragment).toMatchObject({
      runtime_session_uid: "9555e9b6-06bf-481e-ac8e-f3d49038ef5e",
      user_uid: "e2a4f38a-1b5f-40a3-974f-70bc8f065b3f",
    });
    expect(fragment).not.toHaveProperty("userId");
    expect(fragment).not.toHaveProperty("sessionId");
    expect(fragment).not.toHaveProperty("runtime_session_id");
  });

  it("keeps uid fields on live chat bodies", () => {
    const body = buildAgentSessionLiveRequestBody({
      input: "hello",
      runtimeSessionUid: "session-uid",
      userUid: "user-uid",
    });

    expect(body.runtime_session_uid).toBe("session-uid");
    expect(body.user_uid).toBe("user-uid");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("sessionId");
    expect(body).not.toHaveProperty("runtime_session_id");
  });

  it("never sends an agent type or a workflow key", () => {
    const body = buildAgentSessionLiveRequestBody({
      input: "hello",
      runtimeSessionUid: "session-uid",
    });

    expect(body).not.toHaveProperty("agentType");
    expect(body).not.toHaveProperty("sessionMetadata");
  });
});
