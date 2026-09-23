import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  probeAgentRuntimeServing,
  resetAgentRuntimeServingState,
} from "./agent-runtime-serving.js";
import {
  archiveAgentSessionRequest,
  deleteAgentSessionRequest,
  fetchAgentSessionDetail,
  fetchArchivedAgentSessions,
  fetchLatestAgentSessions,
  getOrCreateAgentSessionRequest,
  patchAgentSessionModelConfig,
  searchAgentSessions,
  startNewAgentSessionRequest,
  unarchiveAgentSessionRequest,
} from "./agent-sessions-api.js";
import { fetchAgentSessionRuntimeAccess } from "./agent-session-runtime-access.js";
import {
  clearMainSequenceAiResolvedRuntimeAccess,
  fetchMainSequenceAiAssistantResponse,
} from "./assistant-endpoint.js";
import {
  fetchCommandCenterAgentIconBytes,
  fetchCommandCenterAgentIcons,
} from "./command-center-agent-icons-api.js";
import {
  buildPlatformApiUrl,
  createChatBackendConnection,
  resolvePlatformApiUrl,
  resolveRequestUrl,
  type ChatBackendRequestTarget,
} from "./connection.js";
import {
  createCustomModelProvider,
  createCustomModelProviderModel,
  deleteCustomModelProvider,
  deleteCustomModelProviderModel,
  fetchCustomModelProviders,
  updateCustomModelProvider,
  updateCustomModelProviderModel,
  type CustomModelProviderModelInput,
} from "./custom-model-provider-api.js";
import { fetchModelProviderCatalog } from "./model-catalog-api.js";
import {
  cancelModelProviderSignIn,
  fetchModelProviderSignInAttempt,
  signOffModelProvider,
  startModelProviderSignIn,
} from "./model-provider-auth-api.js";
import { fetchSessionHistory } from "./session-history-api.js";
import { fetchSessionInsights } from "./session-insights-api.js";

const apiBaseUrl = "https://api.platform.test";
const userUid = "00000000-0000-4000-8000-000000000123";
const environmentUid = "env-1";
const sessionUid = "00000000-0000-4000-8000-0000000000aa";

describe("chat backend connection", () => {
  it("requires an absolute http(s) platform API base URL", () => {
    expect(() => createChatBackendConnection({ apiBaseUrl: "" })).toThrow("absolute http(s)");
    expect(() => createChatBackendConnection({ apiBaseUrl: "/api" })).toThrow("absolute http(s)");
    expect(() => createChatBackendConnection({ apiBaseUrl: "ftp://platform.test" })).toThrow(
      "absolute http(s)",
    );
    expect(createChatBackendConnection({ apiBaseUrl: ` ${apiBaseUrl} ` }).apiBaseUrl).toBe(
      apiBaseUrl,
    );
  });

  it("requests the platform directly when the application has no rewrite", () => {
    const connection = createChatBackendConnection({ apiBaseUrl });

    expect(resolvePlatformApiUrl(connection, "/api/v1/model-providers/")).toBe(
      `${apiBaseUrl}/api/v1/model-providers/`,
    );
    expect(resolveRequestUrl(connection, "https://agent.test/api/chat", "agent-runtime")).toBe(
      "https://agent.test/api/chat",
    );
  });

  it("gives the rewrite the full URL and where the request is going", () => {
    const rewriteRequestUrl = vi.fn(
      (url: URL, target: ChatBackendRequestTarget) => `/__${target}__${url.pathname}${url.search}`,
    );
    const connection = createChatBackendConnection({ apiBaseUrl, rewriteRequestUrl });
    const url = buildPlatformApiUrl(connection, "/api/v1/agent-sessions/");
    url.searchParams.set("limit", "20");

    expect(resolveRequestUrl(connection, url, "platform")).toBe(
      "/__platform__/api/v1/agent-sessions/?limit=20",
    );
    expect(resolveRequestUrl(connection, "https://agent.test/rpc/api/chat", "agent-runtime")).toBe(
      "/__agent-runtime__/rpc/api/chat",
    );
    expect(rewriteRequestUrl.mock.calls[0]?.[0].href).toBe(
      `${apiBaseUrl}/api/v1/agent-sessions/?limit=20`,
    );
  });

  it("leaves an address on the application's own origin alone", () => {
    const rewriteRequestUrl = vi.fn(() => "/rewritten");
    const connection = createChatBackendConnection({ apiBaseUrl, rewriteRequestUrl });

    expect(resolveRequestUrl(connection, "/already/same-origin", "platform")).toBe(
      "/already/same-origin",
    );
    expect(rewriteRequestUrl).not.toHaveBeenCalled();
  });
});

