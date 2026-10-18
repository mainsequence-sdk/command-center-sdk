// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelProviderCatalog } from "../backend/model-catalog-api.js";
import type { SignInAttempt } from "../backend/model-provider-auth-api.js";

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  fetchAttempt: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  signOff: vi.fn(),
  start: vi.fn(),
}));

vi.mock("../backend/model-provider-auth-api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../backend/model-provider-auth-api.js")>()),
  cancelModelProviderSignIn: mocks.cancel,
  fetchModelProviderSignInAttempt: mocks.fetchAttempt,
  signOffModelProvider: mocks.signOff,
  startModelProviderSignIn: mocks.start,
}));

const catalog: ModelProviderCatalog = {
  schemaVersion: 1,
  catalogDigest: "digest",
  providers: [
    {
      provider: "openai-codex",
      displayName: "OpenAI Codex",
      authMethods: ["oauth"],
      signInAvailable: true,
      known: true,
      enabled: true,
      authenticated: false,
      credentialStatus: "missing",
      defaultModel: "gpt-5.5",
      models: [],
    },
  ],
};

vi.mock("../engine/run-config-options.js", () => ({
  invalidateModelProviderCatalog: mocks.invalidate,
  useModelProviderCatalog: () => ({ data: catalog, error: null, isLoading: false, refetch: mocks.refetch }),
}));

vi.mock("./CustomModelProviderSettings.js", () => ({
  CustomModelProviderSettings: () => null,
}));

vi.mock("../ui/Dialog.js", () => ({
  Dialog: ({ children, open, title }: { children: React.ReactNode; open: boolean; title: string }) =>
    open ? <section aria-label={title}>{children}</section> : null,
}));

import { createChatBackendConnection } from "../backend/connection.js";
import { ModelProviderApiError } from "../backend/model-provider-auth-api.js";
import { ModelProviderSettings } from "./ModelProviderSettings.js";

const connection = createChatBackendConnection({ apiBaseUrl: "https://platform.test" });
const auth = { token: "session-token", tokenType: "Bearer", userUid: "user-1" };

function attempt(status: SignInAttempt["status"]): SignInAttempt {
  return {
    id: "attempt-1",
    provider: "openai-codex",
    status,
    nextAction: status === "awaiting_browser" ? { type: "open_url", url: "https://provider.test/device" } : { type: "none" },
    authKind: "oauth",
    createdAt: "2026-09-23T00:00:00Z",
    updatedAt: "2026-09-23T00:00:00Z",
    completedAt: status === "completed" ? "2026-09-23T00:00:05Z" : null,
    error: null,
  };
}

