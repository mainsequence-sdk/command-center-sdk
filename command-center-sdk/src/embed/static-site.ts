export const STATIC_SITE_IFRAME_CHANNEL_PREFIX = "mainsequence." as const;
export const STATIC_SITE_IFRAME_PROTOCOL_VERSION = 1 as const;
export const STATIC_SITE_IFRAME_CONTRACT = "command-center.static_site_iframe@v1" as const;
export const STATIC_SITE_IFRAME_SCHEMA_ID =
  "urn:mainsequence:command-center-sdk:schema:static-site-iframe:v1" as const;
const STATIC_SITE_FAST_API_WEBSOCKET_TICKET_PREFIX = "mainsequence.ws-ticket." as const;
const STATIC_SITE_FAST_API_WEBSOCKET_BRIDGE_PREFIX = "mainsequence.ws-bridge." as const;
export const STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL =
  "mainsequence.ws-bridge.v1" as const;

const STATIC_SITE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const DEFAULT_MAX_PAYLOAD_BYTES = 64_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const DEFAULT_CREDENTIAL_TIMEOUT_MS = 10_000;
const DEFAULT_WEBSOCKET_TICKET_HOST_TIMEOUT_MS = 10_000;
const DEFAULT_WEBSOCKET_TICKET_CLIENT_TIMEOUT_MS = 12_000;
const DEFAULT_CREDENTIAL_REFRESH_SKEW_MS = 30_000;
const DEFAULT_FAST_API_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_FAST_API_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_FAST_API_RETRY_MAX_DELAY_MS = 2_000;
const MAX_FAST_API_RETRY_ATTEMPTS = 5;
const MAX_SEEN_REQUEST_IDS = 2_048;
const MAX_WEBSOCKET_PATH_BYTES = 2_048;
const MAX_WEBSOCKET_APPLICATION_PROTOCOLS = 16;
const MAX_WEBSOCKET_APPLICATION_PROTOCOL_BYTES = 128;
const MAX_WEBSOCKET_PROTOCOL_HEADER_BYTES = 4_096;
const WEBSOCKET_TICKET_SUBPROTOCOL_PATTERN =
  /^mainsequence\.ws-ticket\.[A-Za-z0-9_-]{32,256}$/u;
const WEBSOCKET_APPLICATION_PROTOCOL_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const FAST_API_STARTING_STATUSES = new Set([502, 503, 504]);
const FAST_API_DEFAULT_RETRY_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

export type StaticSiteIframeChannel = `${typeof STATIC_SITE_IFRAME_CHANNEL_PREFIX}${string}`;
export type StaticSiteIframeThemeMode = "dark" | "light";

export interface StaticSiteIframeContextInput {
  themeId: string;
  themeMode: StaticSiteIframeThemeMode;
  userUid: string | null;
}

export type StaticSiteIframeContext = StaticSiteIframeContextInput;

export interface StaticSiteIframeUserPayload {
  id: string;
  uid: string;
  user_uid: string;
}

export interface StaticSiteIframeReadyMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "ready";
  payload: Record<string, unknown>;
}

export interface StaticSiteIframeInitializeMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "initialize";
  payload: {
    theme: StaticSiteIframeThemeMode;
    themeId: string;
    user: StaticSiteIframeUserPayload | null;
  };
}

export interface StaticSiteFastApiCredentialRequest {
  resourceReleaseUid: string;
}

export interface StaticSiteFastApiCredential {
  resourceReleaseUid: string;
  rpcUrl: string;
  token: string;
  expiresAt: string;
}

export type StaticSiteFastApiCredentialErrorCode =
  | "invalid_request"
  | "access_denied"
  | "origin_not_allowed"
  | "release_unavailable"
  | "runtime_starting"
  | "temporarily_unavailable"
  | "unsupported";

export type StaticSiteFastApiTransportStatus =
  | "idle"
  | "authorizing"
  | "runtime-starting"
  | "ready"
  | "expired"
  | "authentication-failed"
  | "forbidden"
  | "missing-route"
  | "transient"
  | "cancelled"
  | "unavailable"
  | "unsupported"
  | "invalid";

export interface StaticSiteFastApiTransportState {
  status: StaticSiteFastApiTransportStatus;
  resourceReleaseUid: string;
  attempt: number;
  responseStatus?: number;
  retryDelayMs?: number;
}

export interface StaticSiteFastApiRetryPolicy {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryUnsafeMethods?: boolean;
}

export interface StaticSiteFastApiCredentialRequestOptions {
  signal?: AbortSignal;
}

export interface StaticSiteFastApiCredentialResolverContext {
  signal: AbortSignal;
}

export type ResolveStaticSiteFastApiCredential = (
  request: StaticSiteFastApiCredentialRequest,
  context: StaticSiteFastApiCredentialResolverContext,
) => Promise<StaticSiteFastApiCredential>;

export interface StaticSiteFastApiFetchRequest extends StaticSiteFastApiCredentialRequest {
  path: string;
  retry?: false | StaticSiteFastApiRetryPolicy;
}

export interface StaticSiteFastApiWebSocketRequest {
  resourceReleaseUid: string;
  path: string;
}

export interface StaticSiteFastApiWebSocketConnectRequest
  extends StaticSiteFastApiWebSocketRequest {
  protocols?: readonly string[];
}

export interface StaticSiteFastApiWebSocketTicket {
  resourceReleaseUid: string;
  origin: string;
  path: string;
  websocketUrl: string;
  subprotocol: string;
  expiresAt: string;
}

export type StaticSiteFastApiWebSocketErrorCode =
  | "invalid_request"
  | "access_denied"
  | "origin_not_allowed"
  | "release_unavailable"
  | "temporarily_unavailable"
  | "unsupported";

export interface StaticSiteFastApiWebSocketResolverContext {
  signal: AbortSignal;
}

export type ResolveStaticSiteFastApiWebSocketTicket = (
  request: StaticSiteFastApiWebSocketRequest,
  context: StaticSiteFastApiWebSocketResolverContext,
) => Promise<StaticSiteFastApiWebSocketTicket>;

export interface StaticSiteFastApiCredentialRequestMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "fastapi-credential-request";
  payload: {
    requestId: string;
    resourceReleaseUid: string;
  };
}

export interface StaticSiteFastApiCredentialResponseMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "fastapi-credential-response";
  payload: {
    requestId: string;
    resourceReleaseUid: string;
    rpcUrl: string;
    token: string;
    expiresAt: string;
  };
}

export interface StaticSiteFastApiCredentialErrorMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "fastapi-credential-error";
  payload: {
    requestId: string;
    resourceReleaseUid: string;
    code: StaticSiteFastApiCredentialErrorCode;
  };
}

export interface StaticSiteFastApiWebSocketTicketRequestMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "fastapi-websocket-ticket-request";
  payload: {
    requestId: string;
    resourceReleaseUid: string;
    path: string;
  };
}

export interface StaticSiteFastApiWebSocketTicketCancelMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "fastapi-websocket-ticket-cancel";
  payload: {
    requestId: string;
    resourceReleaseUid: string;
    path: string;
  };
}

export interface StaticSiteFastApiWebSocketTicketResponseMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "fastapi-websocket-ticket-response";
  payload: {
    requestId: string;
    resourceReleaseUid: string;
    path: string;
    websocketUrl: string;
    subprotocol: string;
    expiresAt: string;
  };
}

export interface StaticSiteFastApiWebSocketTicketErrorMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "fastapi-websocket-ticket-error";
  payload: {
    requestId: string;
    resourceReleaseUid: string;
    path: string;
    code: StaticSiteFastApiWebSocketErrorCode;
  };
}

export type StaticSiteIframeMessage =
  | StaticSiteIframeReadyMessage
  | StaticSiteIframeInitializeMessage
  | StaticSiteFastApiCredentialRequestMessage
  | StaticSiteFastApiCredentialResponseMessage
  | StaticSiteFastApiCredentialErrorMessage
  | StaticSiteFastApiWebSocketTicketRequestMessage
  | StaticSiteFastApiWebSocketTicketCancelMessage
  | StaticSiteFastApiWebSocketTicketResponseMessage
  | StaticSiteFastApiWebSocketTicketErrorMessage;

export class StaticSiteFastApiCredentialError extends Error {
  readonly code: StaticSiteFastApiCredentialErrorCode;

  constructor(code: StaticSiteFastApiCredentialErrorCode, message?: string) {
    super(message ?? staticSiteCredentialErrorMessage(code));
    this.name = "StaticSiteFastApiCredentialError";
    this.code = code;
  }
}

export class StaticSiteFastApiWebSocketError extends Error {
  readonly code: StaticSiteFastApiWebSocketErrorCode;

  constructor(code: StaticSiteFastApiWebSocketErrorCode, message?: string) {
    super(message ?? staticSiteWebSocketErrorMessage(code));
    this.name = "StaticSiteFastApiWebSocketError";
    this.code = code;
  }
}

export interface StaticSiteIframeHostOptions {
  targetOrigin: string;
  targetWindow: Pick<Window, "postMessage">;
  context: StaticSiteIframeContextInput;
  resolveFastApiCredential?: ResolveStaticSiteFastApiCredential;
  resolveFastApiWebSocketTicket?: ResolveStaticSiteFastApiWebSocketTicket;
  maxPayloadBytes?: number;
  handshakeTimeoutMs?: number;
  credentialRequestTimeoutMs?: number;
  webSocketTicketRequestTimeoutMs?: number;
  onReady?: (message: StaticSiteIframeReadyMessage) => void;
  onProtocolError?: (message: string) => void;
}

export interface StaticSiteIframeHost {
  handleMessage(event: Pick<MessageEvent, "origin" | "source" | "data">): boolean;
  updateContext(context: StaticSiteIframeContextInput): void;
  updateFastApiCredentialResolver(resolver?: ResolveStaticSiteFastApiCredential): void;
  updateFastApiWebSocketTicketResolver(
    resolver?: ResolveStaticSiteFastApiWebSocketTicket,
  ): void;
  dispose(): void;
  readonly channel: StaticSiteIframeChannel | null;
  readonly ready: boolean;
}

