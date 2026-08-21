import { describe, expect, it } from "vitest";

import {
  composeNavigationApplications,
  defineNavigationApplication,
  defineNavigationContribution,
  findNavigationDestination,
  NavigationDefinitionError,
} from "./index.js";

describe("navigation definitions", () => {
  it("composes contributions and sorts applications, sub-applications, and destinations", () => {
    const foundry = defineNavigationApplication({
      id: "foundry",
      label: "Foundry",
      order: 20,
      defaultDestinationId: "projects",
      subApplications: [
        {
          id: "develop",
          label: "Develop",
          order: 20,
          destinations: [
            { id: "clusters", label: "Clusters", order: 20 },
            { id: "projects", label: "Projects", order: 10 },
          ],
        },
      ],
    });
    const connections = defineNavigationContribution({
      id: "connections.workspace",
      targetApplicationId: "foundry",
      subApplication: {
        id: "connections",
        label: "Connections",
        order: 10,
        destinations: [{ id: "sources", label: "Sources" }],
      },
    });

    const result = composeNavigationApplications(
      [
        foundry,
        {
          id: "ai",
          label: "AI",
          order: 10,
          subApplications: [],
        },
      ],
      [connections],
    );

    expect(result.map((application) => application.id)).toEqual(["ai", "foundry"]);
    expect(result[1]?.subApplications.map((section) => section.id)).toEqual([
      "connections",
      "develop",
    ]);
    expect(result[1]?.subApplications[1]?.destinations.map((item) => item.id)).toEqual([
      "projects",
      "clusters",
    ]);
    expect(findNavigationDestination(result[1]!, "sources")?.subApplication.id)
      .toBe("connections");
  });

  it("rejects duplicate destination ids across an application", () => {
    expect(() => defineNavigationApplication({
      id: "foundry",
      label: "Foundry",
      subApplications: [
        {
          id: "develop",
          label: "Develop",
          destinations: [{ id: "projects", label: "Projects" }],
        },
        {
          id: "ship",
          label: "Ship",
          destinations: [{ id: "projects", label: "Projects" }],
        },
      ],
    })).toThrow(NavigationDefinitionError);
  });

  it("rejects contributions targeting unknown applications", () => {
    expect(() => composeNavigationApplications([], [{
      id: "connections.workspace",
      targetApplicationId: "missing",
      subApplication: {
        id: "connections",
        label: "Connections",
        destinations: [],
      },
    }])).toThrow(/targets unknown application missing/u);
  });
});