// An application served from an origin the platform does not allow reaches the backend only
// through its own address. One client that skipped the rewrite would break that application, so
// every client is held to it here.
describe("every request goes through the application's rewrite", () => {
  const fetchMock = vi.fn();
  const targets: ChatBackendRequestTarget[] = [];
  const connection = createChatBackendConnection({
    apiBaseUrl,
    rewriteRequestUrl: (url, target) => {
      targets.push(target);
      return target === "platform"
        ? `/__platform__${url.pathname}${url.search}`
        : `/__agent__/${url.host}${url.pathname}${url.search}`;
    },
  });
  const auth = { connection, token: "jwt" };
  const modelInput: CustomModelProviderModelInput = {
    model: "alpha",
    displayName: "Alpha",
    api: "openai-completions",
    input: ["text"],
    reasoning: false,
    thinkingLevels: [],
    contextWindow: null,
    maxTokens: null,
    isDefault: true,
    position: 0,
    metadata: {},
  };

  beforeEach(() => {
    targets.length = 0;
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({}), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearMainSequenceAiResolvedRuntimeAccess();
    resetAgentRuntimeServingState();
  });

  const platformRequests: Array<[string, () => Promise<unknown>]> = [
    [
      "latest sessions",
      () =>
        fetchLatestAgentSessions({
          ...auth,
          createdByUserUid: userUid,
          organizationEnvironmentUid: environmentUid,
        }),
    ],
    [
      "archived sessions",
      () =>
        fetchArchivedAgentSessions({
          ...auth,
          agentUid: "agent-1",
          createdByUserUid: userUid,
          organizationEnvironmentUid: environmentUid,
        }),
    ],
    [
      "session search",
      () =>
        searchAgentSessions({
          ...auth,
          createdByUserUid: userUid,
          organizationEnvironmentUid: environmentUid,
          query: "report",
        }),
    ],
    ["session delete", () => deleteAgentSessionRequest({ ...auth, sessionId: sessionUid })],
    ["session archive", () => archiveAgentSessionRequest({ ...auth, sessionId: sessionUid })],
    ["session unarchive", () => unarchiveAgentSessionRequest({ ...auth, sessionId: sessionUid })],
    [
      "session detail",
      () =>
        fetchAgentSessionDetail({
          ...auth,
          organizationEnvironmentUid: environmentUid,
          sessionId: sessionUid,
        }),
    ],
    ["new session", () => startNewAgentSessionRequest({ ...auth, agentId: "agent-1" })],
    [
      "get or create session",
      () =>
        getOrCreateAgentSessionRequest({
          ...auth,
          agentUid: "agent-1",
          handleUniqueId: "standalone-chat",
        }),
    ],
    [
      "session model settings",
      () =>
        patchAgentSessionModelConfig({
          ...auth,
          llmModel: "gpt",
          llmProvider: "openai",
          sessionId: sessionUid,
        }),
    ],
    ["runtime access", () => fetchAgentSessionRuntimeAccess({ ...auth, sessionId: sessionUid })],
    ["history", () => fetchSessionHistory({ ...auth, sessionId: sessionUid })],
    ["insights", () => fetchSessionInsights({ ...auth, sessionId: sessionUid })],
    ["agent icons", () => fetchCommandCenterAgentIcons({ ...auth, environmentUid })],
    [
      "agent icon bytes",
      () =>
        fetchCommandCenterAgentIconBytes({
          ...auth,
          url: `${apiBaseUrl}/api/v1/command-center/agents/agent-1/icon/`,
        }),
    ],
    ["model catalog", () => fetchModelProviderCatalog({ ...auth, createdByUserUid: userUid })],
    [
      "provider sign-in start",
      () => startModelProviderSignIn({ ...auth, createdByUserUid: userUid, provider: "openai" }),
    ],
    [
      "provider sign-in poll",
      () =>
        fetchModelProviderSignInAttempt({
          ...auth,
          attemptId: "attempt-1",
          createdByUserUid: userUid,
          provider: "openai",
        }),
    ],
    [
      "provider sign-in cancel",
      () =>
        cancelModelProviderSignIn({
          ...auth,
          attemptId: "attempt-1",
          createdByUserUid: userUid,
          provider: "openai",
        }),
    ],
    [
      "provider sign-out",
      () => signOffModelProvider({ ...auth, createdByUserUid: userUid, provider: "openai" }),
    ],
    [
      "custom providers list",
      () => fetchCustomModelProviders({ ...auth, createdByUserUid: userUid }),
    ],
    [
      "custom provider create",
      () =>
        createCustomModelProvider(
          { identifier: "alpha", displayName: "Alpha", baseUrl: "https://llm.test/v1", models: [] },
          { ...auth, createdByUserUid: userUid },
        ),
    ],
    [
      "custom provider update",
      () =>
        updateCustomModelProvider(
          "provider-1",
          { displayName: "Alpha 2" },
          { ...auth, createdByUserUid: userUid },
        ),
    ],
    [
      "custom provider delete",
      () => deleteCustomModelProvider("provider-1", { ...auth, createdByUserUid: userUid }),
    ],
    [
      "custom model create",
      () =>
        createCustomModelProviderModel("provider-1", modelInput, {
          ...auth,
          createdByUserUid: userUid,
        }),
    ],
    [
      "custom model update",
      () =>
        updateCustomModelProviderModel(
          "provider-1",
          "model-1",
          { displayName: "Alpha 2" },
          { ...auth, createdByUserUid: userUid },
        ),
    ],
    [
      "custom model delete",
      () =>
        deleteCustomModelProviderModel("provider-1", "model-1", {
          ...auth,
          createdByUserUid: userUid,
        }),
    ],
  ];

  it.each(platformRequests)("platform: %s", async (_name, request) => {
    // The empty stand-in answer fails some parsers; the request itself is what is checked.
    await request().catch(() => undefined);

    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mock.calls.forEach(([url]) => {
      expect(String(url)).toMatch(/^\/__platform__\/api\/v1\//);
    });
    expect(new Set(targets)).toEqual(new Set(["platform"]));
  });

  it("agent runtime: the readiness check", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

    await probeAgentRuntimeServing({
      connection,
      fetchImpl,
      timeoutMs: 1_000,
      token: "runtime-token",
      url: "https://agent.test/rpc/api/chat",
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/__agent__/agent.test/rpc/api/chat");
    expect(targets).toEqual(["agent-runtime"]);
  });

  it("agent runtime: the chat request, after runtime access from the platform", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/resolve-runtime-access/")) {
        return new Response(
          JSON.stringify({
            mode: "token",
            rpc_url: "https://agent.test/rpc",
            token: "runtime-token",
            session_uid: sessionUid,
            is_ready: true,
            runtime_interaction: {
              state: "ready",
              can_submit: true,
              notice: null,
              operation: null,
              retry_after_ms: null,
            },
            runtime_presence: {
              phase: "serving",
              replicas: { desired: 1, actual: 1 },
              detail: "The agent is running.",
              observed_at: "2026-09-03T10:00:00Z",
              wake: null,
            },
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        );
      }

      return new Response(null, { status: 200 });
    });

    await fetchMainSequenceAiAssistantResponse({
      connection,
      currentSessionId: sessionUid,
      method: "POST",
      organizationEnvironmentUid: environmentUid,
      requestPath: "/api/chat",
      sessionToken: "jwt",
    });

    const requested = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requested[0]).toBe(
      `/__platform__/api/v1/agent-sessions/${sessionUid}/resolve-runtime-access/`,
    );
    expect(requested.slice(1).every((url) => url === "/__agent__/agent.test/rpc/api/chat")).toBe(
      true,
    );
    expect(requested.length).toBeGreaterThan(1);
  });
});
