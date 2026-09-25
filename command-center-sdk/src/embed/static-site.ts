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
const DEFAULT_PLATFORM_REQUEST_HOST_TIMEOUT_MS = 60_000;
// Longer than the host's, so a client timeout means the host never answered: an older host.
const DEFAULT_PLATFORM_REQUEST_CLIENT_TIMEOUT_MS = 65_000;
// Per child. The client queues past it; the host refuses past it with temporarily_unavailable.
const MAX_PLATFORM_REQUESTS_IN_FLIGHT = 16;
const MAX_PLATFORM_PATH_LENGTH = 4_096;
const MAX_PLATFORM_HEADER_VALUE_LENGTH = 1_024;
const MAX_PLATFORM_USER_UID_LENGTH = 1_024;
const MAX_PLATFORM_REQUEST_BODY_BYTES = 1_048_576;
const MAX_PLATFORM_RESPONSE_BODY_BYTES = 8_388_608;
const MAX_PLATFORM_RESPONSE_BASE64_LENGTH = 4 * Math.ceil(MAX_PLATFORM_RESPONSE_BODY_BYTES / 3);
// A multiple of three, so the base64 of consecutive chunks concatenates without inner padding.
const BASE64_CHUNK_BYTES = 24_576;
const PLATFORM_REQUEST_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const PLATFORM_REQUEST_HEADER_NAMES = ["accept", "content-type"] as const;
const PLATFORM_RESPONSE_HEADER_NAMES = ["content-type"] as const;
// Printable ASCII the URL parser leaves in a path or query, without `"`, `#`, `<`, `>`, or `\`.
const PLATFORM_PATH_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@/?%\[\]^`{|}-]*$/u;
const PLATFORM_HEADER_VALUE_PATTERN = /^[!-~](?:[ -~]*[!-~])?$/u;
const PLATFORM_NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

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

export type StaticSitePlatformRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** The only request headers that cross the bridge. A credential never does. */
export type StaticSitePlatformRequestHeaders = {
  accept?: string;
  "content-type"?: string;
};

/** The only response header that crosses the bridge. */
export type StaticSitePlatformResponseHeaders = {
  "content-type"?: string;
};

/** `text` for JSON and UTF-8 `text/*` bodies, `base64` for every other body. */
export type StaticSitePlatformResponseBodyEncoding = "text" | "base64";

export type StaticSitePlatformRequestErrorCode =
  | "invalid_request"
  | "access_denied"
  | "not_allowed"
  | "temporarily_unavailable"
  | "unsupported";

/** A platform request from the child, as the host's sender receives it. */
export interface StaticSitePlatformRequest {
  method: StaticSitePlatformRequestMethod;
  /** An absolute path with an optional query, such as `/api/items/?limit=20`. */
  path: string;
  headers: StaticSitePlatformRequestHeaders;
  /** Text; absent when the request has no body. */
  body?: string;
}

export interface StaticSitePlatformRequestSenderContext {
  /** Aborted when the host abandons the request. */
  signal: AbortSignal;
  /** The signed-in person in the host's current context: send the request as them. */
  userUid: string;
}

/**
 * Sends a child's platform request as the signed-in person, typically with the host's own
 * authenticated fetch, and returns the platform's response. It refuses a path or method the host
 * does not serve by throwing `StaticSitePlatformRequestError("not_allowed")`.
 */
export type SendStaticSitePlatformRequest = (
  request: StaticSitePlatformRequest,
  context: StaticSitePlatformRequestSenderContext,
) => Promise<Response>;

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

export interface StaticSitePlatformRequestMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "platform-request";
  payload: {
    requestId: string;
    /** The person the child believes is signed in, from its current host context. */
    userUid: string;
    method: StaticSitePlatformRequestMethod;
    path: string;
    headers?: StaticSitePlatformRequestHeaders;
    body?: string;
  };
}

export interface StaticSitePlatformResponseMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "platform-response";
  payload: {
    requestId: string;
    status: number;
    headers: StaticSitePlatformResponseHeaders;
    body: string;
    bodyEncoding: StaticSitePlatformResponseBodyEncoding;
  };
}

export interface StaticSitePlatformErrorMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "platform-error";
  payload: {
    requestId: string;
    code: StaticSitePlatformRequestErrorCode;
  };
}

