import { describe, expect, it } from "vitest";

import {
  formatMainSequenceAiErrorSource,
  MainSequenceAiError,
  toMainSequenceAiError,
} from "./error-source.js";

describe("assistant request error provenance", () => {
  it("labels pre-transport failures as never sent", () => {
    const error = toMainSequenceAiError(new Error("Local readiness guard failed."), {
      source: "frontend_request_not_sent",
    });

    expect(error.source).toBe("frontend_request_not_sent");
    expect(error.message).toBe(
      "Source: Request was never sent. Local readiness guard failed.",
    );
  });

  it("labels existing local runtime guards as requests that were never sent", () => {
    expect(formatMainSequenceAiErrorSource("frontend_runtime_guard")).toBe(
      "Request was never sent",
    );
  });

  it("preserves a typed local guard source after transport wrapper entry", () => {
    const guarded = new MainSequenceAiError("The runtime is still waking.", {
      source: "frontend_request_not_sent",
    });

    expect(
      toMainSequenceAiError(guarded, {
        source: "assistant_backend_http",
      }),
    ).toBe(guarded);
    expect(guarded.message).toContain("Request was never sent");
    expect(guarded.message).not.toContain("Agent runtime HTTP");
  });
});
