import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cliConfigDirectory,
  clearSession,
  CredentialStoreError,
  currentAccessToken,
  MachineSessionError,
  NoCredentialStoreError,
  normalizeBackendUrl,
  NoSessionError,
  openCredentialStore,
  readSession,
  resolveBackendUrl,
  saveSession,
  SESSION_SERVICE,
  sessionEntry,
  sessionReport,
  STANDARD_BACKEND_URL,
  tokenExpiry,
} from "../../cli/machine-session.mjs";
import {
  BACKEND,
  jsonResponse,
  memoryStore,
  now,
  NOW_SECONDS,
  putSession,
  routedFetch,
  savedRecord,
  testToken,
} from "./session-test-support.mjs";

const SECURITY = "/usr/bin/security";
const MARK = "MainSequenceCLI.session.v1";
const REFRESH_PATH = "/auth/jwt-token/token/refresh/";

/** Apple's `security` program, as far as the CLI uses it. `ours` entries carry the CLIs' mark. */
function fakeSecurity() {
  const entries = new Map();
  const commands = [];
  const key = (service, account) => `${service}\n${account}`;
  const option = (args, name) => args[args.indexOf(name) + 1];
  const notFound = { status: 44, stdout: "", stderr: "security: The specified item could not be found in the keychain.\n" };

  function spawnSyncImpl(program, args, options) {
    assert.equal(program, SECURITY);
    if (args[0] === "-i") {
      const match = /^add-generic-password -U -s (\S+) -a (\S+) -j (\S+) -X ([0-9a-f]+)\n$/u.exec(options.input);
      assert.ok(match, "the secret goes to security on standard input, as one line");
      commands.push(`write ${match[2]}`);
      entries.set(key(match[1], match[2]), {
        secret: Buffer.from(match[4], "hex").toString("utf8"),
        comment: match[3],
      });
      return { status: 0, stdout: "", stderr: "" };
    }
    const entry = entries.get(key(option(args, "-s"), option(args, "-a")));
    if (args[0] === "delete-generic-password") {
      commands.push(`delete ${option(args, "-a")}`);
      if (!entry) return notFound;
      entries.delete(key(option(args, "-s"), option(args, "-a")));
      return { status: 0, stdout: "", stderr: "" };
    }
    assert.equal(args[0], "find-generic-password");
    if (args.includes("-w")) {
      commands.push(`read-secret ${option(args, "-a")}`);
      return entry ? { status: 0, stdout: `${entry.secret}\n`, stderr: "" } : notFound;
    }
    commands.push(`inspect ${option(args, "-a")}`);
    if (!entry) return notFound;
    const comment = entry.comment ? `"${entry.comment}"` : "<NULL>";
    return {
      status: 0,
      stdout: `keychain: "/Users/ada/Library/Keychains/login.keychain-db"\nclass: "genp"\nattributes:\n    "acct"<blob>="${option(args, "-a")}"\n    "icmt"<blob>=${comment}\n    "svce"<blob>="${option(args, "-s")}"\n`,
      stderr: "",
    };
  }

  return {
    entries,
    commands,
    put(account, secret, { ours = true } = {}) {
      entries.set(key(SESSION_SERVICE, account), { secret, comment: ours ? MARK : null });
    },
    store: openCredentialStore({ platform: "darwin", spawnSyncImpl, isExecutable: () => true }),
  };
}