export interface StaticSitePlatformCancelMessage {
  channel: StaticSiteIframeChannel;
  version: typeof STATIC_SITE_IFRAME_PROTOCOL_VERSION;
  type: "platform-cancel";
  payload: {
    requestId: string;
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
  | StaticSiteFastApiWebSocketTicketErrorMessage
  | StaticSitePlatformRequestMessage
  | StaticSitePlatformResponseMessage
  | StaticSitePlatformErrorMessage
  | StaticSitePlatformCancelMessage;

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

export class StaticSitePlatformRequestError extends Error {
  readonly code: StaticSitePlatformRequestErrorCode;

  constructor(code: StaticSitePlatformRequestErrorCode, message?: string) {
    super(message ?? staticSitePlatformRequestErrorMessage(code));
    this.name = "StaticSitePlatformRequestError";
    this.code = code;
  }
}

export interface StaticSiteIframeHostOptions {
  targetOrigin: string;
  targetWindow: Pick<Window, "postMessage">;
  context: StaticSiteIframeContextInput;
  resolveFastApiCredential?: ResolveStaticSiteFastApiCredential;
  resolveFastApiWebSocketTicket?: ResolveStaticSiteFastApiWebSocketTicket;
  /** Sends the child's platform requests; without it, they are `unsupported`. */
  sendPlatformRequest?: SendStaticSitePlatformRequest;
  maxPayloadBytes?: number;
  handshakeTimeoutMs?: number;
  credentialRequestTimeoutMs?: number;
  webSocketTicketRequestTimeoutMs?: number;
  platformRequestTimeoutMs?: number;
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
  updatePlatformRequestSender(sender?: SendStaticSitePlatformRequest): void;
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
  platformRequestTimeoutMs?: number;
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
  /**
   * Sends a platform request through the host, which sends it as the signed-in person and returns
   * the platform's response. Only the method, the path and query, `accept`, `content-type`, and a
   * text body cross the bridge; the response carries the status, `content-type`, and the body.
   * Aborting `request.signal` cancels it.
   */
  sendPlatformRequest(request: Request): Promise<Response>;
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

interface PendingPlatformRequest {
  requestId: string;
  message: StaticSitePlatformRequestMessage;
  /** Set once the request is sent; a queued request has none. */
  timeout?: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

type StaticSitePlatformResponse = Omit<StaticSitePlatformResponseMessage["payload"], "requestId">;

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

function isPlatformRequestErrorCode(value: unknown): value is StaticSitePlatformRequestErrorCode {
  return [
    "invalid_request",
    "access_denied",
    "not_allowed",
    "temporarily_unavailable",
    "unsupported",
  ].includes(String(value));
}

function staticSitePlatformRequestErrorMessage(code: StaticSitePlatformRequestErrorCode): string {
  switch (code) {
    case "invalid_request":
      return "The platform request is invalid.";
    case "access_denied":
      return "The host cannot send this platform request as the signed-in person.";
    case "not_allowed":
      return "The host does not serve this platform path or method.";
    case "temporarily_unavailable":
      return "The platform request is temporarily unavailable.";
    case "unsupported":
      return "The host does not support this platform request.";
  }
}

function isPlatformRequestMethod(value: unknown): value is StaticSitePlatformRequestMethod {
  return typeof value === "string" && PLATFORM_REQUEST_METHODS.has(value);
}

function readPlatformRequestId(value: unknown): string | null {
  // The length check first keeps an oversized value from being scanned.
  return typeof value === "string" && value.length <= 128 ? readExactRequestId(value) : null;
}

/** A person's public uid: non-empty, at most 1,024 code points (JSON Schema's count). */
function readPlatformUserUid(value: unknown): string | null {
  // A code point takes one or two UTF-16 code units; the first check keeps the count bounded.
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length > MAX_PLATFORM_USER_UID_LENGTH * 2) return null;
  return [...value].length <= MAX_PLATFORM_USER_UID_LENGTH ? value : null;
}

/**
 * An absolute path with an optional query, as the URL parser serializes one: printable ASCII, well
 * formed percent-encoding, and no fragment or backslash. The path part has no empty segment (so
 * no `//` prefix), no dot segment even percent-encoded, and no encoded slash or backslash, so a
 * host allow-list that compares path prefixes compares the path the platform routes.
 */
function readStaticSitePlatformPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_PLATFORM_PATH_LENGTH) return null;
  if (!PLATFORM_PATH_PATTERN.test(value) || /%(?![0-9A-Fa-f]{2})/u.test(value)) return null;
  const queryStart = value.indexOf("?");
  const pathPart = queryStart === -1 ? value : value.slice(0, queryStart);
  if (pathPart.includes("//") || /%(?:2f|5c)/iu.test(pathPart)) return null;
  if (pathPart.split("/").some((segment) => /^(?:\.|%2e){1,2}$/iu.test(segment))) return null;
  return value;
}

function readPlatformHeaderValue(value: unknown): string | null {
  return typeof value === "string" &&
    value.length <= MAX_PLATFORM_HEADER_VALUE_LENGTH &&
    PLATFORM_HEADER_VALUE_PATTERN.test(value)
    ? value
    : null;
}

/** Only the named headers, each a printable ASCII value; an `undefined` value counts as absent. */
function readPlatformHeaders<Name extends string>(
  value: unknown,
  names: readonly Name[],
): Partial<Record<Name, string>> | null {
  if (!isRecord(value) || !hasOnlyKeys(value, names)) return null;
  const headers: Partial<Record<Name, string>> = {};
  for (const name of names) {
    if (value[name] === undefined) continue;
    const header = readPlatformHeaderValue(value[name]);
    if (!header) return null;
    headers[name] = header;
  }
  return headers;
}

/** Whether the UTF-8 encoding of `value` fits in `maxBytes`, without encoding it. */
function fitsUtf8ByteLength(value: string, maxBytes: number): boolean {
  // Every UTF-16 code unit takes at least one UTF-8 byte.
  if (value.length > maxBytes) return false;
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > maxBytes) return false;
  }
  return true;
}

