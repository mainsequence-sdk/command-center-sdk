import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CredentialStoreError } from "../../cli/machine-session.mjs";
import {
  authStatus,
  authToken,
  EXIT_NO_CREDENTIAL_STORE,
  EXIT_NO_SESSION,
  login,
  logout,
  parseSessionArguments,
  refreshToken,
  removeEnvCredentials,
  resolvePlatformAccess,
  stripEnvCredentials,
} from "../../cli/session-commands.mjs";
import {
  BACKEND,
  captureIo,
  jsonResponse,
  memoryStore,
  now,
  NOW_SECONDS,
  putSession,
  routedFetch,
  savedRecord,
  testToken,
} from "./session-test-support.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(packageRoot, "cli", "command-center-sdk.mjs");
const REFRESH_PATH = "/auth/jwt-token/token/refresh/";
const env = { MAINSEQUENCE_ENDPOINT: BACKEND };

/** A directory that is a project: commands resolve the backend and clean `.env` here. */
async function withProject(run) {
  const root = await mkdtemp(join(tmpdir(), "command-center-sdk-session-"));
  const cwd = join(root, "project");
  const configDirectory = join(root, "settings");
  await mkdir(cwd);
  await mkdir(configDirectory);
  try {
    return await run({ cwd, configDirectory });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** A store whose entry cannot be read, as the Keychain refuses one another program wrote. */
function unreadableStore() {
  const store = memoryStore();
  store.read = (service, account) => {
    store.calls.push(`read ${account}`);
    throw new CredentialStoreError("The Keychain entry was written by another version of the CLI.");
  };
  return store;
}

test("credential entries are removed from .env text and every other line is kept", () => {
  const text = [
    "# the backend this project uses",
    "MAINSEQUENCE_ENDPOINT=https://platform.example",
    "MAINSEQUENCE_ACCESS_TOKEN=left-by-an-earlier-setup",
    "export MAINSEQUENCE_REFRESH_TOKEN = 'left-too'",
    "  MAINSEQUENCE_TOKEN=legacy",
    "MAINSEQUENCE_AUTH_MODE=runtime_credential",
    "MAINSEQUENCE_RUNTIME_CREDENTIAL_ID=id",
    "MAINSEQUENCE_RUNTIME_CREDENTIAL_SECRET=secret",
    "# MAINSEQUENCE_ACCESS_TOKEN=a comment assigns nothing",
    "VITE_TITLE=My application",
    "",
  ].join("\n");

  const result = stripEnvCredentials(text);

  assert.equal(
    result.text,
    [
      "# the backend this project uses",
      "MAINSEQUENCE_ENDPOINT=https://platform.example",
      "# MAINSEQUENCE_ACCESS_TOKEN=a comment assigns nothing",
      "VITE_TITLE=My application",
      "",
    ].join("\n"),
  );
  assert.deepEqual(result.removed, [
    "MAINSEQUENCE_ACCESS_TOKEN",
    "MAINSEQUENCE_REFRESH_TOKEN",
    "MAINSEQUENCE_RUNTIME_CREDENTIAL_ID",
    "MAINSEQUENCE_RUNTIME_CREDENTIAL_SECRET",
    "MAINSEQUENCE_TOKEN",
    "MAINSEQUENCE_AUTH_MODE",
  ]);

  // An auth mode that names no credential is not one, and text without credentials is returned as it is.
  const kept = "MAINSEQUENCE_AUTH_MODE=jwt\r\nMAINSEQUENCE_ENDPOINT=https://platform.example\r\n";
  assert.deepEqual(stripEnvCredentials(kept), { text: kept, removed: [] });
  assert.deepEqual(stripEnvCredentials(""), { text: "", removed: [] });
});

test("a project's .env loses its credential entries and nothing else", async () => {
  await withProject(async ({ cwd }) => {
    assert.deepEqual(removeEnvCredentials(cwd), [], "a project without .env has nothing to remove");

    await writeFile(join(cwd, ".env"), `MAINSEQUENCE_ENDPOINT=${BACKEND}\nMAINSEQUENCE_ACCESS_TOKEN=left\n`);
    assert.deepEqual(removeEnvCredentials(cwd), ["MAINSEQUENCE_ACCESS_TOKEN"]);
    assert.equal(await readFile(join(cwd, ".env"), "utf8"), `MAINSEQUENCE_ENDPOINT=${BACKEND}\n`);
    assert.deepEqual(removeEnvCredentials(cwd), []);
  });
});

test("the session commands accept only their own arguments", () => {
  assert.deepEqual(parseSessionArguments(["--json", "--backend", BACKEND]), {
    backend: BACKEND,
    json: true,
    open: true,
    mcp: false,
    check: false,
    help: false,
  });
  assert.equal(parseSessionArguments([`--backend=${BACKEND}`]).backend, BACKEND);
  assert.equal(parseSessionArguments(["--check"], { allowed: ["--check"] }).check, true);
  const loginOptions = { allowed: ["--no-open", "--mcp"], positionalBackend: true };
  assert.deepEqual(
    (({ backend, open, mcp }) => ({ backend, open, mcp }))(parseSessionArguments([BACKEND, "--no-open", "--mcp"], loginOptions)),
    { backend: BACKEND, open: false, mcp: true },
  );

  assert.throws(() => parseSessionArguments(["--check"]), /Unknown argument: --check/u);
  assert.throws(() => parseSessionArguments([BACKEND]), /Unknown argument/u);
  assert.throws(() => parseSessionArguments([BACKEND, "https://second.example"], loginOptions), /Unknown argument/u);
  assert.throws(() => parseSessionArguments(["--backend"]), /--backend requires a URL/u);
  assert.throws(() => parseSessionArguments(["--access-token", "value"]), /Unknown argument/u);
});

test("auth token prints a short-lived access token and never the refresh token", async () => {
  const store = memoryStore();
  const access = testToken({ exp: NOW_SECONDS + 600 });
  const refresh = testToken({ exp: NOW_SECONDS + 86_400, kind: "refresh" });
  putSession(store, { access, refresh });

  const asJson = captureIo();
  assert.equal(await authToken({ json: true, env, store, io: asJson.io, now }), 0);
  assert.deepEqual(JSON.parse(asJson.out.join("\n")), {
    endpoint: BACKEND,
    access_token: access,
    token_type: "Bearer",
    expires_at: NOW_SECONDS + 600,
  });

  const plain = captureIo();
  assert.equal(await authToken({ env, store, io: plain.io, now }), 0);
  assert.deepEqual(plain.out, [access]);
  assert.equal([...asJson.out, ...asJson.err, ...plain.out, ...plain.err].join("\n").includes(refresh), false);
});

test("auth token renews a session about to expire before printing it", async () => {
  const store = memoryStore();
  putSession(store, { access: testToken({ exp: NOW_SECONDS + 10 }), refresh: "saved-refresh" });
  const renewed = testToken({ exp: NOW_SECONDS + 300 });
  const { fetchImpl } = routedFetch({ [REFRESH_PATH]: jsonResponse({ access: renewed }) });
  const { io, out } = captureIo();

  assert.equal(await authToken({ env, store, fetchImpl, io, now }), 0);

  assert.deepEqual(out, [renewed]);
  assert.equal(savedRecord(store).access, renewed);
});

test("auth token fails with the exit code that says what is missing", async () => {
  const notLoggedIn = captureIo();
  assert.equal(await authToken({ json: true, env, store: memoryStore(), io: notLoggedIn.io, now }), EXIT_NO_SESSION);
  assert.deepEqual(notLoggedIn.out, []);
  assert.deepEqual(JSON.parse(notLoggedIn.err.join("\n")), { error: "Not logged in. Run: command-center-sdk login" });

  const noStore = captureIo();
  assert.equal(await authToken({ env, store: null, io: noStore.io, now }), EXIT_NO_CREDENTIAL_STORE);
  assert.match(noStore.err.join("\n"), /No credential store is available/u);

  const unreadable = captureIo();
  assert.equal(await authToken({ env, store: unreadableStore(), io: unreadable.io, now }), EXIT_NO_SESSION);
  assert.match(unreadable.err.join("\n"), /The saved session could not be read\..*Run: command-center-sdk login/u);

  const refusedStore = memoryStore();
  putSession(refusedStore, { access: "", refresh: "saved-refresh" });
  const refused = captureIo();
  const { fetchImpl } = routedFetch({ [REFRESH_PATH]: jsonResponse({ detail: "Token is invalid or expired" }, 401) });
  assert.equal(await authToken({ env, store: refusedStore, fetchImpl, io: refused.io, now }), EXIT_NO_SESSION);
  assert.match(refused.err.join("\n"), /refused the saved session/u);
  assert.deepEqual(refused.out, []);
});

test("auth status reports the session without a token value, and asks the backend only with --check", async () => {
  const store = memoryStore();
  const access = testToken({ exp: NOW_SECONDS + 600 });
  const refresh = testToken({ exp: NOW_SECONDS + 86_400 });
  putSession(store, { access, refresh });

  const asJson = captureIo();
  const offline = () => assert.fail("without --check nothing is asked of the backend");
  assert.equal(await authStatus({ json: true, env, store, fetchImpl: offline, io: asJson.io, now }), 0);
  assert.deepEqual(JSON.parse(asJson.out.join("\n")), {
    endpoint: BACKEND,
    authenticated: true,
    checked_with_backend: false,
    auth_mode: "jwt",
    username: "ada",
    source: "store",
    storage: "secure OS credential storage (test store)",
    store_error: null,
    session_expires_at: NOW_SECONDS + 86_400,
    access_expires_at: NOW_SECONDS + 600,
  });

  const plain = captureIo();
  assert.equal(await authStatus({ env, store, fetchImpl: offline, io: plain.io, now }), 0);
  assert.deepEqual(plain.out.slice(0, 5), [
    `Backend: ${BACKEND}`,
    "Authenticated: yes",
    "Checked with backend: no",
    "User: ada",
    "Credentials from: store",
  ]);
  const printed = [...asJson.out, ...plain.out].join("\n");
  assert.equal(printed.includes(access) || printed.includes(refresh), false);

  const checked = captureIo();
  const accepted = routedFetch({ "/api/v1/users/me/": jsonResponse({ username: "ada.lovelace" }) });
  assert.equal(await authStatus({ json: true, check: true, env, store, fetchImpl: accepted.fetchImpl, io: checked.io, now }), 0);
  assert.deepEqual(
    (({ authenticated, checked_with_backend, username }) => ({ authenticated, checked_with_backend, username }))(
      JSON.parse(checked.out.join("\n")),
    ),
    { authenticated: true, checked_with_backend: true, username: "ada.lovelace" },
  );
  assert.equal(accepted.requests[0].headers.Authorization, `Bearer ${access}`);

  const refused = captureIo();
  const rejecting = routedFetch({ "/api/v1/users/me/": jsonResponse({ detail: "Invalid token." }, 401) });
  assert.equal(
    await authStatus({ json: true, check: true, env, store, fetchImpl: rejecting.fetchImpl, io: refused.io, now }),
    EXIT_NO_SESSION,
  );
  assert.equal(JSON.parse(refused.out.join("\n")).authenticated, false);
});

test("auth status tells a store that cannot be read from a machine that is not logged in", async () => {
  const notLoggedIn = captureIo();
  assert.equal(await authStatus({ env, store: memoryStore(), io: notLoggedIn.io, now }), EXIT_NO_SESSION);
  assert.equal(notLoggedIn.out.includes("Authenticated: no"), true);
  assert.equal(notLoggedIn.out.some((line) => line.startsWith("Credential store error")), false);

  const unreadable = captureIo();
  assert.equal(await authStatus({ env, store: unreadableStore(), io: unreadable.io, now }), EXIT_NO_SESSION);
  assert.match(unreadable.out.join("\n"), /Credential store error: The Keychain entry was written by another version/u);
});

test("refresh-token renews the saved session and removes credentials left in ./.env", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    await writeFile(
      join(cwd, ".env"),
      `MAINSEQUENCE_ENDPOINT=${BACKEND}\nMAINSEQUENCE_ACCESS_TOKEN=left\nMAINSEQUENCE_REFRESH_TOKEN=left\n`,
    );
    const store = memoryStore();
    const refresh = testToken({ exp: NOW_SECONDS + 86_400 });
    putSession(store, { access: testToken({ exp: NOW_SECONDS + 600 }), refresh });
    const renewed = testToken({ exp: NOW_SECONDS + 900 });
    const { fetchImpl, requests } = routedFetch({ [REFRESH_PATH]: jsonResponse({ access: renewed }) });

    const asJson = captureIo();
    // The backend is the one the project's .env names; the environment sets none.
    assert.equal(await refreshToken({ json: true, env: {}, cwd, configDirectory, store, fetchImpl, io: asJson.io, now }), 0);

    const report = JSON.parse(asJson.out.join("\n"));
    assert.equal(report.endpoint, BACKEND);
    assert.equal(report.authenticated, true);
    assert.equal(report.source, "store");
    assert.equal(report.access_expires_at, NOW_SECONDS + 900);
    assert.deepEqual(report.removed_env_entries, ["MAINSEQUENCE_ACCESS_TOKEN", "MAINSEQUENCE_REFRESH_TOKEN"]);
    assert.deepEqual(report.notes, []);
    assert.equal(JSON.stringify(report).includes(renewed) || JSON.stringify(report).includes(refresh), false);
    assert.deepEqual(requests[0].body, { refresh });
    assert.equal(savedRecord(store).access, renewed);
    assert.equal(await readFile(join(cwd, ".env"), "utf8"), `MAINSEQUENCE_ENDPOINT=${BACKEND}\n`);

    const plain = captureIo();
    assert.equal(await refreshToken({ env: {}, cwd, configDirectory, store, fetchImpl, io: plain.io, now }), 0);
    assert.deepEqual(plain.out, [`Session renewed for ada on ${BACKEND}, valid until 2030-03-18 17:46 UTC.`]);
  });
});

