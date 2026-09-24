// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveAgentSessionRequest,
  cancelChatSession,
  cancelModelProviderSignIn,
  createChatBackendConnection,
  createCustomModelProvider,
  createCustomModelProviderModel,
  deleteAgentSessionRequest,
  deleteCustomModelProvider,
  deleteCustomModelProviderModel,
  fetchAgentSessionDetail,
  fetchArchivedAgentSessions,
  fetchCommandCenterAgentIconBytes,
  fetchCommandCenterAgentIcons,
  fetchCustomModelProviders,
  fetchLatestAgentSessions,
  fetchModelProviderCatalog,
  fetchModelProviderSignInAttempt,
  fetchSessionHistory,
  fetchSessionInsights,
  fetchVerifiedAgentSessionRuntimeAccess,
  getOrCreateAgentSessionRequest,
  isAgentSessionNotFoundError,
  ModelProviderApiError,
  patchAgentSessionModelConfig,
  searchAgentSessions,
  signOffModelProvider,
  startModelProviderSignIn,
  startNewAgentSessionRequest,
  unarchiveAgentSessionRequest,
  updateCustomModelProvider,
  updateCustomModelProviderModel,
  type CustomModelProviderModelInput,
} from "../src";
import {
  createStandIn,
  installStandIn,
  STAND_IN_TOOL_NAME,
  STAND_IN_TURN_ERROR,
  type StandIn,
} from "./stand-in";

// The standalone application, whole, against the scripted stand-in (ADR 096, sections 5 and 9).
// No module is mocked: the stand-in answers every platform and Agent runtime request through fetch,
// and the page is jsdom's, with the few browser features it lacks filled in below.

const TOKEN = "person-token";
const HANDLE = "standalone_chat";

let standIn: StandIn;
let container: HTMLDivElement;
let root: Root | null = null;

/**
 * The page's browser storage. It is the test's own because Node 25 has a `localStorage` global of
 * its own that shadows jsdom's and throws without `--localstorage-file`.
 */
function createPageStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => Array.from(items.keys())[index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
}

/** A page load: the package's module state starts empty, the browser storage stays. */
async function openApplication() {
  vi.resetModules();
  const { StandaloneApp } = await import("./StandaloneApp");

  root = createRoot(container);
  await act(async () => {
    // As `main.tsx` mounts it: StrictMode runs every effect twice on mount.
    root?.render(
      <StrictMode>
        <StandaloneApp />
      </StrictMode>,
    );
  });
}

async function closeApplication() {
  await act(async () => {
    root?.unmount();
  });
  root = null;
}

function text() {
  return container.textContent ?? "";
}

function field(label: string) {
  const input = Array.from(container.querySelectorAll("label"))
    .find((candidate) => candidate.textContent?.trim().startsWith(label))
    ?.querySelector("input");

  if (!input) {
    throw new Error(`No field is labelled "${label}".`);
  }
  return input;
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The button a person finds by its label, or by its words when it has no label. */
function findButton(name: string) {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === name,
    ) ?? null
  );
}

function button(name: string) {
  const match = findButton(name);
  if (!match) {
    throw new Error(`No button is named "${name}".`);
  }
  return match;
}