/** `secret-tool`, as far as the CLI uses it. Items are kept with the attributes they were stored with. */
function fakeSecretTool({ unavailable = false } = {}) {
  const items = [];
  const calls = [];
  const attributesOf = (args) => {
    const attributes = {};
    for (let index = 0; index < args.length; index += 2) attributes[args[index]] = args[index + 1];
    return attributes;
  };
  const matches = (item, wanted) => Object.entries(wanted).every(([name, value]) => item.attributes[name] === value);

  function spawnSyncImpl(program, args, options) {
    assert.equal(program, "/usr/bin/secret-tool");
    calls.push({ args, input: options.input });
    if (unavailable) {
      return { status: 1, stdout: "", stderr: "secret-tool: Cannot autolaunch D-Bus without X11 $DISPLAY\n" };
    }
    if (args[0] === "lookup") {
      const item = items.find((candidate) => matches(candidate, attributesOf(args.slice(1))));
      return item ? { status: 0, stdout: item.secret, stderr: "" } : { status: 1, stdout: "", stderr: "" };
    }
    if (args[0] === "store") {
      const attributes = attributesOf(args.slice(2));
      const existing = items.find(
        (candidate) => JSON.stringify(candidate.attributes) === JSON.stringify(attributes),
      );
      if (existing) existing.secret = options.input;
      else items.push({ label: args[1], attributes, secret: options.input });
      return { status: 0, stdout: "", stderr: "" };
    }
    assert.equal(args[0], "clear");
    const before = items.length;
    const wanted = attributesOf(args.slice(1));
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (matches(items[index], wanted)) items.splice(index, 1);
    }
    return { status: before === items.length ? 1 : 0, stdout: "", stderr: "" };
  }

  return {
    items,
    calls,
    store: openCredentialStore({
      platform: "linux",
      env: { PATH: "/usr/local/bin:/usr/bin" },
      spawnSyncImpl,
      isExecutable: (candidate) => candidate === "/usr/bin/secret-tool",
    }),
  };
}

test("the backend URL is kept as the Python CLI writes it", () => {
  assert.equal(normalizeBackendUrl("  https://platform.example/  "), "https://platform.example");
  assert.equal(normalizeBackendUrl("http://127.0.0.1:8000///"), "http://127.0.0.1:8000");
  // Not re-serialized: the session entry is named after this exact text.
  assert.equal(normalizeBackendUrl("https://Platform.Example/base"), "https://Platform.Example/base");
  for (const invalid of ["", "platform.example", "ftp://platform.example", "https://user:secret@platform.example", "https://platform.example/?a=1", "https://platform.example/#a", "https://a.example\nhttps://b.example"]) {
    assert.throws(() => normalizeBackendUrl(invalid), MachineSessionError, invalid);
  }
  assert.throws(
    () => normalizeBackendUrl("https://user:secret@platform.example"),
    (error) => !error.message.includes("secret"),
  );
});

test("both CLIs name the session entry of a backend the same way", () => {
  // The first 16 hexadecimal digits of SHA-256 of the backend URL, as the Python CLI computes them.
  assert.deepEqual(sessionEntry("https://api.main-sequence.app/"), {
    service: "MainSequenceCLI.auth",
    account: "default.7f0feafc6447d21a",
  });
  assert.equal(sessionEntry("http://127.0.0.1:8000").account, "default.63767aa5615dabad");
  assert.equal(sessionEntry("https://platform.example/base").account, "default.3785f5ba3b6ddbea");
});

test("the CLIs share one directory for settings that are not secret", () => {
  const homeDirectory = "/home/ada";
  assert.equal(cliConfigDirectory({ platform: "linux", env: {}, homeDirectory }), "/home/ada/.config/mainsequence");
  assert.equal(
    cliConfigDirectory({ platform: "darwin", env: {}, homeDirectory: "/Users/ada" }),
    "/Users/ada/Library/Application Support/MainSequenceCLI",
  );
  assert.match(
    cliConfigDirectory({ platform: "win32", env: { APPDATA: "C:\\Users\\ada\\AppData\\Roaming" }, homeDirectory }),
    /MainSequenceCLI$/u,
  );
});