test("refresh-token is about the saved session even when the shell sets a token", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    const store = memoryStore();
    putSession(store, { access: "", refresh: "saved-refresh" });
    const renewed = testToken({ exp: NOW_SECONDS + 900 });
    const { fetchImpl, requests } = routedFetch({ [REFRESH_PATH]: jsonResponse({ access: renewed }) });
    const { io, out } = captureIo();

    const status = await refreshToken({
      env: { ...env, MAINSEQUENCE_ACCESS_TOKEN: "set-in-the-shell", MAINSEQUENCE_REFRESH_TOKEN: "set-in-the-shell-too" },
      cwd,
      configDirectory,
      store,
      fetchImpl,
      io,
      now,
    });

    assert.equal(status, 0);
    assert.deepEqual(requests[0].body, { refresh: "saved-refresh" });
    assert.equal(savedRecord(store).access, renewed);
    assert.match(out.join("\n"), /Note: MAINSEQUENCE_ACCESS_TOKEN is set in this shell and is used instead of the saved session/u);
  });
});

test("refresh-token says what was removed even when there is no session to renew", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    await writeFile(join(cwd, ".env"), "MAINSEQUENCE_TOKEN=left\n");
    const { io, out, err } = captureIo();

    assert.equal(await refreshToken({ env, cwd, configDirectory, store: memoryStore(), io, now }), EXIT_NO_SESSION);

    assert.deepEqual(out, ["Removed credential entries from ./.env: MAINSEQUENCE_TOKEN"]);
    assert.deepEqual(err, ["command-center-sdk: Not logged in. Run: command-center-sdk login"]);
    assert.equal(await readFile(join(cwd, ".env"), "utf8"), "");

    const noStore = captureIo();
    assert.equal(await refreshToken({ env, cwd, configDirectory, store: null, io: noStore.io, now }), EXIT_NO_CREDENTIAL_STORE);
  });
});