function composer() {
  const input = container.querySelector("textarea");
  if (!input) {
    throw new Error("The composer is not on screen.");
  }
  return input;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

/**
 * Runs `check` until it stops throwing, letting the application work in between. It gives up well
 * before the test's own timeout, so a failure reports the assertion that did not hold.
 */
async function waitFor<T>(check: () => T, timeoutMs = 2_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      return check();
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function connect() {
  await act(async () => {
    setValue(field("Platform API URL"), standIn.identity.platformUrl);
    setValue(field("Access token"), TOKEN);
    setValue(field("User UID"), standIn.identity.userUid);
    setValue(field("Organization Environment UID"), standIn.identity.environmentUid);
    setValue(field("Agent UID"), standIn.identity.agentUid);
  });
  await click(button("Connect"));
}

/** Waits until the thread takes a message: the composer is open with its usual words. */
async function waitUntilReadyToWrite() {
  await waitFor(() => {
    expect(composer().disabled).toBe(false);
    expect(composer().placeholder).toBe("Write a message");
    expect(findButton("Send message")).not.toBeNull();
  });
}

async function send(message: string) {
  await act(async () => {
    setValue(composer(), message);
  });
  await click(button("Send message"));
}

function reply(message: string) {
  return `You wrote: "${message}".`;
}

/** The collapsed block that holds the reasoning and the tool calls of an answer. */
function workTrigger() {
  const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).find(
    (candidate) => /Reasoning|Thinking/.test(candidate.textContent ?? ""),
  );
  if (!trigger) {
    throw new Error("No reasoning block is on screen.");
  }
  return trigger;
}

/**
 * Runs `scenario` while keeping the page's unhandled promise rejections instead of failing the
 * run on them. A failed turn rejects the promise of the composer's send, which assistant-ui does
 * not await, so a browser logs it as "Uncaught (in promise)" too.
 */
async function keepingUnhandledRejections(scenario: (rejections: unknown[]) => Promise<void>) {
  const rejections: unknown[] = [];
  const listeners = process.listeners("unhandledRejection");
  const keep = (reason: unknown) => {
    rejections.push(reason);
  };

  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", keep);
  try {
    await scenario(rejections);
  } finally {
    process.off("unhandledRejection", keep);
    listeners.forEach((listener) => process.on("unhandledRejection", listener));
  }
}

function theSession() {
  const [session] = standIn.sessions;
  if (!session) {
    throw new Error("The stand-in has no session.");
  }
  return session;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!("ResizeObserver" in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })) as typeof window.matchMedia;
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});

  vi.stubGlobal("localStorage", createPageStorage());
  vi.stubGlobal("sessionStorage", createPageStorage());
  standIn = createStandIn();
  vi.stubGlobal("fetch", standIn.fetch);
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  standIn.releaseReplies();
  await closeApplication();
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the standalone chat against the stand-in", () => {
  it("opens the default session behind its handle and becomes ready to write", async () => {
    await openApplication();
    await connect();
    await waitUntilReadyToWrite();

    expect(findButton("Model providers")).not.toBeNull();
    expect(findButton("Disconnect")).not.toBeNull();
    expect(text()).toContain("Ask the agent");

    // The platform returned the session behind the handle for this Agent.
    const session = theSession();
    const [getOrCreate] = standIn.findRequests(
      "POST",
      `/api/v1/agents/${standIn.identity.agentUid}/sessions/get-or-create-session/`,
    );
    expect(getOrCreate?.body).toEqual({ handle_unique_id: HANDLE, name: "Standalone chat" });
    expect(session).toMatchObject({ agentUid: standIn.identity.agentUid, handle: { handleUniqueId: HANDLE } });

    // Then the chat read it, checked that the Agent answers, and read the model catalog.
    const [latest] = standIn.findRequests("GET", "/api/v1/agent-sessions/");
    expect(latest?.query.get("organization_environment_uid")).toBe(standIn.identity.environmentUid);
    expect(latest?.query.get("created_by_user_uid")).toBe(standIn.identity.userUid);
    for (const path of ["/", "/history/", "/insights/"]) {
      expect(standIn.findRequests("GET", `/api/v1/agent-sessions/${session.uid}${path}`)).not.toHaveLength(0);
    }
    expect(
      standIn.findRequests("POST", `/api/v1/agent-sessions/${session.uid}/resolve-runtime-access/`),
    ).not.toHaveLength(0);
    expect(standIn.findRequests("GET", "/api/chat")).not.toHaveLength(0);
    expect(standIn.findRequests("GET", "/api/v1/model-providers/")).toHaveLength(1);

    // The person's token goes to the platform, the runtime token to the Agent, and every request
    // had an answer.
    for (const request of standIn.requests) {
      expect(request.headers.get("Authorization")).toBe(
        request.target === "platform" ? `Bearer ${TOKEN}` : `Bearer ${standIn.identity.runtimeToken}`,
      );
    }
    expect(standIn.unhandledRequests).toEqual([]);
  });

  it("streams the reply in: reasoning, the tool call with its input and output, and the text", async () => {
    await openApplication();
    await connect();
    await waitUntilReadyToWrite();

    await send("What is in the notes?");
    await waitFor(() => expect(text()).toContain(reply("What is in the notes?")));
    expect(text()).toContain("The scripted stand-in answered as Swift 1 (Stand-in Cloud)");

    // The request carried the canonical session and the person's message (ADR 060).
    const session = theSession();
    const [turn] = standIn.turns;
    expect(turn?.status).toBe("completed");
    expect(turn?.body).toMatchObject({
      context: { app: "standalone-chat" },
      messages: [{ role: "user", content: [{ type: "text", text: "What is in the notes?" }] }],
      runConfig: { reasoning_effort: "medium" },
      runtime_session_uid: session.uid,
      session: { uid: session.uid, llm_provider: "stand-in-cloud", llm_model: "swift-1" },
      user_uid: standIn.identity.userUid,
    });
    // The reply carried a data part too; the thread has no renderer for data parts (see below).
    expect(turn?.frames.map((frame) => frame.type)).toContain("data-sources");

    // The work is folded under one line that counts the tools; opening it shows everything.
    const trigger = workTrigger();
    expect(trigger.textContent).toContain("1 tool");
    await click(trigger);
    await waitFor(() => expect(workTrigger().getAttribute("aria-expanded")).toBe("true"));

    expect(text()).toContain('The person wrote "What is in the notes?". I will search the stand-in notes');
    const tool = container.querySelector<HTMLElement>(`[data-tool-name="${STAND_IN_TOOL_NAME}"]`);
    expect(tool?.textContent).toContain(STAND_IN_TOOL_NAME);
    expect(tool?.textContent).toContain("Input");
    expect(tool?.textContent).toContain('"query": "What is in the notes?"');
    expect(tool?.textContent).toContain("Output");
    expect(tool?.textContent).toContain("One note matches: every reply here is scripted by the stand-in.");
    expect(tool?.textContent).toContain("Done");

    await waitUntilReadyToWrite();
    expect(standIn.unhandledRequests).toEqual([]);
  });

  it.todo("shows the data-<name> part of the reply once the thread renders data parts");

  it("stops a run: the local run ends and the Agent's cancel route is called", async () => {
    await openApplication();
    await connect();
    await waitUntilReadyToWrite();

    standIn.holdReplies();
    await send("Take your time.");
    const stop = await waitFor(() => {
      expect(standIn.turns[0]?.status).toBe("held");
      return button("Stop session");
    });
    await click(stop);

    const session = theSession();
    await waitFor(() => expect(standIn.findRequests("POST", "/api/chat/session/cancel")).toHaveLength(1));
    const [cancel] = standIn.findRequests("POST", "/api/chat/session/cancel");
    expect(cancel?.body).toEqual({
      message: "User pressed stop.",
      reason: "user_requested",
      runtime_session_uid: session.uid,
      thread_id: session.uid,
      user_uid: standIn.identity.userUid,
    });
    expect(cancel?.headers.get("Authorization")).toBe(`Bearer ${standIn.identity.runtimeToken}`);
    expect(standIn.turns[0]?.status).toBe("stopped");

    // The composer is open again, the answer that was cut short stays cut short, and a stop is
    // not an error.
    await waitUntilReadyToWrite();
    expect(findButton("Stop session")).toBeNull();
    expect(text()).not.toContain(reply("Take your time."));
    expect(text()).not.toMatch(/abort/i);
  });

  it("shows a failed turn's error, and sends the message again on request", async () => {
    await openApplication();
    await connect();
    await waitUntilReadyToWrite();

    await keepingUnhandledRejections(async (rejections) => {
      standIn.failNextTurn();
      await send("Try the new model.");
      await waitFor(() => expect(text()).toContain(STAND_IN_TURN_ERROR));
      expect(standIn.turns[0]?.status).toBe("failed");
      // Give the failed run's rejection time to surface; whatever is left unhandled is the turn's
      // own error.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      rejections.forEach((reason) => expect(String(reason)).toContain(STAND_IN_TURN_ERROR));
    });

    // The failed turn offers to send its message again, as a new turn.
    const sendAgain = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Send again",
    );
    expect(sendAgain).toBeDefined();
    await click(sendAgain as HTMLButtonElement);
    await waitFor(() => expect(text()).toContain(reply("Try the new model.")));
    expect(standIn.turns.map((turn) => turn.status)).toEqual(["failed", "completed"]);
    expect(standIn.turns[1]?.input).toBe("Try the new model.");
  });

  it("shows the transcript from history when the application is opened again", async () => {
    await openApplication();
    await connect();
    await waitUntilReadyToWrite();
    await send("Remember this.");
    await waitFor(() => expect(text()).toContain(reply("Remember this.")));
    await waitUntilReadyToWrite();

    const session = theSession();
    const historyPath = `/api/v1/agent-sessions/${session.uid}/history/`;
    const historyReads = standIn.findRequests("GET", historyPath).length;

    await closeApplication();
    await openApplication();

    // The form remembers everything but the token.
    expect(field("Agent UID").value).toBe(standIn.identity.agentUid);
    expect(field("Organization Environment UID").value).toBe(standIn.identity.environmentUid);
    expect(field("Access token").value).toBe("");

    await connect();
    await waitFor(() => expect(text()).toContain(reply("Remember this.")));
    await waitUntilReadyToWrite();

    // The thread shows the platform's transcript: the message, and the answer with its work.
    expect(standIn.findRequests("GET", historyPath).length).toBeGreaterThan(historyReads);
    expect(standIn.sessions).toHaveLength(1);
    const [message, answer] = theSession().transcript;
    expect(container.querySelector(`[data-message-id="${message?.id}"]`)?.textContent).toContain("Remember this.");
    expect(container.querySelector(`[data-message-id="${answer?.id}"]`)?.textContent).toContain(
      reply("Remember this."),
    );
    expect(workTrigger().textContent).toContain("1 tool");
  });

  it("shows the model provider settings with the stand-in's providers", async () => {
    await openApplication();
    await connect();
    await waitUntilReadyToWrite();

    await click(button("Model providers"));
    await waitFor(() => {
      expect(text()).toContain("Organization custom providers");
      expect(text()).toContain("Stand-in Models");
      expect(text()).toContain("Built-in providers");
      expect(text()).toContain("Stand In Cloud");
      expect(text()).toContain("Stand In Labs");
    });
    expect(findButton("Back to chat")).not.toBeNull();
    expect(findButton("Sign in")).not.toBeNull();
    expect(findButton("Sign off")).not.toBeNull();
    // StrictMode mounts the screen twice in development, so the list may be read twice.
    expect(standIn.findRequests("GET", "/api/v1/custom-model-providers/").length).toBeGreaterThanOrEqual(1);

    await click(button("Back to chat"));
    await waitUntilReadyToWrite();
    expect(standIn.unhandledRequests).toEqual([]);
  });

  it("answers the platform through the development proxy, as the dev server serves it", async () => {
    // With the platform's URL in the environment, the connection asks for `/__platform__/...`.
    vi.stubEnv("VITE_CHAT_API_BASE_URL", standIn.identity.platformUrl);
    await openApplication();
    await connect();
    await waitUntilReadyToWrite();

    const platformRequests = standIn.requests.filter((request) => request.target === "platform");
    expect(platformRequests.length).toBeGreaterThan(0);
    platformRequests.forEach((request) =>
      expect(new URL(request.url, window.location.href).pathname).toMatch(/^\/__platform__\/api\/v1\//),
    );
    // The icon the platform hands back hangs from the same prefix, so it takes the same way.
    expect(
      standIn.findRequests("GET", `/api/v1/command-center/agents/${standIn.identity.agentUid}/icon/`),
    ).not.toHaveLength(0);
    expect(standIn.unhandledRequests).toEqual([]);
  });
});

