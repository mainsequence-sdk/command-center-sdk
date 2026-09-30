/**
 * The CLI commands that create, renew, report and hand out the machine session:
 * `login`, `logout`, `refresh-token`, `auth token` and `auth status`.
 *
 * Their names, output and exit codes are those of the Main Sequence Python CLI, so a tool can ask
 * whichever CLI a project has. No command prints a refresh token.
 */

import fs from "node:fs";
import path from "node:path";

import { fetchUsername, loginViaBrowser, loginViaMcpHandoff, revokeSession } from "./login.mjs";
import {
  clearSession,
  currentAccessToken,
  NoCredentialStoreError,
  NoSessionError,
  CredentialStoreError,
  openCredentialStore,
  readSession,
  requireCredentialStore,
  resolveBackendUrl,
  saveSession,
  sessionReport,
} from "./machine-session.mjs";

export const EXIT_NO_SESSION = 1;
export const EXIT_NO_CREDENTIAL_STORE = 3;

const ENV_CREDENTIAL_KEYS = [
  "MAINSEQUENCE_ACCESS_TOKEN",
  "MAINSEQUENCE_REFRESH_TOKEN",
  "MAINSEQUENCE_RUNTIME_CREDENTIAL_ID",
  "MAINSEQUENCE_RUNTIME_CREDENTIAL_SECRET",
  "MAINSEQUENCE_TOKEN",
];
// The forms the tools that load a `.env` accept: leading whitespace, an `export` prefix, and
// whitespace before the equals sign. A commented line assigns nothing.
const ENV_ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u;

/**
 * `.env` text without its credential entries, and the names removed. Every other line is kept
 * exactly as it is, the endpoint included.
 */