/** Finish the browser login as the person would: follow the announced address back to the CLI. */
function signInThrough(io) {
  const announced = [];
  return {
    announced,
    io: {
      out: io.out,
      err(text) {
        io.err(text);
        const match = /^Open this URL to authenticate: (.+)$/u.exec(text);
        if (!match) return;
        const authorize = new URL(match[1]);
        announced.push(authorize);
        const callback = new URL(authorize.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", "authorization-code");
        callback.searchParams.set("state", authorize.searchParams.get("state"));
        void fetch(callback)
          .then((response) => response.text())
          .catch(() => {});
      },
    },
  };
}

test("login saves one session for the backend and tells where it is kept", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    const store = memoryStore();
    const { fetchImpl } = routedFetch({
      "/auth/cli/token/": jsonResponse({ access: "access-1", refresh: "refresh-1" }),
      "/api/v1/users/me/": jsonResponse({ user: { username: "ada" } }),
    });
    const captured = captureIo();
    const browser = signInThrough(captured.io);

    const status = await login({ open: false, env, cwd, configDirectory, store, fetchImpl, io: browser.io });

    assert.equal(status, 0);
    assert.equal(`${browser.announced[0].origin}${browser.announced[0].pathname}`, `${BACKEND}/auth/cli/authorize/`);
    assert.deepEqual(savedRecord(store), { v: 1, backend: BACKEND, username: "ada", access: "access-1", refresh: "refresh-1" });
    assert.deepEqual(captured.out, [
      `Signed in as ada (Backend: ${BACKEND}).`,
      "The session is saved in the test store. It serves every project on this machine.",
    ]);
    const printed = [...captured.out, ...captured.err].join("\n");
    assert.equal(printed.includes("access-1") || printed.includes("refresh-1"), false);
  });
});

