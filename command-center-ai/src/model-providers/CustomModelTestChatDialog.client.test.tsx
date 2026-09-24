// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
}));

vi.mock("../backend/custom-model-direct-chat.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../backend/custom-model-direct-chat.js")>()),
  streamCustomModelDirectChat: mocks.stream,
}));

vi.mock("@dev-mainsequence/command-center-sdk/controls", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, size: _size, type, variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => (
    <button type={type ?? "button"} {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));


vi.mock("../ui/Dialog.js", () => ({
  Dialog: ({ children, open, title }: { children: React.ReactNode; open: boolean; title: string }) =>
    open ? <section aria-label={title}>{children}</section> : null,
}));


vi.mock("../ui/PasswordInput.js", () => ({
  PasswordInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="password" {...props} />,
}));

vi.mock("../ui/Select.js", () => ({
  Select: ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props}>{children}</select>
  ),
}));


import { CustomModelDirectChatError } from "../backend/custom-model-direct-chat.js";
import {
  CustomModelTestChatDialog,
  type CustomModelTestChatTarget,
} from "./CustomModelTestChatDialog.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const storedTarget: CustomModelTestChatTarget = {
  providerLabel: "Acme Models",
  baseUrl: "https://models.example.test/v1",
  model: "alpha",
  displayName: "Alpha",
  api: "openai-completions",
  reasoning: true,
  thinkingLevels: ["off", "high"],
  auth: { kind: "stored", hasApiKey: true, headerNames: ["x-tenant-id"] },
};

const successResult = {
  text: "Hello there",
  reasoning: "",
  finishReason: "stop",
  usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
  status: 200,
  latencyMs: 1200,
  firstTokenMs: 300,
};

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CustomModelTestChatDialog", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  async function renderDialog(target: CustomModelTestChatTarget) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(<CustomModelTestChatDialog target={target} onClose={() => undefined} />);
    });
    return container;
  }

  function button(container: HTMLElement, label: string) {
    const match = Array.from(container.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes(label),
    );
    if (!match) throw new Error(`Button ${label} was not rendered.`);
    return match;
  }

  function message(container: HTMLElement) {
    return container.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
  });

  it("requires the stored secrets, then sends them only to the direct chat transport", async () => {
    mocks.stream.mockImplementation(async (request: { onTextDelta?: (delta: string) => void }) => {
      request.onTextDelta?.("Hello there");
      return successResult;
    });
    const container = await renderDialog(storedTarget);

    expect(container.textContent).toContain("POST https://models.example.test/v1/chat/completions");
    expect(container.textContent).toContain("Stored secrets are never returned to the browser");
    // Nothing but real inputs may look typable: no empty conversation box before the first send.
    expect(container.querySelector('[role="log"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('input[type="password"]'));

    await act(async () => setValue(message(container), "Hi"));
    expect(button(container, "Send").disabled).toBe(true);
    expect(container.textContent).toContain("Enter the stored credentials above to send.");

    const secrets = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
    expect(secrets).toHaveLength(2);
    await act(async () => {
      setValue(secrets[0], "key-1");
      setValue(secrets[1], "acme");
    });
    expect(button(container, "Send").disabled).toBe(false);

    await act(async () => button(container, "Send").click());

    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0][0]).toMatchObject({
      baseUrl: "https://models.example.test/v1",
      api: "openai-completions",
      model: "alpha",
      messages: [{ role: "user", content: "Hi" }],
      maxTokens: null,
      thinking: null,
      auth: { apiKey: "key-1", headers: [{ name: "x-tenant-id", value: "acme" }] },
    });
    expect(container.querySelector('[role="log"]')?.textContent).toContain("Hello there");
    expect(container.textContent).toContain(
      "HTTP 200 · 1.2 s total · first token 300 ms · 5 in / 2 out tokens · finish: stop",
    );
    expect(message(container).value).toBe("");
  });

  it("resends the conversation each turn and leaves failed turns out of it", async () => {
    mocks.stream
      .mockResolvedValueOnce(successResult)
      .mockRejectedValueOnce(new CustomModelDirectChatError("auth", "The endpoint rejected the credentials (HTTP 401).", 401))
      .mockResolvedValueOnce({ ...successResult, text: "Third" });
    const container = await renderDialog({
      ...storedTarget,
      auth: { kind: "draft", apiKey: "draft-key", headers: [] },
    });

    expect(container.textContent).toContain("currently entered in the provider form");
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(0);
    expect(document.activeElement).toBe(message(container));

    for (const prompt of ["One", "Two", "Three"]) {
      await act(async () => setValue(message(container), prompt));
      await act(async () => button(container, "Send").click());
    }

    expect(container.textContent).toContain("Authentication");
    expect(container.textContent).toContain("The endpoint rejected the credentials (HTTP 401).");
    expect(mocks.stream.mock.calls[1][0].messages).toEqual([
      { role: "user", content: "One" },
      { role: "assistant", content: "Hello there" },
      { role: "user", content: "Two" },
    ]);
    expect(mocks.stream.mock.calls[2][0].messages).toEqual([
      { role: "user", content: "One" },
      { role: "assistant", content: "Hello there" },
      { role: "user", content: "Three" },
    ]);
    expect(mocks.stream.mock.calls[2][0].auth).toEqual({ apiKey: "draft-key", headers: [] });
  });

  it("refuses to send to an endpoint the browser would block", async () => {
    vi.stubGlobal("location", { protocol: "https:", origin: "https://command-center.test" });
    try {
      const container = await renderDialog({
        ...storedTarget,
        baseUrl: "http://models.internal/v1",
        auth: { kind: "stored", hasApiKey: false, headerNames: [] },
      });

      expect(container.textContent).toContain("plain HTTP");
      expect(message(container).disabled).toBe(true);
      expect(button(container, "Send").disabled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
