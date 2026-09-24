// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProviders: vi.fn(),
  toast: vi.fn(),
}));

// The Organization has no custom providers yet.
vi.mock("../backend/custom-model-provider-api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../backend/custom-model-provider-api.js")>()),
  fetchCustomModelProviders: mocks.fetchProviders,
}));

vi.mock("../ui/ConfirmationDialog.js", () => ({
  ConfirmationDialog: () => null,
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


import { createChatBackendConnection } from "../backend/connection.js";
import { CustomModelProviderSettings } from "./CustomModelProviderSettings.js";

const connection = createChatBackendConnection({ apiBaseUrl: "https://platform.test" });
const auth = {
  token: "session-token",
  tokenType: "Bearer",
  userUid: "00000000-0000-4000-8000-000000000123",
};

function Settings() {
  return <CustomModelProviderSettings auth={auth} connection={connection} notify={mocks.toast} />;
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("CustomModelProviderSettings", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProviders.mockResolvedValue([]);
  });

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
  });

  it("opens an atomic provider editor with auth and exact relational model fields", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<Settings />);
    });

    expect(container.textContent).toContain("Organization custom providers");
    expect(container.textContent).toContain("No custom providers yet");
    expect(mocks.fetchProviders).toHaveBeenCalledWith(
      expect.objectContaining({ connection, createdByUserUid: auth.userUid, token: auth.token }),
    );

    const addProvider = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add custom provider"),
    );
    await act(async () => addProvider?.click());

    expect(container.textContent).toContain("Secrets are encrypted by the platform");
    expect(container.textContent).toContain("Exactly one model must be the default");
    expect(container.textContent).toContain("Upstream model ID");
    expect(container.textContent).toContain("API protocol");
    expect(container.textContent).toContain("Thinking levels");
    expect(container.textContent).toContain("Context window");
    expect(container.textContent).toContain("Max output tokens");
    expect(container.textContent).toContain("Metadata (optional JSON object)");
    expect(container.querySelector('input[type="radio"]')?.getAttribute("checked")).not.toBeNull();

    const addModel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add model"),
    );
    await act(async () => addModel?.click());
    expect(container.textContent).toContain("Model 2");

    const jsonMode = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("JSON"),
    );
    await act(async () => jsonMode?.click());
    expect(container.querySelector('textarea[aria-label="Models JSON"]')).not.toBeNull();
    expect(container.textContent).toContain("catalog-style object");
    expect(container.textContent).toContain("Format and validate JSON");
  });

  it("opens a direct test chat for a draft model once the endpoint and model ID are entered", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    await act(async () => {
      root.render(<Settings />);
    });

    const findButton = (label: string) =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.trim().endsWith(label),
      );
    const setValue = (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    await act(async () => findButton("Add custom provider")?.click());
    expect(findButton("Test")?.disabled).toBe(true);

    await act(async () => {
      setValue('input[type="url"]', "https://models.example.test/v1/");
      setValue('input[placeholder="model-id"]', "alpha");
    });
    expect(findButton("Test")?.disabled).toBe(false);

    await act(async () => findButton("Test")?.click());

    expect(container.querySelector('section[aria-label="Test alpha"]')).not.toBeNull();
    expect(container.textContent).toContain("POST https://models.example.test/v1/chat/completions");
    expect(container.textContent).toContain("currently entered in the provider form");
  });
});
