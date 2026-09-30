// Stand-ins for the machine session tests. No test reads or writes this machine's credential
// store: each one passes its own store, or the programs a store adapter would run.

import { SESSION_SERVICE, sessionEntry } from "../../cli/machine-session.mjs";

export const BACKEND = "https://platform.example";
export const NOW_SECONDS = 1_900_000_000;
export const now = () => NOW_SECONDS * 1000;

/** An unsigned token with the claims a test needs. The CLI reads `exp` without verifying it. */
export function testToken(claims = {}) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.test-signature`;
}

/** A credential store in memory, with a log of what was asked of it. */
export function memoryStore({ name = "test store" } = {}) {
  const entries = new Map();
  const calls = [];
  const key = (service, account) => `${service}\n${account}`;
  return {
    name,
    entries,
    calls,
    read(service, account) {
      calls.push(`read ${account}`);
      return entries.get(key(service, account)) ?? null;
    },
    write(service, account, secret) {
      calls.push(`write ${account}`);
      entries.set(key(service, account), secret);
    },
    remove(service, account) {
      calls.push(`remove ${account}`);
      return entries.delete(key(service, account));
    },
  };
}

/** Put a session record in a store as either CLI would have written it. */
export function putSession(store, { backend = BACKEND, username = "ada", access, refresh, account } = {}) {
  store.entries.set(
    `${SESSION_SERVICE}\n${account ?? sessionEntry(backend).account}`,
    JSON.stringify({ v: 1, backend, username, access: access ?? "", refresh: refresh ?? "" }),
  );
}

/** The record a store holds for one backend, or null. */
export function savedRecord(store, backend = BACKEND) {
  const raw = store.entries.get(`${SESSION_SERVICE}\n${sessionEntry(backend).account}`);
  return raw ? JSON.parse(raw) : null;
}

export function jsonResponse(payload, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    async json() {
      return payload;
    },
  };
}

/** A Fetch stand-in that answers by path and records every request. */
export function routedFetch(routes) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url: String(url), path: pathname, method: init.method ?? "GET", headers: init.headers ?? {}, body });
    const route = routes[pathname];
    if (!route) return jsonResponse({ detail: "Not found." }, 404);
    return typeof route === "function" ? route({ url: String(url), body, headers: init.headers ?? {} }) : route;
  };
  return { fetchImpl, requests };
}

/** Collect what a command prints. */
export function captureIo() {
  const out = [];
  const err = [];
  return { io: { out: (text) => out.push(text), err: (text) => err.push(text) }, out, err };
}
