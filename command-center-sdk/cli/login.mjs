/**
 * Logging a developer in and out of the machine session.
 *
 * The flows are the ones the Main Sequence Python CLI uses, against the same public routes and
 * with the same client identifier, so either CLI can create the session the other one reads.
 * Node-only and dependency-free.
 */

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";

import { normalizeBackendUrl } from "./machine-session.mjs";

const CLIENT_ID = "mainsequence-cli";
const AUTHORIZE_PATH = "/auth/cli/authorize/";
const TOKEN_PATH = "/auth/cli/token/";
const REVOKE_PATH = "/auth/cli/revoke/";
const MCP_HANDOFF_START_PATH = "/auth/mcp/cli-handoff/start/";
const CURRENT_USER_PATH = "/api/v1/users/me/";
const MCP_AUTHORIZE_TOOL = "auth.cli_authorize";
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LOGIN_TIMEOUT_MS = 300_000;

export class LoginError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "LoginError";
  }
}

function createPkce() {
  const verifier = randomBytes(64).toString("base64url");
  return {
    state: randomBytes(32).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier, "ascii").digest("base64url"),
  };
}

async function request(fetchImpl, url, { method = "POST", body, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    let payload = {};
    try {
      payload = (await response.json()) ?? {};
    } catch {
      payload = {};
    }
    return { status: response.status, ok: response.ok, payload };
  } catch {
    // Never report the cause's text: it can carry the request.
    throw new LoginError(
      controller.signal.aborted ? "The backend did not answer in time." : "The backend could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
}

function detailOf(payload, fallback) {
  const detail = payload?.detail || payload?.message;
  return typeof detail === "string" && detail.trim() ? detail.trim() : fallback;
}

function tokensOf(payload) {
  const access = payload?.access || payload?.access_token;
  const refresh = payload?.refresh || payload?.refresh_token;
  if (typeof access !== "string" || typeof refresh !== "string" || !access || !refresh) {
    throw new LoginError("The backend did not return the expected tokens.");
  }
  return { access, refresh };
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/gu, (character) => `&#${character.charCodeAt(0)};`);
}

function defaultBrowserOpener(url, platform = process.platform) {
  const command = platform === "darwin" ? "open" : platform === "linux" ? "xdg-open" : null;
  if (!command) return false;
  try {
    const child = spawn(command, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Receive the authorization callback on a loopback port this process owns. */
function startCallbackServer(expectedState) {
  let settle;
  const callback = new Promise((resolve) => {
    settle = resolve;
  });
  const server = http.createServer((incoming, outgoing) => {
    const url = new URL(incoming.url || "/", "http://127.0.0.1");
    if (incoming.method !== "GET" || url.pathname !== "/callback") {
      outgoing.writeHead(404).end();
      return;
    }
    const received = {
      code: url.searchParams.get("code")?.trim() || null,
      state: url.searchParams.get("state")?.trim() || null,
      error: url.searchParams.get("error")?.trim() || null,
      errorDescription: url.searchParams.get("error_description")?.trim() || null,
    };
    const problem =
      received.errorDescription ||
      received.error ||
      (received.state !== expectedState
        ? "The callback does not belong to this login."
        : received.code
          ? null
          : "Missing authorization code in callback.");
    const title = problem ? "Main Sequence Login Failed" : "Main Sequence Login Complete";
    const body = problem
      ? `Authentication failed: ${escapeHtml(problem)}`
      : "You can close this window and return to the terminal.";
    outgoing
      .writeHead(problem ? 400 : 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "close",
      })
      .end(`<html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`);
    settle(received);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        redirectUri: `http://127.0.0.1:${server.address().port}/callback`,
        callback,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            // A browser may keep its connection open; the login does not wait for it.
            server.closeAllConnections?.();
          }),
      });
    });
  });
}

/**
 * Log in through the browser. The address is always handed to `onAuthorizeUrl`, so the login also
 * works where no browser can be opened from here.
 */
