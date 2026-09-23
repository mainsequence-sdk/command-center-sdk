
import { fetchCommandCenterAgentIconBytes } from "../backend/command-center-agent-icons-api.js";
import type { ChatBackendConnection } from "../backend/connection.js";

/**
 * Bytes of agent icons, shared by every avatar on the page (ADR 090).
 *
 * One fetch per delivery URL, in-flight requests shared, an object URL kept
 * for the page's life. The delivery URL does not change when an icon is
 * replaced on the platform, so a ready entry is revalidated after
 * AGENT_ICON_REVALIDATE_MS: the browser sends If-None-Match, and the object URL
 * is replaced only when the bytes' fingerprint (ETag when exposed, otherwise a
 * SHA-256 of the bytes) differs. Sign-out clears everything.
 */
export const AGENT_ICON_REVALIDATE_MS = 5 * 60_000;
export const AGENT_ICON_RETRY_MS = 60_000;

export interface AgentIconCacheEntry {
  status: "loading" | "ready" | "error";
  objectUrl: string | null;
  fingerprint: string | null;
  checkedAt: number;
}

const entries = new Map<string, AgentIconCacheEntry>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeAgentIconCache(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAgentIconCacheEntry(url: string | null | undefined) {
  return url ? entries.get(url) : undefined;
}

/** True while a load or revalidation for the url is running. */
export function isAgentIconRequestInFlight(url: string) {
  return inFlight.has(url);
}

function createObjectUrl(blob: Blob) {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

function revokeObjectUrl(objectUrl: string) {
  try {
    if (typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // Nothing to do: the URL is gone either way.
  }
}

async function fingerprintBlob(blob: Blob, etag: string | null) {
  if (etag) {
    return etag;
  }
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // Fall through to the weak fingerprint.
  }
  return `${blob.size}:${blob.type}`;
}

export function ensureAgentIcon({
  connection,
  now = Date.now(),
  token,
  tokenType = "Bearer",
  url,
}: {
  connection: ChatBackendConnection;
  now?: number;
  token: string | null;
  tokenType?: string;
  url: string;
}) {
  if (!token || inFlight.has(url)) {
    return;
  }
  const existing = entries.get(url);
  if (existing?.status === "ready" && now - existing.checkedAt < AGENT_ICON_REVALIDATE_MS) {
    return;
  }
  if (existing?.status === "error" && now - existing.checkedAt < AGENT_ICON_RETRY_MS) {
    return;
  }
  if (!existing) {
    entries.set(url, { status: "loading", objectUrl: null, fingerprint: null, checkedAt: now });
    emit();
  }
  const request = fetchCommandCenterAgentIconBytes({ connection, url, token, tokenType })
    .then(async ({ blob, etag }) => {
      const fingerprint = await fingerprintBlob(blob, etag);
      const current = entries.get(url);
      inFlight.delete(url);
      if (current?.objectUrl && current.fingerprint === fingerprint) {
        entries.set(url, { ...current, status: "ready", checkedAt: Date.now() });
        emit();
        return;
      }
      const objectUrl = createObjectUrl(blob);
      if (current?.objectUrl) {
        revokeObjectUrl(current.objectUrl);
      }
      entries.set(url, {
        status: objectUrl ? "ready" : "error",
        objectUrl,
        fingerprint: objectUrl ? fingerprint : null,
        checkedAt: Date.now(),
      });
      emit();
    })
    .catch(() => {
      const current = entries.get(url);
      inFlight.delete(url);
      // A failed revalidation keeps the icon we have; a failed first load is an error.
      entries.set(
        url,
        current?.objectUrl
          ? { ...current, status: "ready", checkedAt: Date.now() }
          : { status: "error", objectUrl: null, fingerprint: null, checkedAt: Date.now() },
      );
      emit();
    })
    .finally(() => {
      inFlight.delete(url);
    });
  inFlight.set(url, request);
}

export function clearAgentIconCache() {
  entries.forEach((entry) => {
    if (entry.objectUrl) {
      revokeObjectUrl(entry.objectUrl);
    }
  });
  entries.clear();
  inFlight.clear();
  emit();
}