function readPlatformRequestBody(value: unknown): string | null {
  return typeof value === "string" && fitsUtf8ByteLength(value, MAX_PLATFORM_REQUEST_BODY_BYTES)
    ? value
    : null;
}

/** The decoded length of canonical padded base64, or null for anything else. */
function readBase64DecodedLength(value: string): number | null {
  if (value.length % 4 !== 0) return null;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  for (let index = 0; index < value.length - padding; index += 1) {
    const code = value.charCodeAt(index);
    const inAlphabet =
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x2b ||
      code === 0x2f;
    if (!inAlphabet) return null;
  }
  return (value.length / 4) * 3 - padding;
}

function readPlatformResponseBody(
  value: unknown,
  encoding: StaticSitePlatformResponseBodyEncoding,
): string | null {
  if (typeof value !== "string") return null;
  if (encoding === "text") {
    return fitsUtf8ByteLength(value, MAX_PLATFORM_RESPONSE_BODY_BYTES) ? value : null;
  }
  if (value.length > MAX_PLATFORM_RESPONSE_BASE64_LENGTH) return null;
  const decodedLength = readBase64DecodedLength(value);
  return decodedLength !== null && decodedLength <= MAX_PLATFORM_RESPONSE_BODY_BYTES ? value : null;
}

function isPlatformResponseStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}

function isPlatformResponseBodyEncoding(
  value: unknown,
): value is StaticSitePlatformResponseBodyEncoding {
  return value === "text" || value === "base64";
}

/** Strict UTF-8 that keeps a byte-order mark, so re-encoding the text restores the exact bytes. */
function decodeUtf8Exactly(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += BASE64_CHUNK_BYTES) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES))));
  }
  return chunks.join("");
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** JSON and `text/*` travel as text when their charset is UTF-8 or unstated; nothing else does. */
function isTextualContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const [essence = "", ...parameters] = contentType.split(";");
  const mediaType = essence.trim().toLowerCase();
  if (
    mediaType !== "application/json" &&
    !/^application\/[^/\s]+\+json$/u.test(mediaType) &&
    !/^text\/[^/\s]+$/u.test(mediaType)
  ) {
    return false;
  }
  return parameters.every((parameter) => {
    const separator = parameter.indexOf("=");
    if (separator === -1 || parameter.slice(0, separator).trim().toLowerCase() !== "charset") {
      return true;
    }
    const charset = parameter
      .slice(separator + 1)
      .trim()
      .replace(/^"(.*)"$/u, "$1")
      .toLowerCase();
    return charset === "utf-8" || charset === "utf8";
  });
}

function isResponseLike(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Response).status === "number" &&
    typeof (value as Response).headers?.get === "function" &&
    typeof (value as Response).arrayBuffer === "function"
  );
}

function discardResponseBody(value: unknown): void {
  try {
    if (isResponseLike(value) && value.body && !value.bodyUsed) {
      void value.body.cancel().catch(() => undefined);
    }
  } catch {
    // A body that cannot be cancelled is left to garbage collection.
  }
}

/** The body's bytes, read up to the response cap; past it the answer is `unsupported`. */
async function readPlatformResponseBytes(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = response.body;
  if (stream === null) return new Uint8Array(new ArrayBuffer(0));
  if (!stream || typeof stream.getReader !== "function") {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PLATFORM_RESPONSE_BODY_BYTES) {
      throw new StaticSitePlatformRequestError("unsupported");
    }
    return new Uint8Array(buffer);
  }
  const reader = stream.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw createAbortError("The platform request was cancelled.");
      const { done, value } = await reader.read();
      if (done) break;
      // A realm-independent check: the Response may come from another frame.
      if (!ArrayBuffer.isView(value)) throw new Error("The platform response body is not bytes.");
      total += value.byteLength;
      if (total > MAX_PLATFORM_RESPONSE_BODY_BYTES) {
        cancel();
        throw new StaticSitePlatformRequestError("unsupported");
      }
      chunks.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  if (signal.aborted) throw createAbortError("The platform request was cancelled.");
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads the sender's Response into the wire answer, choosing the body encoding. */
async function readStaticSitePlatformResponse(
  value: unknown,
  signal: AbortSignal,
): Promise<StaticSitePlatformResponse> {
  // A network error or an opaque response has status 0; neither is a platform answer.
  if (
    !isResponseLike(value) ||
    !Number.isInteger(value.status) ||
    value.status < 200 ||
    value.status > 599
  ) {
    discardResponseBody(value);
    throw new Error("The platform request sender did not return a usable Response.");
  }
  const contentType = readPlatformHeaderValue(value.headers.get("content-type"));
  const bytes = await readPlatformResponseBytes(value, signal);
  const text = isTextualContentType(contentType) ? decodeUtf8Exactly(bytes) : null;
  return {
    status: value.status,
    headers: contentType ? { "content-type": contentType } : {},
    ...(text === null
      ? { body: encodeBase64(bytes), bodyEncoding: "base64" as const }
      : { body: text, bodyEncoding: "text" as const }),
  };
}