test("login notes a shell token that hides the session and a directory that uses another backend", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    const store = memoryStore();
    const { fetchImpl } = routedFetch({
      "/auth/cli/token/": jsonResponse({ access: "access-1", refresh: "refresh-1" }),
      "/api/v1/users/me/": jsonResponse({ username: "ada" }),
    });
    const captured = captureIo();
    const browser = signInThrough(captured.io);

    const status = await login({
      json: true,
      open: false,
      backend: "https://other.example",
      env: { ...env, MAINSEQUENCE_ACCESS_TOKEN: "set-in-the-shell" },
      cwd,
      configDirectory,
      store,
      fetchImpl,
      io: browser.io,
    });

    assert.equal(status, 0);
    const result = JSON.parse(captured.out.join("\n"));
    assert.equal(result.endpoint, "https://other.example");
    assert.equal(result.username, "ada");
    assert.equal(result.storage, "test store");
    assert.equal(result.notes.length, 2);
    assert.match(result.notes[0], /MAINSEQUENCE_ACCESS_TOKEN is set in this shell/u);
    assert.match(result.notes[1], /Commands run in this directory use https:\/\/platform\.example\..*MAINSEQUENCE_ENDPOINT=https:\/\/other\.example/u);
    assert.equal(savedRecord(store, "https://other.example").refresh, "refresh-1");
    assert.equal(savedRecord(store), null, "the session of another backend is not touched");
  });
});

