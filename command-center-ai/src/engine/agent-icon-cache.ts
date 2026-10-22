
import {
  fetchCommandCenterAgentIconBytes,
  type CommandCenterAgentIconImage,
} from "../backend/command-center-agent-icons-api.js";
import type { ChatBackendConnection } from "../backend/connection.js";
import { apngStill } from "./apng-still.js";

/**
 * Bytes of agent icons, shared by every avatar on the page (ADR 090).
 *
 * One fetch per delivery URL, in-flight requests shared, an object URL kept
 * for the page's life. The delivery URL does not change when an icon is
 * replaced on the platform, so a ready entry is revalidated after
 * AGENT_ICON_REVALIDATE_MS: the browser sends If-None-Match, and the object URL
 * is replaced only when the bytes' fingerprint (ETag when exposed, otherwise a
 * SHA-256 of the bytes) differs. Sign-out clears everything.
 *
 * An animated PNG also gets a still: a static PNG of its frame 0, made once from the same bytes,
 * for the places that should not move (ADR 090, amended 2026-10-16).
 *
 * Bytes an agent read carried inline seed the entry of their delivery URL through
 * `primeAgentIcon`, without a request (ADR 090, section 8).
 */
export const AGENT_ICON_REVALIDATE_MS = 5 * 60_000;
export const AGENT_ICON_RETRY_MS = 60_000;

export interface AgentIconCacheEntry {
  status: "loading" | "ready" | "error";
  objectUrl: string | null;
  /** A static PNG of frame 0 when the icon is an animated PNG; null otherwise. */
  stillObjectUrl: string | null;
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

function createStillObjectUrlFromBytes(bytes: Uint8Array, type: string) {
  if (type && type !== "image/png") {
    return null;
  }
  try {
    const still = apngStill(bytes);
    return still ? createObjectUrl(new Blob([still], { type: "image/png" })) : null;
  } catch {
    return null;
  }
}

async function createStillObjectUrl(blob: Blob) {
  if (blob.type && blob.type !== "image/png") {
    return null;
  }
  try {
    return createStillObjectUrlFromBytes(new Uint8Array(await blob.arrayBuffer()), blob.type);
  } catch {
    return null;
  }
}

function revokeEntryUrls(entry: AgentIconCacheEntry) {
  if (entry.objectUrl) {
    revokeObjectUrl(entry.objectUrl);
  }
  if (entry.stillObjectUrl) {
    revokeObjectUrl(entry.stillObjectUrl);
  }
}

async function sha256Hex(bytes: BufferSource) {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // The caller falls back to the weak fingerprint.
  }
  return null;
}

// The platform's ETag is the quoted SHA-256 of the bytes, so without its quotes it equals the
// fingerprint of the same bytes seeded inline.
async function fingerprintBlob(blob: Blob, etag: string | null) {
  if (etag) {
    return etag.replace(/^W\//, "").replace(/"/g, "");
  }
  return (await sha256Hex(await blob.arrayBuffer())) ?? `${blob.size}:${blob.type}`;
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
  if ((!token && !connection.sendPlatformRequest) || inFlight.has(url)) {
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
    entries.set(url, { status: "loading", objectUrl: null, stillObjectUrl: null, fingerprint: null, checkedAt: now });
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
      const stillObjectUrl = objectUrl ? await createStillObjectUrl(blob) : null;
      if (current) {
        revokeEntryUrls(current);
      }
      entries.set(url, {
        status: objectUrl ? "ready" : "error",
        objectUrl,
        stillObjectUrl,
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
          : { status: "error", objectUrl: null, stillObjectUrl: null, fingerprint: null, checkedAt: Date.now() },
      );
      emit();
    })
    .finally(() => {
      inFlight.delete(url);
    });
  inFlight.set(url, request);
}

function decodeBase64(text: string) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

/**
 * Seeds the entry of an icon's delivery URL from the idle sprite an agent read carried inline
 * (the platform's `include_icons`), so the icon draws without a request. A fresh ready entry is
 * kept as it is; an older one is refreshed, and its object URL replaced only when the bytes
 * differ. Resolves whether the entry is ready afterwards; when it is not (the bytes do not decode
 * or no object URL can be made), the caller loads the URL as usual.
 */
export function primeAgentIcon({
  idle,
  now = Date.now(),
  url,
}: {
  idle: CommandCenterAgentIconImage;
  now?: number;
  url: string;
}): Promise<boolean> {
  const isReady = () => entries.get(url)?.status === "ready";
  const running = inFlight.get(url);
  if (running) {
    return running.then(isReady);
  }
  const existing = entries.get(url);
  if (existing?.status === "ready" && now - existing.checkedAt < AGENT_ICON_REVALIDATE_MS) {
    return Promise.resolve(true);
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeBase64(idle.bytes);
  } catch {
    return Promise.resolve(isReady());
  }
  if (!existing) {
    entries.set(url, { status: "loading", objectUrl: null, stillObjectUrl: null, fingerprint: null, checkedAt: now });
    emit();
  }
  const blob = new Blob([bytes], { type: idle.mime });
  const seeding = sha256Hex(bytes)
    .then((digest) => {
      const fingerprint = digest ?? `${blob.size}:${blob.type}`;
      const current = entries.get(url);
      if (current?.objectUrl && current.fingerprint === fingerprint) {
        entries.set(url, { ...current, status: "ready", checkedAt: Date.now() });
        return;
      }
      const objectUrl = createObjectUrl(blob);
      if (!objectUrl) {
        if (!current?.objectUrl) {
          entries.delete(url);
        }
        return;
      }
      if (current) {
        revokeEntryUrls(current);
      }
      entries.set(url, {
        status: "ready",
        objectUrl,
        stillObjectUrl: createStillObjectUrlFromBytes(bytes, idle.mime),
        fingerprint,
        checkedAt: Date.now(),
      });
    })
    .finally(() => {
      inFlight.delete(url);
      emit();
    });
  inFlight.set(url, seeding);
  return seeding.then(isReady);
}

export function clearAgentIconCache() {
  entries.forEach(revokeEntryUrls);
  entries.clear();
  inFlight.clear();
  emit();
}
