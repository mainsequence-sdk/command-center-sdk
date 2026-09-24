import { describe, expect, it } from "vitest";

import { appendCreatedByUserUidSearchParam } from "./user-scope.js";

describe("runtime user scope helpers", () => {
  const userUid = "00000000-0000-4000-8000-000000000123";

  it("uses created_by_user_uid and removes legacy created_by_user", () => {
    expect(
      appendCreatedByUserUidSearchParam(
        "/api/model-providers?created_by_user=4&provider=openai",
        userUid,
      ),
    ).toBe(`/api/model-providers?provider=openai&created_by_user_uid=${userUid}`);
  });

  it("does not add a user scope when no uid is available", () => {
    expect(appendCreatedByUserUidSearchParam("/api/model-providers", null)).toBe(
      "/api/model-providers",
    );
  });
});
