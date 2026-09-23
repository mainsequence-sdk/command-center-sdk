import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = await readFile(new URL("./src/transport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createHostedApiTransport, createLocalApiTransport, parseHostedApiReleases } =
  await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test("top-level local requests use same-origin fetch without a release UID", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response("ok");
  };
  try {
    const controller = new AbortController();
    const response = await createLocalApiTransport().get("/api/me", controller.signal);
    assert.equal(await response.text(), "ok");
    assert.deepEqual(calls, [["/api/me", { method: "GET", signal: controller.signal }]]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hosted requests choose a separate release UID for each named API", async () => {
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
    const transport = createHostedApiTransport({
      client,
      releases: parseHostedApiReleases(JSON.stringify({
        identity: "00000000-0000-4000-8000-000000000001",
        reports: "00000000-0000-4000-8000-000000000002",
      })),
    });
    const identity = await transport.get("identity", "/api/me", controller.signal);
    const reports = await transport.get("reports", "/v1/report");
    assert.equal(await identity.text(), "delegated");
    assert.equal(await reports.text(), "delegated");
    assert.deepEqual(calls, [
      [
        { resourceReleaseUid: "00000000-0000-4000-8000-000000000001", path: "/api/me" },
        { method: "GET", signal: controller.signal },
      ],
      [
        { resourceReleaseUid: "00000000-0000-4000-8000-000000000002", path: "/v1/report" },
        { method: "GET", signal: undefined },
      ],
    ]);
    assert.throws(
      () => transport.get("unknown", "/api/me"),
      /No FastAPI release configured for API "unknown"/u,
    );
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hosted release configuration rejects missing and invalid targets", () => {
  assert.throws(() => parseHostedApiReleases(undefined), /JSON object/u);
  assert.throws(() => parseHostedApiReleases("[]"), /JSON object/u);
  assert.throws(() => parseHostedApiReleases("{}"), /at least one API/u);
  assert.throws(() => parseHostedApiReleases('{"reports":"not-a-uid"}'), /Invalid release UID/u);
});