test("login through MCP prints the call the agent has to make and keeps JSON output to one document", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    const handoff = jsonResponse({
      handoff_uid: "handoff-1",
      redirect_uri: `${BACKEND}/auth/mcp/cli-handoff/token/`,
      mcp_tool: "auth.cli_authorize",
      mcp_arguments: { handoff_uid: "handoff-1" },
    });
    const backend = () =>
      routedFetch({
        "/auth/mcp/cli-handoff/start/": handoff,
        "/auth/mcp/cli-handoff/token/": jsonResponse({ access: "access-1", refresh: "refresh-1", user: { username: "ada" } }),
      });
    const call = '{"tool":"auth.cli_authorize","arguments":{"handoff_uid":"handoff-1"}}';

    const plain = captureIo();
    const store = memoryStore();
    assert.equal(await login({ mcp: true, env, cwd, configDirectory, store, fetchImpl: backend().fetchImpl, io: plain.io }), 0);
    assert.deepEqual(plain.err, ["Authorize this CLI from the connected Main Sequence MCP session:"]);
    assert.equal(plain.out[0], call);
    assert.equal(savedRecord(store).username, "ada");

    const asJson = captureIo();
    assert.equal(
      await login({ mcp: true, json: true, env, cwd, configDirectory, store: memoryStore(), fetchImpl: backend().fetchImpl, io: asJson.io }),
      0,
    );
    assert.equal(asJson.err[1], call);
    assert.equal(JSON.parse(asJson.out.join("\n")).username, "ada");
  });
});

test("login needs a credential store before anyone is sent to a browser", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    const { io, err } = captureIo();
    const status = await login({
      env,
      cwd,
      configDirectory,
      store: null,
      fetchImpl: () => assert.fail("nothing is asked of the backend"),
      io,
    });
    assert.equal(status, EXIT_NO_CREDENTIAL_STORE);
    assert.match(err.join("\n"), /No credential store is available/u);
    assert.equal(err.some((line) => line.includes("Open this URL")), false);
  });
});

test("logout ends the session on the backend and removes it from this machine", async () => {
  const store = memoryStore();
  putSession(store, { access: "access-1", refresh: "refresh-1" });
  const { fetchImpl, requests } = routedFetch({ "/auth/cli/revoke/": jsonResponse({}) });
  const { io, out } = captureIo();

  assert.equal(await logout({ env, store, fetchImpl, io }), 0);

  assert.deepEqual(requests.map((request) => [request.path, request.body]), [["/auth/cli/revoke/", { refresh: "refresh-1" }]]);
  assert.equal(store.entries.size, 0);
  assert.deepEqual(out, ["Signed out. The session is ended on the backend and removed from this machine."]);

  const again = captureIo();
  assert.equal(await logout({ json: true, env, store, fetchImpl, io: again.io }), 0);
  assert.deepEqual(JSON.parse(again.out.join("\n")), {
    endpoint: BACKEND,
    removed: false,
    revoked: false,
    detail: "No saved session to end on the backend.",
  });
});

