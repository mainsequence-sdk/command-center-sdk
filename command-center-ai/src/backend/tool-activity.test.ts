import { describe, expect, it } from "vitest";

import {
  describeStreamedToolCallStatus,
  describeToolActivity,
  describeToolInput,
  describeToolStatus,
  followStreamedToolCall,
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
      application: null,
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
      application: null,
    });
    expect(describeToolActivity("mainsequence__").kind).toBe("builtin");
    expect(describeToolActivity(undefined).displayName).toBe("tool");
  });

  it("names an application's tool from the call's arguments while it runs", () => {
    const args = { tool: "list_namespaces", arguments: { limit: 500 } };
    const activity = describeToolActivity("metatables__call_tool", undefined, args);
    expect(activity).toEqual({
      kind: "mcp",
      toolName: "metatables__call_tool",
      displayName: "list_namespaces",
      providerLabel: "metatables",
      mcpToolName: "list_namespaces",
      application: { name: "metatables", operation: "call_tool" },
    });
    expect(describeToolInput(activity, args)).toEqual({ limit: 500 });
    expect(describeToolInput(activity, { tool: "list_namespaces" })).toEqual({});
  });

  it("names an application's tool from the result once it ran", () => {
    const activity = describeToolActivity(
      "metatables__call_tool",
      {
        content: [{ type: "text", text: "[]" }],
        details: { mcp_tool: "list_namespaces", is_error: false, application: "metatables" },
      },
      { tool: "list_namespaces", arguments: {} },
    );
    expect(activity.displayName).toBe("list_namespaces");
    expect(activity.providerLabel).toBe("metatables");
  });

  it("keeps the envelope when an application call names no tool", () => {
    const activity = describeToolActivity("metatables__call_tool", undefined, { arguments: {} });
    expect(activity.kind).toBe("mcp");
    expect(activity.displayName).toBe("call_tool");
    expect(activity.mcpToolName).toBeNull();
    expect(describeToolInput(activity, { arguments: {} })).toEqual({ arguments: {} });
    expect(describeToolStatus(activity, "running")).toBe("Using a metatables MCP tool");
    expect(describeToolStatus(activity, "done")).toBe("Used a metatables MCP tool");
    expect(describeToolStatus(activity, "failed")).toBe("A metatables MCP tool failed");
  });

  it("recognises an application's tool listing", () => {
    const activity = describeToolActivity("my_app__list_tools");
    expect(activity).toEqual({
      kind: "mcp",
      toolName: "my_app__list_tools",
      displayName: "list_tools",
      providerLabel: "my_app",
      mcpToolName: null,
      application: { name: "my_app", operation: "list_tools" },
    });
    expect(describeToolInput(activity, {})).toEqual({});
    expect(describeToolStatus(activity, "running")).toBe("Listing my_app MCP tools");
    expect(describeToolStatus(activity, "done")).toBe("Listed my_app MCP tools");
    expect(describeToolStatus(activity, "failed")).toBe("Listing my_app MCP tools failed");
  });

  it("keeps Main Sequence MCP tools named like an application's", () => {
    const activity = describeToolActivity("mainsequence__call_tool", undefined, { tool: "x" });
    expect(activity.application).toBeNull();
    expect(activity.displayName).toBe("call_tool");
    expect(activity.providerLabel).toBe("Main Sequence MCP");
    expect(describeToolInput(activity, { tool: "x" })).toEqual({ tool: "x" });
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
    const application = describeToolActivity("metatables__call_tool", undefined, {
      tool: "list_namespaces",
    });
    expect(describeToolStatus(application, "running")).toBe(
      "Using metatables MCP tool list_namespaces",
    );
    expect(describeToolStatus(application, "done")).toBe("Used metatables MCP tool list_namespaces");
    expect(describeToolStatus(application, "failed")).toBe(
      "metatables MCP tool list_namespaces failed",
    );
  });

  it("follows a streamed call until its arguments name the application's tool", () => {
    const start = followStreamedToolCall(null, "tool-call-start", {
      type: "tool-call-start",
      toolCallId: "call-1",
      toolName: "metatables__call_tool",
    });
    expect(start).not.toBeNull();
    expect(describeStreamedToolCallStatus(start!)).toBe("Using a metatables MCP tool");

    const partial = followStreamedToolCall(start, "tool-call-delta", {
      type: "tool-call-delta",
      toolCallId: "call-1",
      argsText: '{"tool":"list_names',
    });
    expect(describeStreamedToolCallStatus(partial!)).toBe("Using a metatables MCP tool");

    const complete = followStreamedToolCall(partial, "tool-call-delta", {
      type: "tool-call-delta",
      toolCallId: "call-1",
      argsText: 'paces","arguments":{"limit":500}}',
    });
    expect(describeStreamedToolCallStatus(complete!)).toBe(
      "Using metatables MCP tool list_namespaces",
    );
    // The first chunk's call is left as it was.
    expect(start!.argsText).toBe("");

    expect(
      followStreamedToolCall(complete, "tool-call-delta", {
        type: "tool-call-delta",
        toolCallId: "call-2",
        argsText: "{}",
      }),
    ).toBeNull();
    expect(followStreamedToolCall(complete, "tool-result", { toolCallId: "call-1" })).toBeNull();
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
    expect(
      summarizeToolActivities([
        describeToolActivity("metatables__list_tools"),
        describeToolActivity("metatables__call_tool", undefined, { tool: "list_namespaces" }),
      ]),
    ).toBe("2 MCP tools");
  });
});
