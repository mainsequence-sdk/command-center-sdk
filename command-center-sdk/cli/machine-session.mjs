/**
 * The developer's Main Sequence session on this machine.
 *
 * One session per backend lives in the operating system credential store. The Main Sequence
 * Python CLI reads and writes the same record, so a login made with either CLI serves both. No
 * project file holds a credential: a project names its backend, and the machine holds the session.
 *
 * Node-only and dependency-free. Nothing here reaches a browser bundle.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SESSION_SERVICE = "MainSequenceCLI.auth";
export const SESSION_RECORD_VERSION = 1;
export const STANDARD_BACKEND_URL = "https://api.main-sequence.app";
export const ACCESS_TOKEN_MIN_VALIDITY_SECONDS = 60;

const REFRESH_PATH = "/auth/jwt-token/token/refresh/";
const SECURITY_PROGRAM = "/usr/bin/security";
const SECURITY_ITEM_NOT_FOUND = 44;
const STORE_TIMEOUT_MS = 10_000;
// `security -i` reads one command per line into a 4,096-character buffer and cuts a longer line:
// the first part runs with a truncated secret and the rest runs as another command.
const SECURITY_STDIN_LINE_LIMIT = 4000;
const SAFE_ENTRY_NAME = /^[A-Za-z0-9._@-]+$/u;
// The comment attribute of every Keychain entry the Main Sequence CLIs write. Attributes are
// readable without consent, the secret is not: the mark tells, before the secret is asked for, that
// `security` wrote the entry and may read it without a dialog.
const SECURITY_ENTRY_MARK = "MainSequenceCLI.session.v1";
const SECURITY_COMMENT_ATTRIBUTE = /^\s*"icmt"<blob>="([^"]*)"\s*$/mu;
// The Python CLI keeps its Secret Service item under this attribute and replaces only an item
// that carries it. Writing the same attributes makes both CLIs replace one item in place.
const SECRET_SERVICE_APPLICATION = "Python keyring library";
const REQUEST_TIMEOUT_MS = 15_000;

export class MachineSessionError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "MachineSessionError";
  }
}

/** There is no usable session: nobody logged in, or the backend refused the saved one. */
export class NoSessionError extends MachineSessionError {
  constructor(message = "Not logged in. Run: command-center-sdk login", options) {
    super(message, options);
    this.name = "NoSessionError";
  }
}

/** This machine has no credential store the CLI can reach. */
export class NoCredentialStoreError extends MachineSessionError {
  constructor(message, options) {
    super(message, options);
    this.name = "NoCredentialStoreError";
  }
}

/** The credential store exists and could not be read or written. */
export class CredentialStoreError extends MachineSessionError {
  constructor(message, options) {
    super(message, options);
    this.name = "CredentialStoreError";
  }
}

function requireSingleLine(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /[\r\n]/u.test(text)) {
    throw new MachineSessionError(`${label} must be a single non-empty line.`);
  }
  return text;
}

/**
 * The backend URL as the Python CLI writes it: trimmed, without trailing slashes. The account of
 * the session entry is derived from this exact text, so it must not be re-serialized.
 */
export function normalizeBackendUrl(value) {
  const candidate = requireSingleLine(value, "Main Sequence backend URL").replace(/\/+$/u, "");
  let url;
  try {
    url = new URL(candidate);
  } catch (error) {
    throw new MachineSessionError("The backend must be an absolute HTTP(S) URL.", { cause: error });
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new MachineSessionError(
      "The backend must be an absolute HTTP(S) URL without embedded credentials.",
    );
  }
  if (url.search || url.hash) {
    throw new MachineSessionError("The backend URL must not carry a query or a fragment.");
  }
  return candidate;
}

/** The directory the Main Sequence CLIs share for non-secret settings. */
export function cliConfigDirectory({
  platform = process.platform,
  env = process.env,
  homeDirectory = os.homedir(),
} = {}) {
  if (platform === "win32") return path.join(env.APPDATA || homeDirectory, "MainSequenceCLI");
  if (platform === "darwin") {
    return path.join(homeDirectory, "Library", "Application Support", "MainSequenceCLI");
  }
  return path.join(homeDirectory, ".config", "mainsequence");
}

// The forms the tools that load a `.env` accept: leading whitespace, an `export` prefix, whitespace
// around the equals sign, a quoted value, and a comment after an unquoted one.
const ENV_ENDPOINT_ASSIGNMENT = /^\s*(?:export\s+)?MAINSEQUENCE_ENDPOINT\s*=\s*(.*)$/u;

