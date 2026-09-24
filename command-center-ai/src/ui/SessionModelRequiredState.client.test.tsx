// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AvailableChatModelOption } from "../backend/model-catalog-api.js";

const mocks = vi.hoisted(() => ({
  feature: {} as Record<string, unknown>,
  openUserSettings: vi.fn(),
}));

vi.mock("../engine/ChatEngineProvider.js", () => ({
  useChatEngine: () => mocks.feature,
}));

vi.mock("./AgentIcon.js", () => ({
  AgentIcon: ({ fallback }: { fallback?: React.ReactNode }) => fallback ?? null,
}));

// The select renders a native select here so the choice can be driven directly.
vi.mock("./Select.js", () => ({
  Select: ({
    children,
    value,
    onChange,
    disabled,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={(event) => onChange?.({ target: { value: event.target.value } })}>
      {children}
    </select>
  ),
}));

import { ChatUiProvider, DEFAULT_CHAT_THREAD_COPY } from "./chat-ui-context.js";
import { SessionModelRequiredState } from "./SessionModelRequiredState.js";

// The application passes how to open its model provider settings; the state offers them only then.
function WithSettings({ openSettings = true }: { openSettings?: boolean }) {
  return (
    <ChatUiProvider
      value={{
        copy: DEFAULT_CHAT_THREAD_COPY,
        onOpenModelProviderSettings: openSettings ? mocks.openUserSettings : undefined,
        viewer: null,
      }}
    >
      <SessionModelRequiredState />
    </ChatUiProvider>
  );
}

function model(provider: string, value: string, overrides: Partial<AvailableChatModelOption> = {}): AvailableChatModelOption {
  return {
    auth: { authKind: null, authenticated: true, configuredFromEnv: false, required: false, signInAvailable: false },
    id: `${provider}::${value}`,
    label: value,
    defaultReasoningEffort: "medium",
    value,
    provider,
    reasoningEfforts: [
      { label: "Low", value: "low" },
      { label: "Medium", value: "medium" },
      { label: "High", value: "high" },
    ],
    source: "platform",
    known: true,
    enabled: true,
    selectable: true,
    ...overrides,
  };
}

function setSelect(label: string, value: string) {
  const select = document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("SessionModelRequiredState", () => {
  let container: HTMLDivElement;
  let root: Root;
  const resolveSessionModelSelection = vi.fn();
  const cancelSessionModelSelection = vi.fn();
  const requestAvailableModels = vi.fn();
  const setSelectedModelValue = vi.fn();
  const setSelectedProviderValue = vi.fn();

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resolveSessionModelSelection.mockReset();
    cancelSessionModelSelection.mockReset();
    requestAvailableModels.mockReset();
    setSelectedModelValue.mockReset();
    setSelectedProviderValue.mockReset();
    mocks.openUserSettings.mockReset();
    mocks.feature = {
      availableModels: [model("anthropic", "claude-fable-5-1"), model("openai-codex", "gpt-5.5"), model("openai-codex", "gpt-5.5-mini")],
      availableModelsError: null,
      availableProviders: [
        { label: "Anthropic", value: "anthropic" },
        { label: "OpenAI Codex", value: "openai-codex" },
      ],
      cancelSessionModelSelection,
      isLoadingAvailableModels: false,
      requestAvailableModels,
      resolveSessionModelSelection,
      sessionModelLastUsed: [{ provider: "openai-codex", model: "gpt-5.5" }],
      sessionModelSelectionRequest: { id: 1, agentLabel: "MainSequence Tutorial Helper", agentUid: "agent-1" },
      setSelectedModelValue,
      setSelectedProviderValue,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the chat picker with the last used model and starts the session with provider, model and thinking", async () => {
    await act(async () => {
      root.render(<WithSettings />);
    });
    expect(container.textContent).toContain("Choose a model for MainSequence Tutorial Helper");
    expect(container.querySelector("[data-chat-run-config]")).not.toBeNull();
    expect((container.querySelector('select[aria-label="Provider"]') as HTMLSelectElement).value).toBe("openai-codex");
    expect((container.querySelector('select[aria-label="Model"]') as HTMLSelectElement).value).toBe("openai-codex::gpt-5.5");
    expect((container.querySelector('select[aria-label="Reasoning effort"]') as HTMLSelectElement).value).toBe("medium");

    await act(async () => {
      setSelect("Model", "openai-codex::gpt-5.5-mini");
    });
    await act(async () => {
      setSelect("Reasoning effort", "high");
    });
    await act(async () => {
      (container.querySelector("[data-session-model-start]") as HTMLButtonElement).click();
    });
    expect(resolveSessionModelSelection).toHaveBeenCalledWith({ provider: "openai-codex", model: "gpt-5.5-mini", thinking: "high" });
    // The open session's picker is never touched by this choice.
    expect(setSelectedModelValue).not.toHaveBeenCalled();
    expect(setSelectedProviderValue).not.toHaveBeenCalled();
    expect(mocks.openUserSettings).not.toHaveBeenCalled();
  });

  it("switches provider to that provider's first usable model and can be cancelled", async () => {
    await act(async () => {
      root.render(<WithSettings />);
    });
    await act(async () => {
      setSelect("Provider", "anthropic");
    });
    expect((container.querySelector('select[aria-label="Model"]') as HTMLSelectElement).value).toBe("anthropic::claude-fable-5-1");
    await act(async () => {
      (container.querySelector("[data-session-model-cancel]") as HTMLButtonElement).click();
    });
    expect(cancelSessionModelSelection).toHaveBeenCalledTimes(1);
    expect(resolveSessionModelSelection).not.toHaveBeenCalled();
  });

  it("asks for the catalog and keeps Start disabled while there is nothing to choose", async () => {
    mocks.feature = { ...mocks.feature, availableModels: [], availableProviders: [], sessionModelLastUsed: [] };
    await act(async () => {
      root.render(<WithSettings />);
    });
    expect(requestAvailableModels).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-session-model-state="empty"]')).not.toBeNull();
    expect((container.querySelector("[data-session-model-start]") as HTMLButtonElement).disabled).toBe(true);
    const openProviders = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Open model providers",
    );
    await act(async () => {
      openProviders?.click();
    });
    expect(mocks.openUserSettings).toHaveBeenCalledTimes(1);
  });

  it("offers the model provider settings only when the application can open them", async () => {
    mocks.feature = { ...mocks.feature, availableModels: [], availableProviders: [], sessionModelLastUsed: [] };
    await act(async () => {
      root.render(<WithSettings openSettings={false} />);
    });
    expect(container.querySelector('[data-session-model-state="empty"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Open model providers");
  });

  it("renders nothing when no session is waiting for a model", async () => {
    mocks.feature = { ...mocks.feature, sessionModelSelectionRequest: null };
    await act(async () => {
      root.render(<WithSettings />);
    });
    expect(container.querySelector("[data-session-model-required]")).toBeNull();
  });
});
