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
    defaultDestinationId: "services",
    subApplications: [
      {
        id: "build",
        label: "Build",
        destinations: [
          { id: "services", label: "Services", href: "/app/foundry/services" },
          { id: "clusters", label: "Clusters", href: "/app/foundry/clusters" },
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
    href: "/app/ai",
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

    const items = Array.from(
      container.querySelectorAll<HTMLElement>(
        "[data-cc-navigation-application]",
      ),
    );
    expect(items[0]?.tagName).toBe("A");
    expect(items[0]?.getAttribute("href")).toBe("/app/foundry/services");
    expect(items[1]?.getAttribute("href")).toBe("/app/ai");

    await act(async () => items[0]!.click());
    expect(onOpenChange).toHaveBeenCalledWith("foundry");

    let preventedBeforeNativeFallback: boolean | undefined;
    document.addEventListener("click", (event) => {
      preventedBeforeNativeFallback = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    await act(async () => {
      items[0]!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      }));
    });
    expect(preventedBeforeNativeFallback).toBe(false);
    expect(onOpenChange).toHaveBeenCalledOnce();

    items[0]!.focus();
    await act(async () => {
      items[0]!.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "ArrowDown",
      }));
    });
    expect(document.activeElement).toBe(items[1]);
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
          activeDestinationId="services"
          application={applications[0]!}
          onClose={onClose}
          onNavigate={onNavigate}
        />,
      );
    });

    const serviceLink = Array.from(container.querySelectorAll("a"))
      .find((link) => link.textContent === "Services");
    expect(serviceLink?.getAttribute("aria-current")).toBe("page");
    expect(serviceLink?.getAttribute("href")).toBe("/app/foundry/services");
    expect(container.textContent).toContain("Build");
    expect(container.textContent).toContain("Ship");
    expect(container.textContent).toContain("Unavailable");

    await act(async () => serviceLink!.click());
    expect(onNavigate).toHaveBeenCalledWith({
      applicationId: "foundry",
      destinationId: "services",
      subApplicationId: "build",
    });

    await act(async () => {
      serviceLink!.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Escape",
      }));
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(["metaKey", "ctrlKey"] as const)(
    "leaves %s destination clicks to the browser",
    async (modifier) => {
      const onNavigate = vi.fn();
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.push(root);

      await act(async () => {
        root.render(
          <ApplicationNavigationPanel
            application={applications[0]!}
            onNavigate={onNavigate}
          />,
        );
      });

      const serviceLink = Array.from(container.querySelectorAll("a"))
        .find((link) => link.textContent === "Services")!;
      let preventedBeforeNativeFallback: boolean | undefined;
      const recordAndCancelNativeFallback = (event: MouseEvent) => {
        preventedBeforeNativeFallback = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener("click", recordAndCancelNativeFallback, {
        once: true,
      });

      await act(async () => {
        serviceLink.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          [modifier]: true,
        }));
      });

      expect(preventedBeforeNativeFallback).toBe(false);
      expect(onNavigate).not.toHaveBeenCalled();
    },
  );

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
