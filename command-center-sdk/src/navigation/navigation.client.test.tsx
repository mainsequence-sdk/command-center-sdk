// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationNavigationPanel,
  ApplicationNavigationShell,
  ApplicationRail,
  type NavigationApplicationDefinition,
} from "./index.js";

const applications: NavigationApplicationDefinition[] = [
  {
    id: "foundry",
    label: "Foundry",
    subApplications: [
      {
        id: "build",
        label: "Build",
        destinations: [
          { id: "projects", label: "Projects" },
          { id: "clusters", label: "Clusters" },
        ],
      },
      {
        id: "ship",
        label: "Ship",
        destinations: [
          { id: "releases", label: "Releases" },
          { id: "disabled", label: "Unavailable", disabled: true },
        ],
      },
    ],
  },
  {
    id: "ai",
    label: "AI",
    subApplications: [],
  },
];

describe("application navigation", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
  });

  it("reports controlled rail open state and supports arrow-key focus", async () => {
    const onOpenChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ApplicationRail
          applications={applications}
          collapsed={false}
          onOpenApplicationChange={onOpenChange}
        />,
      );
    });

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        "[data-cc-navigation-application]",
      ),
    );
    await act(async () => buttons[0]!.click());
    expect(onOpenChange).toHaveBeenCalledWith("foundry");

    buttons[0]!.focus();
    await act(async () => {
      buttons[0]!.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "ArrowDown",
      }));
    });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("renders all sub-app destinations and emits route-neutral navigation intents", async () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ApplicationNavigationPanel
          activeDestinationId="projects"
          application={applications[0]!}
          onClose={onClose}
          onNavigate={onNavigate}
        />,
      );
    });

    const projectButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Projects");
    expect(projectButton?.getAttribute("aria-current")).toBe("page");
    expect(container.textContent).toContain("Build");
    expect(container.textContent).toContain("Ship");
    expect(container.textContent).toContain("Unavailable");

    await act(async () => projectButton!.click());
    expect(onNavigate).toHaveBeenCalledWith({
      applicationId: "foundry",
      destinationId: "projects",
      subApplicationId: "build",
    });

    await act(async () => {
      projectButton!.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Escape",
      }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("composes a rail, open panel, and consumer-owned content", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <ApplicationNavigationShell
          activeApplicationId="foundry"
          activeDestinationId="clusters"
          applications={applications}
          collapsed
          onNavigate={() => undefined}
          onOpenApplicationChange={() => undefined}
          openApplicationId="foundry"
        >
          <main>Consumer surface</main>
        </ApplicationNavigationShell>,
      );
    });

    expect(container.querySelector("[data-cc-navigation-rail]")).toBeTruthy();
    expect(container.querySelector("[data-app-navigation-panel]")).toBeTruthy();
    expect(container.textContent).toContain("Consumer surface");
  });
});