test("the backend comes from the argument, the environment, the project, the CLI settings, then the standard one", async () => {
  const root = await mkdtemp(join(tmpdir(), "command-center-sdk-backend-"));
  const project = join(root, "project");
  const configDirectory = join(root, "config");
  await mkdir(project);
  await mkdir(configDirectory);
  try {
    const resolve = (options = {}) => resolveBackendUrl({ env: {}, cwd: project, configDirectory, ...options });
    assert.equal(resolve(), STANDARD_BACKEND_URL);

    await writeFile(join(configDirectory, "config.json"), JSON.stringify({ backend_url: "https://settings.example/" }));
    assert.equal(resolve(), "https://settings.example");

    await writeFile(join(project, ".env"), "OTHER=1\nMAINSEQUENCE_ENDPOINT=https://project.example/\n");
    assert.equal(resolve(), "https://project.example");

    assert.equal(resolve({ env: { MAINSEQUENCE_ENDPOINT: "https://environment.example" } }), "https://environment.example");
    assert.equal(
      resolve({ explicit: "https://argument.example", env: { MAINSEQUENCE_ENDPOINT: "https://environment.example" } }),
      "https://argument.example",
    );
    assert.throws(() => resolve({ explicit: "not a url" }), MachineSessionError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("only the endpoint is read from a project's .env, in the forms tools that load the file accept", async () => {
  const project = await mkdtemp(join(tmpdir(), "command-center-sdk-env-"));
  const configDirectory = join(project, "no-settings");
  try {
    const cases = [
      ["MAINSEQUENCE_ENDPOINT=https://a.example\n", "https://a.example"],
      ["export MAINSEQUENCE_ENDPOINT = 'https://b.example/'\n", "https://b.example"],
      ['  MAINSEQUENCE_ENDPOINT="https://c.example" # the backend\r\n', "https://c.example"],
      ["MAINSEQUENCE_ENDPOINT=https://d.example # local\n", "https://d.example"],
      ["MAINSEQUENCE_ENDPOINT=https://first.example\nMAINSEQUENCE_ENDPOINT=https://last.example\n", "https://last.example"],
      ["# MAINSEQUENCE_ENDPOINT=https://commented.example\n", STANDARD_BACKEND_URL],
      ["MAINSEQUENCE_ACCESS_TOKEN=left-by-an-earlier-setup\n", STANDARD_BACKEND_URL],
    ];
    for (const [text, expected] of cases) {
      await writeFile(join(project, ".env"), text);
      assert.equal(resolveBackendUrl({ env: {}, cwd: project, configDirectory }), expected, text);
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("a token's expiry is read without verifying it", () => {
  assert.equal(tokenExpiry(testToken({ exp: 1_900_000_123 })), 1_900_000_123);
  assert.equal(tokenExpiry(testToken({})), null);
  assert.equal(tokenExpiry("opaque-token"), null);
  assert.equal(tokenExpiry("a.b.c"), null);
  assert.equal(tokenExpiry(undefined), null);
});

test("a session is saved as the one record both CLIs read", () => {
  const store = memoryStore();
  saveSession({ backend: `${BACKEND}/`, username: "José", access: "access-1", refresh: "refresh-1", store });

  const raw = store.entries.get(`${SESSION_SERVICE}\n${sessionEntry(BACKEND).account}`);
  // ASCII only, so every store returns the same bytes.
  assert.match(raw, /^[\x20-\x7e]+$/u);
  assert.deepEqual(JSON.parse(raw), { v: 1, backend: BACKEND, username: "José", access: "access-1", refresh: "refresh-1" });
  assert.deepEqual(readSession({ backend: BACKEND, store }), { username: "José", access: "access-1", refresh: "refresh-1" });
});

test("a record with only a refresh token is a session, and one of another backend is not this one's", () => {
  const store = memoryStore();
  putSession(store, { refresh: "refresh-only" });
  assert.deepEqual(readSession({ backend: BACKEND, store }), { username: "ada", access: "", refresh: "refresh-only" });

  const other = memoryStore();
  other.entries.set(
    `${SESSION_SERVICE}\n${sessionEntry(BACKEND).account}`,
    JSON.stringify({ v: 1, backend: "https://other.example", username: "ada", access: "a", refresh: "r" }),
  );
  assert.equal(readSession({ backend: BACKEND, store: other }), null);

  const broken = memoryStore();
  broken.entries.set(`${SESSION_SERVICE}\n${sessionEntry(BACKEND).account}`, "not json");
  assert.throws(() => readSession({ backend: BACKEND, store: broken }), CredentialStoreError);
});

test("the unscoped entry old Python CLIs wrote is read, and removed at logout", () => {
  const store = memoryStore();
  putSession(store, { account: "default", access: "legacy-access", refresh: "legacy-refresh" });
  assert.equal(readSession({ backend: BACKEND, store }).refresh, "legacy-refresh");

  assert.equal(clearSession({ backend: BACKEND, store }), true);
  assert.equal(store.entries.size, 0);
  assert.equal(clearSession({ backend: BACKEND, store }), false);
});

test("without a credential store there is no session to read or save", () => {
  assert.throws(() => readSession({ backend: BACKEND, store: null }), NoCredentialStoreError);
  assert.throws(
    () => saveSession({ backend: BACKEND, access: "a", refresh: "r", store: null }),
    NoCredentialStoreError,
  );
  assert.equal(openCredentialStore({ platform: "win32" }), null);
  assert.equal(openCredentialStore({ platform: "linux", env: { PATH: "/usr/bin" }, isExecutable: () => false }), null);
  assert.equal(openCredentialStore({ platform: "darwin", isExecutable: () => false }), null);
});

test("a token set in the environment wins and the saved session is not read", async () => {
  const store = memoryStore();
  putSession(store, { access: "saved-access", refresh: "saved-refresh" });
  const environmentToken = testToken({ exp: NOW_SECONDS + 600 });

  const token = await currentAccessToken({
    backend: BACKEND,
    env: { MAINSEQUENCE_ACCESS_TOKEN: environmentToken },
    store,
    fetchImpl: () => assert.fail("nothing is asked of the backend"),
    now,
  });

  assert.deepEqual(token, {
    endpoint: BACKEND,
    access_token: environmentToken,
    token_type: "Bearer",
    expires_at: NOW_SECONDS + 600,
    source: "environment",
  });
  assert.deepEqual(store.calls, []);
});

test("an expired pair in the environment is renewed in memory and never saved", async () => {
  const store = memoryStore();
  const renewed = testToken({ exp: NOW_SECONDS + 300 });
  const { fetchImpl, requests } = routedFetch({ [REFRESH_PATH]: jsonResponse({ access: renewed }) });

  const token = await currentAccessToken({
    backend: BACKEND,
    env: {
      MAINSEQUENCE_ACCESS_TOKEN: testToken({ exp: NOW_SECONDS - 10 }),
      MAINSEQUENCE_REFRESH_TOKEN: "environment-refresh",
    },
    store,
    fetchImpl,
    now,
  });

  assert.equal(token.access_token, renewed);
  assert.equal(token.source, "environment");
  assert.deepEqual(requests.map((request) => [request.url, request.body]), [
    [`${BACKEND}${REFRESH_PATH}`, { refresh: "environment-refresh" }],
  ]);
  assert.deepEqual(store.calls, []);
});

test("a saved session that is still valid is used as it is", async () => {
  const store = memoryStore();
  const access = testToken({ exp: NOW_SECONDS + 600 });
  putSession(store, { access, refresh: "saved-refresh" });

  const token = await currentAccessToken({
    backend: BACKEND,
    env: {},
    store,
    fetchImpl: () => assert.fail("nothing is asked of the backend"),
    now,
  });

  assert.equal(token.access_token, access);
  assert.equal(token.source, "store");
  assert.equal(store.calls.some((call) => call.startsWith("write")), false);
});

test("a saved session about to expire is renewed and saved again", async () => {
  const store = memoryStore();
  putSession(store, { access: testToken({ exp: NOW_SECONDS + 30 }), refresh: "saved-refresh" });
  const renewed = testToken({ exp: NOW_SECONDS + 300 });
  const { fetchImpl, requests } = routedFetch({ [REFRESH_PATH]: jsonResponse({ access: renewed }) });

  const token = await currentAccessToken({ backend: BACKEND, env: {}, store, fetchImpl, now });

  assert.equal(token.access_token, renewed);
  assert.equal(token.expires_at, NOW_SECONDS + 300);
  assert.deepEqual(requests[0].body, { refresh: "saved-refresh" });
  // The backend returned no new refresh token, so the saved one stays.
  assert.deepEqual(savedRecord(store), { v: 1, backend: BACKEND, username: "ada", access: renewed, refresh: "saved-refresh" });
});

test("a refresh token the backend replaces is saved with the new access token", async () => {
  const store = memoryStore();
  putSession(store, { access: "", refresh: "saved-refresh" });
  const renewed = testToken({ exp: NOW_SECONDS + 300 });
  const { fetchImpl } = routedFetch({ [REFRESH_PATH]: jsonResponse({ access: renewed, refresh: "rotated-refresh" }) });

  await currentAccessToken({ backend: BACKEND, env: {}, store, fetchImpl, now });

  assert.equal(savedRecord(store).refresh, "rotated-refresh");
  assert.equal(savedRecord(store).access, renewed);
});

test("a valid session is renewed when the caller asks for it", async () => {
  const store = memoryStore();
  putSession(store, { access: testToken({ exp: NOW_SECONDS + 600 }), refresh: "saved-refresh" });
  const renewed = testToken({ exp: NOW_SECONDS + 900 });
  const { fetchImpl } = routedFetch({ [REFRESH_PATH]: jsonResponse({ access: renewed }) });

  const token = await currentAccessToken({ backend: BACKEND, env: {}, store, fetchImpl, now, forceRenewal: true });

  assert.equal(token.access_token, renewed);
});

test("no session, a refused one and an unreachable backend are told apart", async () => {
  const unreachable = async () => {
    throw new TypeError("fetch failed: https://platform.example/?token=must-not-be-reported");
  };

  await assert.rejects(
    currentAccessToken({ backend: BACKEND, env: {}, store: memoryStore(), now }),
    (error) => error instanceof NoSessionError && /command-center-sdk login/u.test(error.message),
  );

  const expired = memoryStore();
  putSession(expired, { access: testToken({ exp: NOW_SECONDS - 10 }), refresh: "saved-refresh" });
  const { fetchImpl } = routedFetch({ [REFRESH_PATH]: jsonResponse({ detail: "Token is invalid or expired" }, 401) });
  await assert.rejects(
    currentAccessToken({ backend: BACKEND, env: {}, store: expired, fetchImpl, now }),
    (error) => error instanceof NoSessionError && /refused the saved session/u.test(error.message),
  );
  // A refused session is left in the store: only a login or a logout replaces it.
  assert.equal(savedRecord(expired).refresh, "saved-refresh");

  await assert.rejects(
    currentAccessToken({ backend: BACKEND, env: {}, store: expired, fetchImpl: unreachable, now }),
    (error) =>
      error instanceof MachineSessionError &&
      !(error instanceof NoSessionError) &&
      !error.message.includes("must-not-be-reported"),
  );

  const accessOnly = memoryStore();
  putSession(accessOnly, { access: testToken({ exp: NOW_SECONDS - 10 }), refresh: "" });
  await assert.rejects(currentAccessToken({ backend: BACKEND, env: {}, store: accessOnly, now }), NoSessionError);

  await assert.rejects(currentAccessToken({ backend: BACKEND, env: {}, store: null, now }), NoCredentialStoreError);
});

test("the session report says where credentials come from and carries no token", () => {
  const store = memoryStore();
  const access = testToken({ exp: NOW_SECONDS + 120 });
  const refresh = testToken({ exp: NOW_SECONDS + 86_400 });
  putSession(store, { access, refresh });

  const report = sessionReport({ backend: BACKEND, env: {}, store, now });
  assert.deepEqual(report, {
    endpoint: BACKEND,
    authenticated: true,
    checked_with_backend: false,
    auth_mode: "jwt",
    username: "ada",
    source: "store",
    storage: "secure OS credential storage (test store)",
    store_error: null,
    session_expires_at: NOW_SECONDS + 86_400,
    access_expires_at: NOW_SECONDS + 120,
  });
  assert.equal(JSON.stringify(report).includes(access), false);
  assert.equal(JSON.stringify(report).includes(refresh), false);

  const expired = memoryStore();
  putSession(expired, { access, refresh: testToken({ exp: NOW_SECONDS - 1 }) });
  assert.equal(sessionReport({ backend: BACKEND, env: {}, store: expired, now }).authenticated, false);

  assert.deepEqual(
    (({ authenticated, source, storage }) => ({ authenticated, source, storage }))(
      sessionReport({ backend: BACKEND, env: {}, store: null, now }),
    ),
    { authenticated: false, source: null, storage: "process environment only (no credential store)" },
  );

  const fromEnvironment = sessionReport({
    backend: BACKEND,
    env: { MAINSEQUENCE_ACCESS_TOKEN: access },
    store,
    now,
  });
  assert.equal(fromEnvironment.source, "environment");
  assert.equal(fromEnvironment.username, null);
  assert.equal(fromEnvironment.authenticated, true);
});

test("macOS: an entry with the CLIs' mark is read, after its attributes alone are inspected", () => {
  const security = fakeSecurity();
  const { account } = sessionEntry(BACKEND);
  security.put(account, JSON.stringify({ v: 1, backend: BACKEND, username: "ada", access: "a", refresh: "r" }));

  assert.equal(security.store.name, "macOS Keychain");
  assert.deepEqual(readSession({ backend: BACKEND, store: security.store }), { username: "ada", access: "a", refresh: "r" });
  assert.deepEqual(security.commands, [`inspect ${account}`, `read-secret ${account}`]);
});

test("macOS: the secret of an entry another program wrote is never asked for", () => {
  const security = fakeSecurity();
  const { account } = sessionEntry(BACKEND);
  security.put(account, JSON.stringify({ v: 1, backend: BACKEND, access: "a", refresh: "r" }), { ours: false });

  // Asking would show the consent dialog, in every process that starts.
  assert.throws(
    () => readSession({ backend: BACKEND, store: security.store }),
    (error) => error instanceof CredentialStoreError && /another version of the CLI/u.test(error.message),
  );
  assert.deepEqual(security.commands, [`inspect ${account}`]);

  const report = sessionReport({ backend: BACKEND, env: {}, store: security.store, now });
  assert.equal(report.authenticated, false);
  assert.match(report.store_error, /another version of the CLI/u);
});

test("macOS: an entry this process read is updated in place, and any other is replaced", () => {
  const security = fakeSecurity();
  const { account } = sessionEntry(BACKEND);
  security.put(account, JSON.stringify({ v: 1, backend: BACKEND, username: "ada", access: "a", refresh: "r" }));

  readSession({ backend: BACKEND, store: security.store });
  security.commands.length = 0;
  saveSession({ backend: BACKEND, username: "ada", access: "b", refresh: "r", store: security.store });
  // No delete: another process never finds the session missing while it is renewed.
  assert.deepEqual(security.commands, [`write ${account}`]);
  assert.equal(security.entries.get(`${SESSION_SERVICE}\n${account}`).comment, MARK);

  const foreign = fakeSecurity();
  foreign.put(account, "left by another program", { ours: false });
  saveSession({ backend: BACKEND, username: "ada", access: "c", refresh: "r", store: foreign.store });
  // Replacing needs no consent; updating another program's entry would wait for it.
  assert.deepEqual(foreign.commands, [`delete ${account}`, `write ${account}`]);
  assert.equal(readSession({ backend: BACKEND, store: foreign.store }).access, "c");
});

test("macOS: a missing entry is no session, and logout removes both account names", () => {
  const security = fakeSecurity();
  const { account } = sessionEntry(BACKEND);
  assert.equal(readSession({ backend: BACKEND, store: security.store }), null);
  assert.deepEqual(security.commands, [`inspect ${account}`, "inspect default"]);

  security.put(account, "{}");
  security.commands.length = 0;
  assert.equal(clearSession({ backend: BACKEND, store: security.store }), true);
  assert.deepEqual(security.commands, [`delete ${account}`, "delete default"]);
  assert.equal(security.entries.size, 0);
});

test("macOS: a record too long for one line of the Keychain helper is refused, not cut", () => {
  const security = fakeSecurity();
  assert.throws(
    () => saveSession({ backend: BACKEND, access: "a".repeat(2_000), refresh: "r", store: security.store }),
    (error) => error instanceof CredentialStoreError && /too long/u.test(error.message),
  );
  assert.equal(security.entries.size, 0);
});

test("macOS: a store that waits for the user is reported, not waited for", () => {
  const store = openCredentialStore({
    platform: "darwin",
    isExecutable: () => true,
    spawnSyncImpl: () => ({ status: null, stdout: "", stderr: "", error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) }),
  });
  assert.throws(
    () => readSession({ backend: BACKEND, store }),
    (error) => error instanceof CredentialStoreError && /waiting for the user/u.test(error.message),
  );
});

test("Linux: the session is one Secret Service item that both CLIs replace in place", () => {
  const secretTool = fakeSecretTool();
  const { account } = sessionEntry(BACKEND);
  assert.equal(secretTool.store.name, "Secret Service");

  saveSession({ backend: BACKEND, username: "ada", access: "a", refresh: "r", store: secretTool.store });
  saveSession({ backend: BACKEND, username: "ada", access: "b", refresh: "r", store: secretTool.store });

  assert.equal(secretTool.items.length, 1);
  assert.deepEqual(secretTool.items[0].attributes, {
    service: SESSION_SERVICE,
    username: account,
    application: "Python keyring library",
  });
  assert.equal(secretTool.items[0].label, `--label=Password for '${account}' on '${SESSION_SERVICE}'`);
  // The secret travels on standard input, without a trailing newline the store would keep.
  const stored = secretTool.calls.filter((call) => call.args[0] === "store");
  assert.equal(stored.every((call) => !call.args.join(" ").includes('"access"')), true);
  assert.equal(stored[1].input.endsWith("\n"), false);
  assert.equal(readSession({ backend: BACKEND, store: secretTool.store }).access, "b");

  assert.equal(clearSession({ backend: BACKEND, store: secretTool.store }), true);
  assert.equal(secretTool.items.length, 0);
  assert.equal(readSession({ backend: BACKEND, store: secretTool.store }), null);
});

test("Linux: an item another program stored for the entry is read too", () => {
  const secretTool = fakeSecretTool();
  const { account } = sessionEntry(BACKEND);
  secretTool.items.push({
    label: "stored by another program",
    attributes: { service: SESSION_SERVICE, username: account },
    secret: JSON.stringify({ v: 1, backend: BACKEND, username: "ada", access: "a", refresh: "r" }),
  });

  assert.equal(readSession({ backend: BACKEND, store: secretTool.store }).refresh, "r");
});

test("Linux: a Secret Service that cannot be reached is an error, not a missing session", () => {
  const secretTool = fakeSecretTool({ unavailable: true });
  assert.throws(
    () => readSession({ backend: BACKEND, store: secretTool.store }),
    (error) => error instanceof CredentialStoreError && /Secret Service is not available/u.test(error.message),
  );
});