export interface StaticSiteIframeClientOptions {
  channel: StaticSiteIframeChannel;
  hostOrigin: string;
  parentWindow: Pick<Window, "postMessage">;
  maxPayloadBytes?: number;
  credentialRequestTimeoutMs?: number;
  webSocketTicketRequestTimeoutMs?: number;
  credentialRefreshSkewMs?: number;
  fastApiRetryPolicy?: false | StaticSiteFastApiRetryPolicy;
  fetcher?: typeof fetch;
  onContext: (context: StaticSiteIframeContext) => void;
  onFastApiStateChange?: (state: StaticSiteFastApiTransportState) => void;
  onProtocolError?: (message: string) => void;
}

export interface StaticSiteIframeClient {
  announceReady(): void;
  handleMessage(event: Pick<MessageEvent, "origin" | "source" | "data">): boolean;
  requestFastApiCredential(
    request: StaticSiteFastApiCredentialRequest,
    options?: StaticSiteFastApiCredentialRequestOptions,
  ): Promise<StaticSiteFastApiCredential>;
  fetchFastApi(request: StaticSiteFastApiFetchRequest, init?: RequestInit): Promise<Response>;
  createFastApiWebSocket(
    request: StaticSiteFastApiWebSocketConnectRequest,
    options?: { signal?: AbortSignal },
  ): Promise<WebSocket>;
  getFastApiState(resourceReleaseUid: string): StaticSiteFastApiTransportState;
  clearFastApiCredentials(): void;
  dispose(): void;
}

interface PendingCredentialRequest {
  targetUid: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (credential: StaticSiteFastApiCredential) => void;
  reject: (error: StaticSiteFastApiCredentialError) => void;
}

interface ActiveHostCredentialRequest {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  generation: number;
}

interface PendingWebSocketTicketRequest {
  targetUid: string;
  path: string;
  timeout: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
  resolve: (ticket: StaticSiteFastApiWebSocketTicket) => void;
  reject: (error: StaticSiteFastApiWebSocketError | Error) => void;
}

interface ActiveHostWebSocketTicketRequest {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
  generation: number;
  targetUid: string;
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function payloadSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function readExactNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value === value.trim() ? value : null;
}

function readRequestId(value: unknown): string | null {
  const requestId = readNonEmptyString(value);
  return requestId && STATIC_SITE_REQUEST_ID_PATTERN.test(requestId) ? requestId : null;
}

function readCanonicalUuid(value: unknown): string | null {
  const uid = readNonEmptyString(value);
  return uid && CANONICAL_UUID_PATTERN.test(uid) ? uid : null;
}

function readExactRequestId(value: unknown): string | null {
  const requestId = readExactNonEmptyString(value);
  return requestId && STATIC_SITE_REQUEST_ID_PATTERN.test(requestId) ? requestId : null;
}

function readExactCanonicalUuid(value: unknown): string | null {
  const uid = readExactNonEmptyString(value);
  return uid && CANONICAL_UUID_PATTERN.test(uid) ? uid : null;
}

function requireCanonicalUuid(value: unknown, label: string): string {
  const uid = readCanonicalUuid(value);
  if (!uid) throw new Error(`${label} must be a canonical lowercase UUID.`);
  return uid;
}

function requireExactCanonicalUuid(value: unknown, label: string): string {
  const uid = readExactCanonicalUuid(value);
  if (!uid) throw new Error(`${label} must be a canonical lowercase UUID.`);
  return uid;
}

function readHttpUrl(value: unknown): string | null {
  const rawUrl = readNonEmptyString(value);
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function readFutureTimestamp(value: unknown, now = Date.now()): string | null {
  const timestamp = readNonEmptyString(value);
  if (!timestamp) return null;
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) && milliseconds > now ? timestamp : null;
}

function isCredentialErrorCode(value: unknown): value is StaticSiteFastApiCredentialErrorCode {
  return [
    "invalid_request",
    "access_denied",
    "origin_not_allowed",
    "release_unavailable",
    "runtime_starting",
    "temporarily_unavailable",
    "unsupported",
  ].includes(String(value));
}

function staticSiteCredentialErrorMessage(code: StaticSiteFastApiCredentialErrorCode): string {
  switch (code) {
    case "invalid_request":
      return "The FastAPI request is invalid.";
    case "access_denied":
      return "Access to the FastAPI release was denied.";
    case "origin_not_allowed":
      return "This static-site origin is not allowed to call the FastAPI release.";
    case "release_unavailable":
      return "The FastAPI release is unavailable.";
    case "runtime_starting":
      return "The FastAPI runtime is starting.";
    case "temporarily_unavailable":
      return "FastAPI access is temporarily unavailable.";
    case "unsupported":
      return "This host does not support delegated FastAPI access.";
  }
}

function isWebSocketErrorCode(value: unknown): value is StaticSiteFastApiWebSocketErrorCode {
  return [
    "invalid_request",
    "access_denied",
    "origin_not_allowed",
    "release_unavailable",
    "temporarily_unavailable",
    "unsupported",
  ].includes(String(value));
}

function staticSiteWebSocketErrorMessage(code: StaticSiteFastApiWebSocketErrorCode): string {
  switch (code) {
    case "invalid_request":
      return "The FastAPI WebSocket request is invalid.";
    case "access_denied":
      return "Access to the FastAPI WebSocket release was denied.";
    case "origin_not_allowed":
      return "This static-site origin is not allowed to connect to the FastAPI release.";
    case "release_unavailable":
      return "The FastAPI WebSocket release is unavailable.";
    case "temporarily_unavailable":
      return "FastAPI WebSocket access is temporarily unavailable.";
    case "unsupported":
      return "This host does not support delegated FastAPI WebSocket access.";
  }
}

function readStaticSiteFastApiWebSocketPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.length === 0 || value.length > MAX_WEBSOCKET_PATH_BYTES) return null;
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/u.test(value)) return null;
  if (value.includes("//")) return null;
  const segments = value.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  if (value === "/_healthz" || value.startsWith("/logos/")) return null;
  return value;
}

function requireStaticSiteFastApiWebSocketPath(value: unknown): string {
  const path = readStaticSiteFastApiWebSocketPath(value);
  if (!path) {
    throw new Error("FastAPI WebSocket path must be a safe absolute ASCII path.");
  }
  return path;
}

function readRfc3339FutureTimestamp(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string") return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds > now ? value : null;
}

function normalizeWebSocketTicket(
  value: StaticSiteFastApiWebSocketTicket,
  expected: StaticSiteFastApiWebSocketRequest & { origin: string },
  now = Date.now(),
): StaticSiteFastApiWebSocketTicket {
  const resourceReleaseUid = requireExactCanonicalUuid(
    value.resourceReleaseUid,
    "FastAPI WebSocket resource release UID",
  );
  const rawOrigin = readExactNonEmptyString(value.origin);
  const origin = rawOrigin ? resolveStaticSiteIframeOrigin(rawOrigin) : "";
  const path = requireStaticSiteFastApiWebSocketPath(value.path);
  const websocketUrl = readExactNonEmptyString(value.websocketUrl);
  const subprotocol = readExactNonEmptyString(value.subprotocol);
  const expiresAt = readRfc3339FutureTimestamp(value.expiresAt, now);
  if (
    !rawOrigin ||
    rawOrigin !== origin ||
    resourceReleaseUid !== expected.resourceReleaseUid ||
    origin !== expected.origin ||
    path !== expected.path
  ) {
    throw new Error("The FastAPI WebSocket ticket binding does not match the request.");
  }
  if (!websocketUrl || !subprotocol || !expiresAt) {
    throw new Error("The FastAPI WebSocket ticket is malformed or expired.");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(websocketUrl);
  } catch {
    throw new Error("FastAPI websocketUrl must be a WebSocket URL.");
  }
  if (
    (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") ||
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== "" ||
    parsedUrl.pathname !== path ||
    (expected.origin.startsWith("https:") && parsedUrl.protocol !== "wss:")
  ) {
    throw new Error("The FastAPI WebSocket URL does not match the requested path or scheme.");
  }
  if (!WEBSOCKET_TICKET_SUBPROTOCOL_PATTERN.test(subprotocol)) {
    throw new Error("The FastAPI WebSocket ticket subprotocol is invalid.");
  }
  return {
    resourceReleaseUid,
    origin,
    path,
    websocketUrl: parsedUrl.toString(),
    subprotocol,
    expiresAt,
  };
}

function normalizeApplicationWebSocketProtocols(value: readonly string[] | undefined): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_WEBSOCKET_APPLICATION_PROTOCOLS) {
    throw new StaticSiteFastApiWebSocketError("invalid_request");
  }
  const protocols: string[] = [];
  const seen = new Set<string>();
  for (const protocol of value) {
    if (
      typeof protocol !== "string" ||
      protocol.length === 0 ||
      protocol.length > MAX_WEBSOCKET_APPLICATION_PROTOCOL_BYTES ||
      !WEBSOCKET_APPLICATION_PROTOCOL_PATTERN.test(protocol) ||
      seen.has(protocol)
    ) {
      throw new StaticSiteFastApiWebSocketError("invalid_request");
    }
    const lower = protocol.toLowerCase();
    if (
      lower.startsWith(STATIC_SITE_FAST_API_WEBSOCKET_BRIDGE_PREFIX.toLowerCase()) ||
      lower.startsWith(STATIC_SITE_FAST_API_WEBSOCKET_TICKET_PREFIX.toLowerCase())
    ) {
      throw new StaticSiteFastApiWebSocketError("invalid_request");
    }
    seen.add(protocol);
    protocols.push(protocol);
  }
  return protocols;
}

function validateWebSocketProtocolHeader(protocols: readonly string[]): void {
  if (protocols.join(", ").length > MAX_WEBSOCKET_PROTOCOL_HEADER_BYTES) {
    throw new StaticSiteFastApiWebSocketError("invalid_request");
  }
}

interface NormalizedStaticSiteFastApiRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryUnsafeMethods: boolean;
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.trunc(value)))
    : fallback;
}

function normalizeFastApiRetryPolicy(
  value: false | StaticSiteFastApiRetryPolicy | undefined,
  fallback?: false | StaticSiteFastApiRetryPolicy,
): NormalizedStaticSiteFastApiRetryPolicy {
  const selected = value === undefined ? fallback : value;
  if (selected === false) {
    return {
      maxAttempts: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      retryUnsafeMethods: false,
    };
  }
  return {
    maxAttempts: Math.max(
      1,
      normalizeNonNegativeInteger(
        selected?.maxAttempts,
        DEFAULT_FAST_API_RETRY_MAX_ATTEMPTS,
        MAX_FAST_API_RETRY_ATTEMPTS,
      ),
    ),
    baseDelayMs: normalizeNonNegativeInteger(
      selected?.baseDelayMs,
      DEFAULT_FAST_API_RETRY_BASE_DELAY_MS,
    ),
    maxDelayMs: normalizeNonNegativeInteger(
      selected?.maxDelayMs,
      DEFAULT_FAST_API_RETRY_MAX_DELAY_MS,
    ),
    retryUnsafeMethods: selected?.retryUnsafeMethods === true,
  };
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("The FastAPI request was cancelled.", "AbortError");
  }
  const error = new Error("The FastAPI request was cancelled.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(createAbortError());
    signal.addEventListener("abort", handleAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
}

function waitForRetry(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function resolveRetryDelayMs(
  response: Response | null,
  attempt: number,
  policy: NormalizedStaticSiteFastApiRetryPolicy,
): number {
  const retryAfter = response?.headers.get("Retry-After")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const parsedDate = Date.parse(retryAfter);
    const requestedDelay = Number.isFinite(seconds)
      ? seconds * 1_000
      : Number.isFinite(parsedDate)
        ? Math.max(0, parsedDate - Date.now())
        : null;
    if (requestedDelay !== null) return Math.min(policy.maxDelayMs, requestedDelay);
  }
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

function canRetryFastApiMethod(method: string, policy: NormalizedStaticSiteFastApiRetryPolicy) {
  return policy.retryUnsafeMethods || FAST_API_DEFAULT_RETRY_METHODS.has(method.toUpperCase());
}

function normalizeCredential(
  value: StaticSiteFastApiCredential,
  now = Date.now(),
): StaticSiteFastApiCredential {
  const resourceReleaseUid = requireCanonicalUuid(
    value.resourceReleaseUid,
    "FastAPI resource release UID",
  );
  const rpcUrl = readHttpUrl(value.rpcUrl);
  const token = readNonEmptyString(value.token);
  const expiresAt = readFutureTimestamp(value.expiresAt, now);
  if (!rpcUrl) throw new Error("FastAPI rpcUrl must be an HTTP or HTTPS URL.");
  if (!token) throw new Error("FastAPI token must be a non-empty string.");
  if (!expiresAt) throw new Error("FastAPI expiresAt must be a future timestamp.");
  return { resourceReleaseUid, rpcUrl, token, expiresAt };
}

export function isStaticSiteIframeChannel(value: unknown): value is StaticSiteIframeChannel {
  const channel = readNonEmptyString(value);
  return Boolean(
    channel &&
      channel.startsWith(STATIC_SITE_IFRAME_CHANNEL_PREFIX) &&
      channel.length > STATIC_SITE_IFRAME_CHANNEL_PREFIX.length,
  );
}

export function resolveStaticSiteIframeOrigin(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Static-site iframe URLs must use HTTP or HTTPS.");
  }
  return parsed.origin;
}

function requireStaticSiteIframeChannel(value: unknown): StaticSiteIframeChannel {
  if (!isStaticSiteIframeChannel(value)) {
    throw new Error(
      `Static-site iframe channels must start with ${STATIC_SITE_IFRAME_CHANNEL_PREFIX} and include an application name.`,
    );
  }
  return value.trim() as StaticSiteIframeChannel;
}

function normalizeContext(context: StaticSiteIframeContextInput): StaticSiteIframeContext {
  const themeId = readNonEmptyString(context.themeId);
  const userUid = context.userUid === null ? null : readNonEmptyString(context.userUid);
  if (!themeId) throw new Error("Static-site iframe themeId must be a non-empty string.");
  if (context.themeMode !== "dark" && context.themeMode !== "light") {
    throw new Error('Static-site iframe themeMode must be either "dark" or "light".');
  }
  if (context.userUid !== null && !userUid) {
    throw new Error("Static-site iframe userUid must be null or a non-empty string.");
  }
  return { themeId, themeMode: context.themeMode, userUid };
}

export function readStaticSiteIframeReadyMessage(
  value: unknown,
): StaticSiteIframeReadyMessage | null {
  if (!isRecord(value) || !isStaticSiteIframeChannel(value.channel)) return null;
  if (value.version !== STATIC_SITE_IFRAME_PROTOCOL_VERSION || value.type !== "ready") return null;
  return {
    channel: value.channel.trim() as StaticSiteIframeChannel,
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "ready",
    payload: isRecord(value.payload) ? value.payload : {},
  };
}

export function buildStaticSiteIframeReadyMessage(
  channel: StaticSiteIframeChannel,
): StaticSiteIframeReadyMessage {
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "ready",
    payload: {},
  };
}

export function buildStaticSiteIframeInitializeMessage({
  channel,
  context,
}: {
  channel: StaticSiteIframeChannel;
  context: StaticSiteIframeContextInput;
}): StaticSiteIframeInitializeMessage {
  const normalized = normalizeContext(context);
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "initialize",
    payload: {
      theme: normalized.themeMode,
      themeId: normalized.themeId,
      user: normalized.userUid
        ? { id: normalized.userUid, uid: normalized.userUid, user_uid: normalized.userUid }
        : null,
    },
  };
}

export function readStaticSiteIframeInitializeMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSiteIframeInitializeMessage | null {
  const channel = requireStaticSiteIframeChannel(expectedChannel);
  if (!isRecord(value) || value.channel !== channel) return null;
  if (value.version !== STATIC_SITE_IFRAME_PROTOCOL_VERSION || value.type !== "initialize") {
    return null;
  }
  if (!isRecord(value.payload)) return null;
  const theme = value.payload.theme;
  const themeId = readNonEmptyString(value.payload.themeId);
  const user = value.payload.user;
  if ((theme !== "dark" && theme !== "light") || !themeId) return null;
  if (user !== null) {
    if (!isRecord(user) || !readNonEmptyString(user.user_uid)) return null;
    if (user.id !== undefined && !readNonEmptyString(user.id)) return null;
    if (user.uid !== undefined && !readNonEmptyString(user.uid)) return null;
  }
  const userUid = user === null ? null : (user.user_uid as string).trim();
  return buildStaticSiteIframeInitializeMessage({
    channel,
    context: { themeId, themeMode: theme, userUid },
  });
}

export function readStaticSiteIframeContext(
  message: StaticSiteIframeInitializeMessage,
): StaticSiteIframeContext {
  return {
    themeId: message.payload.themeId,
    themeMode: message.payload.theme,
    userUid: message.payload.user?.user_uid ?? null,
  };
}

export function buildStaticSiteFastApiCredentialRequestMessage({
  channel,
  requestId,
  resourceReleaseUid,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  resourceReleaseUid: string;
}): StaticSiteFastApiCredentialRequestMessage {
  const normalizedRequestId = readRequestId(requestId);
  if (!normalizedRequestId) throw new Error("FastAPI credential requestId is invalid.");
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "fastapi-credential-request",
    payload: {
      requestId: normalizedRequestId,
      resourceReleaseUid: requireCanonicalUuid(resourceReleaseUid, "FastAPI resource release UID"),
    },
  };
}

export function readStaticSiteFastApiCredentialRequestMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSiteFastApiCredentialRequestMessage | null {
  if (!isRecord(value) || value.channel !== requireStaticSiteIframeChannel(expectedChannel)) {
    return null;
  }
  if (
    value.version !== STATIC_SITE_IFRAME_PROTOCOL_VERSION ||
    value.type !== "fastapi-credential-request" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value, ["channel", "version", "type", "payload"]) ||
    !hasOnlyKeys(value.payload, ["requestId", "resourceReleaseUid"])
  ) {
    return null;
  }
  const requestId = readRequestId(value.payload.requestId);
  const resourceReleaseUid = readCanonicalUuid(value.payload.resourceReleaseUid);
  if (!requestId || !resourceReleaseUid) return null;
  return buildStaticSiteFastApiCredentialRequestMessage({
    channel: expectedChannel,
    requestId,
    resourceReleaseUid,
  });
}

export function buildStaticSiteFastApiCredentialResponseMessage({
  channel,
  requestId,
  credential,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  credential: StaticSiteFastApiCredential;
}): StaticSiteFastApiCredentialResponseMessage {
  const normalizedRequestId = readRequestId(requestId);
  if (!normalizedRequestId) throw new Error("FastAPI credential requestId is invalid.");
  const normalized = normalizeCredential(credential);
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "fastapi-credential-response",
    payload: { requestId: normalizedRequestId, ...normalized },
  };
}

export function readStaticSiteFastApiCredentialResponseMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
  now = Date.now(),
): StaticSiteFastApiCredentialResponseMessage | null {
  if (!isRecord(value) || value.channel !== requireStaticSiteIframeChannel(expectedChannel)) {
    return null;
  }
  if (
    value.version !== STATIC_SITE_IFRAME_PROTOCOL_VERSION ||
    value.type !== "fastapi-credential-response" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value, ["channel", "version", "type", "payload"]) ||
    !hasOnlyKeys(value.payload, [
      "requestId",
      "resourceReleaseUid",
      "rpcUrl",
      "token",
      "expiresAt",
    ])
  ) {
    return null;
  }
  const requestId = readRequestId(value.payload.requestId);
  if (!requestId) return null;
  try {
    const credential = normalizeCredential(
      {
        resourceReleaseUid: String(value.payload.resourceReleaseUid ?? ""),
        rpcUrl: String(value.payload.rpcUrl ?? ""),
        token: String(value.payload.token ?? ""),
        expiresAt: String(value.payload.expiresAt ?? ""),
      },
      now,
    );
    return {
      channel: expectedChannel,
      version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
      type: "fastapi-credential-response",
      payload: { requestId, ...credential },
    };
  } catch {
    return null;
  }
}

