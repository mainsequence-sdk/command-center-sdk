import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = await readFile(new URL("./src/transport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createApiTransport } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("top-level local requests use same-origin fetch without a release UID", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response("ok");
  };
  try {
    const controller = new AbortController();
    const response = await createApiTransport({ mode: "local" }).get("/api/me", controller.signal);
    assert.equal(await response.text(), "ok");
    assert.deepEqual(calls, [["/api/me", { method: "GET", signal: controller.signal }]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hosted requests delegate through the trusted iframe client with the release UID", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("hosted transport must not use direct fetch"); };
  const calls = [];
  const client = {
    fetchFastApi: async (...args) => {
      calls.push(args);
      return new Response("delegated");
    },
  };
  try {
    const controller = new AbortController();
    const response = await createApiTransport({
      mode: "hosted",
      client,
      resourceReleaseUid: "00000000-0000-4000-8000-000000000001",
    }).get("/api/me", controller.signal);
    assert.equal(await response.text(), "delegated");
    assert.deepEqual(calls, [[
      { resourceReleaseUid: "00000000-0000-4000-8000-000000000001", path: "/api/me" },
      { method: "GET", signal: controller.signal },
    ]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