/** The Fetch Response the child receives: status, `content-type`, and the decoded body. */
function createStaticSitePlatformResponse(answer: StaticSitePlatformResponse): Response {
  const headers = new Headers();
  const contentType = answer.headers["content-type"];
  if (contentType) headers.set("content-type", contentType);
  const body = PLATFORM_NULL_BODY_STATUSES.has(answer.status)
    ? null
    : answer.bodyEncoding === "base64"
      ? decodeBase64(answer.body)
      : answer.body;
  // The Fetch API cannot represent a status below 200; the caller reports that as unsupported.
  return new Response(body, { status: answer.status, headers });
}

/** The wire form of a child's Fetch Request, or `invalid_request`. */
async function serializeStaticSitePlatformRequest(
  request: Request,
): Promise<StaticSitePlatformRequest> {
  const invalid = () => new StaticSitePlatformRequestError("invalid_request");
  if (
    typeof request !== "object" ||
    request === null ||
    typeof request.url !== "string" ||
    typeof request.method !== "string" ||
    typeof request.headers?.get !== "function"
  ) {
    throw invalid();
  }
  // The Fetch API upper-cases only some methods; `patch` stays lower-case.
  const method = request.method.toUpperCase();
  if (!isPlatformRequestMethod(method)) throw invalid();
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw invalid();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw invalid();
  // The URL's origin and fragment stay behind: the host decides where the request goes.
  const path = readStaticSitePlatformPath(`${url.pathname}${url.search}`);
  if (!path) throw invalid();
  const headers: StaticSitePlatformRequestHeaders = {};
  for (const name of PLATFORM_REQUEST_HEADER_NAMES) {
    const value = request.headers.get(name);
    if (value === null) continue;
    const header = readPlatformHeaderValue(value);
    if (!header) throw invalid();
    headers[name] = header;
  }
  if (method === "GET" || request.body === null) return { method, path, headers };
  if (request.bodyUsed) throw invalid();
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    throw invalid();
  }
  if (bytes.byteLength > MAX_PLATFORM_REQUEST_BODY_BYTES) throw invalid();
  const body = decodeUtf8Exactly(bytes);
  if (body === null) throw invalid();
  return { method, path, headers, body };
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

function createAbortError(message = "The FastAPI request was cancelled."): Error {
  if (typeof DOMException === "function") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
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

function readStaticSitePlatformEnvelope(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
  type: StaticSiteIframeMessage["type"],
  payloadKeys: readonly string[],
): Record<string, unknown> | null {
  if (!isRecord(value) || value.channel !== requireStaticSiteIframeChannel(expectedChannel)) {
    return null;
  }
  if (
    value.version !== STATIC_SITE_IFRAME_PROTOCOL_VERSION ||
    value.type !== type ||
    !isRecord(value.payload) ||
    !hasOnlyKeys(value, ["channel", "version", "type", "payload"]) ||
    !hasOnlyKeys(value.payload, payloadKeys)
  ) {
    return null;
  }
  return value.payload;
}

export function buildStaticSitePlatformRequestMessage({
  channel,
  requestId,
  userUid,
  method,
  path,
  headers,
  body,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  userUid: string;
  method: StaticSitePlatformRequestMethod;
  path: string;
  headers?: StaticSitePlatformRequestHeaders;
  body?: string;
}): StaticSitePlatformRequestMessage {
  const normalizedRequestId = readPlatformRequestId(requestId);
  if (!normalizedRequestId) throw new Error("Platform requestId is invalid.");
  const normalizedUserUid = readPlatformUserUid(userUid);
  if (!normalizedUserUid) {
    throw new Error(
      "Platform request userUid must be a non-empty string of at most 1,024 characters.",
    );
  }
  if (!isPlatformRequestMethod(method)) {
    throw new Error("Platform request method must be GET, POST, PUT, PATCH, or DELETE.");
  }
  const normalizedPath = readStaticSitePlatformPath(path);
  if (!normalizedPath) {
    throw new Error("Platform request path must be a safe absolute path with an optional query.");
  }
  const normalizedHeaders = readPlatformHeaders(headers ?? {}, PLATFORM_REQUEST_HEADER_NAMES);
  if (!normalizedHeaders) {
    throw new Error("Platform request headers are limited to accept and content-type.");
  }
  if (body !== undefined && readPlatformRequestBody(body) === null) {
    throw new Error("Platform request body must be text of at most 1 MiB.");
  }
  if (method === "GET" && body !== undefined) {
    throw new Error("A GET platform request has no body.");
  }
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "platform-request",
    payload: {
      requestId: normalizedRequestId,
      userUid: normalizedUserUid,
      method,
      path: normalizedPath,
      ...(Object.keys(normalizedHeaders).length > 0 ? { headers: normalizedHeaders } : {}),
      ...(body === undefined ? {} : { body }),
    },
  };
}

export function readStaticSitePlatformRequestMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSitePlatformRequestMessage | null {
  const payload = readStaticSitePlatformEnvelope(value, expectedChannel, "platform-request", [
    "requestId",
    "userUid",
    "method",
    "path",
    "headers",
    "body",
  ]);
  if (!payload) return null;
  const requestId = readPlatformRequestId(payload.requestId);
  const userUid = readPlatformUserUid(payload.userUid);
  const method = isPlatformRequestMethod(payload.method) ? payload.method : null;
  const path = readStaticSitePlatformPath(payload.path);
  const headers =
    payload.headers === undefined
      ? {}
      : readPlatformHeaders(payload.headers, PLATFORM_REQUEST_HEADER_NAMES);
  const body = payload.body === undefined ? undefined : readPlatformRequestBody(payload.body);
  if (!requestId || !userUid || !method || !path || !headers || body === null) return null;
  if (method === "GET" && body !== undefined) return null;
  return buildStaticSitePlatformRequestMessage({
    channel: expectedChannel,
    requestId,
    userUid,
    method,
    path,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

export function buildStaticSitePlatformResponseMessage({
  channel,
  requestId,
  status,
  headers,
  body,
  bodyEncoding,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  status: number;
  headers?: StaticSitePlatformResponseHeaders;
  body: string;
  bodyEncoding: StaticSitePlatformResponseBodyEncoding;
}): StaticSitePlatformResponseMessage {
  const normalizedRequestId = readPlatformRequestId(requestId);
  if (!normalizedRequestId) throw new Error("Platform requestId is invalid.");
  if (!isPlatformResponseStatus(status)) {
    throw new Error("Platform response status must be an integer from 100 to 599.");
  }
  const normalizedHeaders = readPlatformHeaders(headers ?? {}, PLATFORM_RESPONSE_HEADER_NAMES);
  if (!normalizedHeaders) throw new Error("Platform response headers are limited to content-type.");
  if (!isPlatformResponseBodyEncoding(bodyEncoding)) {
    throw new Error('Platform response bodyEncoding must be "text" or "base64".');
  }
  if (readPlatformResponseBody(body, bodyEncoding) === null) {
    throw new Error("Platform response body must be text or base64 of at most 8 MiB.");
  }
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "platform-response",
    payload: {
      requestId: normalizedRequestId,
      status,
      headers: normalizedHeaders,
      body,
      bodyEncoding,
    },
  };
}

export function readStaticSitePlatformResponseMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSitePlatformResponseMessage | null {
  const payload = readStaticSitePlatformEnvelope(value, expectedChannel, "platform-response", [
    "requestId",
    "status",
    "headers",
    "body",
    "bodyEncoding",
  ]);
  if (!payload) return null;
  const requestId = readPlatformRequestId(payload.requestId);
  const headers = readPlatformHeaders(payload.headers, PLATFORM_RESPONSE_HEADER_NAMES);
  const bodyEncoding = isPlatformResponseBodyEncoding(payload.bodyEncoding)
    ? payload.bodyEncoding
    : null;
  if (!requestId || !isPlatformResponseStatus(payload.status) || !headers || !bodyEncoding) {
    return null;
  }
  const body = readPlatformResponseBody(payload.body, bodyEncoding);
  if (body === null) return null;
  return {
    channel: expectedChannel,
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "platform-response",
    payload: { requestId, status: payload.status, headers, body, bodyEncoding },
  };
}

export function buildStaticSitePlatformErrorMessage({
  channel,
  requestId,
  code,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
  code: StaticSitePlatformRequestErrorCode;
}): StaticSitePlatformErrorMessage {
  const normalizedRequestId = readPlatformRequestId(requestId);
  if (!normalizedRequestId) throw new Error("Platform requestId is invalid.");
  if (!isPlatformRequestErrorCode(code)) throw new Error("Platform request error code is invalid.");
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "platform-error",
    payload: { requestId: normalizedRequestId, code },
  };
}

export function readStaticSitePlatformErrorMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSitePlatformErrorMessage | null {
  const payload = readStaticSitePlatformEnvelope(value, expectedChannel, "platform-error", [
    "requestId",
    "code",
  ]);
  if (!payload) return null;
  const requestId = readPlatformRequestId(payload.requestId);
  if (!requestId || !isPlatformRequestErrorCode(payload.code)) return null;
  return buildStaticSitePlatformErrorMessage({
    channel: expectedChannel,
    requestId,
    code: payload.code,
  });
}

export function buildStaticSitePlatformCancelMessage({
  channel,
  requestId,
}: {
  channel: StaticSiteIframeChannel;
  requestId: string;
}): StaticSitePlatformCancelMessage {
  const normalizedRequestId = readPlatformRequestId(requestId);
  if (!normalizedRequestId) throw new Error("Platform requestId is invalid.");
  return {
    channel: requireStaticSiteIframeChannel(channel),
    version: STATIC_SITE_IFRAME_PROTOCOL_VERSION,
    type: "platform-cancel",
    payload: { requestId: normalizedRequestId },
  };
}

export function readStaticSitePlatformCancelMessage(
  value: unknown,
  expectedChannel: StaticSiteIframeChannel,
): StaticSitePlatformCancelMessage | null {
  const payload = readStaticSitePlatformEnvelope(value, expectedChannel, "platform-cancel", [
    "requestId",
  ]);
  if (!payload) return null;
  const requestId = readPlatformRequestId(payload.requestId);
  return requestId
    ? buildStaticSitePlatformCancelMessage({ channel: expectedChannel, requestId })
    : null;
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
    case "platform-request":
      return readStaticSitePlatformRequestMessage(value, expectedChannel);
    case "platform-response":
      return readStaticSitePlatformResponseMessage(value, expectedChannel);
    case "platform-error":
      return readStaticSitePlatformErrorMessage(value, expectedChannel);
    case "platform-cancel":
      return readStaticSitePlatformCancelMessage(value, expectedChannel);
    default:
      return null;
  }
}

