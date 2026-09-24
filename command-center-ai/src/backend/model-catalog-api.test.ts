import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchAvailableRunConfigOptions,
  fetchModelCatalog,
  fetchModelProviderCatalog,
} from "./model-catalog-api.js";
import { createChatBackendConnection } from "./connection.js";

const connection = createChatBackendConnection({ apiBaseUrl: "http://localhost:8000" });

const catalogDigest = `sha256:${"a".repeat(64)}`;

describe("model provider catalog api", () => {
  const userUid = "00000000-0000-4000-8000-000000000123";
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: 1,
          catalog_digest: catalogDigest,
          providers: [
            {
              provider: "openai-codex",
              display_name: "OpenAI Codex",
              auth_methods: ["oauth"],
              sign_in_available: true,
              known: true,
              enabled: true,
              authenticated: true,
              credential_status: "active",
              default_model: "gpt-5.6",
              models: [
                {
                  model: "gpt-5.6",
                  display_name: "GPT-5.6",
                  api: "openai-responses",
                  input: ["text", "image"],
                  reasoning: true,
                  thinking_levels: ["low", "medium", "high", "xhigh", "max"],
                  context_window: 400000,
                  max_tokens: 128000,
                },
              ],
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads provider ownership and model capabilities directly from the platform", async () => {
    const catalog = await fetchModelProviderCatalog({
      connection,
      createdByUserUid: userUid,
      token: "session-token",
    });

    expect(catalog).toMatchObject({
      schemaVersion: 1,
      catalogDigest,
      providers: [
        {
          provider: "openai-codex",
          displayName: "OpenAI Codex",
          authenticated: true,
          credentialStatus: "active",
          models: [
            {
              provider: "openai-codex",
              model: "gpt-5.6",
              label: "GPT-5.6",
              auth: {
                required: true,
                authKind: "oauth",
                authSource: "platform_store",
              },
              capabilities: {
                runConfig: {
                  reasoning_effort: {
                    values: ["low", "medium", "high", "xhigh", "max"],
                    default: "medium",
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(requestInit?.headers);
    expect(requestUrl).toContain("/api/v1/model-providers/");
    expect(requestUrl).not.toContain("created_by_user_uid=");
    expect(requestUrl).not.toContain("/api/models/catalog");
    expect(headers.get("Authorization")).toBe("Bearer session-token");
  });

  it("keeps the flat model helper as a projection of the same platform response", async () => {
    await expect(
      fetchModelCatalog({ connection, createdByUserUid: userUid }),
    ).resolves.toMatchObject([
      {
        provider: "openai-codex",
        model: "gpt-5.6",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("projects the platform's selection and credential state without treating authentication as selectability", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema_version: 1,
          catalog_digest: catalogDigest,
          providers: [
            {
              provider: "openai-codex",
              display_name: "OpenAI Codex",
              auth_methods: ["oauth"],
              sign_in_available: true,
              known: true,
              enabled: true,
              authenticated: false,
              credential_status: "missing",
              default_model: "gpt-5.6",
              models: [
                {
                  model: "gpt-5.6",
                  display_name: "GPT-5.6",
                  api: "openai-responses",
                  input: ["text"],
                  reasoning: true,
                  thinking_levels: [],
                  context_window: null,
                  max_tokens: null,
                },
              ],
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    const options = await fetchAvailableRunConfigOptions({ connection, createdByUserUid: userUid });

    expect(options.models[0]).toMatchObject({
      provider: "openai-codex",
      source: "platform",
      selectable: true,
      auth: {
        authenticated: false,
        required: true,
      },
      reasoningEfforts: [],
    });
  });

  it("includes Organization custom providers in the same run-config projection", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          schema_version: 1,
          catalog_digest: catalogDigest,
          providers: [
            {
              provider: "acme-models",
              display_name: "Acme Models",
              auth_methods: [],
              sign_in_available: false,
              known: false,
              enabled: true,
              authenticated: true,
              credential_status: "active",
              default_model: "alpha",
              models: [
                {
                  model: "alpha",
                  display_name: "Alpha",
                  api: "openai-completions",
                  input: ["text", "image"],
                  reasoning: true,
                  thinking_levels: ["low", "high"],
                  context_window: 128000,
                  max_tokens: 16000,
                },
              ],
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    const options = await fetchAvailableRunConfigOptions({ connection, createdByUserUid: userUid });

    expect(options.providers).toEqual([{ label: "Acme Models", value: "acme-models" }]);
    expect(options.models).toMatchObject([
      {
        provider: "acme-models",
        value: "alpha",
        known: false,
        enabled: true,
        selectable: true,
        auth: { required: false, authenticated: true },
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects legacy numeric user ids before requesting the catalog", async () => {
    await expect(
      fetchModelProviderCatalog({
        connection,
        createdByUserUid: "4",
        token: "session-token",
      }),
    ).rejects.toThrow("legacy numeric user id");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
