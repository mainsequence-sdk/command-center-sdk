// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationNavigationDrawer, ApplicationNavigationTrigger } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function hostNavigation() {
  return (
    <nav aria-label="Host applications">
      <a href="/app/foundry">Foundry</a>
      <a href="/app/marketplace">Marketplace</a>
    </nav>
  );
}

/** A host frame: its own top bar with the trigger, an embedded site, and the drawer. */
function HostFrame({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    onOpenChange?.(next);
    setOpen(next);
  };

  return (
    <>
      <header>
        <ApplicationNavigationTrigger controlsId="host-menu" onOpenChange={change} open={open} />
      </header>
      <iframe title="Embedded site" />
      <ApplicationNavigationDrawer id="host-menu" onOpenChange={change} open={open}>
        {hostNavigation()}
      </ApplicationNavigationDrawer>
    </>
  );
}

describe("host navigation drawer (SDK ADR 010)", () => {
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

  it("renders nothing while closed", () => {
    const html = renderToStaticMarkup(
      <ApplicationNavigationDrawer id="host-menu" onOpenChange={() => undefined} open={false}>
        {hostNavigation()}
      </ApplicationNavigationDrawer>,
    );
    expect(html).toBe("");
  });

  it("renders the host's navigation in a named modal dialog over a scrim", () => {
    const html = renderToStaticMarkup(
      <ApplicationNavigationDrawer
        className="host-drawer"
        data-shell-sidebar=""
        id="host-menu"
        label="Command Center navigation"
        onOpenChange={() => undefined}
        open
        style={{ inlineSize: "18rem" }}
      >
        {hostNavigation()}
      </ApplicationNavigationDrawer>,
    );
    const view = document.createElement("div");
    view.innerHTML = html;
    const drawer = view.querySelector<HTMLElement>("[data-cc-navigation-drawer]")!;

    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    expect(drawer.getAttribute("aria-label")).toBe("Command Center navigation");
    expect(drawer.id).toBe("host-menu");
    expect(drawer.getAttribute("data-theme-chrome")).toBe("sidebar");
    // Host attributes pass through; the SDK class and the dialog semantics cannot be overridden.
    expect(drawer.className).toBe("cc-application-navigation-drawer host-drawer");
    expect(drawer.hasAttribute("data-shell-sidebar")).toBe(true);
    expect(drawer.style.inlineSize).toBe("18rem");
    expect(drawer.textContent).toContain("Foundry");

    const scrim = view.querySelector<HTMLElement>("[data-cc-navigation-scrim]")!;
    expect(scrim.getAttribute("aria-hidden")).toBe("true");
    expect(scrim.className).toBe("cc-application-navigation-drawer__scrim");
    // No SDK navigation is rendered inside: the host owns the content.
    expect(view.querySelector("[data-cc-navigation-rail]")).toBeNull();
    expect(view.querySelector("[data-cc-navigation-depth]")).toBeNull();
  });

  it("moves focus into the drawer, locks scroll, and restores both on close", async () => {
    const { container } = await mount(<HostFrame />);
    const trigger = container.querySelector<HTMLButtonElement>("[data-cc-navigation-trigger]")!;
    trigger.focus();

    await act(async () => trigger.click());
    const drawer = container.querySelector<HTMLElement>("[data-cc-navigation-drawer]")!;
    expect(trigger.getAttribute("aria-controls")).toBe(drawer.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Foundry");
    expect(document.body.style.position).toBe("fixed");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(container.querySelector("[data-cc-navigation-drawer]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.position).toBe("");
  });

  it("keeps Tab inside the drawer", async () => {
    const { container } = await mount(<HostFrame />);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-cc-navigation-trigger]")!.click();
    });
    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("[data-cc-navigation-drawer] a"),
    );

    links[links.length - 1]!.focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    });
    expect(document.activeElement).toBe(links[0]);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: true }),
      );
    });
    expect(document.activeElement).toBe(links[links.length - 1]);
  });

  it("dismisses from the scrim and from a pointer press outside the drawer", async () => {
    const onOpenChange = vi.fn();
    const { container } = await mount(
      <ApplicationNavigationDrawer id="host-menu" onOpenChange={onOpenChange} open>
        {hostNavigation()}
      </ApplicationNavigationDrawer>,
    );

    await act(async () => {
      container.querySelector<HTMLElement>("[data-cc-navigation-scrim]")!.click();
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    onOpenChange.mockClear();
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    await act(async () => {
      container
        .querySelector<HTMLElement>("[data-cc-navigation-drawer] a")!
        .dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("stays controlled: a dismissal only reports, the host decides", async () => {
    const onOpenChange = vi.fn();
    const { container } = await mount(
      <ApplicationNavigationDrawer id="host-menu" onOpenChange={onOpenChange} open>
        {hostNavigation()}
      </ApplicationNavigationDrawer>,
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(container.querySelector("[data-cc-navigation-drawer]")).not.toBeNull();
  });
});
