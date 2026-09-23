import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

const userUid = "00000000-0000-4000-8000-000000000123";
const providerUid = "10000000-0000-4000-8000-000000000123";
const modelUid = "20000000-0000-4000-8000-000000000123";

const modelInput: CustomModelProviderModelInput = {
  model: "alpha",
  displayName: "Alpha",
  api: "openai-completions",
  input: ["text", "image"],
  reasoning: true,
  thinkingLevels: ["off", "high"],
  contextWindow: 128000,
  maxTokens: 16000,
  isDefault: true,
  position: 0,
  metadata: { family: "test" },
};

const modelResponse = {
  uid: modelUid,
  model: "alpha",
  display_name: "Alpha",
  api: "openai-completions",
  input: ["text", "image"],
  reasoning: true,
  thinking_levels: ["off", "high"],
  context_window: 128000,
  max_tokens: 16000,
  is_default: true,
  position: 0,
  metadata: { family: "test" },
  created_by_user_uid: userUid,
  creation_date: "2026-09-04T12:00:00Z",
  updated_at: "2026-09-04T12:00:00Z",
};

const providerResponse = {
  uid: providerUid,
  identifier: "acme-gateway",
  display_name: "Acme Gateway",
  base_url: "https://models.example.test/v1",
  auth: { has_api_key: true, header_names: ["Authorization"] },
  default_model: "alpha",
  models: [modelResponse],
  created_by_user_uid: userUid,
  creation_date: "2026-09-04T12:00:00Z",
  updated_at: "2026-09-04T12:00:00Z",
};

describe("custom model provider api", () => {
  const fetchMock = vi.fn();
  const options = {
    connection,
    createdByUserUid: userUid,
    token: "session-token",
    tokenType: "Bearer",
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the Organization administration rows without sending a user scope", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([providerResponse]), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );

    await expect(fetchCustomModelProviders(options)).resolves.toMatchObject([
      {
        uid: providerUid,
        identifier: "acme-gateway",
        auth: { hasApiKey: true, headerNames: ["Authorization"] },
        models: [{ uid: modelUid, displayName: "Alpha", isDefault: true }],
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain("/api/v1/custom-model-providers/");
    expect(url).not.toContain("created_by_user");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer session-token");
  });

  it("creates an aggregate with exact model fields and keeps secrets write-only", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(providerResponse), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      }),
    );

    const provider = await createCustomModelProvider(
      {
        identifier: "acme-gateway",
        displayName: "Acme Gateway",
        baseUrl: "https://models.example.test/v1",
        apiKey: "organization-secret",
        headers: [{ name: "Authorization", value: "Bearer header-secret" }],
        models: [modelInput],
      },
      options,
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      identifier: "acme-gateway",
      display_name: "Acme Gateway",
      base_url: "https://models.example.test/v1",
      api_key: "organization-secret",
      headers: [{ name: "Authorization", value: "Bearer header-secret" }],
      models: [
        {
          model: "alpha",
          display_name: "Alpha",
          api: "openai-completions",
          input: ["text", "image"],
          reasoning: true,
          thinking_levels: ["off", "high"],
          context_window: 128000,
          max_tokens: 16000,
          is_default: true,
          position: 0,
          metadata: { family: "test" },
        },
      ],
    });
    expect(body).not.toHaveProperty("created_by_user_uid");
    expect(provider).not.toHaveProperty("apiKey");
    expect(JSON.stringify(provider)).not.toContain("organization-secret");
    expect(JSON.stringify(provider)).not.toContain("header-secret");
  });

  it("patches provider auth with explicit clear semantics", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...providerResponse,
          auth: { has_api_key: false, header_names: [] },
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    await updateCustomModelProvider(
      providerUid,
      { displayName: "Updated Gateway", apiKey: null, headers: [] },
      options,
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain(`/custom-model-providers/${providerUid}/`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      display_name: "Updated Gateway",
      api_key: null,
      headers: [],
    });
    expect(init.body).not.toContain("models");
  });

  it("uses nested model POST, PATCH, and hard DELETE routes", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(modelResponse), {
          headers: { "Content-Type": "application/json" },
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...modelResponse, display_name: "Alpha 2" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await createCustomModelProviderModel(providerUid, modelInput, options);
    await updateCustomModelProviderModel(providerUid, modelUid, { displayName: "Alpha 2" }, options);
    await deleteCustomModelProviderModel(providerUid, modelUid, options);
    await deleteCustomModelProvider(providerUid, options);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      [expect.stringContaining(`/custom-model-providers/${providerUid}/models/`), "POST"],
      [expect.stringContaining(`/custom-model-providers/${providerUid}/models/${modelUid}/`), "PATCH"],
      [expect.stringContaining(`/custom-model-providers/${providerUid}/models/${modelUid}/`), "DELETE"],
      [expect.stringContaining(`/custom-model-providers/${providerUid}/`), "DELETE"],
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      display_name: "Alpha 2",
    });
  });

  it("rejects legacy numeric user ids before network I/O", async () => {
    await expect(fetchCustomModelProviders({ connection, createdByUserUid: "4" })).rejects.toThrow(
      "legacy numeric user id",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
