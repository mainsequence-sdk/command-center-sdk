import { describe, expect, it } from "vitest";

import { readRuntimeBackendErrorMessage } from "./http-error.js";

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 400,
  });
}

describe("runtime HTTP errors", () => {
  it("preserves a direct backend message", async () => {
    await expect(
      readRuntimeBackendErrorMessage(
        jsonResponse({ message: "The provider is invalid." }),
        "Fallback message.",
      ),
    ).resolves.toBe("The provider is invalid.");
  });

  it("formats nested DRF field errors", async () => {
    await expect(
      readRuntimeBackendErrorMessage(
        jsonResponse({
          models: [
            {
              metadata: ["Metadata cannot contain authentication fields: token."],
              thinking_levels: ["A non-reasoning model cannot expose thinking levels."],
            },
          ],
          request_id: "request-123",
        }),
        "Fallback message.",
      ),
    ).resolves.toBe(
      "models[0].metadata: Metadata cannot contain authentication fields: token.; " +
        "models[0].thinking_levels: A non-reasoning model cannot expose thinking levels.",
    );
  });

  it("formats top-level DRF field errors and omits response metadata", async () => {
    await expect(
      readRuntimeBackendErrorMessage(
        jsonResponse({
          code: "validation_error",
          identifier: ["This identifier is reserved by the built-in provider catalog."],
          request_id: "request-123",
        }),
        "Fallback message.",
      ),
    ).resolves.toBe(
      "identifier: This identifier is reserved by the built-in provider catalog.",
    );
  });
});