export async function loginViaBrowser({
  backend,
  open = true,
  timeoutMs = DEFAULT_LOGIN_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  openBrowser = defaultBrowserOpener,
  onAuthorizeUrl = () => {},
} = {}) {
  const endpoint = normalizeBackendUrl(backend);
  const pkce = createPkce();
  const server = await startCallbackServer(pkce.state);
  let timer;
  try {
    const query = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      state: pkce.state,
      redirect_uri: server.redirectUri,
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
    });
    const authorizeUrl = `${endpoint}${AUTHORIZE_PATH}?${query}`;
    onAuthorizeUrl(authorizeUrl);
    if (open) openBrowser(authorizeUrl);

    const received = await Promise.race([
      server.callback,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (!received) {
      throw new LoginError("Timed out waiting for the browser login. Run the login again.");
    }
    if (received.state !== pkce.state) throw new LoginError("The browser callback does not belong to this login.");
    if (received.error) {
      throw new LoginError(`The browser authorization failed: ${received.errorDescription || received.error}`);
    }
    if (!received.code) throw new LoginError("The browser callback carried no authorization code.");

    const { ok, payload } = await request(fetchImpl, `${endpoint}${TOKEN_PATH}`, {
      body: {
        client_id: CLIENT_ID,
        code: received.code,
        code_verifier: pkce.verifier,
        redirect_uri: server.redirectUri,
      },
    });
    if (!ok) throw new LoginError(detailOf(payload, "The backend refused the login."));
    return tokensOf(payload);
  } finally {
    clearTimeout(timer);
    await server.close();
  }
}

function originOf(url) {
  try {
    const parsed = new URL(url);
    if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Log in through a coding agent's authenticated MCP connection. The backend issues the handoff and
 * its callback; the agent approves it with `auth.cli_authorize`; no token passes through MCP.
 */
export async function loginViaMcpHandoff({
  backend,
  timeoutMs = DEFAULT_LOGIN_TIMEOUT_MS,
  pollIntervalMs = 1000,
  fetchImpl = globalThis.fetch,
  onHandoff = () => {},
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => Date.now(),
} = {}) {
  const endpoint = normalizeBackendUrl(backend);
  const pkce = createPkce();
  const started = await request(fetchImpl, `${endpoint}${MCP_HANDOFF_START_PATH}`, {
    body: { state: pkce.state, code_challenge: pkce.challenge, code_challenge_method: "S256" },
  });
  if (!started.ok) {
    throw new LoginError(detailOf(started.payload, "The backend could not create the MCP login handoff."));
  }
  const handoff = started.payload;
  const handoffUid = typeof handoff.handoff_uid === "string" ? handoff.handoff_uid.trim() : "";
  const redirectUri = typeof handoff.redirect_uri === "string" ? handoff.redirect_uri.trim() : "";
  const argumentNames = Object.keys(handoff.mcp_arguments ?? {});
  if (
    !handoffUid ||
    handoff.mcp_tool !== MCP_AUTHORIZE_TOOL ||
    argumentNames.length !== 1 ||
    handoff.mcp_arguments.handoff_uid !== handoffUid
  ) {
    throw new LoginError("The backend returned an invalid MCP login handoff.");
  }
  if (!originOf(redirectUri) || originOf(redirectUri) !== originOf(endpoint)) {
    throw new LoginError("The backend returned an MCP login callback on a different origin.");
  }
  onHandoff({ tool: MCP_AUTHORIZE_TOOL, arguments: { handoff_uid: handoffUid } });

  const deadline = now() + timeoutMs;
  for (;;) {
    if (now() >= deadline) {
      throw new LoginError(`Timed out waiting for ${MCP_AUTHORIZE_TOOL} to approve the login handoff.`);
    }
    const polled = await request(fetchImpl, redirectUri, {
      body: { handoff_uid: handoffUid, state: pkce.state, code_verifier: pkce.verifier },
    });
    if (polled.status === 202) {
      await sleep(Math.max(100, pollIntervalMs));
      continue;
    }
    if (!polled.ok) throw new LoginError(detailOf(polled.payload, "The MCP login handoff failed."));
    const username = typeof polled.payload?.user?.username === "string" ? polled.payload.user.username : "";
    return { ...tokensOf(polled.payload), username };
  }
}

/** The signed-in user's name, for display only. An empty string when it cannot be read. */
export async function fetchUsername({ backend, access, fetchImpl = globalThis.fetch } = {}) {
  try {
    const { ok, payload } = await request(fetchImpl, `${normalizeBackendUrl(backend)}${CURRENT_USER_PATH}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${access}` },
    });
    const username = ok ? payload?.user?.username || payload?.username : "";
    return typeof username === "string" ? username.trim() : "";
  } catch {
    return "";
  }
}

/** Ask the backend to end the tracked login session the refresh token belongs to. */
export async function revokeSession({ backend, refresh, fetchImpl = globalThis.fetch } = {}) {
  try {
    const { ok, payload } = await request(fetchImpl, `${normalizeBackendUrl(backend)}${REVOKE_PATH}`, {
      body: { refresh },
    });
    return { revoked: ok, detail: ok ? "" : detailOf(payload, "The backend did not confirm the logout.") };
  } catch (error) {
    return { revoked: false, detail: error.message };
  }
}