function readEndpointFromEnvFile(directory) {
  let text;
  try {
    text = fs.readFileSync(path.join(directory, ".env"), "utf8");
  } catch {
    return "";
  }
  let endpoint = "";
  for (const line of text.split(/\r?\n/u)) {
    const match = ENV_ENDPOINT_ASSIGNMENT.exec(line);
    if (!match) continue;
    const value = match[1].trim();
    const closing = value[0] === '"' || value[0] === "'" ? value.indexOf(value[0], 1) : -1;
    // The last assignment wins, as it does for a tool that loads the file.
    endpoint = closing > 0 ? value.slice(1, closing).trim() : value.split(/\s+#/u, 1)[0].trim();
  }
  return endpoint;
}

function readEndpointFromCliConfig(configDirectory) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(configDirectory, "config.json"), "utf8"));
    return typeof config?.backend_url === "string" ? config.backend_url.trim() : "";
  } catch {
    return "";
  }
}

/**
 * The backend this process talks to: an explicit value, `MAINSEQUENCE_ENDPOINT` of the process,
 * the same entry in the project's `.env`, the backend saved by a Main Sequence CLI, and last the
 * standard one. Only the endpoint is ever read from `.env`.
 */
export function resolveBackendUrl({
  explicit,
  env = process.env,
  cwd = process.cwd(),
  configDirectory = cliConfigDirectory({ env }),
} = {}) {
  const candidate =
    (typeof explicit === "string" && explicit.trim()) ||
    (env.MAINSEQUENCE_ENDPOINT || "").trim() ||
    readEndpointFromEnvFile(cwd) ||
    readEndpointFromCliConfig(configDirectory) ||
    STANDARD_BACKEND_URL;
  return normalizeBackendUrl(candidate);
}

/** The entry that holds the session of one backend. Both CLIs compute it the same way. */
export function sessionEntry(backend) {
  const digest = createHash("sha256").update(normalizeBackendUrl(backend), "utf8").digest("hex");
  return { service: SESSION_SERVICE, account: `default.${digest.slice(0, 16)}` };
}

/** The `exp` claim of a JWT in epoch seconds, read without verifying it; null when there is none. */
export function tokenExpiry(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const expiry = Number(claims?.exp);
    return Number.isFinite(expiry) ? Math.trunc(expiry) : null;
  } catch {
    return null;
  }
}

