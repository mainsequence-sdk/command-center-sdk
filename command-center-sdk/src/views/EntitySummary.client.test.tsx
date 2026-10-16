// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { EntitySummary } from "./EntitySummary.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("EntitySummary field information", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
  });

  it("opens a field's info on tap instead of relying on a hover title", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(
        <EntitySummary
          summary={{
            entity: { id: "svc-1", type: "service", title: "Pricing" },
            badges: [],
            inline_fields: [],
            highlight_fields: [
              { key: "sla", label: "SLA", value: "99.9%", info: "Rolling 30-day availability." },
            ],
            stats: [],
          }}
        />,
      );
    });

    const toggle = container.querySelector<HTMLButtonElement>("button.cc-entity-summary__info")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("About SLA");
    expect(container.querySelector(".cc-entity-summary__info-note")).toBeNull();

    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".cc-entity-summary__info-note")?.textContent).toBe(
      "Rolling 30-day availability.",
    );

    await act(async () => toggle.click());
    expect(container.querySelector(".cc-entity-summary__info-note")).toBeNull();
  });

  it("puts the title lead before the title and leaves the title alone without one", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const summary = {
      entity: { id: "agent-1", type: "agent", title: "Tutorial Helper" },
      badges: [],
      inline_fields: [],
      highlight_fields: [],
      stats: [],
    };

    await act(async () => {
      root.render(<EntitySummary summary={summary} titleLead={<img alt="" data-testid="lead" />} />);
    });
    const heading = container.querySelector(".cc-entity-summary__heading")!;
    expect(heading.firstElementChild?.className).toBe("cc-entity-summary__title-lead");
    expect(heading.querySelector("[data-testid='lead']")).not.toBeNull();
    expect(heading.querySelector("h2")?.textContent).toBe("Tutorial Helper");

    await act(async () => {
      root.render(<EntitySummary summary={summary} />);
    });
    expect(container.querySelector(".cc-entity-summary__heading")).toBeNull();
    expect(container.querySelector(".cc-entity-summary__identity > h2")?.textContent).toBe("Tutorial Helper");
  });
});
