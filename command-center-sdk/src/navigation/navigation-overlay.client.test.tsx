// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationNavigationShell,
  ApplicationNavigationTrigger,
  type NavigationApplicationDefinition,
} from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    ],
  },
];

function shell(props: Partial<React.ComponentProps<typeof ApplicationNavigationShell>>) {
  return (
    <ApplicationNavigationShell
      activeApplicationId="foundry"
      activeDestinationId="services"
      applications={applications}
      collapsed
      onNavigate={() => undefined}
      onOpenApplicationChange={() => undefined}
      openApplicationId="foundry"
      {...props}
    >
      <main>
        <button type="button">Content action</button>
      </main>
    </ApplicationNavigationShell>
  );
}

describe("application navigation overlay presentation", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
  });

  async function mount(element: React.ReactElement) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(element);
    });
    return { container, root };
  }

  it("keeps the docked presentation as the default and publishes the rail width", () => {
    const html = renderToStaticMarkup(shell({}));
    expect(html).toContain('data-cc-presentation="docked"');
    expect(html).toContain("--application-navigation-rail-width:52px");
    expect(html).not.toContain("cc-application-navigation-shell__drawer");
    expect(html).toContain("data-cc-navigation-rail");
    expect(html).toContain("data-app-navigation-panel");
  });

  it("renders nothing but content while the overlay menu is closed", () => {
    const html = renderToStaticMarkup(shell({ presentation: "overlay" }));
    expect(html).toContain('data-cc-presentation="overlay"');
    expect(html).not.toContain("data-cc-navigation-rail");
    expect(html).not.toContain("data-cc-navigation-scrim");
    expect(html).toContain("Content action");
  });

  it("opens an accessible drawer with the rail expanded, traps focus, and locks scroll", async () => {
    const onMenuOpenChange = vi.fn();
    const { container } = await mount(
      shell({ menuId: "primary-menu", menuOpen: true, onMenuOpenChange, presentation: "overlay" }),
    );

    const drawer = container.querySelector<HTMLElement>("[data-cc-navigation-drawer]")!;
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    expect(drawer.id).toBe("primary-menu");
    expect(container.querySelector(".cc-application-rail--collapsed")).toBeNull();
    expect(container.querySelector(".cc-application-rail__label")?.textContent).toBe("Foundry");
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(document.body.style.position).toBe("fixed");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onMenuOpenChange).toHaveBeenCalledWith(false);

    await act(async () => {
      container.querySelector<HTMLElement>("[data-cc-navigation-scrim]")!.click();
    });
    expect(onMenuOpenChange).toHaveBeenCalledTimes(2);
  });

  it("closes the drawer after a destination is chosen and restores scrolling", async () => {
    const onMenuOpenChange = vi.fn();
    const onNavigate = vi.fn();
    const { container, root } = await mount(
      shell({ menuOpen: true, onMenuOpenChange, onNavigate, presentation: "overlay" }),
    );

    const clusters = Array.from(container.querySelectorAll("a"))
      .find((link) => link.textContent === "Clusters")!;
    await act(async () => clusters.click());
    expect(onNavigate).toHaveBeenCalledWith({
      applicationId: "foundry",
      destinationId: "clusters",
      subApplicationId: "build",
    });
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      root.render(shell({ menuOpen: false, onMenuOpenChange, onNavigate, presentation: "overlay" }));
    });
    expect(container.querySelector("[data-cc-navigation-drawer]")).toBeNull();
    expect(document.body.style.position).toBe("");
  });

  it("wires the trigger to the drawer id and open state", async () => {
    const onOpenChange = vi.fn();
    const { container, root } = await mount(
      <ApplicationNavigationTrigger controlsId="primary-menu" open={false} onOpenChange={onOpenChange} />,
    );
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-controls")).toBe("primary-menu");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Open navigation menu");
    await act(async () => button.click());
    expect(onOpenChange).toHaveBeenCalledWith(true);

    await act(async () => {
      root.render(
        <ApplicationNavigationTrigger controlsId="primary-menu" open onOpenChange={onOpenChange} />,
      );
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Close navigation menu");
  });
});