export function stripEnvCredentials(text) {
  const removed = new Set();
  const kept = [];
  for (const line of (text || "").split(/(?<=\n)/u)) {
    const name = ENV_ASSIGNMENT.exec(line)?.[1];
    if (ENV_CREDENTIAL_KEYS.includes(name)) {
      removed.add(name);
      continue;
    }
    if (name === "MAINSEQUENCE_AUTH_MODE") {
      const value = line.slice(line.indexOf("=") + 1).split("#", 1)[0].trim().replace(/^["']|["']$/gu, "");
      if (value.toLowerCase() === "runtime_credential") {
        removed.add(name);
        continue;
      }
    }
    kept.push(line);
  }
  const names = [...ENV_CREDENTIAL_KEYS, "MAINSEQUENCE_AUTH_MODE"].filter((name) => removed.has(name));
  return { text: names.length > 0 ? kept.join("") : text || "", removed: names };
}

/** Remove credential entries from `directory/.env`. A file that cannot be changed is left alone. */
export function removeEnvCredentials(directory) {
  const envPath = path.join(directory, ".env");
  try {
    const { text, removed } = stripEnvCredentials(fs.readFileSync(envPath, "utf8"));
    if (removed.length > 0) fs.writeFileSync(envPath, text, "utf8");
    return removed;
  } catch {
    return [];
  }
}

export function parseSessionArguments(args, { allowed = [], positionalBackend = false } = {}) {
  const options = { backend: undefined, json: false, open: true, mcp: false, check: false, help: false };
  const flags = new Map([
    ["--json", () => (options.json = true)],
    ["--no-open", () => (options.open = false)],
    ["--mcp", () => (options.mcp = true)],
    ["--check", () => (options.check = true)],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      return options;
    }
    if (argument === "--backend") {
      index += 1;
      if (!args[index] || args[index].startsWith("-")) throw new Error("--backend requires a URL.");
      options.backend = args[index];
      continue;
    }
    if (argument.startsWith("--backend=")) {
      options.backend = argument.slice("--backend=".length);
      if (!options.backend) throw new Error("--backend requires a URL.");
      continue;
    }
    if (flags.has(argument) && (argument === "--json" || allowed.includes(argument))) {
      flags.get(argument)();
      continue;
    }
    if (positionalBackend && !argument.startsWith("-") && options.backend === undefined) {
      options.backend = argument;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function formatEpoch(value) {
  if (value === null || value === undefined) return "-";
  return `${new Date(value * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Say why there is no usable session, and return the matching exit code. */
function reportFailure(error, io, json = false) {
  // The message of these errors never carries a request or a token.
  const message =
    error instanceof CredentialStoreError
      ? `The saved session could not be read. ${error.message} Run: command-center-sdk login`
      : error.message;
  io.err(json ? JSON.stringify({ error: message }, null, 2) : `command-center-sdk: ${message}`);
  return error instanceof NoCredentialStoreError ? EXIT_NO_CREDENTIAL_STORE : EXIT_NO_SESSION;
}

const ENVIRONMENT_TOKEN_NOTE =
  "MAINSEQUENCE_ACCESS_TOKEN is set in this shell and is used instead of the saved session. Unset it to use the session.";

function createContext({
  backend,
  env = process.env,
  cwd = process.cwd(),
  configDirectory,
  store,
  fetchImpl = globalThis.fetch,
  io = { out: (text) => console.log(text), err: (text) => console.error(text) },
  now,
} = {}) {
  return {
    env,
    cwd,
    configDirectory,
    fetchImpl,
    io,
    now,
    endpoint: resolveBackendUrl({ explicit: backend, env, cwd, configDirectory }),
    store: store === undefined ? openCredentialStore({ env }) : store,
  };
}

/** `auth token`: a short-lived access token for another local tool. */
export async function authToken({ json = false, ...rest } = {}) {
  const context = createContext(rest);
  try {
    const token = await currentAccessToken({
      backend: context.endpoint,
      env: context.env,
      store: context.store,
      fetchImpl: context.fetchImpl,
      now: context.now,
    });
    const payload = {
      endpoint: token.endpoint,
      access_token: token.access_token,
      token_type: token.token_type,
      expires_at: token.expires_at,
    };
    context.io.out(json ? JSON.stringify(payload, null, 2) : payload.access_token);
    return 0;
  } catch (error) {
    return reportFailure(error, context.io, json);
  }
}

/** `auth status`: the session other local tools would use. No token value is printed. */
export async function authStatus({ json = false, check = false, ...rest } = {}) {
  const context = createContext(rest);
  const report = sessionReport({
    backend: context.endpoint,
    env: context.env,
    store: context.store,
    now: context.now,
  });
  if (check && report.authenticated) {
    report.checked_with_backend = true;
    let username = "";
    try {
      const token = await currentAccessToken({
        backend: context.endpoint,
        env: context.env,
        store: context.store,
        fetchImpl: context.fetchImpl,
        now: context.now,
      });
      username = await fetchUsername({
        backend: context.endpoint,
        access: token.access_token,
        fetchImpl: context.fetchImpl,
      });
    } catch {
      username = "";
    }
    report.authenticated = Boolean(username);
    if (username) report.username = username;
  }
  if (json) {
    context.io.out(JSON.stringify(report, null, 2));
  } else {
    const rows = [
      ["Backend", report.endpoint],
      ["Authenticated", report.authenticated ? "yes" : "no"],
      ["Checked with backend", report.checked_with_backend ? "yes" : "no"],
      ["User", report.username || "-"],
      ["Credentials from", report.source || "-"],
      ["Auth storage", report.storage],
      ["Session expires", formatEpoch(report.session_expires_at)],
      ["Access token expires", formatEpoch(report.access_expires_at)],
    ];
    if (report.store_error) rows.push(["Credential store error", report.store_error]);
    for (const [label, value] of rows) context.io.out(`${label}: ${value}`);
  }
  return report.authenticated ? 0 : EXIT_NO_SESSION;
}

/**
 * `refresh-token`: renew the saved session and say whether it works. Run in a directory whose
 * `.env` still holds credentials from an earlier setup, it removes them first. Credentials set in
 * the environment cannot be renewed for the shell that holds them, so this command is always about
 * the saved session.
 */
export async function refreshToken({ json = false, ...rest } = {}) {
  const context = createContext(rest);
  const removed = removeEnvCredentials(context.cwd);
  const announce = () => {
    if (removed.length > 0 && !json) {
      context.io.out(`Removed credential entries from ./.env: ${removed.join(", ")}`);
    }
  };
  const saved = { backend: context.endpoint, env: {}, store: context.store, now: context.now };
  try {
    await currentAccessToken({ ...saved, fetchImpl: context.fetchImpl, forceRenewal: true });
  } catch (error) {
    announce();
    return reportFailure(error, context.io, json);
  }
  const notes = (context.env.MAINSEQUENCE_ACCESS_TOKEN || "").trim() ? [ENVIRONMENT_TOKEN_NOTE] : [];
  const report = { ...sessionReport(saved), removed_env_entries: removed, notes };
  if (json) {
    context.io.out(JSON.stringify(report, null, 2));
    return 0;
  }
  announce();
  const who = report.username ? ` for ${report.username}` : "";
  const until = report.session_expires_at === null ? "" : `, valid until ${formatEpoch(report.session_expires_at)}`;
  context.io.out(`Session renewed${who} on ${report.endpoint}${until}.`);
  for (const note of notes) context.io.out(`Note: ${note}`);
  return 0;
}

/** `login`: create the machine session through the browser, or through an agent's MCP connection. */
export async function login({ json = false, open = true, mcp = false, ...rest } = {}) {
  const context = createContext(rest);
  try {
    // Checked before anyone is sent to a browser: without a store the session cannot be kept.
    requireCredentialStore(context.store);
    const tokens = mcp
      ? await loginViaMcpHandoff({
          backend: context.endpoint,
          fetchImpl: context.fetchImpl,
          onHandoff: (call) => {
            context.io.err("Authorize this CLI from the connected Main Sequence MCP session:");
            // With --json, standard output carries one document: the result.
            (json ? context.io.err : context.io.out)(JSON.stringify(call));
          },
        })
      : await loginViaBrowser({
          backend: context.endpoint,
          open,
          fetchImpl: context.fetchImpl,
          onAuthorizeUrl: (url) => context.io.err(`Open this URL to authenticate: ${url}`),
        });
    const username =
      tokens.username ||
      (await fetchUsername({ backend: context.endpoint, access: tokens.access, fetchImpl: context.fetchImpl }));
    saveSession({
      backend: context.endpoint,
      username,
      access: tokens.access,
      refresh: tokens.refresh,
      store: context.store,
    });

    const notes = (context.env.MAINSEQUENCE_ACCESS_TOKEN || "").trim() ? [ENVIRONMENT_TOKEN_NOTE] : [];
    // Without `--backend`, a command run here may resolve another backend than the one just used.
    let resolved = context.endpoint;
    try {
      resolved = resolveBackendUrl({
        env: context.env,
        cwd: context.cwd,
        configDirectory: context.configDirectory,
      });
    } catch {
      // An unusable endpoint setting is reported by the command that meets it.
    }
    if (resolved !== context.endpoint) {
      notes.push(
        `Commands run in this directory use ${resolved}. To use this session here, set MAINSEQUENCE_ENDPOINT=${context.endpoint} in its .env or in the environment.`,
      );
    }
    const result = {
      endpoint: context.endpoint,
      username: username || null,
      storage: context.store.name,
      notes,
    };
    if (json) context.io.out(JSON.stringify(result, null, 2));
    else {
      context.io.out(`Signed in${username ? ` as ${username}` : ""} (Backend: ${context.endpoint}).`);
      context.io.out(`The session is saved in the ${context.store.name}. It serves every project on this machine.`);
      for (const note of notes) context.io.out(`Note: ${note}`);
    }
    return 0;
  } catch (error) {
    return reportFailure(error, context.io, json);
  }
}

/** `logout`: end the tracked session on the backend and remove it from this machine. */
export async function logout({ json = false, ...rest } = {}) {
  const context = createContext(rest);
  try {
    let session = null;
    let unreadable = false;
    try {
      session = readSession({ backend: context.endpoint, store: context.store });
    } catch (error) {
      if (error instanceof NoCredentialStoreError) throw error;
      // An entry that cannot be read is still removed below.
      unreadable = true;
    }
    const revoked = session?.refresh
      ? await revokeSession({ backend: context.endpoint, refresh: session.refresh, fetchImpl: context.fetchImpl })
      : {
          revoked: false,
          detail: unreadable
            ? "The saved session could not be read, so the backend was not asked to end it."
            : "No saved session to end on the backend.",
        };
    const removed = clearSession({ backend: context.endpoint, store: context.store });
    const result = { endpoint: context.endpoint, removed, revoked: revoked.revoked, detail: revoked.detail };
    if (json) context.io.out(JSON.stringify(result, null, 2));
    else if (revoked.revoked) context.io.out("Signed out. The session is ended on the backend and removed from this machine.");
    else if (removed) context.io.out(`Signed out on this machine. The backend did not confirm: ${revoked.detail}`);
    else context.io.out("No saved session on this machine.");
    return 0;
  } catch (error) {
    return reportFailure(error, context.io, json);
  }
}

/**
 * The backend and access token for a CLI command that calls the platform, taken from the machine
 * session. `cwd` is the project: its `.env` may name the backend.
 *
 * Returns null when `MAINSEQUENCE_ACCESS_TOKEN` is set: that token wins, as before, and the caller
 * keeps its own environment handling, which sends it only to the endpoint set next to it. A saved
 * session is sent only to the backend it belongs to.
 */
export async function resolvePlatformAccess({
  env = process.env,
  cwd = process.cwd(),
  configDirectory,
  store,
  fetchImpl = globalThis.fetch,
} = {}) {
  if ((env.MAINSEQUENCE_ACCESS_TOKEN || "").trim()) return null;
  const backendUrl = resolveBackendUrl({ env, cwd, configDirectory });
  const token = await currentAccessToken({
    backend: backendUrl,
    // Only the saved session: no other variable of the environment is a credential here.
    env: {},
    store: store === undefined ? openCredentialStore({ env }) : store,
    fetchImpl,
  });
  return { backendUrl, accessToken: token.access_token };
}
