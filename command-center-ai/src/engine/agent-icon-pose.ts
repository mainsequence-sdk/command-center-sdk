import type { CommandCenterAgentIcon } from "../backend/command-center-agent-icons-api.js";

/**
 * Which pose an agent's icon shows while it works (ADR 090, amended 2026-10-16).
 *
 * The platform delivers, per agent, pose sprites by name and rules mapping a declared
 * application to a pose. Three pose names also follow the run status.
 */
export const AGENT_ICON_RUN_STATUS_POSES = {
  thinking: "thinking",
  working: "working",
  error: "error",
} as const;

/** The tool an agent is using, as the thread or the stream sees it. */
export interface AgentIconToolSignal {
  /** The declared application whose tool runs (`<application>__call_tool`), or null. */
  application: string | null;
  phase: "running" | "done" | "failed";
}

/** What the agent is doing now; absent when the place does not follow the run. */
export interface AgentIconActivity {
  /** The agent is working on a turn. */
  thinking: boolean;
  /** The latest tool call of that turn, or null. */
  tool: AgentIconToolSignal | null;
  /** The run failed. */
  failed?: boolean;
}

function declared(icon: CommandCenterAgentIcon, pose: string | null | undefined) {
  return pose && icon.poses?.[pose] ? pose : null;
}

/**
 * The pose to draw, or null for the idle icon: the application's rule while its tool runs,
 * otherwise `working` while any tool runs, `error` after a failed tool or run, `thinking` while
 * the agent works, and idle when the pose is not declared.
 */
export function resolveAgentIconPose(
  icon: CommandCenterAgentIcon,
  activity: AgentIconActivity | null | undefined,
): string | null {
  if (!activity) {
    return null;
  }
  const { tool } = activity;
  if (tool?.phase === "running") {
    const rule = tool.application ? icon.toolPoses?.[tool.application] : null;
    return declared(icon, rule) ?? declared(icon, AGENT_ICON_RUN_STATUS_POSES.working);
  }
  if (tool?.phase === "failed" || activity.failed) {
    return declared(icon, AGENT_ICON_RUN_STATUS_POSES.error);
  }
  return activity.thinking ? declared(icon, AGENT_ICON_RUN_STATUS_POSES.thinking) : null;
}

/** A tool signal as a string, so selectors can return a stable value. */
export function encodeToolSignal(signal: AgentIconToolSignal | null): string {
  return signal ? `${signal.phase}:${signal.application ?? ""}` : "";
}

export function decodeToolSignal(value: string): AgentIconToolSignal | null {
  if (!value) {
    return null;
  }
  const separator = value.indexOf(":");
  const phase = value.slice(0, separator);
  const application = value.slice(separator + 1);
  if (phase !== "running" && phase !== "done" && phase !== "failed") {
    return null;
  }
  return { application: application || null, phase };
}
