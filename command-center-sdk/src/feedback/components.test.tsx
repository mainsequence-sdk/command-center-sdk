import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivityIndicator,
  ApplicationStatusScreen,
  ProgressStageList,
} from "./index.js";

describe("application feedback primitives", () => {
  it("renders truth-based stage states, elapsed time, and active details", () => {
    const html = renderToStaticMarkup(
      <ApplicationStatusScreen
        eyebrow="Runtime startup"
        message="Attaching shared runtime."
        stages={[
          {
            id: "core",
            label: "Core data",
            description: "Attached the baseline schema.",
            status: "complete",
            elapsedSeconds: 1.25,
            details: [{ id: "old", label: "PreviousSchema" }],
          },
          {
            id: "pricing",
            label: "Pricing",
            description: "Resolving registered models.",
            status: "active",
            statusLabel: "Attaching",
            elapsedSeconds: 62,
            details: [{ id: "curve", label: "CurveSchema" }],
          },
        ]}
        title="Preparing analytics"
      />,
    );

    expect(html).toContain("data-cc-application-status-screen");
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Application progress"');
    expect(html).toContain("Complete · 1.3s");
    expect(html).toContain("Attaching · 1m 2s");
    expect(html).toContain("CurveSchema");
    expect(html).not.toContain("PreviousSchema");
  });

  it("renders a contained error with one assertive announcement and retry action", () => {
    const html = renderToStaticMarkup(
      <ApplicationStatusScreen
        action={{ label: "Retry startup", onSelect: () => undefined }}
        as="section"
        message="The runtime did not become ready."
        state="error"
        title="Analytics could not start"
        titleAs="h2"
        variant="contained"
      />,
    );

    expect(html.startsWith("<section")).toBe(true);
    expect(html).toContain('data-variant="contained"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("<h2");
    expect(html).toContain("Retry startup");
  });

  it("supports empty progress discovery and accessible standalone activity", () => {
    const progress = renderToStaticMarkup(
      <ProgressStageList emptyMessage="Discovering runtime stages." stages={[]} />,
    );
    const indicator = renderToStaticMarkup(
      <ActivityIndicator label="Refreshing data" size="large" />,
    );

    expect(progress).toContain("Discovering runtime stages.");
    expect(indicator).toContain('aria-label="Refreshing data"');
    expect(indicator).toContain('role="status"');
    expect(createElement(ApplicationStatusScreen, { title: "Preparing" })).toBeTruthy();
  });
});
