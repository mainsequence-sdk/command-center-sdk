import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  fetchUsername,
  LoginError,
  loginViaBrowser,
  loginViaMcpHandoff,
  revokeSession,
} from "../../cli/login.mjs";
import { BACKEND, jsonResponse, routedFetch } from "./session-test-support.mjs";

const TOKEN_PATH = "/auth/cli/token/";
const HANDOFF_START_PATH = "/auth/mcp/cli-handoff/start/";
const HANDOFF_POLL_PATH = "/auth/mcp/cli-handoff/token/";

/** A browser that signs in at once and follows the redirect back to the CLI. */
function signingBrowser(answer = (authorize) => ({ code: "authorization-code", state: authorize.searchParams.get("state") })) {
  const opened = [];
  return {
    opened,
    openBrowser(url) {
      const authorize = new URL(url);
      opened.push(authorize);
      const callback = new URL(authorize.searchParams.get("redirect_uri"));
      for (const [name, value] of Object.entries(answer(authorize))) callback.searchParams.set(name, value);
      void fetch(callback)
        .then((response) => response.text())
        .catch(() => {});
      return true;
    },
  };
}

test("browser login exchanges the authorization code with the verifier of its own challenge", async () => {
  const browser = signingBrowser();
  const { fetchImpl, requests } = routedFetch({ [TOKEN_PATH]: jsonResponse({ access: "access-1", refresh: "refresh-1" }) });
  const announced = [];

  const tokens = await loginViaBrowser({
    backend: `${BACKEND}/`,
    fetchImpl,
    openBrowser: browser.openBrowser,
    onAuthorizeUrl: (url) => announced.push(url),
  });

  assert.deepEqual(tokens, { access: "access-1", refresh: "refresh-1" });
  const authorize = browser.opened[0];
  assert.equal(`${authorize.origin}${authorize.pathname}`, `${BACKEND}/auth/cli/authorize/`);
  assert.equal(authorize.searchParams.get("client_id"), "mainsequence-cli");
  assert.equal(authorize.searchParams.get("response_type"), "code");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  // The callback is a port on this machine that the CLI itself listens on.
  assert.match(authorize.searchParams.get("redirect_uri"), /^http:\/\/127\.0\.0\.1:\d+\/callback$/u);
  // The address is always announced, for a machine where no browser can be opened from here.
  assert.deepEqual(announced, [authorize.href]);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${BACKEND}${TOKEN_PATH}`);
  assert.deepEqual(Object.keys(requests[0].body).sort(), ["client_id", "code", "code_verifier", "redirect_uri"]);
  assert.equal(requests[0].body.client_id, "mainsequence-cli");
  assert.equal(requests[0].body.code, "authorization-code");
  assert.equal(requests[0].body.redirect_uri, authorize.searchParams.get("redirect_uri"));
  assert.equal(
    createHash("sha256").update(requests[0].body.code_verifier, "ascii").digest("base64url"),
    authorize.searchParams.get("code_challenge"),
  );
});

test("browser login can leave the browser to the person", async () => {
  let announced;
  const { fetchImpl } = routedFetch({ [TOKEN_PATH]: jsonResponse({ access: "a", refresh: "r" }) });

  const tokens = await loginViaBrowser({
    backend: BACKEND,
    open: false,
    fetchImpl,
    openBrowser: () => assert.fail("--no-open opens nothing"),
    onAuthorizeUrl: (url) => {
      announced = new URL(url);
      const callback = new URL(announced.searchParams.get("redirect_uri"));
      callback.searchParams.set("code", "code");
      callback.searchParams.set("state", announced.searchParams.get("state"));
      void fetch(callback)
        .then((response) => response.text())
        .catch(() => {});
    },
  });

  assert.equal(tokens.access, "a");
  assert.ok(announced);
});

test("browser login refuses a callback of another login, a refusal, and a missing code", async () => {
  const { fetchImpl, requests } = routedFetch({ [TOKEN_PATH]: jsonResponse({ access: "a", refresh: "r" }) });
  const login = (answer) =>
    loginViaBrowser({ backend: BACKEND, fetchImpl, openBrowser: signingBrowser(answer).openBrowser });

  await assert.rejects(
    login(() => ({ code: "code", state: "another-login" })),
    (error) => error instanceof LoginError && /does not belong to this login/u.test(error.message),
  );
  await assert.rejects(
    login((authorize) => ({ error: "access_denied", error_description: "Denied by the person", state: authorize.searchParams.get("state") })),
    /Denied by the person/u,
  );
  await assert.rejects(
    login((authorize) => ({ state: authorize.searchParams.get("state") })),
    /no authorization code/u,
  );
  assert.equal(requests.length, 0, "no code is exchanged after a refused callback");
});

test("browser login reports the backend's reason and a login nobody finishes", async () => {
  const refused = routedFetch({ [TOKEN_PATH]: jsonResponse({ detail: "The authorization code expired." }, 400) });
  await assert.rejects(
    loginViaBrowser({ backend: BACKEND, fetchImpl: refused.fetchImpl, openBrowser: signingBrowser().openBrowser }),
    /The authorization code expired\./u,
  );

  const incomplete = routedFetch({ [TOKEN_PATH]: jsonResponse({ access: "only-access" }) });
  await assert.rejects(
    loginViaBrowser({ backend: BACKEND, fetchImpl: incomplete.fetchImpl, openBrowser: signingBrowser().openBrowser }),
    /did not return the expected tokens/u,
  );

  await assert.rejects(
    loginViaBrowser({ backend: BACKEND, timeoutMs: 20, openBrowser: () => true }),
    /Timed out waiting for the browser login/u,
  );
});

function handoffBackend({ start, polls }) {
  let poll = 0;
  return routedFetch({
    [HANDOFF_START_PATH]: () => start,
    [HANDOFF_POLL_PATH]: () => polls[Math.min(poll++, polls.length - 1)],
  });
}

function startedHandoff(overrides = {}) {
  return jsonResponse({
    handoff_uid: "handoff-1",
    redirect_uri: `${BACKEND}${HANDOFF_POLL_PATH}`,
    expires_at: "2030-01-01T00:00:00Z",
    mcp_tool: "auth.cli_authorize",
    mcp_arguments: { handoff_uid: "handoff-1" },
    ...overrides,
  });
}

test("MCP login waits for the agent's approval and receives the tokens outside MCP", async () => {
  const { fetchImpl, requests } = handoffBackend({
    start: startedHandoff(),
    polls: [
      jsonResponse({ detail: "pending" }, 202),
      jsonResponse({ access: "access-1", refresh: "refresh-1", user: { username: "ada" } }),
    ],
  });
  const calls = [];
  const waits = [];

  const tokens = await loginViaMcpHandoff({
    backend: BACKEND,
    fetchImpl,
    onHandoff: (call) => calls.push(call),
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  assert.deepEqual(tokens, { access: "access-1", refresh: "refresh-1", username: "ada" });
  // What the agent is asked to call carries no token and no verifier.
  assert.deepEqual(calls, [{ tool: "auth.cli_authorize", arguments: { handoff_uid: "handoff-1" } }]);
  assert.deepEqual(waits, [1000]);

  const [start, firstPoll, secondPoll] = requests;
  assert.equal(start.url, `${BACKEND}${HANDOFF_START_PATH}`);
  assert.deepEqual(Object.keys(start.body).sort(), ["code_challenge", "code_challenge_method", "state"]);
  assert.equal(start.body.code_challenge_method, "S256");
  assert.deepEqual(Object.keys(firstPoll.body).sort(), ["code_verifier", "handoff_uid", "state"]);
  assert.equal(firstPoll.body.state, start.body.state);
  assert.equal(
    createHash("sha256").update(firstPoll.body.code_verifier, "ascii").digest("base64url"),
    start.body.code_challenge,
  );
  assert.deepEqual(secondPoll.body, firstPoll.body);
});

test("MCP login refuses a handoff it cannot trust", async () => {
  const login = (start) =>
    loginViaMcpHandoff({
      backend: BACKEND,
      fetchImpl: handoffBackend({ start, polls: [jsonResponse({ access: "a", refresh: "r" })] }).fetchImpl,
      onHandoff: () => assert.fail("an invalid handoff is never announced"),
    });

  await assert.rejects(login(startedHandoff({ mcp_tool: "auth.another_tool" })), /invalid MCP login handoff/u);
  await assert.rejects(
    login(startedHandoff({ mcp_arguments: { handoff_uid: "handoff-1", extra: "argument" } })),
    /invalid MCP login handoff/u,
  );
  await assert.rejects(login(startedHandoff({ mcp_arguments: { handoff_uid: "another" } })), /invalid MCP login handoff/u);
  // The verifier is sent to the callback, so it must be the backend the login started on.
  await assert.rejects(
    login(startedHandoff({ redirect_uri: `https://elsewhere.example${HANDOFF_POLL_PATH}` })),
    /different origin/u,
  );
  await assert.rejects(login(jsonResponse({ detail: "MCP login is not enabled." }, 403)), /MCP login is not enabled\./u);
});