/** A platform request or response carries a body past the default payload limit and has its own
 * caps, which its reader enforces field by field. */
function isPlatformBodyMessage(value: unknown, type: "platform-request" | "platform-response") {
  return isRecord(value) && value.type === type;
}

function resolvePlatformRequestErrorCode(error: unknown): StaticSitePlatformRequestErrorCode {
  return error instanceof StaticSitePlatformRequestError && isPlatformRequestErrorCode(error.code)
    ? error.code
    : "temporarily_unavailable";
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
  const platformRequestTimeoutMs =
    options.platformRequestTimeoutMs ?? DEFAULT_PLATFORM_REQUEST_HOST_TIMEOUT_MS;
  let context = normalizeContext(options.context);
  let handshake: StaticSiteIframeReadyMessage | null = null;
  let generation = 0;
  let resolveFastApiCredential = options.resolveFastApiCredential;
  let resolveFastApiWebSocketTicket = options.resolveFastApiWebSocketTicket;
  let platformRequestSender = options.sendPlatformRequest;
  let disposed = false;
  const activeCredentialRequests = new Map<string, ActiveHostCredentialRequest>();
  const activeWebSocketTicketRequests = new Map<string, ActiveHostWebSocketTicketRequest>();
  const activePlatformRequests = new Map<string, ActiveHostCredentialRequest>();
  const seenRequestIds = new Set<string>();
  const handshakeTimeout = setTimeout(() => {
    if (!handshake && !disposed) {
      options.onProtocolError?.("Static-site iframe handshake timed out.");
    }
  }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);

  function postMessage(message: StaticSiteIframeMessage): void {
    if (disposed) return;
    // A platform response's builder already holds its body to the response cap.
    if (message.type !== "platform-response" && payloadSize(message) > maxPayloadBytes) {
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

  /**
   * Aborts the sender's work for every platform request. With a code, the child is told, because
   * the child is still waiting; without one, the child already knows (a person change or its own
   * new handshake) or is gone.
   */
  function abortPlatformRequests(code?: StaticSitePlatformRequestErrorCode): void {
    const requestIds = [...activePlatformRequests.keys()];
    activePlatformRequests.forEach(({ controller, timeout }) => {
      clearTimeout(timeout);
      controller.abort();
    });
    activePlatformRequests.clear();
    if (code) requestIds.forEach((requestId) => postPlatformError(requestId, code));
  }

  function abortAllRequests(): void {
    abortCredentialRequests();
    abortWebSocketTicketRequests();
    abortPlatformRequests();
  }

  function postPlatformError(requestId: string, code: StaticSitePlatformRequestErrorCode): void {
    if (!handshake) return;
    postMessage(
      buildStaticSitePlatformErrorMessage({ channel: handshake.channel, requestId, code }),
    );
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

  function sendPlatformRequestForChild(message: StaticSitePlatformRequestMessage): void {
    const { requestId } = message.payload;
    if (!rememberRequestId(requestId)) {
      postPlatformError(requestId, "invalid_request");
      return;
    }
    const sender = platformRequestSender;
    if (!sender) {
      postPlatformError(requestId, "unsupported");
      return;
    }
    // The request names the person the child believed was signed in when it sent it. Sending only
    // for the host's current person means a person change in between never sends it as another.
    const userUid = context.userUid;
    if (!userUid || message.payload.userUid !== userUid) {
      postPlatformError(requestId, "access_denied");
      return;
    }
    if (activePlatformRequests.size >= MAX_PLATFORM_REQUESTS_IN_FLIGHT) {
      postPlatformError(requestId, "temporarily_unavailable");
      return;
    }

    const controller = new AbortController();
    const requestGeneration = generation;
    const activeRequest: ActiveHostCredentialRequest = {
      controller,
      generation: requestGeneration,
      timeout: setTimeout(() => {
        if (activePlatformRequests.get(requestId) !== activeRequest) return;
        activePlatformRequests.delete(requestId);
        controller.abort();
        postPlatformError(requestId, "temporarily_unavailable");
      }, platformRequestTimeoutMs),
    };
    activePlatformRequests.set(requestId, activeRequest);
    const isCurrent = () =>
      !disposed &&
      !controller.signal.aborted &&
      activePlatformRequests.get(requestId) === activeRequest &&
      generation === requestGeneration;
    const settle = () => {
      clearTimeout(activeRequest.timeout);
      activePlatformRequests.delete(requestId);
    };
    const { method, path, headers, body } = message.payload;
    const request: StaticSitePlatformRequest = {
      method,
      path,
      headers: { ...headers },
      ...(body === undefined ? {} : { body }),
    };

    void Promise.resolve()
      .then(() => sender(request, { signal: controller.signal, userUid }))
      .then((response) => {
        if (!isCurrent()) {
          discardResponseBody(response);
          return null;
        }
        return readStaticSitePlatformResponse(response, controller.signal);
      })
      .then(
        (answer) => {
          if (!answer || !isCurrent() || !handshake) return;
          settle();
          let response: StaticSitePlatformResponseMessage;
          try {
            response = buildStaticSitePlatformResponseMessage({
              channel: handshake.channel,
              requestId,
              ...answer,
            });
          } catch {
            postPlatformError(requestId, "temporarily_unavailable");
            return;
          }
          postMessage(response);
        },
        (error) => {
          if (!isCurrent()) return;
          settle();
          postPlatformError(requestId, resolvePlatformRequestErrorCode(error));
        },
      );
  }

  function cancelPlatformRequest(message: StaticSitePlatformCancelMessage): void {
    const activeRequest = activePlatformRequests.get(message.payload.requestId);
    if (!activeRequest || activeRequest.generation !== generation) return;
    clearTimeout(activeRequest.timeout);
    activePlatformRequests.delete(message.payload.requestId);
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
      if (
        !isPlatformBodyMessage(event.data, "platform-request") &&
        payloadSize(event.data) > maxPayloadBytes
      ) {
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
      const platformRequest = readStaticSitePlatformRequestMessage(event.data, handshake.channel);
      if (platformRequest) {
        sendPlatformRequestForChild(platformRequest);
        return true;
      }
      const platformCancel = readStaticSitePlatformCancelMessage(event.data, handshake.channel);
      if (platformCancel) {
        cancelPlatformRequest(platformCancel);
        return true;
      }
      if (
        isRecord(event.data) &&
        event.data.type === "platform-request" &&
        event.data.channel === handshake.channel &&
        isRecord(event.data.payload)
      ) {
        // Answer a malformed request the child can correlate, so it does not wait for its timeout.
        const requestId = readPlatformRequestId(event.data.payload.requestId);
        if (requestId) postPlatformError(requestId, "invalid_request");
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
    updatePlatformRequestSender(sender) {
      if (disposed) throw new Error("Static-site iframe host is disposed.");
      // The child is still waiting for these; it may retry them with the new sender.
      if (sender !== platformRequestSender) abortPlatformRequests("temporarily_unavailable");
      platformRequestSender = sender;
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
  const platformRequestTimeoutMs =
    options.platformRequestTimeoutMs ?? DEFAULT_PLATFORM_REQUEST_CLIENT_TIMEOUT_MS;
  const credentialCache = new Map<string, StaticSiteFastApiCredential>();
  const pendingByRequestId = new Map<string, PendingCredentialRequest>();
  const pendingByTarget = new Map<string, Promise<StaticSiteFastApiCredential>>();
  const pendingWebSocketTickets = new Map<string, PendingWebSocketTicketRequest>();
  const activeWebSockets = new Set<WebSocket>();
  const fastApiStates = new Map<string, StaticSiteFastApiTransportState>();
  const platformRequestsInFlight = new Map<string, PendingPlatformRequest>();
  const queuedPlatformRequests: PendingPlatformRequest[] = [];
  let disposed = false;
  let initialized = false;
  let currentUserUid: string | null | undefined;

  function postPlatformCancel(requestId: string): void {
    options.parentWindow.postMessage(
      buildStaticSitePlatformCancelMessage({ channel, requestId }),
      hostOrigin,
    );
  }

  /** Takes the request out of flight or out of the queue; returns whether it was in flight. */
  function releasePlatformRequest(pending: PendingPlatformRequest): boolean {
    clearTimeout(pending.timeout);
    pending.removeAbortListener();
    if (platformRequestsInFlight.get(pending.requestId) === pending) {
      platformRequestsInFlight.delete(pending.requestId);
      return true;
    }
    const queued = queuedPlatformRequests.indexOf(pending);
    if (queued !== -1) queuedPlatformRequests.splice(queued, 1);
    return false;
  }

  /** Sends queued requests while fewer than the host's cap are in flight. */
  function dispatchPlatformRequests(): void {
    while (
      !disposed &&
      platformRequestsInFlight.size < MAX_PLATFORM_REQUESTS_IN_FLIGHT &&
      queuedPlatformRequests.length > 0
    ) {
      const pending = queuedPlatformRequests.shift()!;
      platformRequestsInFlight.set(pending.requestId, pending);
      pending.timeout = setTimeout(() => {
        if (platformRequestsInFlight.get(pending.requestId) !== pending) return;
        releasePlatformRequest(pending);
        postPlatformCancel(pending.requestId);
        // The host answers every request before its own timeout; silence means an older host.
        pending.reject(new StaticSitePlatformRequestError("unsupported"));
        dispatchPlatformRequests();
      }, platformRequestTimeoutMs);
      options.parentWindow.postMessage(pending.message, hostOrigin);
    }
  }

  /** Rejects every queued and in-flight request, and tells the host to stop the ones in flight. */
  function rejectPlatformRequests(code: StaticSitePlatformRequestErrorCode): void {
    const inFlight = [...platformRequestsInFlight.values()];
    const pending = [...inFlight, ...queuedPlatformRequests.splice(0)];
    platformRequestsInFlight.clear();
    pending.forEach((request) => {
      clearTimeout(request.timeout);
      request.removeAbortListener();
    });
    inFlight.forEach((request) => postPlatformCancel(request.requestId));
    pending.forEach((request) => request.reject(new StaticSitePlatformRequestError(code)));
  }

  async function sendPlatformRequest(request: Request): Promise<Response> {
    const notReady = () =>
      new StaticSitePlatformRequestError(
        "unsupported",
        "The static-site host handshake is not ready.",
      );
    if (disposed || !initialized) throw notReady();
    const signal = typeof request === "object" && request !== null ? request.signal : undefined;
    if (signal?.aborted) throw createAbortError("The platform request was cancelled.");
    const userUid = currentUserUid;
    if (!userUid) throw new StaticSitePlatformRequestError("access_denied");
    const serialized = await serializeStaticSitePlatformRequest(request);
    if (disposed || !initialized) throw notReady();
    if (signal?.aborted) throw createAbortError("The platform request was cancelled.");
    // Reading the body is asynchronous; the person may have changed meanwhile.
    if (currentUserUid !== userUid) throw new StaticSitePlatformRequestError("access_denied");

    const requestId = createRequestId();
    let message: StaticSitePlatformRequestMessage;
    try {
      message = buildStaticSitePlatformRequestMessage({
        channel,
        requestId,
        userUid,
        ...serialized,
      });
    } catch {
      // A person's uid the wire cannot carry.
      throw new StaticSitePlatformRequestError("invalid_request");
    }
    return new Promise<Response>((resolve, reject) => {
      const handleAbort = () => {
        if (releasePlatformRequest(pending)) postPlatformCancel(requestId);
        reject(createAbortError("The platform request was cancelled."));
        dispatchPlatformRequests();
      };
      const pending: PendingPlatformRequest = {
        requestId,
        message,
        removeAbortListener: () => signal?.removeEventListener("abort", handleAbort),
        resolve,
        reject,
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      queuedPlatformRequests.push(pending);
      dispatchPlatformRequests();
    });
  }

  /** Settles the in-flight request an answer names; false when none is waiting for it. */
  function settlePlatformAnswer(
    requestId: string,
    settle: (pending: PendingPlatformRequest) => void,
  ): boolean {
    const pending = platformRequestsInFlight.get(requestId);
    if (!pending) return false;
    releasePlatformRequest(pending);
    settle(pending);
    dispatchPlatformRequests();
    return true;
  }

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
      if (
        !isPlatformBodyMessage(event.data, "platform-response") &&
        payloadSize(event.data) > maxPayloadBytes
      ) {
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
          rejectPlatformRequests("access_denied");
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

      const platformResponse = readStaticSitePlatformResponseMessage(event.data, channel);
      if (platformResponse) {
        const { requestId, ...answer } = platformResponse.payload;
        if (
          !settlePlatformAnswer(requestId, (pending) => {
            let response: Response;
            try {
              response = createStaticSitePlatformResponse(answer);
            } catch {
              pending.reject(new StaticSitePlatformRequestError("unsupported"));
              return;
            }
            pending.resolve(response);
          })
        ) {
          options.onProtocolError?.("Rejected unmatched static-site platform response.");
          return false;
        }
        return true;
      }

      const platformError = readStaticSitePlatformErrorMessage(event.data, channel);
      if (platformError) {
        const { requestId, code } = platformError.payload;
        if (
          !settlePlatformAnswer(requestId, (pending) =>
            pending.reject(new StaticSitePlatformRequestError(code)),
          )
        ) {
          options.onProtocolError?.("Rejected unmatched static-site platform error.");
          return false;
        }
        return true;
      }

      if (
        isRecord(event.data) &&
        (event.data.type === "platform-response" || event.data.type === "platform-error") &&
        event.data.channel === channel &&
        isRecord(event.data.payload)
      ) {
        // A malformed answer to a request in flight fails that request instead of its timeout.
        const requestId = readPlatformRequestId(event.data.payload.requestId);
        if (requestId) {
          settlePlatformAnswer(requestId, (pending) =>
            pending.reject(new StaticSitePlatformRequestError("invalid_request")),
          );
        }
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
    sendPlatformRequest,
    dispose() {
      if (!disposed) rejectPlatformRequests("unsupported");
      disposed = true;
      initialized = false;
      currentUserUid = undefined;
      clearCredentials("unsupported");
      fastApiStates.clear();
    },
  };

  return client;
}