test("logout removes a session it cannot read or that the backend does not confirm", async () => {
  const unreadable = unreadableStore();
  unreadable.entries.set("MainSequenceCLI.auth\ndefault", "left by another program");
  const first = captureIo();
  assert.equal(await logout({ env, store: unreadable, fetchImpl: () => assert.fail("no token to send"), io: first.io }), 0);
  assert.equal(unreadable.entries.size, 0);
  assert.match(first.out.join("\n"), /could not be read, so the backend was not asked/u);

  const store = memoryStore();
  putSession(store, { access: "a", refresh: "refresh-1" });
  const offline = async () => {
    throw new TypeError("fetch failed");
  };
  const second = captureIo();
  assert.equal(await logout({ env, store, fetchImpl: offline, io: second.io }), 0);
  assert.equal(store.entries.size, 0);
  assert.match(second.out.join("\n"), /Signed out on this machine\. The backend did not confirm/u);
});

test("commands that call the platform take the saved session only when no token is set", async () => {
  await withProject(async ({ cwd, configDirectory }) => {
    await writeFile(join(cwd, ".env"), `MAINSEQUENCE_ENDPOINT=${BACKEND}/\n`);
    const store = memoryStore();
    const access = testToken({ exp: NOW_SECONDS + 10_000_000_000 });
    putSession(store, { access, refresh: "saved-refresh" });
    const offline = () => assert.fail("a valid session needs no renewal");

    assert.deepEqual(await resolvePlatformAccess({ env: {}, cwd, configDirectory, store, fetchImpl: offline }), {
      backendUrl: BACKEND,
      accessToken: access,
    });

    // A token set in the environment wins, and the caller keeps its own handling of it.
    store.calls.length = 0;
    assert.equal(
      await resolvePlatformAccess({ env: { MAINSEQUENCE_ACCESS_TOKEN: "set-in-the-shell" }, cwd, configDirectory, store }),
      null,
    );
    assert.deepEqual(store.calls, []);

    // No other variable of the environment is a credential for these commands.
    assert.equal(
      (await resolvePlatformAccess({ env: { MAINSEQUENCE_REFRESH_TOKEN: "set-in-the-shell" }, cwd, configDirectory, store, fetchImpl: offline }))
        .accessToken,
      access,
    );

    await assert.rejects(
      resolvePlatformAccess({ env: {}, cwd, configDirectory, store: memoryStore() }),
      /Not logged in\. Run: command-center-sdk login/u,
    );
  });
});

test("the CLI lists the session commands and rejects an argument before it touches anything", () => {
  // Should a command run after all, it finds no project here and no session for this backend.
  const spawnOptions = {
    encoding: "utf8",
    cwd: tmpdir(),
    env: { ...process.env, MAINSEQUENCE_ENDPOINT: "http://127.0.0.1:9", MAINSEQUENCE_ACCESS_TOKEN: "" },
  };
  const help = spawnSync(process.execPath, [cliPath, "--help"], spawnOptions);
  assert.equal(help.status, 0);
  for (const command of ["login", "logout", "refresh-token", "auth status", "auth token"]) {
    assert.match(help.stdout, new RegExp(`command-center-sdk ${command}`, "u"));
  }

  for (const args of [
    ["login", "--access-token", "value", "--json"],
    ["auth", "token", "--check", "--json"],
    ["auth", "status", "--bogus", "--json"],
    ["refresh-token", "extra", "--json"],
    ["refresh_token", "--bogus", "--json"],
    ["logout", "--backend", "--json"],
  ]) {
    const result = spawnSync(process.execPath, [cliPath, ...args], spawnOptions);
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(result.stdout, "");
    assert.match(JSON.parse(result.stderr).error, /Unknown argument|--backend requires a URL/u, args.join(" "));
  }

  const unknown = spawnSync(process.execPath, [cliPath, "auth", "whoami", "--json"], spawnOptions);
  assert.equal(unknown.status, 1);
  assert.deepEqual(JSON.parse(unknown.stderr), { error: "Unknown command: auth whoami --json" });
});
