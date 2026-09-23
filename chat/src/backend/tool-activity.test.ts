import { describe, expect, it } from "vitest";

import {
  describeToolActivity,
  describeToolStatus,
  summarizeToolActivities,
} from "./tool-activity.js";

describe("tool activity", () => {
  it("recognises Main Sequence MCP tools by the runtime's prefix", () => {
    expect(describeToolActivity("mainsequence__code_repository_list")).toEqual({
      kind: "mcp",
      toolName: "mainsequence__code_repository_list",
      displayName: "code_repository_list",
      providerLabel: "Main Sequence MCP",
      mcpToolName: "code_repository_list",
    });
  });

  it("prefers the canonical MCP name the result carries", () => {
    const activity = describeToolActivity("mainsequence__code_repository_list", {
      content: [],
      details: { mcp_tool: "code_repository.list", is_error: false },
    });
    expect(activity.kind).toBe("mcp");
    expect(activity.displayName).toBe("code_repository.list");
  });

  it("keeps built-in tools plain", () => {
    expect(describeToolActivity("web_search")).toEqual({
      kind: "builtin",
      toolName: "web_search",
      displayName: "web_search",
      providerLabel: null,
      mcpToolName: null,
    });
    expect(describeToolActivity("mainsequence__").kind).toBe("builtin");
    expect(describeToolActivity(undefined).displayName).toBe("tool");
  });

  it("writes the status lines", () => {
    const mcp = describeToolActivity("mainsequence__a2a_send_message");
    expect(describeToolStatus(mcp, "running")).toBe("Using MCP tool a2a_send_message");
    expect(describeToolStatus(mcp, "done")).toBe("Used MCP tool a2a_send_message");
    expect(describeToolStatus(mcp, "failed")).toBe("MCP tool a2a_send_message failed");
    const builtin = describeToolActivity("bash");
    expect(describeToolStatus(builtin, "running")).toBe("Running bash");
    expect(describeToolStatus(builtin, "done")).toBe("Used bash");
    expect(describeToolStatus(builtin, "failed")).toBe("bash failed");
  });

  it("summarises tool use for a header", () => {
    expect(summarizeToolActivities([])).toBeNull();
    expect(summarizeToolActivities([describeToolActivity("bash")])).toBe("1 tool");
    expect(summarizeToolActivities([describeToolActivity("mainsequence__x")])).toBe("1 MCP tool");
    expect(
      summarizeToolActivities([
        describeToolActivity("bash"),
        describeToolActivity("mainsequence__x"),
        describeToolActivity("mainsequence__y"),
      ]),
    ).toBe("3 tools · 2 MCP");
  });
});
