/**
 * Describes a tool the agent used so the chat can say what it was.
 *
 * The Agent runtime registers every tool it gets from the platform's MCP server
 * under the `mainsequence__<mcp name>` prefix and returns `details.mcp_tool`
 * with the canonical MCP name in the result. Both signals mean the same thing:
 * this call went through the Main Sequence MCP. Built-in tools (read, write,
 * bash, web_search, runtime_info, ...) carry no prefix.
 *
 * Each application an Agent declares (ms-tau ADR 0021, section 4) reaches the
 * model as two tools: `<name>__list_tools` reads the application's tools, and
 * `<name>__call_tool` calls one of them with `{ tool, arguments }`. The call's
 * result returns the same tool name as `details.mcp_tool`. The chat names the
 * application's tool, from the arguments while the call runs and from the
 * result afterwards, never the runtime's `call_tool` envelope.
 */
export const MAIN_SEQUENCE_MCP_TOOL_PREFIX = "mainsequence__";
export const MAIN_SEQUENCE_MCP_PROVIDER_LABEL = "Main Sequence MCP";

// ms-tau's application names: `^[a-z][a-z0-9_]{0,39}$`, `mainsequence` reserved.
const APPLICATION_TOOL_NAME = /^([a-z][a-z0-9_]{0,39})__(call_tool|list_tools)$/;

export type ToolActivityKind = "mcp" | "builtin";
export type ToolActivityPhase = "running" | "done" | "failed";

export interface ToolActivityApplication {
  /** The application's name, as the Agent declares it. */
  name: string;
  /** `call_tool` calls one of the application's tools; `list_tools` lists them. */
  operation: "call_tool" | "list_tools";
}

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
  /** The declared application whose MCP endpoint the call went to, or null. */
  application: ToolActivityApplication | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMcpToolNameFromResult(result: unknown): string | null {
  if (!isRecord(result) || !isRecord(result.details)) {
    return null;
  }
  const name = result.details.mcp_tool;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function readApplication(name: string): ToolActivityApplication | null {
  if (name.startsWith(MAIN_SEQUENCE_MCP_TOOL_PREFIX)) {
    return null;
  }
  const match = APPLICATION_TOOL_NAME.exec(name);
  return match ? { name: match[1], operation: match[2] as ToolActivityApplication["operation"] } : null;
}

function readApplicationToolFromArgs(args: unknown): string | null {
  if (!isRecord(args)) {
    return null;
  }
  return typeof args.tool === "string" && args.tool.trim() ? args.tool.trim() : null;
}

/**
 * Names the tool a call used. Pass the call's arguments when they are known:
 * an application's `call_tool` names its tool there before any result exists.
 */
export function describeToolActivity(
  toolName: unknown,
  result?: unknown,
  args?: unknown,
): ToolActivity {
  const name = typeof toolName === "string" ? toolName.trim() : "";
  const fromResult = readMcpToolNameFromResult(result);
  const application = readApplication(name);
  if (application) {
    const mcpToolName =
      application.operation === "call_tool"
        ? (fromResult ?? readApplicationToolFromArgs(args))
        : null;
    return {
      kind: "mcp",
      toolName: name,
      displayName: mcpToolName ?? application.operation,
      providerLabel: application.name,
      mcpToolName,
      application,
    };
  }
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
      application: null,
    };
  }
  return {
    kind: "builtin",
    toolName: name,
    displayName: name || "tool",
    providerLabel: null,
    mcpToolName: null,
    application: null,
  };
}

/**
 * The input a tool card shows: the arguments an application's `call_tool`
 * passes to its tool, without the `{ tool, arguments }` envelope, whose tool
 * name the card already shows.
 */
export function describeToolInput(activity: ToolActivity, args: unknown): unknown {
  if (
    activity.application?.operation !== "call_tool" ||
    !isRecord(args) ||
    readApplicationToolFromArgs(args) === null
  ) {
    return args;
  }
  return args.arguments ?? {};
}

function describeApplicationToolStatus(
  application: ToolActivityApplication,
  mcpToolName: string | null,
  phase: ToolActivityPhase,
): string {
  const tools = `${application.name} MCP tools`;
  if (application.operation === "list_tools") {
    switch (phase) {
      case "running":
        return `Listing ${tools}`;
      case "failed":
        return `Listing ${tools} failed`;
      default:
        return `Listed ${tools}`;
    }
  }
  if (!mcpToolName) {
    switch (phase) {
      case "running":
        return `Using a ${application.name} MCP tool`;
      case "failed":
        return `A ${application.name} MCP tool failed`;
      default:
        return `Used a ${application.name} MCP tool`;
    }
  }
  const subject = `${application.name} MCP tool ${mcpToolName}`;
  switch (phase) {
    case "running":
      return `Using ${subject}`;
    case "failed":
      return `${subject} failed`;
    default:
      return `Used ${subject}`;
  }
}

/** One line for a status row or a collapsed header. */
export function describeToolStatus(activity: ToolActivity, phase: ToolActivityPhase): string {
  if (activity.application) {
    return describeApplicationToolStatus(activity.application, activity.mcpToolName, phase);
  }
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

/** The tool call a response stream is announcing, as far as it has arrived. */
export interface StreamedToolCall {
  toolCallId: string;
  toolName: unknown;
  argsText: string;
}

/**
 * Follows the stream's tool chunks: `tool-call-start` names the tool, and
 * `tool-call-delta` appends the arguments' JSON text. Returns the call the
 * chunk belongs to, or null when the chunk is about no call it has seen.
 */
export function followStreamedToolCall(
  current: StreamedToolCall | null,
  type: string,
  data: Record<string, unknown>,
): StreamedToolCall | null {
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (type === "tool-call-start") {
    return { toolCallId, toolName: data.toolName, argsText: "" };
  }
  if (
    type === "tool-call-delta" &&
    current &&
    current.toolCallId === toolCallId &&
    typeof data.argsText === "string"
  ) {
    return { ...current, argsText: current.argsText + data.argsText };
  }
  return null;
}

/** The running status of a streamed call: an application's tool once its arguments parse. */
export function describeStreamedToolCallStatus(call: StreamedToolCall): string {
  let args: unknown = null;
  if (call.argsText) {
    try {
      args = JSON.parse(call.argsText);
    } catch {
      // The arguments are still arriving.
    }
  }
  return describeToolStatus(describeToolActivity(call.toolName, undefined, args), "running");
}
