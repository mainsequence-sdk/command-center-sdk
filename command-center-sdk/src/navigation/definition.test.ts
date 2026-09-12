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
      defaultDestinationId: "services",
      subApplications: [
        {
          id: "develop",
          label: "Develop",
          order: 20,
          destinations: [
            { id: "clusters", label: "Clusters", order: 20 },
            { id: "services", label: "Services", order: 10 },
          ],
        },
      ],
    });
    const reports = defineNavigationContribution({
      id: "reports.foundry",
      targetApplicationId: "foundry",
      subApplication: {
        id: "reports",
        label: "Reports",
        order: 10,
        destinations: [{ id: "daily", label: "Daily" }],
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
      [reports],
    );

    expect(result.map((application) => application.id)).toEqual(["ai", "foundry"]);
    expect(result[1]?.subApplications.map((section) => section.id)).toEqual([
      "reports",
      "develop",
    ]);
    expect(result[1]?.subApplications[1]?.destinations.map((item) => item.id)).toEqual([
      "services",
      "clusters",
    ]);
    expect(findNavigationDestination(result[1]!, "daily")?.subApplication.id)
      .toBe("reports");
  });

  it("rejects duplicate destination ids across an application", () => {
    expect(() => defineNavigationApplication({
      id: "foundry",
      label: "Foundry",
      subApplications: [
        {
          id: "develop",
          label: "Develop",
          destinations: [{ id: "services", label: "Services" }],
        },
        {
          id: "ship",
          label: "Ship",
          destinations: [{ id: "services", label: "Services" }],
        },
      ],
    })).toThrow(NavigationDefinitionError);
  });

  it("rejects contributions targeting unknown applications", () => {
    expect(() => composeNavigationApplications([], [{
      id: "reports.foundry",
      targetApplicationId: "missing",
      subApplication: {
        id: "reports",
        label: "Reports",
        destinations: [],
      },
    }])).toThrow(/targets unknown application missing/u);
  });

  it("rejects blank application and destination hrefs", () => {
    expect(() => defineNavigationApplication({
      id: "foundry",
      label: "Foundry",
      href: "   ",
      subApplications: [],
    })).toThrow(/application foundry href must be non-empty/u);

    expect(() => defineNavigationApplication({
      id: "foundry",
      label: "Foundry",
      subApplications: [{
        id: "build",
        label: "Build",
        destinations: [{ id: "services", label: "Services", href: "" }],
      }],
    })).toThrow(/destination services href must be non-empty/u);
  });
});
