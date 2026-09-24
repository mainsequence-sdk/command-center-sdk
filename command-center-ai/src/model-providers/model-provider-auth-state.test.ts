import { describe, expect, it } from "vitest";

import { getProviderAuthenticationLabel } from "./model-provider-auth-state.js";

describe("getProviderAuthenticationLabel", () => {
  it("marks an active but unusable credential as requiring sign-in", () => {
    expect(
      getProviderAuthenticationLabel({
        authenticated: false,
        credentialStatus: "active",
      }),
    ).toBe("Requires sign-in");
  });

  it("marks a usable credential as signed in", () => {
    expect(
      getProviderAuthenticationLabel({
        authenticated: true,
        credentialStatus: "active",
      }),
    ).toBe("Signed in");
  });

  it.each(["missing", "revoked"] as const)(
    "keeps %s credentials in the ordinary signed-out state",
    (credentialStatus) => {
      expect(
        getProviderAuthenticationLabel({
          authenticated: false,
          credentialStatus,
        }),
      ).toBe("Not signed in");
    },
  );
});
