import { assertJsonSerializable } from "../contracts/index.js";

import type { DashboardDefinition, DashboardWidgetInstance } from "./types.js";

export const WORKSPACE_SCHEMA_VERSION = 1;
export const WORKSPACE_SNAPSHOT_SCHEMA = "command-center-workspace" as const;
export const WORKSPACE_SNAPSHOT_VERSION = 1;

export interface WorkspaceSnapshot {
  schema: typeof WORKSPACE_SNAPSHOT_SCHEMA;
  version: typeof WORKSPACE_SNAPSHOT_VERSION;
  exportedAt: string;
  workspace: DashboardDefinition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pruneUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(pruneUndefined);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, pruneUndefined(entry)]),
    );
  }
  return value;
}

function normalizeWidget(value: unknown): DashboardWidgetInstance | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.widgetId !== "string") {
    return null;
  }
  const layout = isRecord(value.layout) ? value.layout : {};
  const normalizedLayout =
    layout.cols !== undefined || layout.rows !== undefined
      ? {
          ...layout,
          cols: positiveInteger(layout.cols ?? layout.w, 1),
          rows: positiveInteger(layout.rows ?? layout.h, 1),
        }
      : {
          ...layout,
          w: positiveInteger(layout.w, 1),
          h: positiveInteger(layout.h, 1),
        };
  const normalized = {
    ...value,
    id: value.id,
    widgetId: value.widgetId,
    props: isRecord(value.props) ? cloneJson(value.props) : undefined,
    runtimeState: isRecord(value.runtimeState) ? cloneJson(value.runtimeState) : undefined,
    layout: normalizedLayout,
  } as DashboardWidgetInstance;
  return normalized;
}

export function normalizeWorkspaceDocument(value: unknown): DashboardDefinition {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new TypeError("Workspace must be an object with a string id.");
  }
  const widgets = Array.isArray(value.widgets)
    ? value.widgets.flatMap((entry) => {
        const widget = normalizeWidget(entry);
        return widget ? [widget] : [];
      })
    : [];
  const workspace = pruneUndefined({
    ...value,
    id: value.id,
    title: typeof value.title === "string" ? value.title : "Untitled workspace",
    description: typeof value.description === "string" ? value.description : "",
    source: typeof value.source === "string" ? value.source : "user",
    widgets,
  }) as DashboardDefinition;
  assertJsonSerializable(workspace, `Workspace ${workspace.id}`);
  return workspace;
}

export function createWorkspaceSnapshot(
  workspace: DashboardDefinition,
  exportedAt = new Date().toISOString(),
): WorkspaceSnapshot {
  return {
    schema: WORKSPACE_SNAPSHOT_SCHEMA,
    version: WORKSPACE_SNAPSHOT_VERSION,
    exportedAt,
    workspace: normalizeWorkspaceDocument(workspace),
  };
}

export function stringifyWorkspaceSnapshot(workspace: DashboardDefinition): string {
  return JSON.stringify(createWorkspaceSnapshot(workspace), null, 2);
}

export function parseWorkspaceSnapshot(serialized: string): WorkspaceSnapshot {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) {
    throw new TypeError("Workspace snapshot must be an object.");
  }
  if (parsed.schema !== WORKSPACE_SNAPSHOT_SCHEMA || parsed.version !== WORKSPACE_SNAPSHOT_VERSION) {
    throw new Error("Unsupported workspace snapshot schema or version.");
  }
  return {
    schema: WORKSPACE_SNAPSHOT_SCHEMA,
    version: WORKSPACE_SNAPSHOT_VERSION,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    workspace: normalizeWorkspaceDocument(parsed.workspace),
  };
}