export function buildStaticSiteFastApiCredentialErrorMessage({
  channel,
  requestId,
  resourceReleaseUid,
  code,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  resourceReleaseUid: string;
  code: StaticSiteFastApiCredentialErrorCode;
}): StaticSiteFastApiCredentialErrorMessage {
  const normalizedRequestId = readRequestId(requestId);
  if (!normalizedRequestId) throw new Error("FastAPI credential requestId is invalid.");
  if (!isCredentialErrorCode(code)) throw new Error("FastAPI credential error code is invalid.");
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "fastapi-credential-error",
    payload: {
      requestId: normalizedRequestId,
      resourceReleaseUid: requireCanonicalUuid(resourceReleaseUid, "FastAPI resource release UID"),
      code,
    },
  };
}

export function readStaticSiteFastApiCredentialErrorMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSiteFastApiCredentialErrorMessage | null {
  if (!isRecord(value) || value.channel !== requireStaticSiteIframeChannel(expectedChannel)) {
    return null;
  }
  if (
    value.version !== STATIC_SITE_IFRAME_PROTOCOL_VERSION ||
    value.type !== "fastapi-credential-error" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value, ["channel", "version", "type", "payload"]) ||
    !hasOnlyKeys(value.payload, ["requestId", "resourceReleaseUid", "code"])
  ) {
    return null;
  }
  const requestId = readRequestId(value.payload.requestId);
  const resourceReleaseUid = readCanonicalUuid(value.payload.resourceReleaseUid);
  const code = value.payload.code;
  if (!requestId || !resourceReleaseUid || !isCredentialErrorCode(code)) return null;
  return buildStaticSiteFastApiCredentialErrorMessage({
    channel: expectedChannel,
    requestId,
    resourceReleaseUid,
    code,
  });
}

function buildStaticSiteFastApiWebSocketBinding({
  channel,
  requestId,
  resourceReleaseUid,
  path,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  resourceReleaseUid: string;
  path: string;
}) {
  const normalizedRequestId = readExactRequestId(requestId);
  if (!normalizedRequestId) throw new Error("FastAPI WebSocket requestId is invalid.");
  return {
    channel: requireStaticSiteIframeChannel(channel),
    requestId: normalizedRequestId,
    resourceReleaseUid: requireExactCanonicalUuid(
      resourceReleaseUid,
      "FastAPI WebSocket resource release UID",
    ),
    path: requireStaticSiteFastApiWebSocketPath(path),
  };
}

function readStaticSiteFastApiWebSocketBinding(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): { requestId: string; resourceReleaseUid: string; path: string } | null {
  if (!isRecord(value) || value.channel !== requireStaticSiteIframeChannel(expectedChannel)) {
    return null;
  }
  if (
    value.version !== STATIC_SITE_IFRAME_PROTOCOL_VERSION ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value, ["channel", "version", "type", "payload"])
  ) {
    return null;
  }
  const requestId = readExactRequestId(value.payload.requestId);
  const resourceReleaseUid = readExactCanonicalUuid(value.payload.resourceReleaseUid);
  const path = readStaticSiteFastApiWebSocketPath(value.payload.path);
  return requestId && resourceReleaseUid && path
    ? { requestId, resourceReleaseUid, path }
    : null;
}

export function buildStaticSiteFastApiWebSocketTicketRequestMessage({
  channel,
  requestId,
  resourceReleaseUid,
  path,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  resourceReleaseUid: string;
  path: string;
}): StaticSiteFastApiWebSocketTicketRequestMessage {
  const binding = buildStaticSiteFastApiWebSocketBinding({
    channel,
    requestId,
    resourceReleaseUid,
    path,
  });
  return {
    channel: binding.channel,
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "fastapi-websocket-ticket-request",
    payload: {
      requestId: binding.requestId,
      resourceReleaseUid: binding.resourceReleaseUid,
      path: binding.path,
    },
  };
}

export function readStaticSiteFastApiWebSocketTicketRequestMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSiteFastApiWebSocketTicketRequestMessage | null {
  const binding = readStaticSiteFastApiWebSocketBinding(value, expectedChannel);
  if (
    !binding ||
    !isRecord(value) ||
    value.type !== "fastapi-websocket-ticket-request" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, ["requestId", "resourceReleaseUid", "path"])
  ) {
    return null;
  }
  return buildStaticSiteFastApiWebSocketTicketRequestMessage({
    channel: expectedChannel,
    ...binding,
  });
}

export function buildStaticSiteFastApiWebSocketTicketCancelMessage({
  channel,
  requestId,
  resourceReleaseUid,
  path,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  resourceReleaseUid: string;
  path: string;
}): StaticSiteFastApiWebSocketTicketCancelMessage {
  const binding = buildStaticSiteFastApiWebSocketBinding({
    channel,
    requestId,
    resourceReleaseUid,
    path,
  });
  return {
    channel: binding.channel,
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "fastapi-websocket-ticket-cancel",
    payload: {
      requestId: binding.requestId,
      resourceReleaseUid: binding.resourceReleaseUid,
      path: binding.path,
    },
  };
}

export function readStaticSiteFastApiWebSocketTicketCancelMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSiteFastApiWebSocketTicketCancelMessage | null {
  const binding = readStaticSiteFastApiWebSocketBinding(value, expectedChannel);
  if (
    !binding ||
    !isRecord(value) ||
    value.type !== "fastapi-websocket-ticket-cancel" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, ["requestId", "resourceReleaseUid", "path"])
  ) {
    return null;
  }
  return buildStaticSiteFastApiWebSocketTicketCancelMessage({
    channel: expectedChannel,
    ...binding,
  });
}

export function buildStaticSiteFastApiWebSocketTicketResponseMessage({
  channel,
  requestId,
  ticket,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  ticket: StaticSiteFastApiWebSocketTicket;
}): StaticSiteFastApiWebSocketTicketResponseMessage {
  const binding = buildStaticSiteFastApiWebSocketBinding({
    channel,
    requestId,
    resourceReleaseUid: ticket.resourceReleaseUid,
    path: ticket.path,
  });
  const normalized = normalizeWebSocketTicket(ticket, {
    resourceReleaseUid: binding.resourceReleaseUid,
    path: binding.path,
    origin: resolveStaticSiteIframeOrigin(ticket.origin),
  });
  return {
    channel: binding.channel,
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "fastapi-websocket-ticket-response",
    payload: {
      requestId: binding.requestId,
      resourceReleaseUid: normalized.resourceReleaseUid,
      path: normalized.path,
      websocketUrl: normalized.websocketUrl,
      subprotocol: normalized.subprotocol,
      expiresAt: normalized.expiresAt,
    },
  };
}

export function readStaticSiteFastApiWebSocketTicketResponseMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
  now = Date.now(),
): StaticSiteFastApiWebSocketTicketResponseMessage | null {
  const binding = readStaticSiteFastApiWebSocketBinding(value, expectedChannel);
  if (
    !binding ||
    !isRecord(value) ||
    value.type !== "fastapi-websocket-ticket-response" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, [
      "requestId",
      "resourceReleaseUid",
      "path",
      "websocketUrl",
      "subprotocol",
      "expiresAt",
    ])
  ) {
    return null;
  }
  const websocketUrl = readExactNonEmptyString(value.payload.websocketUrl);
  const subprotocol = readExactNonEmptyString(value.payload.subprotocol);
  const expiresAt = readRfc3339FutureTimestamp(value.payload.expiresAt, now);
  if (!websocketUrl || websocketUrl.length > 4_096 || !subprotocol || !expiresAt) return null;
  try {
    const parsedUrl = new URL(websocketUrl);
    if (
      (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") ||
      parsedUrl.username !== "" ||
      parsedUrl.password !== "" ||
      parsedUrl.search !== "" ||
      parsedUrl.hash !== "" ||
      parsedUrl.pathname !== binding.path ||
      !WEBSOCKET_TICKET_SUBPROTOCOL_PATTERN.test(subprotocol)
    ) {
      return null;
    }
    return {
      channel: expectedChannel,
      version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
      type: "fastapi-websocket-ticket-response",
      payload: {
        ...binding,
        websocketUrl: parsedUrl.toString(),
        subprotocol,
        expiresAt,
      },
    };
  } catch {
    return null;
  }
}

export function buildStaticSiteFastApiWebSocketTicketErrorMessage({
  channel,
  requestId,
  resourceReleaseUid,
  path,
  code,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  resourceReleaseUid: string;
  path: string;
  code: StaticSiteFastApiWebSocketErrorCode;
}): StaticSiteFastApiWebSocketTicketErrorMessage {
  if (!isWebSocketErrorCode(code)) throw new Error("FastAPI WebSocket error code is invalid.");
  const binding = buildStaticSiteFastApiWebSocketBinding({
    channel,
    requestId,
    resourceReleaseUid,
    path,
  });
  return {
    channel: binding.channel,
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "fastapi-websocket-ticket-error",
    payload: {
      requestId: binding.requestId,
      resourceReleaseUid: binding.resourceReleaseUid,
      path: binding.path,
      code,
    },
  };
}

export function readStaticSiteFastApiWebSocketTicketErrorMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSiteFastApiWebSocketTicketErrorMessage | null {
  const binding = readStaticSiteFastApiWebSocketBinding(value, expectedChannel);
  if (
    !binding ||
    !isRecord(value) ||
    value.type !== "fastapi-websocket-ticket-error" ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value.payload, ["requestId", "resourceReleaseUid", "path", "code"]) ||
    !isWebSocketErrorCode(value.payload.code)
  ) {
    return null;
  }
  return buildStaticSiteFastApiWebSocketTicketErrorMessage({
    channel: expectedChannel,
    ...binding,
    code: value.payload.code,
  });
}