describe("?stand-in in development", () => {
  it("answers the page's requests and prefills the connect form but the token", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const installed = installStandIn({ latencyMs: 0, chunkDelayMs: 0 });

    try {
      await openApplication();
      expect(field("Platform API URL").value).toBe(installed.identity.platformUrl);
      expect(field("User UID").value).toBe(installed.identity.userUid);
      expect(field("Organization Environment UID").value).toBe(installed.identity.environmentUid);
      expect(field("Agent UID").value).toBe(installed.identity.agentUid);
      expect(field("Access token").value).toBe("");

      // Any token will do.
      await act(async () => {
        setValue(field("Access token"), "anything");
      });
      await click(button("Connect"));
      await waitUntilReadyToWrite();

      expect(installed.requests.length).toBeGreaterThan(0);
      expect(standIn.requests).toHaveLength(0);
      expect(installed.unhandledRequests).toEqual([]);
    } finally {
      delete (window as Window & { chatStandIn?: StandIn }).chatStandIn;
      vi.mocked(console.info).mockRestore();
    }
  });
});

// The routes the flows above do not reach, held to the shapes the package's own clients parse.
describe("the stand-in answers the package's clients", () => {
  function scope() {
    const connection = createChatBackendConnection({ apiBaseUrl: standIn.identity.platformUrl });
    return {
      connection,
      createdByUserUid: standIn.identity.userUid,
      organizationEnvironmentUid: standIn.identity.environmentUid,
      token: TOKEN,
    };
  }

  it("sessions: handles, lists, search, the model, archive, delete, history, insights, access", async () => {
    const { connection, createdByUserUid, organizationEnvironmentUid, token } = scope();
    const agentUid = standIn.identity.agentUid;
    const opened = await getOrCreateAgentSessionRequest({
      agentUid,
      connection,
      handleUniqueId: "notes",
      name: "Notes",
      token,
    });
    const again = await getOrCreateAgentSessionRequest({ agentUid, connection, handleUniqueId: "notes", token });
    const started = await startNewAgentSessionRequest({ agentId: agentUid, connection, token });
    expect(again.sessionId).toBe(opened.sessionId);
    expect(started.sessionId).not.toBe(opened.sessionId);

    const latest = await fetchLatestAgentSessions({ connection, createdByUserUid, organizationEnvironmentUid, token });
    expect(latest.map((record) => record.uid).sort()).toEqual([opened.sessionId, started.sessionId].sort());
    const found = await searchAgentSessions({ connection, createdByUserUid, organizationEnvironmentUid, query: "notes", token });
    expect(found.map((record) => record.uid)).toEqual([opened.sessionId]);

    const patched = await patchAgentSessionModelConfig({
      connection,
      llmModel: "deep-1",
      llmProvider: "stand-in-cloud",
      llmThinking: "high",
      sessionId: opened.sessionId,
      token,
    });
    expect(patched).toMatchObject({ llm_model: "deep-1", llm_thinking: "high" });
    await expect(
      patchAgentSessionModelConfig({ connection, llmModel: "none", llmProvider: "stand-in-cloud", sessionId: opened.sessionId, token }),
    ).rejects.toMatchObject({ status: 400 });

    const history = await fetchSessionHistory({ connection, sessionId: opened.sessionId, token });
    expect(history.messages).toEqual([]);
    const insights = await fetchSessionInsights({ connection, sessionId: opened.sessionId, token });
    expect(insights).toMatchObject({ harness: "tau", hasInsights: false });
    const access = await fetchVerifiedAgentSessionRuntimeAccess({ connection, sessionId: opened.sessionId, token });
    expect(access).toMatchObject({ mode: "token", rpcUrl: standIn.identity.runtimeUrl, runtimeInteraction: { canSubmit: true } });
    await cancelChatSession({
      body: { runtimeSessionUid: opened.sessionId, threadId: opened.sessionId, userUid: createdByUserUid },
      connection,
      organizationEnvironmentUid,
      token,
    });

    const archived = await archiveAgentSessionRequest({ connection, sessionId: started.sessionId, token });
    expect(archived.is_archived).toBe(true);
    const archive = await fetchArchivedAgentSessions({ agentUid, connection, createdByUserUid, organizationEnvironmentUid, token });
    expect(archive.map((record) => record.uid)).toEqual([started.sessionId]);
    expect((await unarchiveAgentSessionRequest({ connection, sessionId: started.sessionId, token })).is_archived).toBe(false);
    await deleteAgentSessionRequest({ connection, sessionId: started.sessionId, token });
    const gone = await fetchAgentSessionDetail({ connection, organizationEnvironmentUid, sessionId: started.sessionId, token }).catch(
      (error: unknown) => error,
    );
    expect(isAgentSessionNotFoundError(gone)).toBe(true);

    const icons = await fetchCommandCenterAgentIcons({ connection, environmentUid: organizationEnvironmentUid, token });
    const icon = icons.get(agentUid);
    expect(icon?.rendering).toBe("mask");
    const bytes = await fetchCommandCenterAgentIconBytes({ connection, token, url: icon?.url ?? "" });
    expect(bytes.blob.type).toBe("image/svg+xml");
    expect(standIn.unhandledRequests).toEqual([]);
  });

  it("model providers: the catalog, sign-in and sign-off, and custom providers with their models", async () => {
    const { connection, createdByUserUid, token } = scope();
    const request = { connection, createdByUserUid, token };
    const labs = async () =>
      (await fetchModelProviderCatalog(request)).providers.find((provider) => provider.provider === "stand-in-labs");
    expect((await fetchModelProviderCatalog(request)).providers.map((provider) => provider.provider)).toEqual([
      "stand-in-cloud",
      "stand-in-labs",
      "stand-in-models",
    ]);

    // A sign-in completes on its second read; a second start opens the attempt in progress.
    const { attempt } = await startModelProviderSignIn({ ...request, provider: "stand-in-labs" });
    const refused = await startModelProviderSignIn({ ...request, provider: "stand-in-labs" }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ModelProviderApiError);
    expect(refused).toMatchObject({ code: "provider_signin_in_progress", attempt: { id: attempt.id } });
    const read = { ...request, attemptId: attempt.id, provider: "stand-in-labs" };
    expect((await fetchModelProviderSignInAttempt(read)).status).toBe("pending");
    expect((await fetchModelProviderSignInAttempt(read)).status).toBe("completed");
    expect(await labs()).toMatchObject({ authenticated: true, credentialStatus: "active" });
    await signOffModelProvider({ ...request, provider: "stand-in-labs" });
    expect(await labs()).toMatchObject({ authenticated: false, credentialStatus: "revoked" });
    const cancelled = await startModelProviderSignIn({ ...request, provider: "stand-in-labs" });
    expect(
      (await cancelModelProviderSignIn({ ...request, attemptId: cancelled.attempt.id, provider: "stand-in-labs" })).status,
    ).toBe("cancelled");

    // Custom providers: create with models, edit, add and switch models, delete.
    const model: CustomModelProviderModelInput = {
      model: "beta",
      displayName: "Beta",
      api: "openai-responses",
      input: ["text"],
      reasoning: false,
      thinkingLevels: [],
      contextWindow: 64_000,
      maxTokens: null,
      isDefault: true,
      position: 0,
      metadata: {},
    };
    const created = await createCustomModelProvider(
      { identifier: "acme", displayName: "Acme", baseUrl: "https://acme.test/v1", apiKey: "key", models: [model] },
      request,
    );
    expect(created).toMatchObject({ identifier: "acme", auth: { hasApiKey: true }, defaultModel: "beta" });
    await expect(
      createCustomModelProvider({ identifier: "acme", displayName: "Acme", baseUrl: "https://acme.test/v1", models: [model] }, request),
    ).rejects.toThrow("already exists");
    expect(await updateCustomModelProvider(created.uid, { apiKey: null, displayName: "Acme 2" }, request)).toMatchObject({
      auth: { hasApiKey: false },
      displayName: "Acme 2",
    });
    const gamma = await createCustomModelProviderModel(created.uid, { ...model, model: "gamma", displayName: "Gamma", isDefault: false }, request);
    await expect(deleteCustomModelProviderModel(created.uid, created.models[0]?.uid ?? "", request)).rejects.toThrow();
    expect((await updateCustomModelProviderModel(created.uid, gamma.uid, { isDefault: true }, request)).isDefault).toBe(true);
    await deleteCustomModelProviderModel(created.uid, created.models[0]?.uid ?? "", request);
    const catalog = await fetchModelProviderCatalog(request);
    expect(catalog.providers.find((provider) => provider.provider === "acme")).toMatchObject({
      defaultModel: "gamma",
      known: false,
      models: [{ model: "gamma" }],
    });
    await deleteCustomModelProvider(created.uid, request);
    expect((await fetchCustomModelProviders(request)).map((provider) => provider.identifier)).toEqual(["stand-in-models"]);
    expect(standIn.unhandledRequests).toEqual([]);
  });

  it("refuses what the platform and the Agent's runtime refuse", async () => {
    const { connection, token } = scope();
    const platform = standIn.identity.platformUrl;
    const runtime = standIn.identity.runtimeUrl;
    const withToken = { Authorization: `Bearer ${token}` };

    expect((await standIn.fetch(`${platform}/api/v1/model-providers/`)).status).toBe(401);
    expect((await standIn.fetch(`${runtime}/api/chat`, { headers: withToken })).status).toBe(401);
    expect((await standIn.fetch(`${platform}/api/v1/model-providers/`, { headers: withToken, method: "DELETE" })).status).toBe(405);
    expect((await standIn.fetch(`${platform}/api/v1/unknown/`, { headers: withToken })).status).toBe(404);
    expect((await standIn.fetch("https://elsewhere.test/v1/chat/completions", { method: "POST" })).status).toBe(404);
    expect(standIn.unhandledRequests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "DELETE /api/v1/model-providers/",
      "GET /api/v1/unknown/",
      "POST /v1/chat/completions",
    ]);

    // A model whose provider is not signed in cannot answer: the turn streams the reason.
    const { sessionId } = await getOrCreateAgentSessionRequest({
      agentUid: standIn.identity.agentUid,
      connection,
      handleUniqueId: "labs",
      llmModel: "labs-preview",
      llmProvider: "stand-in-labs",
      token,
    });
    const session = await fetchAgentSessionDetail({
      connection,
      organizationEnvironmentUid: standIn.identity.environmentUid,
      sessionId,
      token,
    });
    const answer = await standIn.fetch(`${runtime}/api/chat`, {
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ type: "text", text: "Hello." }] }],
        runtime_session_uid: sessionId,
        session,
      }),
      headers: { Authorization: `Bearer ${standIn.identity.runtimeToken}`, "Content-Type": "application/json" },
      method: "POST",
    });
    expect(await answer.text()).toContain("Sign in to Stand-in Labs before you use Labs Preview.");
    expect(standIn.turns.map((turn) => turn.status)).toEqual(["failed"]);
  });
});
