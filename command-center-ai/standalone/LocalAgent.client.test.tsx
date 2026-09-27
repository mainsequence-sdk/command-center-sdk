// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatEngineProvider,
  ChatThread,
  createLocalAgentSource,
  useChatComposerState,
  useChatEngine,
  type ChatComposerState,
} from "../src";
import { createLocalRuntimeStandIn, type LocalRuntimeStandIn } from "./stand-in/local-runtime";

// ADR 099: the chat's own thread, whole, over a local Agent source, against a stand-in for an
// `ms-tau` runtime in local mode. No module is mocked; the stand-in answers through fetch.

let runtime: LocalRuntimeStandIn;
let container: HTMLDivElement;
let root: Root | null = null;
let composerState: ChatComposerState | null = null;
let engineSessionId: string | null = null;
const notify = vi.fn();

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

function Probe() {
  composerState = useChatComposerState();
  engineSessionId = useChatEngine().currentSessionId;
  return null;
}

async function openChat(surface: "overlay" | "page" = "page") {
  const source = createLocalAgentSource({ baseUrl: "/__agent__", displayName: "CRM assistant" });
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StrictMode>
        <ChatEngineProvider source={source} isVisible notify={notify} viewContext={{ application: "crm", path: "/deals" }}>
          <Probe />
          <ChatThread surface={surface} />
        </ChatEngineProvider>
      </StrictMode>,
    );
  });
}

async function closeChat() {
  await act(async () => {
    root?.unmount();
  });
  root = null;
}

async function waitFor<T>(check: () => T, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function composer() {
  const input = container.querySelector("textarea");
  if (!input) throw new Error("The composer is not on screen.");
  return input;
}

function button(name: string) {
  const match = Array.from(container.querySelectorAll("button")).find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === name,
  );
  if (!match) throw new Error(`No button is named "${name}".`);
  return match;
}

async function sendWithEnter(message: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(composer(), message);
    composer().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    composer().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
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
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.scrollTo = Element.prototype.scrollTo ?? (() => {});
  vi.stubGlobal("localStorage", createPageStorage());
  vi.stubGlobal("sessionStorage", createPageStorage());
  runtime = createLocalRuntimeStandIn();
  vi.stubGlobal("fetch", runtime.fetch);
  notify.mockClear();
  composerState = null;
  engineSessionId = null;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  await closeChat();
  container.remove();
  vi.unstubAllGlobals();
});

describe("a local Agent source", () => {
  it("streams an answer with reasoning and a tool call, and calls no platform route", async () => {
    await openChat();
    await waitFor(() => expect(composerState?.status).toBe("ready"));

    await sendWithEnter("What is in the notes?");

    await waitFor(() => expect(container.textContent).toContain('You wrote: "What is in the notes?".'));
    const work = await waitFor(() => {
      const trigger = Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).find(
        (candidate) => /Reasoning/.test(candidate.textContent ?? ""),
      );
      if (!trigger) throw new Error("No reasoning block.");
      return trigger;
    });
    expect(work.textContent).toContain("1 tool");
    await act(async () => {
      work.click();
    });
    expect(container.querySelector('[data-tool-name="stand_in_search"]')).not.toBeNull();

    const chat = runtime.requests.find((request) => request.method === "POST" && request.path === "/api/chat");
    expect(chat?.body).toMatchObject({
      runtime_session_uid: "default",
      context: { application: "crm", path: "/deals" },
    });
    // The runtime's canonical id replaces the page's after the first answer.
    await waitFor(() => expect(engineSessionId).toMatch(/^local-standin-/u));
    expect(runtime.sessions.map((session) => session.uid)).toEqual([engineSessionId]);
    expect(runtime.requests.every((request) => !request.path.startsWith("/api/v1/"))).toBe(true);
  });

  it("shows the conversation again after a reload", async () => {
    await openChat();
    await waitFor(() => expect(composerState?.status).toBe("ready"));
    await sendWithEnter("Remember the currency exposure.");
    await waitFor(() => expect(container.textContent).toContain('You wrote: "Remember the currency exposure.".'));
    await waitFor(() => expect(composerState?.status).toBe("ready"));
    const sessionUid = engineSessionId!;

    await closeChat();
    await openChat();

    // The page remembered the canonical session and the runtime replays it.
    await waitFor(() => expect(container.textContent).toContain("Remember the currency exposure."));
    expect(engineSessionId).toBe(sessionUid);
    expect(
      runtime.requests.some((request) => request.path === `/api/local/v1/chat-sessions/${sessionUid}/history`),
    ).toBe(true);
  });

  it("says so when the runtime cannot reload a conversation, and still answers", async () => {
    runtime = createLocalRuntimeStandIn({ listsSessions: false });
    vi.stubGlobal("fetch", runtime.fetch);
    // The rail shows session notices over an empty thread; the page shows its start screen.
    await openChat("overlay");

    await waitFor(() =>
      expect(container.textContent).toContain("this local Agent cannot reload a conversation yet"),
    );
    await waitFor(() => expect(composerState?.status).toBe("ready"));
    await sendWithEnter("Still there?");
    await waitFor(() => expect(container.textContent).toContain('You wrote: "Still there?".'));
  });

  it("reports an Agent that is not running as unavailable, not waking", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: "local_agent_unreachable" }), { status: 502 }));
    await openChat();

    await waitFor(() => expect(composerState?.status).toBe("unavailable"));
    expect(composerState?.canWrite).toBe(false);
  });

  it("stops a running turn on the runtime", async () => {
    runtime = createLocalRuntimeStandIn({ chunkDelayMs: 40 });
    vi.stubGlobal("fetch", runtime.fetch);
    await openChat();
    await waitFor(() => expect(composerState?.status).toBe("ready"));

    await sendWithEnter("A long answer, please.");
    await waitFor(() => expect(composerState?.status).toBe("working"));
    await act(async () => {
      button("Stop session").click();
    });

    await waitFor(() =>
      expect(runtime.requests.some((request) => request.path === "/api/chat/session/cancel")).toBe(true),
    );
    await waitFor(() => expect(composerState?.status).toBe("ready"));
  });

  it("changes the session's model on the runtime once the session exists", async () => {
    await openChat();
    await waitFor(() => expect(composerState?.status).toBe("ready"));
    await sendWithEnter("First message.");
    await waitFor(() => expect(container.textContent).toContain('You wrote: "First message.".'));
    await waitFor(() =>
      expect(runtime.requests.some((request) => request.method === "GET" && request.path.startsWith("/api/chat/session-model"))).toBe(true),
    );
    await waitFor(() => expect(composerState?.status).toBe("ready"));

    const picker = await waitFor(() => {
      const select = Array.from(container.querySelectorAll("select")).find((candidate) =>
        Array.from(candidate.options).some((option) => option.value.startsWith("stand-in-cloud::")),
      );
      if (!select) throw new Error("No model picker.");
      return select;
    });
    const other = Array.from(picker.options).find(
      (option) => option.value.startsWith("stand-in-cloud::") && !option.selected && !option.disabled,
    );
    expect(other).toBeDefined();
    await act(async () => {
      picker.value = other!.value;
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitFor(() => {
      const put = runtime.requests.find((request) => request.method === "PUT" && request.path === "/api/chat/session-model");
      expect(put?.body).toMatchObject({ sessionUid: engineSessionId, provider: "stand-in-cloud" });
    });
  });
});