export function readStaticSiteIframeMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSiteIframeMessage | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "ready": {
      const message = readStaticSiteIframeReadyMessage(value);
      return message?.channel === expectedChannel ? message : null;
    }
    case "initialize":
      return readStaticSiteIframeInitializeMessage(value, expectedChannel);
    case "fastapi-credential-request":
      return readStaticSiteFastApiCredentialRequestMessage(value, expectedChannel);
    case "fastapi-credential-response":
      return readStaticSiteFastApiCredentialResponseMessage(value, expectedChannel);
    case "fastapi-credential-error":
      return readStaticSiteFastApiCredentialErrorMessage(value, expectedChannel);
    case "fastapi-websocket-ticket-request":
      return readStaticSiteFastApiWebSocketTicketRequestMessage(value, expectedChannel);
    case "fastapi-websocket-ticket-cancel":
      return readStaticSiteFastApiWebSocketTicketCancelMessage(value, expectedChannel);
    case "fastapi-websocket-ticket-response":
      return readStaticSiteFastApiWebSocketTicketResponseMessage(value, expectedChannel);
    case "fastapi-websocket-ticket-error":
      return readStaticSiteFastApiWebSocketTicketErrorMessage(value, expectedChannel);
    default:
      return null;
  }
}

function readCandidateRequestBinding(value: unknown): {
  requestId: string;
  resourceReleaseUid: string;
} | null {
  if (!isRecord(value) || !isRecord(value.payload)) return null;
  const requestId = readRequestId(value.payload.requestId);
  const resourceReleaseUid = readCanonicalUuid(value.payload.resourceReleaseUid);
  return requestId && resourceReleaseUid ? { requestId, resourceReleaseUid } : null;
}

function resolveCredentialErrorCode(error: unknown): StaticSiteFastApiCredentialErrorCode {
  return error instanceof StaticSiteFastApiCredentialError
    ? error.code
    : "temporarily_unavailable";
}

function resolveWebSocketErrorCode(error: unknown): StaticSiteFastApiWebSocketErrorCode {
  return error instanceof StaticSiteFastApiWebSocketError
    ? error.code
    : "temporarily_unavailable";
}

export function createStaticSiteIframeHost(
  options: StaticSiteIframeHostOptions,
): StaticSiteIframeHost {
  const targetOrigin = resolveStaticSiteIframeOrigin(options.targetOrigin);
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const credentialRequestTimeoutMs =
    options.credentialRequestTimeoutMs ?? DEFAULT_CREDENTIAL_TIMEOUT_MS;
  const webSocketTicketRequestTimeoutMs =
    options.webSocketTicketRequestTimeoutMs ?? DEFAULT_WEBSOCKET_TICKET_HOST_TIMEOUT_MS;
  let context = normalizeContext(options.context);
  let handshake: StaticSiteIframeReadyMessage | null = null;
  let generation = 0;
  let resolveFastApiCredential = options.resolveFastApiCredential;
  let resolveFastApiWebSocketTicket = options.resolveFastApiWebSocketTicket;
  let disposed = false;
  const activeCredentialRequests = new Map<string, ActiveHostCredentialRequest>();
  const activeWebSocketTicketRequests = new Map<string, ActiveHostWebSocketTicketRequest>();
  const seenRequestIds = new Set<string>();
  const handshakeTimeout = setTimeout(() => {
    if (!handshake && !disposed) {
      options.onProtocolError?.("Static-site iframe handshake timed out.");
    }
  }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);

  function postMessage(message: StaticSiteIframeMessage): void {
    if (disposed) return;
    if (payloadSize(message) > maxPayloadBytes) {
      options.onProtocolError?.("Static-site iframe payload exceeds the configured limit.");
      return;
    }
    options.targetWindow.postMessage(message, targetOrigin);
  }

  function postContext(): void {
    if (!handshake || disposed) return;
    postMessage(buildStaticSiteIframeInitializeMessage({ channel: handshake.channel, context }));
  }

  function postCredentialError(
    request: { requestId: string; resourceReleaseUid: string },
    code: StaticSiteFastApiCredentialErrorCode,
  ): void {
    if (!handshake) return;
    postMessage(
      buildStaticSiteFastApiCredentialErrorMessage({
        channel: handshake.channel,
        requestId: request.requestId,
        resourceReleaseUid: request.resourceReleaseUid,
        code,
      }),
    );
  }

  function abortCredentialRequests(): void {
    activeCredentialRequests.forEach(({ controller, timeout }) => {
      clearTimeout(timeout);
      controller.abort();
    });
    activeCredentialRequests.clear();
  }

  function abortWebSocketTicketRequests(): void {
    activeWebSocketTicketRequests.forEach(({ controller, timeout }) => {
      clearTimeout(timeout);
      controller.abort();
    });
    activeWebSocketTicketRequests.clear();
  }

  function abortAllRequests(): void {
    abortCredentialRequests();
    abortWebSocketTicketRequests();
  }

  function postWebSocketError(
    request: { requestId: string; resourceReleaseUid: string; path: string },
    code: StaticSiteFastApiWebSocketErrorCode,
  ): void {
    if (!handshake) return;
    postMessage(
      buildStaticSiteFastApiWebSocketTicketErrorMessage({
        channel: handshake.channel,
        ...request,
        code,
      }),
    );
  }

  function rememberRequestId(requestId: string): boolean {
    if (seenRequestIds.has(requestId)) return false;
    seenRequestIds.add(requestId);
    if (seenRequestIds.size > MAX_SEEN_REQUEST_IDS) {
      const oldest = seenRequestIds.values().next().value as string | undefined;
      if (oldest) seenRequestIds.delete(oldest);
    }
    return true;
  }

  function resolveCredential(request: StaticSiteFastApiCredentialRequestMessage): void {
    const requestBinding = request.payload;
    if (!rememberRequestId(requestBinding.requestId)) {
      postCredentialError(requestBinding, "invalid_request");
      return;
    }
    const credentialResolver = resolveFastApiCredential;
    if (!credentialResolver) {
      postCredentialError(requestBinding, "unsupported");
      return;
    }

    const controller = new AbortController();
    const requestGeneration = generation;
    const activeRequest: ActiveHostCredentialRequest = {
      controller,
      generation: requestGeneration,
      timeout: setTimeout(() => {
        if (activeCredentialRequests.get(requestBinding.requestId) !== activeRequest) return;
        activeCredentialRequests.delete(requestBinding.requestId);
        controller.abort();
        postCredentialError(requestBinding, "temporarily_unavailable");
      }, credentialRequestTimeoutMs),
    };
    activeCredentialRequests.set(requestBinding.requestId, activeRequest);

    void Promise.resolve().then(
      () => credentialResolver(
        { resourceReleaseUid: requestBinding.resourceReleaseUid },
        { signal: controller.signal },
      ),
    ).then(
      (value) => {
        if (
          disposed ||
          controller.signal.aborted ||
          activeCredentialRequests.get(requestBinding.requestId) !== activeRequest ||
          generation !== requestGeneration ||
          !handshake
        ) {
          return;
        }
        clearTimeout(activeRequest.timeout);
        activeCredentialRequests.delete(requestBinding.requestId);
        try {
          const credential = normalizeCredential(value);
          if (credential.resourceReleaseUid !== requestBinding.resourceReleaseUid) {
            throw new Error("The resolver returned a credential for another release.");
          }
          postMessage(
            buildStaticSiteFastApiCredentialResponseMessage({
              channel: handshake.channel,
              requestId: requestBinding.requestId,
              credential,
            }),
          );
        } catch {
          postCredentialError(requestBinding, "invalid_request");
        }
      },
      (error) => {
        if (
          disposed ||
          controller.signal.aborted ||
          activeCredentialRequests.get(requestBinding.requestId) !== activeRequest ||
          generation !== requestGeneration
        ) {
          return;
        }
        clearTimeout(activeRequest.timeout);
        activeCredentialRequests.delete(requestBinding.requestId);
        postCredentialError(requestBinding, resolveCredentialErrorCode(error));
      },
    );
  }

  function resolveWebSocketTicket(
    request: StaticSiteFastApiWebSocketTicketRequestMessage,
  ): void {
    const requestBinding = request.payload;
    if (!rememberRequestId(requestBinding.requestId)) {
      postWebSocketError(requestBinding, "invalid_request");
      return;
    }
    const ticketResolver = resolveFastApiWebSocketTicket;
    if (!ticketResolver) {
      postWebSocketError(requestBinding, "unsupported");
      return;
    }

    const controller = new AbortController();
    const requestGeneration = generation;
    const activeRequest: ActiveHostWebSocketTicketRequest = {
      controller,
      generation: requestGeneration,
      targetUid: requestBinding.resourceReleaseUid,
      path: requestBinding.path,
      timeout: setTimeout(() => {
        if (activeWebSocketTicketRequests.get(requestBinding.requestId) !== activeRequest) return;
        activeWebSocketTicketRequests.delete(requestBinding.requestId);
        controller.abort();
        postWebSocketError(requestBinding, "temporarily_unavailable");
      }, webSocketTicketRequestTimeoutMs),
    };
    activeWebSocketTicketRequests.set(requestBinding.requestId, activeRequest);

    void Promise.resolve()
      .then(() =>
        ticketResolver(
          {
            resourceReleaseUid: requestBinding.resourceReleaseUid,
            path: requestBinding.path,
          },
          { signal: controller.signal },
        ),
      )
      .then(
        (value) => {
          if (
            disposed ||
            controller.signal.aborted ||
            activeWebSocketTicketRequests.get(requestBinding.requestId) !== activeRequest ||
            generation !== requestGeneration ||
            !handshake
          ) {
            return;
          }
          clearTimeout(activeRequest.timeout);
          activeWebSocketTicketRequests.delete(requestBinding.requestId);
          try {
            const ticket = normalizeWebSocketTicket(value, {
              resourceReleaseUid: requestBinding.resourceReleaseUid,
              path: requestBinding.path,
              origin: targetOrigin,
            });
            postMessage(
              buildStaticSiteFastApiWebSocketTicketResponseMessage({
                channel: handshake.channel,
                requestId: requestBinding.requestId,
                ticket,
              }),
            );
          } catch {
            postWebSocketError(requestBinding, "invalid_request");
          }
        },
        (error) => {
          if (
            disposed ||
            controller.signal.aborted ||
            activeWebSocketTicketRequests.get(requestBinding.requestId) !== activeRequest ||
            generation !== requestGeneration
          ) {
            return;
          }
          clearTimeout(activeRequest.timeout);
          activeWebSocketTicketRequests.delete(requestBinding.requestId);
          postWebSocketError(requestBinding, resolveWebSocketErrorCode(error));
        },
      );
  }

  function cancelWebSocketTicket(
    request: StaticSiteFastApiWebSocketTicketCancelMessage,
  ): void {
    const activeRequest = activeWebSocketTicketRequests.get(request.payload.requestId);
    if (
      !activeRequest ||
      activeRequest.generation !== generation ||
      activeRequest.targetUid !== request.payload.resourceReleaseUid ||
      activeRequest.path !== request.payload.path
    ) {
      return;
    }
    clearTimeout(activeRequest.timeout);
    activeWebSocketTicketRequests.delete(request.payload.requestId);
    activeRequest.controller.abort();
  }

  return {
    get channel() {
      return handshake?.channel ?? null;
    },
    get ready() {
      return Boolean(handshake) && !disposed;
    },
    handleMessage(event) {
      if (disposed || event.origin !== targetOrigin || event.source !== options.targetWindow) {
        return false;
      }
      if (payloadSize(event.data) > maxPayloadBytes) {
        options.onProtocolError?.("Static-site iframe payload exceeds the configured limit.");
        return false;
      }

      const nextHandshake = readStaticSiteIframeReadyMessage(event.data);
      if (nextHandshake) {
        if (handshake && nextHandshake.channel !== handshake.channel) {
          options.onProtocolError?.("Rejected static-site iframe channel change after handshake.");
          return false;
        }
        abortAllRequests();
        generation += 1;
        handshake = nextHandshake;
        clearTimeout(handshakeTimeout);
        postContext();
        options.onReady?.(nextHandshake);
        return true;
      }

      if (!handshake) {
        options.onProtocolError?.("Rejected malformed static-site iframe ready message.");
        return false;
      }
      const credentialRequest = readStaticSiteFastApiCredentialRequestMessage(
        event.data,
        handshake.channel,
      );
      if (credentialRequest) {
        resolveCredential(credentialRequest);
        return true;
      }
      const webSocketRequest = readStaticSiteFastApiWebSocketTicketRequestMessage(
        event.data,
        handshake.channel,
      );
      if (webSocketRequest) {
        resolveWebSocketTicket(webSocketRequest);
        return true;
      }
      const webSocketCancel = readStaticSiteFastApiWebSocketTicketCancelMessage(
        event.data,
        handshake.channel,
      );
      if (webSocketCancel) {
        cancelWebSocketTicket(webSocketCancel);
        return true;
      }
      const candidate = readCandidateRequestBinding(event.data);
      if (candidate && isRecord(event.data) && event.data.type === "fastapi-credential-request") {
        postCredentialError(candidate, "invalid_request");
      }
      if (
        candidate &&
        isRecord(event.data) &&
        event.data.type === "fastapi-websocket-ticket-request" &&
        isRecord(event.data.payload)
      ) {
        const path = readStaticSiteFastApiWebSocketPath(event.data.payload.path);
        if (path) postWebSocketError({ ...candidate, path }, "invalid_request");
      }
      options.onProtocolError?.("Rejected malformed static-site iframe message.");
      return false;
    },
    updateContext(nextContext) {
      if (disposed) throw new Error("Static-site iframe host is disposed.");
      const normalized = normalizeContext(nextContext);
      if (normalized.userUid !== context.userUid) abortAllRequests();
      context = normalized;
      postContext();
    },
    updateFastApiCredentialResolver(resolver) {
      if (disposed) throw new Error("Static-site iframe host is disposed.");
      if (resolver !== resolveFastApiCredential) abortCredentialRequests();
      resolveFastApiCredential = resolver;
    },
    updateFastApiWebSocketTicketResolver(resolver) {
      if (disposed) throw new Error("Static-site iframe host is disposed.");
      if (resolver !== resolveFastApiWebSocketTicket) abortWebSocketTicketRequests();
      resolveFastApiWebSocketTicket = resolver;
    },
    dispose() {
      disposed = true;
      handshake = null;
      clearTimeout(handshakeTimeout);
      abortAllRequests();
      seenRequestIds.clear();
    },
  };
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resolveFastApiRequestUrl(rpcUrl: string, path: string): URL {
  const normalizedPath = path.trim();
  if (!normalizedPath) throw new StaticSiteFastApiCredentialError("invalid_request");
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(normalizedPath) || normalizedPath.startsWith("//")) {
    throw new StaticSiteFastApiCredentialError(
      "invalid_request",
      "FastAPI request paths must be relative to the delegated RPC URL.",
    );
  }
  const base = new URL(rpcUrl);
  const requestUrl = new URL(normalizedPath, base);
  if (requestUrl.origin !== base.origin) {
    throw new StaticSiteFastApiCredentialError("invalid_request");
  }
  return requestUrl;
}

