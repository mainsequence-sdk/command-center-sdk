import { describe, expect, it } from "vitest";

import type { CommandCenterAgentIcon } from "../backend/command-center-agent-icons-api.js";
import { decodeToolSignal, encodeToolSignal, resolveAgentIconPose } from "./agent-icon-pose.js";

const icon: CommandCenterAgentIcon = {
  agentUid: "a1",
  rendering: "color",
  imageRendering: "pixelated",
  url: "https://api.test/icon/",
  poses: {
    thinking: "https://api.test/icon/thinking/",
    working: "https://api.test/icon/working/",
    error: "https://api.test/icon/error/",
    reading: "https://api.test/icon/reading/",
  },
  toolPoses: { tutorial_api: "reading" },
};

describe("resolveAgentIconPose", () => {
  it("shows the application's pose while its tool runs, and working for other tools", () => {
    expect(resolveAgentIconPose(icon, { thinking: true, tool: { application: "tutorial_api", phase: "running" } })).toBe(
      "reading",
    );
    expect(resolveAgentIconPose(icon, { thinking: true, tool: { application: "orders", phase: "running" } })).toBe(
      "working",
    );
    expect(resolveAgentIconPose(icon, { thinking: true, tool: { application: null, phase: "running" } })).toBe(
      "working",
    );
  });

  it("follows the run: error after a failed tool or run, thinking otherwise, idle when not working", () => {
    expect(resolveAgentIconPose(icon, { thinking: true, tool: { application: "tutorial_api", phase: "failed" } })).toBe(
      "error",
    );
    expect(resolveAgentIconPose(icon, { thinking: false, tool: null, failed: true })).toBe("error");
    expect(resolveAgentIconPose(icon, { thinking: true, tool: { application: "tutorial_api", phase: "done" } })).toBe(
      "thinking",
    );
    expect(resolveAgentIconPose(icon, null)).toBeNull();
    expect(resolveAgentIconPose(icon, { thinking: false, tool: null })).toBeNull();
  });

  it("falls back to idle when a pose is not declared", () => {
    const bare: CommandCenterAgentIcon = { agentUid: "a2", rendering: "color", url: "https://api.test/icon/" };
    expect(resolveAgentIconPose(bare, { thinking: true, tool: { application: "tutorial_api", phase: "running" } })).toBeNull();
    expect(resolveAgentIconPose(bare, { thinking: true, tool: null })).toBeNull();
  });

  it("round-trips tool signals through their string form", () => {
    const signal = { application: "tutorial_api", phase: "running" } as const;
    expect(decodeToolSignal(encodeToolSignal(signal))).toEqual(signal);
    expect(decodeToolSignal(encodeToolSignal({ application: null, phase: "failed" }))).toEqual({
      application: null,
      phase: "failed",
    });
    expect(decodeToolSignal("")).toBeNull();
    expect(decodeToolSignal("waiting:x")).toBeNull();
  });
});
