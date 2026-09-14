// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationImmersiveBar, ApplicationNavigationTrigger } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ApplicationImmersiveBar", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
  });

  it("renders theme chrome, a titled header, and a host trailing slot", () => {
    const html = renderToStaticMarkup(
      <ApplicationImmersiveBar
        backHref="/app/home"
        backLabel="Command Center"
        title="Risk report"
        trailing={<ApplicationNavigationTrigger controlsId="menu" open={false} onOpenChange={() => undefined} />}
      />,
    );
    expect(html).toContain("data-cc-immersive-bar");
    expect(html).toContain('data-theme-chrome="topbar"');
    expect(html).toContain('href="/app/home"');
    expect(html).toContain("Command Center");
    expect(html).toContain("Risk report");
    expect(html).toContain("data-cc-navigation-trigger");
    expect(html).toMatch(/aria-labelledby="([^"]+)"[\s\S]*id="\1"/u);
  });

  it("delivers only unmodified primary clicks to onBack and keeps modified clicks native", async () => {
    const onBack = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ApplicationImmersiveBar backHref="/app/home" onBack={onBack} title="Site" />);
    });
    const back = container.querySelector<HTMLAnchorElement>("[data-cc-immersive-back]")!;
    expect(back.tagName).toBe("A");

    await act(async () => back.click());
    expect(onBack).toHaveBeenCalledOnce();

    let prevented: boolean | undefined;
    document.addEventListener("click", (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    await act(async () => {
      back.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    });
    expect(prevented).toBe(false);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("renders a button when there is no href", async () => {
    const onBack = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<ApplicationImmersiveBar onBack={onBack} title="Site" />);
    });
    const back = container.querySelector<HTMLButtonElement>("[data-cc-immersive-back]")!;
    expect(back.tagName).toBe("BUTTON");
    expect(back.getAttribute("type")).toBe("button");
    await act(async () => back.click());
    expect(onBack).toHaveBeenCalledOnce();
  });
});
