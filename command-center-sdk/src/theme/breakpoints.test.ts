import { describe, expect, it } from "vitest";

import {
  commandCenterBreakpointOrder,
  commandCenterBreakpoints,
  isCommandCenterBreakpointAtLeast,
  resolveCommandCenterBreakpoint,
} from "./breakpoints.js";

describe("command center breakpoints", () => {
  it("publishes the sm, md, and lg scale in CSS pixels", () => {
    expect(commandCenterBreakpoints).toEqual({ sm: 640, md: 768, lg: 1024 });
    expect(Object.isFrozen(commandCenterBreakpoints)).toBe(true);
    expect(commandCenterBreakpointOrder).toEqual(["xs", "sm", "md", "lg"]);
  });

  it("resolves a width to its band with inclusive lower boundaries", () => {
    expect(resolveCommandCenterBreakpoint(320)).toBe("xs");
    expect(resolveCommandCenterBreakpoint(639)).toBe("xs");
    expect(resolveCommandCenterBreakpoint(640)).toBe("sm");
    expect(resolveCommandCenterBreakpoint(767)).toBe("sm");
    expect(resolveCommandCenterBreakpoint(768)).toBe("md");
    expect(resolveCommandCenterBreakpoint(1023)).toBe("md");
    expect(resolveCommandCenterBreakpoint(1024)).toBe("lg");
    expect(resolveCommandCenterBreakpoint(1280)).toBe("lg");
  });

  it("treats non-finite widths as the narrowest band", () => {
    expect(resolveCommandCenterBreakpoint(Number.NaN)).toBe("xs");
    expect(resolveCommandCenterBreakpoint(Number.NEGATIVE_INFINITY)).toBe("xs");
  });

  it("compares bands on the published order", () => {
    expect(isCommandCenterBreakpointAtLeast("md", "sm")).toBe(true);
    expect(isCommandCenterBreakpointAtLeast("sm", "sm")).toBe(true);
    expect(isCommandCenterBreakpointAtLeast("xs", "sm")).toBe(false);
  });
});