function serializeRecord({ backend, username, access, refresh }) {
  const json = JSON.stringify({
    v: SESSION_RECORD_VERSION,
    backend: normalizeBackendUrl(backend),
    username: username || "",
    access: access || "",
    refresh: refresh || "",
  });
  // ASCII only, as the Python CLI writes it, so every store returns the same bytes.
  return json.replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function parseRecord(raw, backend) {
  let record;
  try {
    record = JSON.parse(raw);
  } catch (error) {
    throw new CredentialStoreError("The saved session record is not valid.", { cause: error });
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new CredentialStoreError("The saved session record is not valid.");
  }
  // A record written before the backend was part of it carries none.
  const recordedBackend = typeof record.backend === "string" ? record.backend.trim() : "";
  if (recordedBackend && recordedBackend.replace(/\/+$/u, "") !== normalizeBackendUrl(backend)) {
    return null;
  }
  const session = {
    username: typeof record.username === "string" ? record.username : "",
    access: typeof record.access === "string" ? record.access : "",
    refresh: typeof record.refresh === "string" ? record.refresh : "",
  };
  return session.access || session.refresh ? session : null;
}

function runProgram(spawnSyncImpl, program, args, input) {
  const result = spawnSyncImpl(program, args, {
    input: input ?? "",
    encoding: "utf8",
    timeout: STORE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error) {
    const waited = result.error.code === "ETIMEDOUT";
    throw new CredentialStoreError(
      waited
        ? `The credential store did not answer within ${STORE_TIMEOUT_MS / 1000} seconds. It was waiting for the user: the entry belongs to another program, or the store is locked.`
        : `The credential store program could not be run (${result.error.code || result.error.name}).`,
    );
  }
  return result;
}

function decodeSecuritySecret(output) {
  // `security -w` prints printable ASCII as it is and anything else as hexadecimal. The record is
  // JSON, so a value made only of hexadecimal digits is the second form.
  const value = output.endsWith("\n") ? output.slice(0, -1) : output;
  if (value && value.length % 2 === 0 && /^[0-9a-fA-F]+$/u.test(value)) {
    const decoded = Buffer.from(value, "hex").toString("utf8");
    if (!decoded.includes("\ufffd")) return decoded;
  }
  return value;
}

/**
 * The login Keychain through Apple's `security` program, which is one program for every runtime.
 *
 * Asking `security` for the secret of an entry that another program wrote shows a consent dialog,
 * in every process that starts. The secret is therefore asked for only when the entry carries the
 * CLIs' mark. Any other entry is left alone until a login replaces it.
 */
function createMacOsKeychain(spawnSyncImpl) {
  const readable = new Set();
  const key = (service, account) => `${service}\n${account}`;

  function remove(service, account) {
    const result = runProgram(spawnSyncImpl, SECURITY_PROGRAM, [
      "delete-generic-password",
      "-s",
      service,
      "-a",
      account,
    ]);
    readable.delete(key(service, account));
    if (result.status === SECURITY_ITEM_NOT_FOUND) return false;
    if (result.status !== 0) {
      throw new CredentialStoreError(
        `The Keychain entry could not be deleted (security exit ${result.status}).`,
      );
    }
    return true;
  }

  return {
    name: "macOS Keychain",
    read(service, account) {
      readable.delete(key(service, account));
      // Attributes only: this shows no dialog, whoever wrote the entry.
      const inspected = runProgram(spawnSyncImpl, SECURITY_PROGRAM, [
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
      ]);
      if (inspected.status === SECURITY_ITEM_NOT_FOUND) return null;
      if (inspected.status !== 0) {
        throw new CredentialStoreError(
          `The Keychain entry could not be inspected (security exit ${inspected.status}).`,
        );
      }
      if (SECURITY_COMMENT_ATTRIBUTE.exec(inspected.stdout)?.[1] !== SECURITY_ENTRY_MARK) {
        throw new CredentialStoreError(
          "The Keychain entry was written by another version of the CLI. Asking for it would show a consent dialog in every process, so it is not read.",
        );
      }
      const result = runProgram(spawnSyncImpl, SECURITY_PROGRAM, [
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
      ]);
      if (result.status === SECURITY_ITEM_NOT_FOUND) {
        return null;
      }
      if (result.status !== 0) {
        throw new CredentialStoreError(
          `The Keychain entry could not be read (security exit ${result.status}).`,
        );
      }
      readable.add(key(service, account));
      return decodeSecuritySecret(result.stdout);
    },
    write(service, account, secret) {
      if (!SAFE_ENTRY_NAME.test(service) || !SAFE_ENTRY_NAME.test(account)) {
        throw new CredentialStoreError("Unsupported Keychain entry name.");
      }
      const line = `add-generic-password -U -s ${service} -a ${account} -j ${SECURITY_ENTRY_MARK} -X ${Buffer.from(secret, "utf8").toString("hex")}\n`;
      if (line.length > SECURITY_STDIN_LINE_LIMIT) {
        throw new CredentialStoreError(
          "The session record is too long to store through the Keychain helper.",
        );
      }
      // An entry this process read is updated in place, so another process never finds it
      // missing. Any other entry is removed first: updating one that another program created
      // would wait for the user's consent, and removing it does not.
      if (readable.has(key(service, account))) {
        try {
          if (runProgram(spawnSyncImpl, SECURITY_PROGRAM, ["-i"], line).status === 0) return;
        } catch {
          // Fall through to remove and add.
        }
      }
      remove(service, account);
      // Never report this call's output: on a parse error it echoes the line.
      const result = runProgram(spawnSyncImpl, SECURITY_PROGRAM, ["-i"], line);
      if (result.status !== 0) {
        throw new CredentialStoreError(
          `The Keychain entry could not be written (security exit ${result.status}).`,
        );
      }
      readable.add(key(service, account));
    },
    remove,
  };
}

/** Secret Service through `secret-tool`, the program the desktop's libsecret ships. */
function createSecretService(spawnSyncImpl, program) {
  function run(args, input) {
    const result = runProgram(spawnSyncImpl, program, args, input);
    // `secret-tool` exits 1 both for "no such item" and for an unreachable service. Only the
    // second one says something on standard error.
    const complaint = (result.stderr || "").trim().split("\n")[0] || "";
    if (result.status !== 0 && complaint) {
      throw new CredentialStoreError(`Secret Service is not available: ${complaint}`);
    }
    return result;
  }

  return {
    name: "Secret Service",
    read(service, account) {
      // The exact item both CLIs write, and then any item another program stored for the entry.
      for (const extra of [["application", SECRET_SERVICE_APPLICATION], []]) {
        const result = run(["lookup", "service", service, "username", account, ...extra]);
        if (result.status === 0 && result.stdout) return result.stdout;
      }
      return null;
    },
    write(service, account, secret) {
      const result = run(
        [
          "store",
          `--label=Password for '${account}' on '${service}'`,
          "service",
          service,
          "username",
          account,
          "application",
          SECRET_SERVICE_APPLICATION,
        ],
        secret,
      );
      if (result.status !== 0) {
        throw new CredentialStoreError(
          `The Secret Service entry could not be written (secret-tool exit ${result.status}).`,
        );
      }
    },
    remove(service, account) {
      return run(["clear", "service", service, "username", account]).status === 0;
    },
  };
}

function isExecutableFile(candidate) {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(program, env, isExecutable) {
  for (const directory of (env.PATH || "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, program);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

/**
 * This system's credential store, or null when the CLI can reach none. macOS and Linux each use
 * one named store, reached through a program of the system, so every runtime on the machine sees
 * the same entry.
 */
export function openCredentialStore({
  platform = process.platform,
  env = process.env,
  spawnSyncImpl = spawnSync,
  isExecutable = isExecutableFile,
} = {}) {
  if (platform === "darwin") {
    return isExecutable(SECURITY_PROGRAM) ? createMacOsKeychain(spawnSyncImpl) : null;
  }
  if (platform === "linux") {
    const program = findOnPath("secret-tool", env, isExecutable);
    return program ? createSecretService(spawnSyncImpl, program) : null;
  }
  return null;
}

/** The store, or the error that says this machine has none the CLI can reach. */
export function requireCredentialStore(store, platform = process.platform) {
  if (store) return store;
  throw new NoCredentialStoreError(
    platform === "linux"
      ? "No credential store is available: `secret-tool` was not found. Install your distribution's libsecret tools (Debian and Ubuntu: `libsecret-tools`), or set MAINSEQUENCE_ACCESS_TOKEN for this shell."
      : "No credential store is available on this system. Set MAINSEQUENCE_ACCESS_TOKEN for this shell.",
  );
}

/** Read the saved session of one backend: `{ username, access, refresh }`, or null. */
export function readSession({ backend, store = openCredentialStore() } = {}) {
  const { service, account } = sessionEntry(backend);
  // The unscoped account predates per-backend entries; old Python CLIs wrote it.
  for (const candidate of [account, "default"]) {
    const raw = requireCredentialStore(store).read(service, candidate);
    if (!raw) continue;
    const session = parseRecord(raw, backend);
    if (session) return session;
  }
  return null;
}

/** Save the session of one backend. */
export function saveSession({ backend, username, access, refresh, store = openCredentialStore() } = {}) {
  const { service, account } = sessionEntry(backend);
  requireCredentialStore(store).write(service, account, serializeRecord({ backend, username, access, refresh }));
}

/** Remove the saved session of one backend. Missing state is success. */
export function clearSession({ backend, store = openCredentialStore() } = {}) {
  const { service, account } = sessionEntry(backend);
  const target = requireCredentialStore(store);
  let removed = false;
  for (const candidate of [account, "default"]) {
    removed = target.remove(service, candidate) || removed;
  }
  return removed;
}

async function requestJson(fetchImpl, url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    return { status: response.status, ok: response.ok, payload: payload ?? {} };
  } catch (error) {
    // Never report the cause's text: it can carry the request.
    throw new MachineSessionError(
      controller.signal.aborted
        ? "The backend did not answer in time."
        : "The backend could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Exchange a refresh token for a new access token. The backend may return a new refresh token. */
export async function refreshTokens({ backend, refresh, fetchImpl = globalThis.fetch } = {}) {
  const { status, ok, payload } = await requestJson(
    fetchImpl,
    `${normalizeBackendUrl(backend)}${REFRESH_PATH}`,
    { refresh },
  );
  if (status === 401 || status === 400) {
    throw new NoSessionError(
      "The backend refused the saved session. Run: command-center-sdk login",
    );
  }
  const access = typeof payload.access === "string" ? payload.access.trim() : "";
  if (!ok || !access) {
    throw new MachineSessionError(`The session could not be renewed (status ${status}).`);
  }
  const renewed = typeof payload.refresh === "string" ? payload.refresh.trim() : "";
  return { access, refresh: renewed || refresh };
}

function needsRenewal(access, nowSeconds, minValiditySeconds) {
  if (!access) return true;
  const expiry = tokenExpiry(access);
  return expiry !== null && expiry <= nowSeconds + minValiditySeconds;
}

/**
 * An access token for the session this process would use, and where it came from.
 *
 * Credentials already in the process environment win, as they always did. Otherwise the saved
 * session is read, renewed when it is about to expire, and saved again. The refresh token never
 * leaves this function.
 */
export async function currentAccessToken({
  backend,
  env = process.env,
  store,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  minValiditySeconds = ACCESS_TOKEN_MIN_VALIDITY_SECONDS,
  forceRenewal = false,
} = {}) {
  const endpoint = normalizeBackendUrl(backend);
  const nowSeconds = Math.trunc(now() / 1000);
  const environmentAccess = (env.MAINSEQUENCE_ACCESS_TOKEN || "").trim();
  const environmentRefresh = (env.MAINSEQUENCE_REFRESH_TOKEN || "").trim();

  if (environmentAccess || environmentRefresh) {
    let access = environmentAccess;
    if (environmentRefresh && (forceRenewal || needsRenewal(access, nowSeconds, minValiditySeconds))) {
      // Renewed in memory only: the saved session is not replaced by an exported pair.
      access = (await refreshTokens({ backend: endpoint, refresh: environmentRefresh, fetchImpl })).access;
    }
    if (!access) throw new NoSessionError();
    return { endpoint, access_token: access, token_type: "Bearer", expires_at: tokenExpiry(access), source: "environment" };
  }

  const target = store === undefined ? openCredentialStore({ env }) : store;
  const session = readSession({ backend: endpoint, store: target });
  if (!session) throw new NoSessionError();
  let { access } = session;
  if (forceRenewal || needsRenewal(access, nowSeconds, minValiditySeconds)) {
    if (!session.refresh) throw new NoSessionError();
    const renewed = await refreshTokens({ backend: endpoint, refresh: session.refresh, fetchImpl });
    access = renewed.access;
    saveSession({
      backend: endpoint,
      username: session.username,
      access,
      refresh: renewed.refresh,
      store: target,
    });
  }
  return { endpoint, access_token: access, token_type: "Bearer", expires_at: tokenExpiry(access), source: "store" };
}

/**
 * Describe the session this process would use, without any token value. `authenticated` is judged
 * from the tokens' own expiry and asks nothing of the backend.
 */
export function sessionReport({ backend, env = process.env, store, now = () => Date.now() } = {}) {
  const endpoint = normalizeBackendUrl(backend);
  const nowSeconds = Math.trunc(now() / 1000);
  const target = store === undefined ? openCredentialStore({ env }) : store;
  const report = {
    endpoint,
    authenticated: false,
    checked_with_backend: false,
    auth_mode: "jwt",
    username: null,
    source: null,
    storage: target ? `secure OS credential storage (${target.name})` : "process environment only (no credential store)",
    store_error: null,
    session_expires_at: null,
    access_expires_at: null,
  };
  let access = (env.MAINSEQUENCE_ACCESS_TOKEN || "").trim();
  let refresh = (env.MAINSEQUENCE_REFRESH_TOKEN || "").trim();
  if (access || refresh) {
    report.source = "environment";
  } else if (target) {
    try {
      const session = readSession({ backend: endpoint, store: target });
      if (session) {
        ({ access, refresh } = session);
        report.source = "store";
        report.username = session.username || null;
      }
    } catch (error) {
      report.store_error = error.message;
    }
  }
  report.access_expires_at = tokenExpiry(access);
  if (refresh) {
    report.session_expires_at = tokenExpiry(refresh);
    report.authenticated = report.session_expires_at === null || report.session_expires_at > nowSeconds;
  } else {
    report.session_expires_at = report.access_expires_at;
    report.authenticated = Boolean(access) && (report.access_expires_at === null || report.access_expires_at > nowSeconds);
  }
  return report;
}