test("MCP login reports a failed handoff and one that is never approved", async () => {
  const failed = handoffBackend({ start: startedHandoff(), polls: [jsonResponse({ detail: "The handoff expired." }, 400)] });
  await assert.rejects(loginViaMcpHandoff({ backend: BACKEND, fetchImpl: failed.fetchImpl }), /The handoff expired\./u);

  const pending = handoffBackend({ start: startedHandoff(), polls: [jsonResponse({}, 202)] });
  let clock = 0;
  await assert.rejects(
    loginViaMcpHandoff({
      backend: BACKEND,
      timeoutMs: 3_000,
      fetchImpl: pending.fetchImpl,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
      now: () => clock,
    }),
    /Timed out waiting for auth\.cli_authorize/u,
  );
});

test("the signed-in user's name is read for display and its absence is not an error", async () => {
  const nested = routedFetch({ "/api/v1/users/me/": jsonResponse({ user: { username: " ada " } }) });
  assert.equal(await fetchUsername({ backend: BACKEND, access: "access-1", fetchImpl: nested.fetchImpl }), "ada");
  assert.equal(nested.requests[0].headers.Authorization, "Bearer access-1");
  assert.equal(nested.requests[0].method, "GET");

  const flat = routedFetch({ "/api/v1/users/me/": jsonResponse({ username: "grace" }) });
  assert.equal(await fetchUsername({ backend: BACKEND, access: "a", fetchImpl: flat.fetchImpl }), "grace");

  const refused = routedFetch({ "/api/v1/users/me/": jsonResponse({ detail: "Invalid token." }, 401) });
  assert.equal(await fetchUsername({ backend: BACKEND, access: "a", fetchImpl: refused.fetchImpl }), "");

  const unreachable = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal(await fetchUsername({ backend: BACKEND, access: "a", fetchImpl: unreachable }), "");
});

test("logout asks the backend to end the tracked session and says when it did not", async () => {
  const ended = routedFetch({ "/auth/cli/revoke/": jsonResponse({}) });
  assert.deepEqual(await revokeSession({ backend: BACKEND, refresh: "refresh-1", fetchImpl: ended.fetchImpl }), {
    revoked: true,
    detail: "",
  });
  assert.deepEqual(ended.requests[0].body, { refresh: "refresh-1" });

  const refused = routedFetch({ "/auth/cli/revoke/": jsonResponse({ detail: "Token is blacklisted." }, 400) });
  assert.deepEqual(await revokeSession({ backend: BACKEND, refresh: "r", fetchImpl: refused.fetchImpl }), {
    revoked: false,
    detail: "Token is blacklisted.",
  });

  const unreachable = async () => {
    throw new TypeError("fetch failed: refresh=must-not-be-reported");
  };
  const result = await revokeSession({ backend: BACKEND, refresh: "r", fetchImpl: unreachable });
  assert.equal(result.revoked, false);
  assert.equal(result.detail.includes("must-not-be-reported"), false);
});
