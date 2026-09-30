// Types of `machine-session.mjs` for the SDK's own TypeScript sources (the Vite plugins). They
// name no Node type, so a consumer's compiler never needs Node's declarations for them.

type Environment = Record<string, string | undefined>;

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

type SpawnSyncLike = (
  program: string,
  args: string[],
  options: { input?: string; encoding?: string; timeout?: number; windowsHide?: boolean },
) => { status: number | null; stdout: string; stderr: string; error?: Error & { code?: string } };

export declare const SESSION_SERVICE: string;
export declare const SESSION_RECORD_VERSION: number;
export declare const STANDARD_BACKEND_URL: string;
export declare const ACCESS_TOKEN_MIN_VALIDITY_SECONDS: number;

export declare class MachineSessionError extends Error {}
/** There is no usable session: nobody logged in, or the backend refused the saved one. */
export declare class NoSessionError extends MachineSessionError {}
/** This machine has no credential store the CLI can reach. */
export declare class NoCredentialStoreError extends MachineSessionError {}
/** The credential store exists and could not be read or written. */
export declare class CredentialStoreError extends MachineSessionError {}

/** One named credential store of the operating system. */
export interface CredentialStore {
  readonly name: string;
  read(service: string, account: string): string | null;
  write(service: string, account: string, secret: string): void;
  remove(service: string, account: string): boolean;
}

export interface SavedSession {
  username: string;
  access: string;
  refresh: string;
}

export interface AccessToken {
  endpoint: string;
  access_token: string;
  token_type: "Bearer";
  /** Epoch seconds, or null when the token carries no expiry. */
  expires_at: number | null;
  source: "environment" | "store";
}

export interface SessionReport {
  endpoint: string;
  authenticated: boolean;
  checked_with_backend: boolean;
  auth_mode: "jwt";
  username: string | null;
  source: "environment" | "store" | null;
  storage: string;
  store_error: string | null;
  session_expires_at: number | null;
  access_expires_at: number | null;
}

export declare function normalizeBackendUrl(value: string): string;

export declare function cliConfigDirectory(options?: {
  platform?: string;
  env?: Environment;
  homeDirectory?: string;
}): string;

export declare function resolveBackendUrl(options?: {
  explicit?: string;
  env?: Environment;
  cwd?: string;
  configDirectory?: string;
}): string;

export declare function sessionEntry(backend: string): { service: string; account: string };

export declare function tokenExpiry(token: unknown): number | null;

export declare function openCredentialStore(options?: {
  platform?: string;
  env?: Environment;
  spawnSyncImpl?: SpawnSyncLike;
  isExecutable?: (path: string) => boolean;
}): CredentialStore | null;

export declare function requireCredentialStore(
  store: CredentialStore | null | undefined,
  platform?: string,
): CredentialStore;

export declare function readSession(options: {
  backend: string;
  store?: CredentialStore | null;
}): SavedSession | null;

export declare function saveSession(options: {
  backend: string;
  username?: string;
  access: string;
  refresh: string;
  store?: CredentialStore | null;
}): void;

export declare function clearSession(options: {
  backend: string;
  store?: CredentialStore | null;
}): boolean;

export declare function refreshTokens(options: {
  backend: string;
  refresh: string;
  fetchImpl?: FetchLike;
}): Promise<{ access: string; refresh: string }>;

export declare function currentAccessToken(options: {
  backend: string;
  env?: Environment;
  store?: CredentialStore | null;
  fetchImpl?: FetchLike;
  now?: () => number;
  minValiditySeconds?: number;
  forceRenewal?: boolean;
}): Promise<AccessToken>;

export declare function sessionReport(options: {
  backend: string;
  env?: Environment;
  store?: CredentialStore | null;
  now?: () => number;
}): SessionReport;