describe("ModelProviderSettings sign-in", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.signOff.mockReset();
    delete catalog.providers[0].configuredCredentials;
    mocks.refetch.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  const signIn = () =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Sign in");
  const dialog = () => container.querySelector('section[aria-label="Openai Codex sign-in"]');

  it("follows the attempt every 1.5 s until it completes, then reads the catalog again", async () => {
    mocks.start.mockResolvedValue({ ok: true, statusCode: 201, provider: "openai-codex", attempt: attempt("pending") });
    mocks.fetchAttempt
      .mockResolvedValueOnce(attempt("awaiting_browser"))
      .mockResolvedValueOnce(attempt("completed"));

    await act(async () => {
      root.render(<ModelProviderSettings auth={auth} connection={connection} />);
    });
    await act(async () => {
      signIn()?.click();
    });

    // The attempt is read at once, and shows the page to open.
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ connection, createdByUserUid: "user-1", provider: "openai-codex", token: "session-token" }),
    );
    expect(mocks.fetchAttempt).toHaveBeenCalledTimes(1);
    expect(dialog()?.textContent).toContain("https://provider.test/device");

    // The next read comes 1.5 s later; the completed attempt closes the dialog.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(mocks.fetchAttempt).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(mocks.refetch).toHaveBeenCalled();

    // A finished attempt is not read again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mocks.fetchAttempt).toHaveBeenCalledTimes(2);
  });

  it("closes the dialog when the platform no longer knows the attempt", async () => {
    mocks.start.mockResolvedValue({ ok: true, statusCode: 201, provider: "openai-codex", attempt: attempt("pending") });
    mocks.fetchAttempt.mockRejectedValue(
      new ModelProviderApiError("Not found.", { code: "signin_attempt_not_found", status: 404 }),
    );

    await act(async () => {
      root.render(<ModelProviderSettings auth={auth} connection={connection} />);
    });
    await act(async () => {
      signIn()?.click();
    });
    // One read and one retry a second later, like the application's other reads.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(mocks.fetchAttempt).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
    expect(mocks.invalidate).toHaveBeenCalled();
  });

  it("opens the attempt already in progress instead of failing", async () => {
    mocks.start.mockRejectedValue(
      new ModelProviderApiError("Already signing in.", {
        attempt: attempt("awaiting_browser"),
        code: "provider_signin_in_progress",
        status: 409,
      }),
    );
    mocks.fetchAttempt.mockResolvedValue(attempt("awaiting_browser"));

    await act(async () => {
      root.render(<ModelProviderSettings auth={auth} connection={connection} />);
    });
    await act(async () => {
      signIn()?.click();
    });

    expect(dialog()).not.toBeNull();
    expect(container.textContent).not.toContain("Already signing in.");
  });
  it("shows the selected name, owner, Environment and credential disclosure before sharing", async () => {
    catalog.providers[0].configuredCredentials = [{
      uid: "credential-one", customId: "openai-work", userUid: "owner-one",
      organizationEnvironmentUid: "environment-one", status: "active", authenticated: true,
    }];
    const renderSharing = vi.fn(() => <button>Share with selected recipient</button>);
    await act(async () => root.render(<ModelProviderSettings auth={auth} connection={connection}
      organizationEnvironmentUid="environment-one" renderSharing={renderSharing} />));
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Details and sharing")?.click();
    });
    expect(renderSharing).toHaveBeenCalledWith({
      uid: "credential-one", name: "openai-work", ownerUserUid: "owner-one",
      organizationEnvironmentUid: "environment-one", resource: "model-provider-credentials",
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("owner-one");
    expect(text).toContain("environment-one");
    expect(text).toContain("including local Tau");
    expect(text).toContain("credentials already received may work until they expire");
    expect(text).toContain("Organization admins don't need a share");
    expect(text.indexOf("Sharing this configured provider lets recipients")).toBeLessThan(text.indexOf("Share with selected recipient"));
  });

  it("reconnects the named credential rather than the provider default", async () => {
    catalog.providers[0].configuredCredentials = [{
      uid: "credential-two", customId: "openai-work", userUid: "owner-one",
      organizationEnvironmentUid: "environment-one", status: "revoked", authenticated: false,
    }];
    mocks.start.mockResolvedValue({ ok: true, statusCode: 201, provider: "openai-codex", attempt: attempt("completed") });
    mocks.fetchAttempt.mockResolvedValue(attempt("completed"));
    await act(async () => root.render(<ModelProviderSettings auth={auth} connection={connection} organizationEnvironmentUid="environment-one" />));
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Sign in openai-work")?.click();
    });
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai-codex", customId: "openai-work", organizationEnvironmentUid: "environment-one" }));
  });

  it.each(["refusal", "network"])("shows a sign-off %s without changing the signed-in card, and clears it on retry", async (failure) => {
    catalog.providers[0].configuredCredentials = [{
      uid: "credential-one", customId: "openai-work", userUid: "owner-one",
      organizationEnvironmentUid: "environment-one", status: "active", authenticated: true,
    }];
    const message = failure === "refusal"
      ? "This needs the model-provider-credentials.revoke action."
      : "The network connection was lost.";
    const sendPlatformRequest = vi.fn();
    if (failure === "refusal") {
      sendPlatformRequest.mockResolvedValue(new Response(JSON.stringify({
        detail: message,
        code: "missing_action",
        required_action: "model-provider-credentials.revoke",
        granting_policies: ["model-provider-credentials.editor", "model-provider-credentials.owner"],
      }), { status: 403, statusText: "Forbidden", headers: { "Content-Type": "application/json" } }));
    } else {
      sendPlatformRequest.mockRejectedValue(new Error(message));
    }
    const api = await vi.importActual<typeof import("../backend/model-provider-auth-api.js")>("../backend/model-provider-auth-api.js");
    mocks.signOff.mockImplementationOnce(api.signOffModelProvider);
    const testConnection = createChatBackendConnection({ apiBaseUrl: "https://platform.test", sendPlatformRequest });
    const signOffButton = () => Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Sign off openai-work")!;

    await act(async () => root.render(<ModelProviderSettings auth={auth} connection={testConnection}
      organizationEnvironmentUid="environment-one" />));
    await act(async () => signOffButton().click());

    const request = sendPlatformRequest.mock.calls[0][0] as Request;
    expect(request.url).toBe("https://platform.test/api/v1/model-provider-credentials/revoke/");
    expect(request.method).toBe("POST");
    expect(await request.json()).toMatchObject({ provider: "openai-codex", custom_id: "openai-work" });
    expect(container.querySelector(".ms-chat-providers__error")?.textContent).toContain(message);
    expect(signOffButton().disabled).toBe(false);
    expect(signOffButton().parentElement?.textContent).toContain("Signed in");
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.refetch).not.toHaveBeenCalled();

    let finishSignOff!: () => void;
    mocks.signOff.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSignOff = resolve; }));
    await act(async () => signOffButton().click());
    expect(container.querySelector(".ms-chat-providers__error")).toBeNull();
    expect(signOffButton().disabled).toBe(true);
    await act(async () => finishSignOff());
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a fallback for an unknown sign-off failure and clears it when starting sign-in", async () => {
    catalog.providers[0].configuredCredentials = [{
      uid: "credential-one", customId: "openai-work", userUid: "owner-one",
      organizationEnvironmentUid: "environment-one", status: "active", authenticated: true,
    }];
    mocks.signOff.mockRejectedValueOnce(null);
    mocks.start.mockResolvedValue({ ok: true, statusCode: 201, provider: "openai-codex", attempt: attempt("awaiting_browser") });
    mocks.fetchAttempt.mockResolvedValue(attempt("awaiting_browser"));
    await act(async () => root.render(<ModelProviderSettings auth={auth} connection={connection} />));
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Sign off openai-work")!.click();
    });
    expect(container.querySelector(".ms-chat-providers__error")?.textContent).toBe("Unable to sign off the provider.");
    await act(async () => signIn()!.click());
    expect(container.querySelector(".ms-chat-providers__error")).toBeNull();
    expect(dialog()).not.toBeNull();
  });

});
