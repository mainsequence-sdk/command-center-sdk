import { describe, expect, it } from "vitest";

import { runOrderedMigrations } from "./index.js";

describe("public contracts", () => {
  it("runs migrations in deterministic consecutive order", () => {
    const result = runOrderedMigrations({
      value: { labels: [] as string[] },
      currentVersion: 1,
      targetVersion: 3,
      steps: [
        { from: 1, to: 2, migrate: (value) => ({ labels: [...value.labels, "v2"] }) },
        { from: 2, to: 3, migrate: (value) => ({ labels: [...value.labels, "v3"] }) },
      ],
    });

    expect(result).toEqual({
      value: { labels: ["v2", "v3"] },
      fromVersion: 1,
      toVersion: 3,
      appliedVersions: [2, 3],
    });
  });
});
