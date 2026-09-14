// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCommandCenterApplicationShell,
  CommandCenterApplicationShellError,
  verifyCommandCenterApplicationShell,
} from "./index.js";

const page = {
  evaluate: async <Result, Argument>(
    pageFunction: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ) => pageFunction(argument),
};

describe("application shell conformance", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts a startup viewport gate with application content unmounted", async () => {
    document.body.innerHTML = `
      <section data-cc-application-status-screen data-variant="viewport">Connecting</section>
    `;

    const report = await verifyCommandCenterApplicationShell(page, {
      navigationDepth: 1,
      phase: "startup",
    });

    expect(report.ok).toBe(true);
    expect(report.measurements.viewportStatusCount).toBe(1);
  });

  it("accepts exactly one ready shell at the declared navigation depth", async () => {
    document.body.innerHTML = `
      <div data-cc-navigation-depth="1">
        <main data-cc-application-page>Ready</main>
      </div>
    `;

    await expect(assertCommandCenterApplicationShell(page, {
      navigationDepth: 1,
      phase: "ready",
    })).resolves.toMatchObject({ ok: true });
  });

  it("rejects child top navigation and a mismatched shell depth", async () => {
    document.body.innerHTML = `
      <header data-theme-chrome="topbar">Duplicate host chrome</header>
      <div data-cc-navigation-depth="2"><main data-cc-application-page /></div>
    `;

    const promise = assertCommandCenterApplicationShell(page, {
      navigationDepth: 1,
      phase: "ready",
    });

    await expect(promise).rejects.toBeInstanceOf(CommandCenterApplicationShellError);
    await expect(promise).rejects.toMatchObject({
      report: {
        violations: expect.arrayContaining([
          expect.objectContaining({ code: "child-top-navigation" }),
          expect.objectContaining({ code: "navigation-depth" }),
        ]),
      },
    });
  });

  it("rejects route content mounted behind the startup gate", async () => {
    document.body.innerHTML = `
      <section data-cc-application-status-screen data-variant="viewport">Connecting</section>
      <main data-cc-application-page>Too early</main>
    `;

    const report = await verifyCommandCenterApplicationShell(page, {
      navigationDepth: 0,
      phase: "startup",
    });

    expect(report.ok).toBe(false);
    expect(report.violations).toContainEqual(expect.objectContaining({ code: "startup-content" }));
  });

  it("rejects a ready phase without one application page", async () => {
    const report = await verifyCommandCenterApplicationShell(page, {
      navigationDepth: 0,
      phase: "ready",
    });

    expect(report.ok).toBe(false);
    expect(report.violations).toContainEqual(expect.objectContaining({ code: "ready-content" }));
  });
});