export function createStaticSiteIframeClient(
  options: StaticSiteIframeClientOptions,
): StaticSiteIframeClient {
  const channel = requireStaticSiteIframeChannel(options.channel);
  const hostOrigin = resolveStaticSiteIframeOrigin(options.hostOrigin);
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const credentialRequestTimeoutMs =
    options.credentialRequestTimeoutMs ?? DEFAULT_CREDENTIAL_TIMEOUT_MS;
  const webSocketTicketRequestTimeoutMs =
    options.webSocketTicketRequestTimeoutMs ?? DEFAULT_WEBSOCKET_TICKET_CLIENT_TIMEOUT_MS;
  const credentialRefreshSkewMs =
    options.credentialRefreshSkewMs ?? DEFAULT_CREDENTIAL_REFRESH_SKEW_MS;
  const credentialCache = new Map<string, StaticSiteFastApiCredential>();
  const pendingByRequestId = new Map<string, PendingCredentialRequest>();
  const pendingByTarget = new Map<string, Promise<StaticSiteFastApiCredential>>();
  const pendingWebSocketTickets = new Map<string, PendingWebSocketTicketRequest>();
  const activeWebSockets = new Set<WebSocket>();
  const fastApiStates = new Map<string, StaticSiteFastApiTransportState>();
  let disposed = false;
  let initialized = false;
  let currentUserUid: string | null | undefined;

  function emitFastApiState(state: StaticSiteFastApiTransportState): void {
    const previous = fastApiStates.get(state.resourceReleaseUid);
    if (
      previous?.status === state.status &&
      previous.attempt === state.attempt &&
      previous.responseStatus === state.responseStatus &&
      previous.retryDelayMs === state.retryDelayMs
    ) {
      return;
    }
    fastApiStates.set(state.resourceReleaseUid, state);
    try {
      options.onFastApiStateChange?.(state);
    } catch {
      options.onProtocolError?.("The static-site FastAPI state listener failed.");
    }
  }

  function emitCredentialErrorState(
    resourceReleaseUid: string,
    attempt: number,
    error: StaticSiteFastApiCredentialError,
  ): void {
    const status: StaticSiteFastApiTransportStatus =
      error.code === "runtime_starting"
        ? "runtime-starting"
        : error.code === "temporarily_unavailable"
          ? "transient"
          : error.code === "access_denied" || error.code === "origin_not_allowed"
            ? "forbidden"
            : error.code === "release_unavailable"
              ? "unavailable"
              : error.code === "unsupported"
                ? "unsupported"
                : "invalid";
    emitFastApiState({ status, resourceReleaseUid, attempt });
  }

  async function waitForNextFastApiAttempt(
    resourceReleaseUid: string,
    attempt: number,
    delayMs: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    try {
      await waitForRetry(delayMs, signal);
    } catch (error) {
      if (isAbortError(error)) {
        emitFastApiState({
          status: "cancelled",
          resourceReleaseUid,
          attempt,
        });
      }
      throw error;
    }
  }

  function rejectPending(code: StaticSiteFastApiCredentialErrorCode): void {
    const error = new StaticSiteFastApiCredentialError(code);
    pendingByRequestId.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
    pendingByRequestId.clear();
    pendingByTarget.clear();
  }

  function clearCredentials(code: StaticSiteFastApiCredentialErrorCode): void {
    credentialCache.clear();
    rejectPending(code);
  }

  function rejectPendingWebSocketTickets(code: StaticSiteFastApiWebSocketErrorCode): void {
    pendingWebSocketTickets.forEach((pending, requestId) => {
      clearTimeout(pending.timeout);
      pending.removeAbortListener();
      postWebSocketCancel(requestId, pending);
      pending.reject(new StaticSiteFastApiWebSocketError(code));
    });
    pendingWebSocketTickets.clear();
  }

  function closeActiveWebSockets(): void {
    activeWebSockets.forEach((socket) => {
      try {
        if (socket.readyState === 0 || socket.readyState === 1) {
          socket.close(1000, "Static-site bridge context changed.");
        }
      } catch {
        // Native close failures do not weaken pending-request invalidation.
      }
    });
    activeWebSockets.clear();
  }

  function postWebSocketCancel(
    requestId: string,
    pending: Pick<PendingWebSocketTicketRequest, "targetUid" | "path">,
  ): void {
    const message = buildStaticSiteFastApiWebSocketTicketCancelMessage({
      channel,
      requestId,
      resourceReleaseUid: pending.targetUid,
      path: pending.path,
    });
    if (payloadSize(message) <= maxPayloadBytes) {
      options.parentWindow.postMessage(message, hostOrigin);
    }
  }

  function requestFastApiWebSocketTicket(
    request: StaticSiteFastApiWebSocketRequest,
    signal: AbortSignal | undefined,
  ): Promise<StaticSiteFastApiWebSocketTicket> {
    if (disposed || !initialized) {
      return Promise.reject(
        new StaticSiteFastApiWebSocketError(
          "unsupported",
          "The static-site host handshake is not ready.",
        ),
      );
    }
    if (signal?.aborted) return Promise.reject(createAbortError());

    let targetUid: string;
    let path: string;
    try {
      targetUid = requireExactCanonicalUuid(
        request.resourceReleaseUid,
        "FastAPI WebSocket resource release UID",
      );
      path = requireStaticSiteFastApiWebSocketPath(request.path);
    } catch {
      return Promise.reject(new StaticSiteFastApiWebSocketError("invalid_request"));
    }

    const requestId = createRequestId();
    return new Promise<StaticSiteFastApiWebSocketTicket>((resolve, reject) => {
      const handleAbort = () => {
        const pending = pendingWebSocketTickets.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingWebSocketTickets.delete(requestId);
        pending.removeAbortListener();
        postWebSocketCancel(requestId, pending);
        reject(createAbortError());
      };
      const timeout = setTimeout(() => {
        const pending = pendingWebSocketTickets.get(requestId);
        if (!pending) return;
        pendingWebSocketTickets.delete(requestId);
        pending.removeAbortListener();
        postWebSocketCancel(requestId, pending);
        reject(new StaticSiteFastApiWebSocketError("unsupported"));
      }, webSocketTicketRequestTimeoutMs);
      const pending: PendingWebSocketTicketRequest = {
        targetUid,
        path,
        timeout,
        removeAbortListener: () => signal?.removeEventListener("abort", handleAbort),
        resolve,
        reject,
      };
      pendingWebSocketTickets.set(requestId, pending);
      signal?.addEventListener("abort", handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      const message = buildStaticSiteFastApiWebSocketTicketRequestMessage({
        channel,
        requestId,
        resourceReleaseUid: targetUid,
        path,
      });
      if (payloadSize(message) > maxPayloadBytes) {
        clearTimeout(timeout);
        pendingWebSocketTickets.delete(requestId);
        pending.removeAbortListener();
        reject(new StaticSiteFastApiWebSocketError("invalid_request"));
        return;
      }
      options.parentWindow.postMessage(message, hostOrigin);
    });
  }

  function requestFastApiCredentialInternal(
    request: StaticSiteFastApiCredentialRequest,
    requestOptions: StaticSiteFastApiCredentialRequestOptions | undefined,
    attempt: number,
  ): Promise<StaticSiteFastApiCredential> {
    if (disposed) {
      return Promise.reject(new StaticSiteFastApiCredentialError("unsupported"));
    }
    if (!initialized) {
      return Promise.reject(
        new StaticSiteFastApiCredentialError(
          "unsupported",
          "The static-site host handshake is not ready.",
        ),
      );
    }

    let targetUid: string;
    try {
      targetUid = requireCanonicalUuid(request.resourceReleaseUid, "FastAPI resource release UID");
    } catch {
      return Promise.reject(new StaticSiteFastApiCredentialError("invalid_request"));
    }
    const cached = credentialCache.get(targetUid);
    if (cached && Date.parse(cached.expiresAt) - credentialRefreshSkewMs > Date.now()) {
      return Promise.resolve(cached);
    }
    if (cached) {
      emitFastApiState({ status: "expired", resourceReleaseUid: targetUid, attempt });
    }
    credentialCache.delete(targetUid);
    const existing = pendingByTarget.get(targetUid);
    if (existing) return raceWithAbort(existing, requestOptions?.signal);

    const requestId = createRequestId();
    emitFastApiState({ status: "authorizing", resourceReleaseUid: targetUid, attempt });
    const promise = new Promise<StaticSiteFastApiCredential>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingByRequestId.delete(requestId);
        pendingByTarget.delete(targetUid);
        reject(new StaticSiteFastApiCredentialError("temporarily_unavailable"));
      }, credentialRequestTimeoutMs);
      pendingByRequestId.set(requestId, { targetUid, timeout, resolve, reject });
      const message = buildStaticSiteFastApiCredentialRequestMessage({
        channel,
        requestId,
        resourceReleaseUid: targetUid,
      });
      if (payloadSize(message) > maxPayloadBytes) {
        clearTimeout(timeout);
        pendingByRequestId.delete(requestId);
        reject(new StaticSiteFastApiCredentialError("invalid_request"));
        return;
      }
      options.parentWindow.postMessage(message, hostOrigin);
    });
    pendingByTarget.set(targetUid, promise);
    void promise.then(
      () => {
        if (pendingByTarget.get(targetUid) === promise) pendingByTarget.delete(targetUid);
      },
      () => {
        if (pendingByTarget.get(targetUid) === promise) pendingByTarget.delete(targetUid);
      },
    );
    return raceWithAbort(promise, requestOptions?.signal);
  }

  function requestFastApiCredential(
    request: StaticSiteFastApiCredentialRequest,
    requestOptions?: StaticSiteFastApiCredentialRequestOptions,
  ): Promise<StaticSiteFastApiCredential> {
    let targetUid: string;
    try {
      targetUid = requireCanonicalUuid(request.resourceReleaseUid, "FastAPI resource release UID");
    } catch {
      return Promise.reject(new StaticSiteFastApiCredentialError("invalid_request"));
    }
    const promise = requestFastApiCredentialInternal(request, requestOptions, 1);
    void promise.catch((error: unknown) => {
      if (isAbortError(error)) {
        emitFastApiState({ status: "cancelled", resourceReleaseUid: targetUid, attempt: 1 });
      } else if (error instanceof StaticSiteFastApiCredentialError) {
        emitCredentialErrorState(targetUid, 1, error);
      }
    });
    return promise;
  }

  const client: StaticSiteIframeClient = {
    announceReady() {
      if (disposed) throw new Error("Static-site iframe client is disposed.");
      options.parentWindow.postMessage(buildStaticSiteIframeReadyMessage(channel), hostOrigin);
    },
    handleMessage(event) {
      if (disposed || event.origin !== hostOrigin || event.source !== options.parentWindow) {
        return false;
      }
      if (payloadSize(event.data) > maxPayloadBytes) {
        options.onProtocolError?.("Static-site iframe payload exceeds the configured limit.");
        return false;
      }

      const initialization = readStaticSiteIframeInitializeMessage(event.data, channel);
      if (initialization) {
        const nextContext = readStaticSiteIframeContext(initialization);
        if (currentUserUid !== undefined && nextContext.userUid !== currentUserUid) {
          clearCredentials("access_denied");
          rejectPendingWebSocketTickets("access_denied");
          closeActiveWebSockets();
          fastApiStates.clear();
        }
        currentUserUid = nextContext.userUid;
        initialized = true;
        options.onContext(nextContext);
        return true;
      }

      const response = readStaticSiteFastApiCredentialResponseMessage(event.data, channel);
      if (response) {
        const pending = pendingByRequestId.get(response.payload.requestId);
        if (!pending || pending.targetUid !== response.payload.resourceReleaseUid) {
          options.onProtocolError?.("Rejected unmatched static-site FastAPI credential response.");
          return false;
        }
        clearTimeout(pending.timeout);
        pendingByRequestId.delete(response.payload.requestId);
        const { requestId: _requestId, ...credential } = response.payload;
        credentialCache.set(credential.resourceReleaseUid, credential);
        pending.resolve(credential);
        return true;
      }

      const errorMessage = readStaticSiteFastApiCredentialErrorMessage(event.data, channel);
      if (errorMessage) {
        const pending = pendingByRequestId.get(errorMessage.payload.requestId);
        if (!pending || pending.targetUid !== errorMessage.payload.resourceReleaseUid) {
          options.onProtocolError?.("Rejected unmatched static-site FastAPI credential error.");
          return false;
        }
        clearTimeout(pending.timeout);
        pendingByRequestId.delete(errorMessage.payload.requestId);
        pending.reject(new StaticSiteFastApiCredentialError(errorMessage.payload.code));
        return true;
      }

      const webSocketResponse = readStaticSiteFastApiWebSocketTicketResponseMessage(
        event.data,
        channel,
      );
      if (webSocketResponse) {
        const pending = pendingWebSocketTickets.get(webSocketResponse.payload.requestId);
        if (
          !pending ||
          pending.targetUid !== webSocketResponse.payload.resourceReleaseUid ||
          pending.path !== webSocketResponse.payload.path
        ) {
          options.onProtocolError?.("Rejected unmatched static-site FastAPI WebSocket response.");
          return false;
        }
        const parsedUrl = new URL(webSocketResponse.payload.websocketUrl);
        if (globalThis.location?.protocol === "https:" && parsedUrl.protocol !== "wss:") {
          clearTimeout(pending.timeout);
          pendingWebSocketTickets.delete(webSocketResponse.payload.requestId);
          pending.removeAbortListener();
          pending.reject(new StaticSiteFastApiWebSocketError("invalid_request"));
          options.onProtocolError?.("Rejected insecure static-site FastAPI WebSocket response.");
          return false;
        }
        clearTimeout(pending.timeout);
        pendingWebSocketTickets.delete(webSocketResponse.payload.requestId);
        pending.removeAbortListener();
        const { requestId: _requestId, ...wireTicket } = webSocketResponse.payload;
        const childOrigin =
          globalThis.location?.origin && globalThis.location.origin !== "null"
            ? globalThis.location.origin
            : `${parsedUrl.protocol === "wss:" ? "https:" : "http:"}//${parsedUrl.host}`;
        pending.resolve({ ...wireTicket, origin: childOrigin });
        return true;
      }

      const webSocketError = readStaticSiteFastApiWebSocketTicketErrorMessage(
        event.data,
        channel,
      );
      if (webSocketError) {
        const pending = pendingWebSocketTickets.get(webSocketError.payload.requestId);
        if (
          !pending ||
          pending.targetUid !== webSocketError.payload.resourceReleaseUid ||
          pending.path !== webSocketError.payload.path
        ) {
          options.onProtocolError?.("Rejected unmatched static-site FastAPI WebSocket error.");
          return false;
        }
        clearTimeout(pending.timeout);
        pendingWebSocketTickets.delete(webSocketError.payload.requestId);
        pending.removeAbortListener();
        pending.reject(new StaticSiteFastApiWebSocketError(webSocketError.payload.code));
        return true;
      }

      const candidate = readCandidateRequestBinding(event.data);
      if (candidate) {
        const pending = pendingByRequestId.get(candidate.requestId);
        if (pending && pending.targetUid === candidate.resourceReleaseUid) {
          clearTimeout(pending.timeout);
          pendingByRequestId.delete(candidate.requestId);
          pending.reject(new StaticSiteFastApiCredentialError("invalid_request"));
        }
        const pendingWebSocket = pendingWebSocketTickets.get(candidate.requestId);
        if (
          pendingWebSocket &&
          pendingWebSocket.targetUid === candidate.resourceReleaseUid &&
          isRecord(event.data) &&
          isRecord(event.data.payload) &&
          readStaticSiteFastApiWebSocketPath(event.data.payload.path) === pendingWebSocket.path
        ) {
          clearTimeout(pendingWebSocket.timeout);
          pendingWebSocketTickets.delete(candidate.requestId);
          pendingWebSocket.removeAbortListener();
          pendingWebSocket.reject(new StaticSiteFastApiWebSocketError("invalid_request"));
        }
      }
      options.onProtocolError?.("Rejected malformed static-site iframe message.");
      return false;
    },
    requestFastApiCredential,
    async createFastApiWebSocket(request, requestOptions) {
      let targetUid: string;
      let path: string;
      let applicationProtocols: string[];
      try {
        targetUid = requireExactCanonicalUuid(
          request.resourceReleaseUid,
          "FastAPI WebSocket resource release UID",
        );
        path = requireStaticSiteFastApiWebSocketPath(request.path);
        applicationProtocols = normalizeApplicationWebSocketProtocols(request.protocols);
      } catch (error) {
        if (error instanceof StaticSiteFastApiWebSocketError) throw error;
        throw new StaticSiteFastApiWebSocketError("invalid_request");
      }
      if (requestOptions?.signal?.aborted) throw createAbortError();
      if (typeof globalThis.WebSocket !== "function") {
        throw new StaticSiteFastApiWebSocketError("unsupported");
      }

      const ticket = await requestFastApiWebSocketTicket(
        { resourceReleaseUid: targetUid, path },
        requestOptions?.signal,
      );
      if (requestOptions?.signal?.aborted) throw createAbortError();
      const responseUrl = new URL(ticket.websocketUrl);
      if (
        ticket.resourceReleaseUid !== targetUid ||
        ticket.path !== path ||
        Date.parse(ticket.expiresAt) <= Date.now() ||
        !WEBSOCKET_TICKET_SUBPROTOCOL_PATTERN.test(ticket.subprotocol) ||
        responseUrl.pathname !== path ||
        responseUrl.search !== "" ||
        responseUrl.hash !== "" ||
        (globalThis.location?.protocol === "https:" && responseUrl.protocol !== "wss:")
      ) {
        throw new StaticSiteFastApiWebSocketError("invalid_request");
      }
      const protocols = [
        ticket.subprotocol,
        STATIC_SITE_FAST_API_WEBSOCKET_ACK_PROTOCOL,
        ...applicationProtocols,
      ];
      validateWebSocketProtocolHeader(protocols);
      if (requestOptions?.signal?.aborted) throw createAbortError();

      let socket: WebSocket;
      try {
        socket = new globalThis.WebSocket(ticket.websocketUrl, protocols);
      } catch {
        throw new StaticSiteFastApiWebSocketError("invalid_request");
      }
      const handleClose = () => activeWebSockets.delete(socket);
      socket.addEventListener("close", handleClose, { once: true });
      activeWebSockets.add(socket);
      return socket;
    },
    async fetchFastApi(request, init) {
      let targetUid: string;
      try {
        targetUid = requireCanonicalUuid(
          request.resourceReleaseUid,
          "FastAPI resource release UID",
        );
      } catch {
        throw new StaticSiteFastApiCredentialError("invalid_request");
      }
      const fetcher = options.fetcher ?? globalThis.fetch;
      if (typeof fetcher !== "function") {
        emitFastApiState({ status: "unsupported", resourceReleaseUid: targetUid, attempt: 1 });
        throw new StaticSiteFastApiCredentialError("unsupported");
      }
      const retryPolicy = normalizeFastApiRetryPolicy(request.retry, options.fastApiRetryPolicy);
      const method = (init?.method ?? "GET").toUpperCase();
      const mayRetryRequest = canRetryFastApiMethod(method, retryPolicy);
      let attempt = 1;
      let refreshedAfterUnauthorized = false;

      while (true) {
        let credential: StaticSiteFastApiCredential;
        try {
          credential = await requestFastApiCredentialInternal(
            { resourceReleaseUid: targetUid },
            { signal: init?.signal ?? undefined },
            attempt,
          );
        } catch (error) {
          if (isAbortError(error)) {
            emitFastApiState({ status: "cancelled", resourceReleaseUid: targetUid, attempt });
            throw error;
          }
          if (error instanceof StaticSiteFastApiCredentialError) {
            emitCredentialErrorState(targetUid, attempt, error);
            const retryableCredentialFailure =
              error.code === "runtime_starting" || error.code === "temporarily_unavailable";
            if (retryableCredentialFailure && attempt < retryPolicy.maxAttempts) {
              const retryDelayMs = resolveRetryDelayMs(null, attempt, retryPolicy);
              emitFastApiState({
                status: error.code === "runtime_starting" ? "runtime-starting" : "transient",
                resourceReleaseUid: targetUid,
                attempt,
                retryDelayMs,
              });
              await waitForNextFastApiAttempt(
                targetUid,
                attempt,
                retryDelayMs,
                init?.signal ?? undefined,
              );
              attempt += 1;
              continue;
            }
          }
          throw error;
        }

        let requestUrl: URL;
        try {
          requestUrl = resolveFastApiRequestUrl(credential.rpcUrl, request.path);
        } catch (error) {
          emitFastApiState({ status: "invalid", resourceReleaseUid: targetUid, attempt });
          throw error;
        }
        const headers = new Headers(init?.headers);
        headers.delete("X-FastAPI-ID");
        headers.set("Authorization", `Bearer ${credential.token}`);
        headers.set("X-Resource-Release-UID", credential.resourceReleaseUid);

        try {
          const response = await fetcher(requestUrl, { ...init, headers });
          if (response.status === 401) {
            credentialCache.delete(targetUid);
            emitFastApiState({
              status: "expired",
              resourceReleaseUid: targetUid,
              attempt,
              responseStatus: response.status,
            });
            if (!refreshedAfterUnauthorized && attempt < retryPolicy.maxAttempts) {
              refreshedAfterUnauthorized = true;
              attempt += 1;
              continue;
            }
            emitFastApiState({
              status: "authentication-failed",
              resourceReleaseUid: targetUid,
              attempt,
              responseStatus: response.status,
            });
            return response;
          }
          if (response.status === 403) {
            emitFastApiState({
              status: "forbidden",
              resourceReleaseUid: targetUid,
              attempt,
              responseStatus: response.status,
            });
            return response;
          }
          if (response.status === 404) {
            emitFastApiState({
              status: "missing-route",
              resourceReleaseUid: targetUid,
              attempt,
              responseStatus: response.status,
            });
            return response;
          }
          if (FAST_API_STARTING_STATUSES.has(response.status)) {
            const retryDelayMs = resolveRetryDelayMs(response, attempt, retryPolicy);
            emitFastApiState({
              status: "runtime-starting",
              resourceReleaseUid: targetUid,
              attempt,
              responseStatus: response.status,
              ...(mayRetryRequest && attempt < retryPolicy.maxAttempts ? { retryDelayMs } : {}),
            });
            if (mayRetryRequest && attempt < retryPolicy.maxAttempts) {
              await waitForNextFastApiAttempt(
                targetUid,
                attempt,
                retryDelayMs,
                init?.signal ?? undefined,
              );
              attempt += 1;
              continue;
            }
            emitFastApiState({
              status: "transient",
              resourceReleaseUid: targetUid,
              attempt,
              responseStatus: response.status,
            });
            return response;
          }
          emitFastApiState({
            status: "ready",
            resourceReleaseUid: targetUid,
            attempt,
            responseStatus: response.status,
          });
          return response;
        } catch (error) {
          if (isAbortError(error) || init?.signal?.aborted) {
            emitFastApiState({ status: "cancelled", resourceReleaseUid: targetUid, attempt });
            throw isAbortError(error) ? error : createAbortError();
          }
          const retryDelayMs = resolveRetryDelayMs(null, attempt, retryPolicy);
          emitFastApiState({
            status: "transient",
            resourceReleaseUid: targetUid,
            attempt,
            ...(mayRetryRequest && attempt < retryPolicy.maxAttempts ? { retryDelayMs } : {}),
          });
          if (!mayRetryRequest || attempt >= retryPolicy.maxAttempts) throw error;
          await waitForNextFastApiAttempt(
            targetUid,
            attempt,
            retryDelayMs,
            init?.signal ?? undefined,
          );
          attempt += 1;
        }
      }
    },
    getFastApiState(resourceReleaseUid) {
      const targetUid = requireCanonicalUuid(
        resourceReleaseUid,
        "FastAPI resource release UID",
      );
      return (
        fastApiStates.get(targetUid) ?? {
          status: "idle",
          resourceReleaseUid: targetUid,
          attempt: 0,
        }
      );
    },
    clearFastApiCredentials() {
      clearCredentials("unsupported");
      rejectPendingWebSocketTickets("unsupported");
      closeActiveWebSockets();
      fastApiStates.clear();
    },
    dispose() {
      disposed = true;
      initialized = false;
      currentUserUid = undefined;
      clearCredentials("unsupported");
      fastApiStates.clear();
    },
  };

  return client;
}
