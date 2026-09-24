/**
 * Describes a tool the agent used so the chat can say what it was.
 *
 * The Agent runtime registers every tool it gets from the platform's MCP gateway
 * under the `mainsequence__<mcp name>` prefix and
 * returns `details.mcp_tool` with the canonical MCP name in the result. Both
 * signals mean the same thing: this call went through the Main Sequence MCP.
 * Built-in tools (read, write, bash, web_search, runtime_info, ...) carry no
 * prefix.
 */
export const MAIN_SEQUENCE_MCP_TOOL_PREFIX = "mainsequence__";
export const MAIN_SEQUENCE_MCP_PROVIDER_LABEL = "Main Sequence MCP";

export type ToolActivityKind = "mcp" | "builtin";
export type ToolActivityPhase = "running" | "done" | "failed";

export interface ToolActivity {
  kind: ToolActivityKind;
  /** The tool name as the runtime reported it. */
  toolName: string;
  /** What the user reads: the canonical MCP name, or the tool name. */
  displayName: string;
  /** Who provided the tool, when it is worth saying. */
  providerLabel: string | null;
  /** The canonical MCP tool name when the call went through the MCP. */
  mcpToolName: string | null;
}

function readMcpToolNameFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const name = (details as { mcp_tool?: unknown }).mcp_tool;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function describeToolActivity(toolName: unknown, result?: unknown): ToolActivity {
  const name = typeof toolName === "string" ? toolName.trim() : "";
  const fromResult = readMcpToolNameFromResult(result);
  const fromPrefix =
    name.startsWith(MAIN_SEQUENCE_MCP_TOOL_PREFIX) &&
    name.length > MAIN_SEQUENCE_MCP_TOOL_PREFIX.length
      ? name.slice(MAIN_SEQUENCE_MCP_TOOL_PREFIX.length)
      : null;
  const mcpToolName = fromResult ?? fromPrefix;
  if (mcpToolName) {
    return {
      kind: "mcp",
      toolName: name,
      displayName: mcpToolName,
      providerLabel: MAIN_SEQUENCE_MCP_PROVIDER_LABEL,
      mcpToolName,
    };
  }
  return {
    kind: "builtin",
    toolName: name,
    displayName: name || "tool",
    providerLabel: null,
    mcpToolName: null,
  };
}

/** One line for a status row or a collapsed header. */
export function describeToolStatus(activity: ToolActivity, phase: ToolActivityPhase): string {
  const subject =
    activity.kind === "mcp" ? `MCP tool ${activity.displayName}` : activity.displayName;
  switch (phase) {
    case "running":
      return activity.kind === "mcp" ? `Using ${subject}` : `Running ${subject}`;
    case "failed":
      return `${subject} failed`;
    default:
      return `Used ${subject}`;
  }
}

/** "3 tools · 2 MCP" for a header, or null when nothing ran. */
export function summarizeToolActivities(activities: ReadonlyArray<ToolActivity>): string | null {
  if (activities.length === 0) {
    return null;
  }
  const mcpCount = activities.filter((activity) => activity.kind === "mcp").length;
  const total = activities.length;
  const tools = `${total} ${total === 1 ? "tool" : "tools"}`;
  if (mcpCount === 0) {
    return tools;
  }
  if (mcpCount === total) {
    return total === 1 ? "1 MCP tool" : `${total} MCP tools`;
  }
  return `${tools} · ${mcpCount} MCP`;
}
