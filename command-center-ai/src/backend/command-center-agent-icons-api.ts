import {
  buildPlatformApiUrl,
  resolveRequestUrl,
  type ChatBackendConnection,
} from "./connection.js";

/**
 * Command Center agent icons, which the platform owns and delivers (ADR 090).
 *
 * The projection lists the agents visible in one Organization Environment with
 * a nullable icon: a rendering (`mask` follows the theme through currentColor,
 * `color` is drawn as an image and never tinted) and a delivery URL. Delivery
 * needs the normal bearer token and has no signed query, so the bytes are
 * fetched with the authenticated client and rendered from an object URL.
 */
export type CommandCenterAgentIconRendering = "mask" | "color";

export interface CommandCenterAgentIcon {
  agentUid: string;
  rendering: CommandCenterAgentIconRendering;
  url: string;
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
    const icon = record.commandCenterIcon ?? record.command_center_icon;
    if (!agentUid || !icon || typeof icon !== "object" || Array.isArray(icon)) {
      continue;
    }
    const iconRecord = icon as Record<string, unknown>;
    const rendering = readString(iconRecord.rendering);
    const url = readString(iconRecord.url);
    if ((rendering !== "mask" && rendering !== "color") || !url) {
      continue;
    }
    icons.set(agentUid, { agentUid, rendering, url });
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
  const response = await fetch(buildCommandCenterAgentIconsUrl(connection, environmentUid), {
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
  // The delivery view is a DRF view: its content negotiation only knows the
  // JSON renderers and answers 406 to an image-only Accept header before the
  // file is served, so the request accepts anything.
  const headers = new Headers({ Accept: "*/*" });
  if (token) {
    headers.set("Authorization", `${tokenType} ${token}`);
  }
  // Default cache mode: the browser revalidates with If-None-Match against the
  // delivery ETag, so an unchanged icon costs a 304 on later loads.
  // The delivery URL comes from the platform, so it takes the same route as any platform request.
  const response = await fetch(resolveRequestUrl(connection, url, "platform"), {
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
