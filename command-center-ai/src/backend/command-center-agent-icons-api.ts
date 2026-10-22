import {
  buildPlatformApiUrl,
  resolveRequestUrl,
  type ChatBackendConnection,
} from "./connection.js";
import { requestPlatform } from "./platform-request.js";

/**
 * Command Center agent icons, which the platform owns and delivers (ADR 090).
 *
 * The projection lists the agents visible in one Organization Environment with
 * a nullable icon: a rendering (`mask` follows the theme through currentColor,
 * `color` is drawn as an image and never tinted) and a delivery URL. Delivery
 * needs the normal bearer token and has no signed query, so the bytes are
 * fetched with the authenticated client and rendered from an object URL.
 *
 * An agent read with `include_icons=true` (the platform's agent list, detail and semantic search)
 * carries the same icon per agent, plus the idle sprite inline, so a list draws without a request.
 */
export type CommandCenterAgentIconRendering = "mask" | "color";
/** How a color icon is scaled: smoothly, or with sharp pixels for pixel art. */
export type CommandCenterAgentIconImageRendering = "auto" | "pixelated";

/** An idle sprite carried inline: its media type and its bytes, base64-encoded. */
export interface CommandCenterAgentIconImage {
  mime: "image/png" | "image/svg+xml";
  bytes: string;
}

export interface CommandCenterAgentIcon {
  agentUid: string;
  rendering: CommandCenterAgentIconRendering;
  /** `pixelated` only for color icons; absent or `auto` scales smoothly. */
  imageRendering?: CommandCenterAgentIconImageRendering;
  url: string;
  /** Delivery URL of each declared pose sprite, keyed by pose name. */
  poses?: Readonly<Record<string, string>>;
  /** The pose a declared application's tools show while they run, keyed by application. */
  toolPoses?: Readonly<Record<string, string>>;
  /**
   * The idle sprite inline, the bytes `url` delivers, from an agent read with `include_icons`;
   * the projection never carries it. Absent or null: the icon is loaded from `url`.
   */
  idle?: CommandCenterAgentIconImage | null;
}

export type CommandCenterAgentIconMap = ReadonlyMap<string, CommandCenterAgentIcon>;

export function buildCommandCenterAgentIconsUrl(
  connection: ChatBackendConnection,
  environmentUid: string,
) {
  const url = buildPlatformApiUrl(connection, "/api/v1/command-center/agents/");
  url.searchParams.set("organization_environment_uid", environmentUid);
  return resolveRequestUrl(connection, url, "platform");
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringMap(value: unknown) {
  const entries: Record<string, string> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const text = readString(entry);
      if (key && text) {
        entries[key] = text;
      }
    }
  }
  return entries;
}

function readIconImage(value: unknown): CommandCenterAgentIconImage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const mime = readString(record.mime);
  const bytes = readString(record.bytes);
  return (mime === "image/png" || mime === "image/svg+xml") && bytes ? { mime, bytes } : null;
}

/**
 * One agent's icon from the projection's `commandCenterIcon` or an agent read's
 * `command_center_icon`; null when it is missing or unusable.
 */
export function normalizeCommandCenterAgentIcon(agentUid: string, value: unknown): CommandCenterAgentIcon | null {
  if (!agentUid || !value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const iconRecord = value as Record<string, unknown>;
  const rendering = readString(iconRecord.rendering);
  const url = readString(iconRecord.url);
  if ((rendering !== "mask" && rendering !== "color") || !url) {
    return null;
  }
  const imageRendering =
    rendering === "color" && readString(iconRecord.imageRendering ?? iconRecord.image_rendering) === "pixelated"
      ? "pixelated"
      : "auto";
  const poses = readStringMap(iconRecord.poses);
  const toolPoses = Object.fromEntries(
    Object.entries(readStringMap(iconRecord.toolPoses ?? iconRecord.tool_poses)).filter(([, pose]) => pose in poses),
  );
  const icon: CommandCenterAgentIcon = { agentUid, rendering, imageRendering, url, poses, toolPoses };
  const idle = readIconImage(iconRecord.idle);
  return idle ? { ...icon, idle } : icon;
}

export function normalizeCommandCenterAgentIcons(payload: unknown): Map<string, CommandCenterAgentIcon> {
  const icons = new Map<string, CommandCenterAgentIcon>();
  if (!Array.isArray(payload)) {
    return icons;
  }
  for (const entry of payload) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const agentUid = readString(record.agentUid ?? record.agent_uid);
    const icon = agentUid
      ? normalizeCommandCenterAgentIcon(agentUid, record.commandCenterIcon ?? record.command_center_icon)
      : null;
    if (agentUid && icon) {
      icons.set(agentUid, icon);
    }
  }
  return icons;
}

export async function fetchCommandCenterAgentIcons({
  connection,
  environmentUid,
  signal,
  token,
  tokenType = "Bearer",
}: {
  connection: ChatBackendConnection;
  environmentUid: string;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
}) {
  const headers = new Headers({ Accept: "application/json" });
  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }
  const response = await requestPlatform(connection, buildCommandCenterAgentIconsUrl(connection, environmentUid), {
    method: "GET",
    headers,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Agent icon projection failed with status ${response.status}.`);
  }
  return normalizeCommandCenterAgentIcons(await response.json());
}

export interface CommandCenterAgentIconBytes {
  blob: Blob;
  /** The delivery ETag when the browser exposes it; null otherwise. */
  etag: string | null;
}

export async function fetchCommandCenterAgentIconBytes({
  connection,
  signal,
  token,
  tokenType = "Bearer",
  url,
}: {
  connection: ChatBackendConnection;
  signal?: AbortSignal;
  token?: string | null;
  tokenType?: string;
  url: string;
}): Promise<CommandCenterAgentIconBytes> {
  // The delivery route answers 406 to an image-only Accept header, so the
  // request accepts anything.
  const headers = new Headers({ Accept: "*/*" });
  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }
  // Default cache mode: the browser revalidates with If-None-Match against the
  // delivery ETag, so an unchanged icon costs a 304 on later loads.
  // The delivery URL comes from the platform, so it takes the same route as any platform request.
  const response = await requestPlatform(connection, resolveRequestUrl(connection, url, "platform"), {
    method: "GET",
    headers,
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Agent icon request failed with status ${response.status}.`);
  }
  return { blob: await response.blob(), etag: response.headers.get("etag") };
}
