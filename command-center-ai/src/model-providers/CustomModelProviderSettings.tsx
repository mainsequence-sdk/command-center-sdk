import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  Braces,
  ChevronDown,
  KeyRound,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge, Button, Input, Textarea } from "@dev-mainsequence/command-center-sdk/controls";

import type { ChatBackendConnection } from "../backend/connection.js";
import {
  createCustomModelProvider,
  createCustomModelProviderModel,
  deleteCustomModelProvider,
  deleteCustomModelProviderModel,
  fetchCustomModelProviders,
  updateCustomModelProvider,
  updateCustomModelProviderModel,
  type CreateCustomModelProviderInput,
  type CustomModelInput,
  type CustomModelProvider,
  type CustomModelProviderApi,
  type CustomModelProviderHeaderInput,
  type CustomModelProviderModel,
  type CustomModelProviderModelInput,
  type CustomModelProviderRequestOptions,
  type CustomModelThinkingLevel,
  type UpdateCustomModelProviderInput,
} from "../backend/custom-model-provider-api.js";
import {
  formatCustomModelProviderModelsJson,
  parseCustomModelProviderModelsJson,
} from "../backend/custom-model-provider-model-json.js";
import { invalidateModelProviderCatalog } from "../engine/run-config-options.js";
import type { ChatAuth, ChatNotify } from "../engine/types.js";
import { cx } from "../ui/class-names.js";
import { ConfirmationDialog } from "../ui/ConfirmationDialog.js";
import { Dialog } from "../ui/Dialog.js";
import { PasswordInput } from "../ui/PasswordInput.js";
import { Select } from "../ui/Select.js";
import {
  CustomModelTestChatDialog,
  type CustomModelTestChatTarget,
} from "./CustomModelTestChatDialog.js";

type SecretMode = "keep" | "replace" | "clear";
type ModelEntryMode = "form" | "json";

interface HeaderDraft extends CustomModelProviderHeaderInput {
  key: number;
}

interface ModelDraft {
  key: number;
  uid?: string;
  model: string;
  displayName: string;
  api: CustomModelProviderApi;
  input: CustomModelInput[];
  reasoning: boolean;
  thinkingLevels: CustomModelThinkingLevel[];
  contextWindow: string;
  maxTokens: string;
  isDefault: boolean;
  position: string;
  metadata: string;
}

interface ProviderDraft {
  identifier: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  apiKeyMode: SecretMode;
  headerMode: SecretMode;
  headers: HeaderDraft[];
  modelEntryMode: ModelEntryMode;
  modelsJson: string;
  models: ModelDraft[];
}

type MutationAction =
  | { kind: "create-provider"; input: CreateCustomModelProviderInput }
  | { kind: "update-provider"; providerUid: string; input: UpdateCustomModelProviderInput }
  | { kind: "delete-provider"; providerUid: string }
  | { kind: "create-model"; providerUid: string; input: CustomModelProviderModelInput }
  | {
      kind: "update-model";
      providerUid: string;
      modelUid: string;
      input: CustomModelProviderModelInput;
    }
  | { kind: "delete-model"; providerUid: string; modelUid: string };

const thinkingLevels: CustomModelThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

let nextDraftKey = 0;

function draftKey() {
  nextDraftKey += 1;
  return nextDraftKey;
}

function emptyHeader(): HeaderDraft {
  return { key: draftKey(), name: "", value: "" };
}

function emptyModel(position = 0, isDefault = false): ModelDraft {
  return {
    key: draftKey(),
    model: "",
    displayName: "",
    api: "openai-completions",
    input: ["text"],
    reasoning: false,
    thinkingLevels: [],
    contextWindow: "",
    maxTokens: "",
    isDefault,
    position: String(position),
    metadata: "{}",
  };
}

function modelToDraft(model: CustomModelProviderModel): ModelDraft {
  return {
    key: draftKey(),
    uid: model.uid,
    model: model.model,
    displayName: model.displayName,
    api: model.api,
    input: [...model.input],
    reasoning: model.reasoning,
    thinkingLevels: [...model.thinkingLevels],
    contextWindow: model.contextWindow === null ? "" : String(model.contextWindow),
    maxTokens: model.maxTokens === null ? "" : String(model.maxTokens),
    isDefault: model.isDefault,
    position: String(model.position),
    metadata: JSON.stringify(model.metadata, null, 2),
  };
}

function modelInputToDraft(model: CustomModelProviderModelInput): ModelDraft {
  return {
    key: draftKey(),
    model: model.model,
    displayName: model.displayName,
    api: model.api,
    input: [...model.input],
    reasoning: model.reasoning,
    thinkingLevels: [...model.thinkingLevels],
    contextWindow: model.contextWindow === null ? "" : String(model.contextWindow),
    maxTokens: model.maxTokens === null ? "" : String(model.maxTokens),
    isDefault: model.isDefault,
    position: String(model.position),
    metadata: JSON.stringify(model.metadata, null, 2),
  };
}

function draftNumberForJson(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
}

function formatModelDraftsJson(models: ModelDraft[]) {
  return JSON.stringify(
    {
      default_model: models.find((model) => model.isDefault)?.model ?? "",
      models: models.map((model) => {
        let metadata: unknown;
        try {
          metadata = JSON.parse(model.metadata || "{}");
        } catch {
          metadata = model.metadata;
        }
        return {
          model: model.model,
          display_name: model.displayName,
          api: model.api,
          input: model.input,
          reasoning: model.reasoning,
          thinking_levels: model.thinkingLevels,
          context_window: draftNumberForJson(model.contextWindow),
          max_tokens: draftNumberForJson(model.maxTokens),
          is_default: model.isDefault,
          position: draftNumberForJson(model.position),
          metadata,
        };
      }),
    },
    null,
    2,
  );
}

function createProviderDraft(provider?: CustomModelProvider): ProviderDraft {
  if (!provider) {
    const models = [emptyModel(0, true)];
    return {
      identifier: "",
      displayName: "",
      baseUrl: "",
      apiKey: "",
      apiKeyMode: "replace",
      headerMode: "replace",
      headers: [],
      modelEntryMode: "form",
      modelsJson: formatModelDraftsJson(models),
      models,
    };
  }

  return {
    identifier: provider.identifier,
    displayName: provider.displayName,
    baseUrl: provider.baseUrl,
    apiKey: "",
    apiKeyMode: "keep",
    headerMode: "keep",
    headers: [],
    modelEntryMode: "form",
    modelsJson: "",
    models: [],
  };
}

function parseOptionalPositiveInteger(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

function parsePosition(value: string) {
  const parsed = Number(value || "0");
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Position must be zero or a positive whole number.");
  }
  return parsed;
}

function parseMetadata(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "{}");
  } catch {
    throw new Error("Metadata must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Metadata must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function parseModelDraft(draft: ModelDraft): CustomModelProviderModelInput {
  if (!draft.model.trim() || !draft.displayName.trim()) {
    throw new Error("Every model requires an upstream model ID and display name.");
  }
  if (draft.input.length === 0) {
    throw new Error(`${draft.displayName || draft.model} requires at least one input type.`);
  }
  if (!draft.reasoning && draft.thinkingLevels.length > 0) {
    throw new Error("Thinking levels must be empty when reasoning is disabled.");
  }

  return {
    model: draft.model.trim(),
    displayName: draft.displayName.trim(),
    api: draft.api,
    input: draft.input,
    reasoning: draft.reasoning,
    thinkingLevels: draft.reasoning ? draft.thinkingLevels : [],
    contextWindow: parseOptionalPositiveInteger(draft.contextWindow, "Context window"),
    maxTokens: parseOptionalPositiveInteger(draft.maxTokens, "Maximum output tokens"),
    isDefault: draft.isDefault,
    position: parsePosition(draft.position),
    metadata: parseMetadata(draft.metadata),
  };
}

function parseHeaders(headers: HeaderDraft[]) {
  const populated = headers.filter((header) => header.name.trim() || header.value);
  if (populated.some((header) => !header.name.trim())) {
    throw new Error("Every header value requires a header name.");
  }
  return populated.map(({ name, value }) => ({ name: name.trim(), value }));
}

function storedModelTestTarget(
  provider: CustomModelProvider,
  model: CustomModelProviderModel,
): CustomModelTestChatTarget {
  return {
    providerLabel: provider.displayName,
    baseUrl: provider.baseUrl,
    model: model.model,
    displayName: model.displayName,
    api: model.api,
    reasoning: model.reasoning,
    thinkingLevels: model.thinkingLevels,
    auth: {
      kind: "stored",
      hasApiKey: provider.auth.hasApiKey,
      headerNames: provider.auth.headerNames,
    },
  };
}

function draftModelTestTarget(draft: ProviderDraft, model: ModelDraft): CustomModelTestChatTarget {
  return {
    providerLabel: draft.displayName.trim() || draft.identifier.trim() || "New provider",
    baseUrl: draft.baseUrl.trim(),
    model: model.model.trim(),
    displayName: model.displayName.trim() || model.model.trim(),
    api: model.api,
    reasoning: model.reasoning,
    thinkingLevels: model.reasoning ? model.thinkingLevels : [],
    auth: {
      kind: "draft",
      apiKey: draft.apiKey,
      headers: draft.headers
        .filter((header) => header.name.trim())
        .map(({ name, value }) => ({ name: name.trim(), value })),
    },
  };
}

const ignoreClose = () => undefined;

function ProviderFields({
  draft,
  existingProvider,
  onChange,
}: {
  draft: ProviderDraft;
  existingProvider: CustomModelProvider | null;
  onChange: (next: ProviderDraft) => void;
}) {
  const updateHeader = (key: number, field: "name" | "value", value: string) => {
    onChange({
      ...draft,
      headers: draft.headers.map((header) =>
        header.key === key ? { ...header, [field]: value } : header,
      ),
    });
  };

  return (
    <div className="ms-chat-custom-providers__form">
      <div className="ms-chat-form__grid">
        <label className="ms-chat-form__field">
          <span className="ms-chat-label">Provider identifier</span>
          <Input
            required
            value={draft.identifier}
            placeholder="acme-models"
            onChange={(event) => onChange({ ...draft, identifier: event.target.value })}
          />
          <span className="ms-chat-form__hint">
            Stable lowercase ID used in model configuration.
          </span>
        </label>
        <label className="ms-chat-form__field">
          <span className="ms-chat-label">Display name</span>
          <Input
            required
            value={draft.displayName}
            placeholder="Acme Models"
            onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
          />
        </label>
      </div>
      <label className="ms-chat-form__field ms-chat-form__field--block">
        <span className="ms-chat-label">Base URL</span>
        <Input
          required
          type="url"
          value={draft.baseUrl}
          placeholder="https://models.example.com/v1"
          onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
        />
      </label>

      <section className="ms-chat-custom-providers__inset">
        <div className="ms-chat-custom-providers__inset-title">
          <KeyRound className="ms-chat-icon-md ms-chat-icon-muted" />
          <div className="ms-chat-custom-providers__heading">Authentication</div>
        </div>
        <div className="ms-chat-custom-providers__hint">
          Secrets are encrypted by the platform. Existing secret values are never returned to this form.
        </div>

        {existingProvider ? (
          <label className="ms-chat-form__field ms-chat-form__field--block">
            <span className="ms-chat-label">API key action</span>
            <Select
              value={draft.apiKeyMode}
              onChange={(event) =>
                onChange({
                  ...draft,
                  apiKeyMode: event.target.value as SecretMode,
                  apiKey: event.target.value === "replace" ? draft.apiKey : "",
                })
              }
            >
              <option value="keep">Keep stored key</option>
              <option value="replace">Replace stored key</option>
              <option value="clear">Clear stored key</option>
            </Select>
            <span className="ms-chat-form__hint">
              {existingProvider.auth.hasApiKey ? "An API key is configured." : "No API key is configured."}
            </span>
          </label>
        ) : null}

        {draft.apiKeyMode === "replace" ? (
          <label className="ms-chat-form__field ms-chat-form__field--block">
            <span className="ms-chat-label">API key {existingProvider ? "replacement" : "(optional)"}</span>
            <PasswordInput
              value={draft.apiKey}
              autoComplete="new-password"
              placeholder="API key"
              onChange={(event) => onChange({ ...draft, apiKey: event.target.value })}
            />
          </label>
        ) : null}

        {existingProvider ? (
          <label className="ms-chat-form__field ms-chat-form__field--block">
            <span className="ms-chat-label">Header action</span>
            <Select
              value={draft.headerMode}
              onChange={(event) => {
                const headerMode = event.target.value as SecretMode;
                onChange({
                  ...draft,
                  headerMode,
                  headers:
                    headerMode === "replace" && draft.headers.length === 0
                      ? [emptyHeader()]
                      : draft.headers,
                });
              }}
            >
              <option value="keep">Keep stored headers</option>
              <option value="replace">Replace all stored headers</option>
              <option value="clear">Clear all stored headers</option>
            </Select>
            <span className="ms-chat-form__hint">
              Stored header names: {existingProvider.auth.headerNames.join(", ") || "None"}.
            </span>
          </label>
        ) : null}

        {draft.headerMode === "replace" ? (
          <div className="ms-chat-form__group">
            <div className="ms-chat-label">Headers (optional)</div>
            {draft.headers.map((header) => (
              <div key={header.key} className="ms-chat-form__header-row">
                <Input
                  aria-label="Header name"
                  value={header.name}
                  placeholder="Header-Name"
                  onChange={(event) => updateHeader(header.key, "name", event.target.value)}
                />
                <PasswordInput
                  aria-label="Header value"
                  value={header.value}
                  placeholder="Header value"
                  onChange={(event) => updateHeader(header.key, "value", event.target.value)}
                />
                <Button
                  iconOnly
                  variant="ghost"
                  aria-label="Remove header"
                  onClick={() =>
                    onChange({
                      ...draft,
                      headers: draft.headers.filter((candidate) => candidate.key !== header.key),
                    })
                  }
                >
                  <Trash2 className="ms-chat-icon-md" />
                </Button>
              </div>
            ))}
            <Button
              size="small"
              variant="ghost"
              onClick={() => onChange({ ...draft, headers: [...draft.headers, emptyHeader()] })}
            >
              <Plus className="ms-chat-icon-md" />
              Add header
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Toggle({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cx("ms-chat-form__toggle", disabled && "ms-chat-form__toggle--disabled")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function ModelFields({
  defaultLocked = false,
  draft,
  defaultMode,
  onChange,
}: {
  defaultLocked?: boolean;
  draft: ModelDraft;
  defaultMode: "radio" | "checkbox";
  onChange: (next: ModelDraft) => void;
}) {
  const toggleInput = (value: CustomModelInput, checked: boolean) => {
    onChange({
      ...draft,
      input: checked
        ? Array.from(new Set([...draft.input, value]))
        : draft.input.filter((entry) => entry !== value),
    });
  };
  const toggleThinking = (value: CustomModelThinkingLevel, checked: boolean) => {
    onChange({
      ...draft,
      thinkingLevels: checked
        ? Array.from(new Set([...draft.thinkingLevels, value]))
        : draft.thinkingLevels.filter((entry) => entry !== value),
    });
  };

  return (
    <div className="ms-chat-custom-providers__stack">
      <div className="ms-chat-form__grid-tight">
        <label className="ms-chat-form__field">
          <span className="ms-chat-label">Upstream model ID</span>
          <Input
            required
            value={draft.model}
            placeholder="model-id"
            onChange={(event) => onChange({ ...draft, model: event.target.value })}
          />
        </label>
        <label className="ms-chat-form__field">
          <span className="ms-chat-label">Display name</span>
          <Input
            required
            value={draft.displayName}
            placeholder="Model display name"
            onChange={(event) => onChange({ ...draft, displayName: event.target.value })}
          />
        </label>
      </div>
      <label className="ms-chat-form__field ms-chat-form__field--block">
        <span className="ms-chat-label">API protocol</span>
        <Select
          value={draft.api}
          onChange={(event) =>
            onChange({ ...draft, api: event.target.value as CustomModelProviderApi })
          }
        >
          <option value="openai-completions">OpenAI Chat Completions</option>
          <option value="openai-responses">OpenAI Responses</option>
        </Select>
      </label>
      <div className="ms-chat-form__grid">
        <div className="ms-chat-form__group">
          <div className="ms-chat-label">Accepted input</div>
          <div className="ms-chat-form__options">
            <Toggle checked={draft.input.includes("text")} label="Text" onChange={(checked) => toggleInput("text", checked)} />
            <Toggle checked={draft.input.includes("image")} label="Image" onChange={(checked) => toggleInput("image", checked)} />
          </div>
        </div>
        <div className="ms-chat-form__group">
          <div className="ms-chat-label">Reasoning</div>
          <Toggle
            checked={draft.reasoning}
            label="Supports reasoning"
            onChange={(reasoning) =>
              onChange({
                ...draft,
                reasoning,
                thinkingLevels: reasoning ? draft.thinkingLevels : [],
              })
            }
          />
        </div>
      </div>
      <div className="ms-chat-form__group">
        <div className="ms-chat-label">Thinking levels</div>
        <div className="ms-chat-form__options-wrap">
          {thinkingLevels.map((level) => (
            <Toggle
              key={level}
              checked={draft.thinkingLevels.includes(level)}
              disabled={!draft.reasoning}
              label={level}
              onChange={(checked) => toggleThinking(level, checked)}
            />
          ))}
        </div>
      </div>
      <div className="ms-chat-form__grid-three">
        <label className="ms-chat-form__field">
          <span className="ms-chat-label">Context window</span>
          <Input
            type="number"
            min={1}
            value={draft.contextWindow}
            placeholder="Optional"
            onChange={(event) => onChange({ ...draft, contextWindow: event.target.value })}
          />
        </label>
        <label className="ms-chat-form__field">
          <span className="ms-chat-label">Max output tokens</span>
          <Input
            type="number"
            min={1}
            value={draft.maxTokens}
            placeholder="Optional"
            onChange={(event) => onChange({ ...draft, maxTokens: event.target.value })}
          />
        </label>
        <label className="ms-chat-form__field">
          <span className="ms-chat-label">Position</span>
          <Input
            type="number"
            min={0}
            value={draft.position}
            onChange={(event) => onChange({ ...draft, position: event.target.value })}
          />
        </label>
      </div>
      <label className="ms-chat-form__field ms-chat-form__field--block">
        <span className="ms-chat-label">Metadata (optional JSON object)</span>
        <Textarea
          className="ms-chat-form__code-input"
          value={draft.metadata}
          spellCheck={false}
          onChange={(event) => onChange({ ...draft, metadata: event.target.value })}
        />
      </label>
      <label className="ms-chat-form__toggle">
        <input
          type={defaultMode}
          name={defaultMode === "radio" ? "custom-provider-default-model" : undefined}
          checked={draft.isDefault}
          disabled={defaultLocked}
          onChange={(event) => onChange({ ...draft, isDefault: event.target.checked })}
        />
        <span>{draft.isDefault ? "Default model" : "Make this the default model"}</span>
      </label>
    </div>
  );
}

function ProviderEditor({
  draft,
  error,
  existingProvider,
  isPending,
  isTesting,
  onChange,
  onClose,
  onSubmit,
  onTestModel,
}: {
  draft: ProviderDraft;
  error: string | null;
  existingProvider: CustomModelProvider | null;
  isPending: boolean;
  isTesting: boolean;
  onChange: (draft: ProviderDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onTestModel: (target: CustomModelTestChatTarget) => void;
}) {
  const [jsonError, setJsonError] = useState<string | null>(null);
  const updateModel = (key: number, next: ModelDraft) => {
    onChange({
      ...draft,
      models: draft.models.map((model) => {
        if (model.key === key) return next;
        return next.isDefault ? { ...model, isDefault: false } : model;
      }),
    });
  };

  const switchToJson = () => {
    setJsonError(null);
    onChange({
      ...draft,
      modelEntryMode: "json",
      modelsJson: formatModelDraftsJson(draft.models),
    });
  };

  const parseJsonIntoForm = () => {
    try {
      const models = parseCustomModelProviderModelsJson(draft.modelsJson);
      setJsonError(null);
      onChange({
        ...draft,
        modelEntryMode: "form",
        modelsJson: formatCustomModelProviderModelsJson(models),
        models: models.map(modelInputToDraft),
      });
    } catch (caughtError) {
      setJsonError(
        caughtError instanceof Error ? caughtError.message : "Models JSON is invalid.",
      );
    }
  };

  const formatJson = () => {
    try {
      const models = parseCustomModelProviderModelsJson(draft.modelsJson);
      setJsonError(null);
      onChange({
        ...draft,
        modelsJson: formatCustomModelProviderModelsJson(models),
        models: models.map(modelInputToDraft),
      });
    } catch (caughtError) {
      setJsonError(
        caughtError instanceof Error ? caughtError.message : "Models JSON is invalid.",
      );
    }
  };

  return (
    <Dialog
      open
      // Both dialogs listen for Escape; while the test chat is open it must not close this form.
      onClose={isTesting ? ignoreClose : onClose}
      title={existingProvider ? `Edit ${existingProvider.displayName}` : "Add custom provider"}
      description={
        existingProvider
          ? "Update the Organization provider endpoint and authentication. Models are edited separately."
          : "Add an OpenAI-compatible endpoint and its real selectable model definitions."
      }
      className="ms-chat-custom-providers__editor"
    >
      <form className="ms-chat-custom-providers__editor-body" onSubmit={onSubmit}>
        <ProviderFields draft={draft} existingProvider={existingProvider} onChange={onChange} />

        {!existingProvider ? (
          <section className="ms-chat-custom-providers__models">
            <div className="ms-chat-custom-providers__models-header">
              <div>
                <div className="ms-chat-custom-providers__heading">Models</div>
                <div className="ms-chat-custom-providers__hint">
                  Define every capability the Agent runtime needs. Exactly one model must be the default.
                </div>
              </div>
              <div className="ms-chat-custom-providers__models-controls">
                <div className="ms-chat-custom-providers__mode-switch">
                  <Button
                    size="small"
                    variant={draft.modelEntryMode === "form" ? "secondary" : "ghost"}
                    aria-pressed={draft.modelEntryMode === "form"}
                    onClick={draft.modelEntryMode === "json" ? parseJsonIntoForm : undefined}
                  >
                    Form editor
                  </Button>
                  <Button
                    size="small"
                    variant={draft.modelEntryMode === "json" ? "secondary" : "ghost"}
                    aria-pressed={draft.modelEntryMode === "json"}
                    onClick={draft.modelEntryMode === "form" ? switchToJson : undefined}
                  >
                    <Braces className="ms-chat-icon-md" /> JSON
                  </Button>
                </div>
                {draft.modelEntryMode === "form" ? (
                  <Button
                    size="small"
                    variant="outline"
                    onClick={() =>
                      onChange({
                        ...draft,
                        models: [...draft.models, emptyModel(draft.models.length * 10)],
                      })
                    }
                  >
                    <Plus className="ms-chat-icon-md" />
                    Add model
                  </Button>
                ) : null}
              </div>
            </div>
            {draft.modelEntryMode === "json" ? (
              <div className="ms-chat-custom-providers__inset">
                <div className="ms-chat-custom-providers__json-help">
                  Paste a model array, or a catalog-style object with <code>default_model</code> and
                  <code> models</code>. Fields use the platform's names: <code>display_name</code>,
                  <code> thinking_levels</code>, <code>context_window</code>, and
                  <code> max_tokens</code>. When <code>default_model</code> is omitted, exactly one
                  row must set <code>is_default</code> to true.
                </div>
                <Textarea
                  aria-label="Models JSON"
                  className="ms-chat-custom-providers__json-input"
                  value={draft.modelsJson}
                  spellCheck={false}
                  onChange={(event) => {
                    setJsonError(null);
                    onChange({ ...draft, modelsJson: event.target.value });
                  }}
                />
                <div className="ms-chat-custom-providers__models-header">
                  <div className="ms-chat-custom-providers__hint">
                    JSON is validated locally before the atomic provider request is sent.
                  </div>
                  <Button size="small" variant="outline" onClick={formatJson}>
                    Format and validate JSON
                  </Button>
                </div>
                {jsonError ? (
                  <div className="ms-chat-custom-providers__error">
                    {jsonError}
                  </div>
                ) : null}
              </div>
            ) : (
              draft.models.map((model, index) => (
                <div key={model.key} className="ms-chat-custom-providers__model-draft">
                  <div className="ms-chat-custom-providers__model-draft-header">
                    <div className="ms-chat-custom-providers__heading">Model {index + 1}</div>
                    <div className="ms-chat-custom-providers__model-draft-actions">
                      <Button
                        size="small"
                        variant="ghost"
                        disabled={!draft.baseUrl.trim() || !model.model.trim()}
                        title="Chat with this model before creating the provider. Needs the base URL and upstream model ID."
                        onClick={() => onTestModel(draftModelTestTarget(draft, model))}
                      >
                        <MessageSquare className="ms-chat-icon-md" /> Test
                      </Button>
                      <Button
                        iconOnly
                        variant="ghost"
                        aria-label={`Remove model ${index + 1}`}
                        disabled={draft.models.length === 1}
                        onClick={() => {
                          const remaining = draft.models.filter((candidate) => candidate.key !== model.key);
                          if (model.isDefault && remaining[0]) remaining[0] = { ...remaining[0], isDefault: true };
                          onChange({ ...draft, models: remaining });
                        }}
                      >
                        <Trash2 className="ms-chat-icon-md" />
                      </Button>
                    </div>
                  </div>
                  <ModelFields
                    draft={model}
                    defaultMode="radio"
                    onChange={(next) => updateModel(model.key, next)}
                  />
                </div>
              ))
            )}
          </section>
        ) : null}

        {error ? (
          <div className="ms-chat-custom-providers__error">{error}</div>
        ) : null}
        <div className="ms-chat-custom-providers__actions">
          <Button variant="outline" disabled={isPending} onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="ms-chat-icon-md ms-chat-spin" /> : null}
            {existingProvider ? "Save provider" : "Create provider"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ModelEditor({
  draft,
  error,
  isPending,
  onChange,
  onClose,
  onSubmit,
  provider,
}: {
  draft: ModelDraft;
  error: string | null;
  isPending: boolean;
  onChange: (draft: ModelDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  provider: CustomModelProvider;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={draft.uid ? `Edit ${draft.displayName}` : `Add model to ${provider.displayName}`}
      description="This row is the exact model capability contract published to the Agent runtime."
      className="ms-chat-custom-providers__model-editor"
    >
      <form className="ms-chat-custom-providers__form" onSubmit={onSubmit}>
        <ModelFields
          draft={draft}
          defaultMode="checkbox"
          defaultLocked={Boolean(
            draft.uid && provider.models.some((model) => model.uid === draft.uid && model.isDefault),
          )}
          onChange={onChange}
        />
        {draft.uid && draft.isDefault ? (
          <div className="ms-chat-custom-providers__warning">
            To change the default, edit another model and make it the default.
          </div>
        ) : null}
        {error ? (
          <div className="ms-chat-custom-providers__error">{error}</div>
        ) : null}
        <div className="ms-chat-custom-providers__actions">
          <Button variant="outline" disabled={isPending} onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="ms-chat-icon-md ms-chat-spin" /> : null}
            {draft.uid ? "Save model" : "Add model"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CustomProviderCard({
  onAddModel,
  onDeleteModel,
  onDeleteProvider,
  onEditModel,
  onEditProvider,
  onTestModel,
  provider,
}: {
  onAddModel: () => void;
  onDeleteModel: (model: CustomModelProviderModel) => void;
  onDeleteProvider: () => void;
  onEditModel: (model: CustomModelProviderModel) => void;
  onEditProvider: () => void;
  onTestModel: (model: CustomModelProviderModel) => void;
  provider: CustomModelProvider;
}) {
  const [modelsOpen, setModelsOpen] = useState(true);

  return (
    <section className="ms-chat-providers__card">
      <div className="ms-chat-custom-providers__card-header">
        <div className="ms-chat-custom-providers__text">
          <div className="ms-chat-providers__card-title">{provider.displayName}</div>
          <div className="ms-chat-custom-providers__identifier">{provider.identifier}</div>
          <div className="ms-chat-custom-providers__base-url">{provider.baseUrl}</div>
          <div className="ms-chat-providers__badges">
            <Badge variant="success">Organization provider</Badge>
            <Badge variant="neutral">Default: {provider.defaultModel}</Badge>
            <Badge variant="neutral">API key: {provider.auth.hasApiKey ? "Configured" : "None"}</Badge>
            <Badge variant="neutral">Headers: {provider.auth.headerNames.length}</Badge>
          </div>
        </div>
        <div className="ms-chat-custom-providers__card-actions">
          <Button size="small" variant="outline" onClick={onEditProvider}>
            <Pencil className="ms-chat-icon-md" /> Edit
          </Button>
          <Button size="small" variant="danger" onClick={onDeleteProvider}>
            <Trash2 className="ms-chat-icon-md" /> Delete
          </Button>
        </div>
      </div>

      {provider.auth.headerNames.length > 0 ? (
        <div className="ms-chat-custom-providers__headers">
          Stored header names: {provider.auth.headerNames.join(", ")}. Values remain hidden.
        </div>
      ) : null}

      <div className="ms-chat-providers__models">
        <button
          type="button"
          className="ms-chat-providers__models-toggle"
          onClick={() => setModelsOpen((current) => !current)}
        >
          <span>Models <span className="ms-chat-providers__count">({provider.models.length})</span></span>
          <ChevronDown className={cx("ms-chat-custom-providers__chevron", modelsOpen && "ms-chat-custom-providers__chevron--open")} />
        </button>
        {modelsOpen ? (
          <div className="ms-chat-providers__model-list">
            {provider.models.map((model) => (
              <div key={model.uid} className="ms-chat-custom-providers__model-row">
                <div className="ms-chat-custom-providers__text">
                  <div className="ms-chat-custom-providers__model-name">
                    <span>{model.displayName}</span>
                    {model.isDefault ? <Badge variant="success">Default</Badge> : null}
                    <Badge variant="neutral">{model.api}</Badge>
                  </div>
                  <div className="ms-chat-custom-providers__model-id">{model.model}</div>
                  <div className="ms-chat-custom-providers__model-meta">
                    Input: {model.input.join(", ")} · Reasoning: {model.reasoning ? model.thinkingLevels.join(", ") || "supported" : "off"}
                    {model.contextWindow ? ` · Context: ${model.contextWindow.toLocaleString()}` : ""}
                    {model.maxTokens ? ` · Max output: ${model.maxTokens.toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="ms-chat-custom-providers__card-actions">
                  <Button size="small" variant="ghost" onClick={() => onTestModel(model)}>
                    <MessageSquare className="ms-chat-icon-md" /> Test
                  </Button>
                  <Button size="small" variant="ghost" onClick={() => onEditModel(model)}>
                    <Pencil className="ms-chat-icon-md" /> Edit
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={model.isDefault || provider.models.length === 1}
                    title={model.isDefault ? "Select another default model before deleting this one." : undefined}
                    onClick={() => onDeleteModel(model)}
                  >
                    <Trash2 className="ms-chat-icon-md" /> Delete
                  </Button>
                </div>
              </div>
            ))}
            <Button size="small" variant="outline" onClick={onAddModel}>
              <Plus className="ms-chat-icon-md" /> Add model
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function successTitle(action: MutationAction) {
  switch (action.kind) {
    case "create-provider":
      return "Custom provider created";
    case "update-provider":
      return "Custom provider updated";
    case "delete-provider":
      return "Custom provider deleted";
    case "create-model":
      return "Model added";
    case "update-model":
      return "Model updated";
    case "delete-model":
      return "Model deleted";
  }
}

function performMutation(action: MutationAction, requestOptions: CustomModelProviderRequestOptions) {
  switch (action.kind) {
    case "create-provider":
      return createCustomModelProvider(action.input, requestOptions);
    case "update-provider":
      return updateCustomModelProvider(action.providerUid, action.input, requestOptions);
    case "delete-provider":
      return deleteCustomModelProvider(action.providerUid, requestOptions);
    case "create-model":
      return createCustomModelProviderModel(action.providerUid, action.input, requestOptions);
    case "update-model":
      return updateCustomModelProviderModel(action.providerUid, action.modelUid, action.input, requestOptions);
    case "delete-model":
      return deleteCustomModelProviderModel(action.providerUid, action.modelUid, requestOptions);
  }
}

// The Organization's custom providers. A failed read is tried once more after a second.
function useCustomModelProviders(requestOptions: CustomModelProviderRequestOptions, enabled: boolean) {
  const [state, setState] = useState<{
    data: CustomModelProvider[] | undefined;
    error: Error | null;
    isLoading: boolean;
  }>({ data: undefined, error: null, isLoading: enabled });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) {
        return;
      }

      setState((current) => ({ ...current, error: null, isLoading: current.data === undefined }));
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        if (signal?.aborted) {
          return;
        }
        try {
          const data = await fetchCustomModelProviders({ ...requestOptions, signal });
          if (!signal?.aborted) {
            setState({ data, error: null, isLoading: false });
          }
          return;
        } catch (error) {
          if (signal?.aborted) {
            return;
          }
          lastError = error;
        }
      }

      setState((current) => ({
        data: current.data,
        error: lastError instanceof Error ? lastError : new Error("Unable to load custom providers."),
        isLoading: false,
      }));
    },
    [enabled, requestOptions],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  return { ...state, isError: Boolean(state.error), reload: load };
}

export interface CustomModelProviderSettingsProps {
  auth: ChatAuth;
  connection: ChatBackendConnection;
  notify?: ChatNotify;
}

/**
 * The Organization's custom providers: create a provider with its models in one request, edit its
 * endpoint and authentication, edit its models, test a model in a direct conversation, and delete
 * providers and models. Stored secrets never come back to the browser.
 */
export function CustomModelProviderSettings({ auth, connection, notify }: CustomModelProviderSettingsProps) {
  const sessionToken = auth.token;
  const sessionTokenType = auth.tokenType ?? "Bearer";
  const sessionUserUid = auth.userUid;
  const [providerEditor, setProviderEditor] = useState<{ provider: CustomModelProvider | null; draft: ProviderDraft } | null>(null);
  const [modelEditor, setModelEditor] = useState<{ provider: CustomModelProvider; draft: ModelDraft } | null>(null);
  const [providerPendingDelete, setProviderPendingDelete] = useState<CustomModelProvider | null>(null);
  const [modelPendingDelete, setModelPendingDelete] = useState<{ provider: CustomModelProvider; model: CustomModelProviderModel } | null>(null);
  const [testTarget, setTestTarget] = useState<CustomModelTestChatTarget | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [mutationFailed, setMutationFailed] = useState(false);

  const requestOptions = useMemo(
    () => ({
      connection,
      createdByUserUid: sessionUserUid,
      token: sessionToken,
      tokenType: sessionTokenType,
    }),
    [connection, sessionToken, sessionTokenType, sessionUserUid],
  );

  const providersQuery = useCustomModelProviders(requestOptions, Boolean(sessionUserUid));

  const refreshAllProviderData = async () => {
    // The chat's model pickers and the built-in provider list read the catalog again too.
    invalidateModelProviderCatalog();
    await providersQuery.reload();
  };

  // Every change goes through here: it runs, reloads the providers, closes the editors, and tells
  // the person. On failure the editor stays open with the error.
  const mutateAsync = async (action: MutationAction) => {
    setIsPending(true);
    setMutationFailed(false);
    try {
      const result = await performMutation(action, requestOptions);
      await refreshAllProviderData();
      setFormError(null);
      setProviderEditor(null);
      setModelEditor(null);
      setProviderPendingDelete(null);
      setModelPendingDelete(null);
      notify?.({ title: successTitle(action), variant: "success" });
      return result;
    } catch (error) {
      setMutationFailed(true);
      setFormError(error instanceof Error ? error.message : "The custom provider operation failed.");
      throw error;
    } finally {
      setIsPending(false);
    }
  };

  const mutate = (action: MutationAction) => {
    void mutateAsync(action).catch(() => undefined);
  };

  const resetMutation = () => {
    setMutationFailed(false);
  };

  const openCreateProvider = () => {
    resetMutation();
    setFormError(null);
    setProviderEditor({ provider: null, draft: createProviderDraft() });
  };

  const submitProvider = (event: FormEvent) => {
    event.preventDefault();
    if (!providerEditor) return;
    try {
      const { draft, provider } = providerEditor;
      if (!draft.identifier.trim() || !draft.displayName.trim() || !draft.baseUrl.trim()) {
        throw new Error("Provider identifier, display name, and base URL are required.");
      }
      const baseInput = {
        identifier: draft.identifier.trim(),
        displayName: draft.displayName.trim(),
        baseUrl: draft.baseUrl.trim(),
      };

      if (!provider) {
        const models =
          draft.modelEntryMode === "json"
            ? parseCustomModelProviderModelsJson(draft.modelsJson)
            : draft.models.map(parseModelDraft);
        if (models.filter((model) => model.isDefault).length !== 1) {
          throw new Error("Exactly one model must be the default.");
        }
        const input: CreateCustomModelProviderInput = { ...baseInput, models };
        if (draft.apiKey) input.apiKey = draft.apiKey;
        const headers = parseHeaders(draft.headers);
        if (headers.length > 0) input.headers = headers;
        setFormError(null);
        mutate({ kind: "create-provider", input });
        return;
      }

      const input: UpdateCustomModelProviderInput = { ...baseInput };
      if (draft.apiKeyMode === "clear") input.apiKey = null;
      if (draft.apiKeyMode === "replace") {
        if (!draft.apiKey) throw new Error("Enter the replacement API key.");
        input.apiKey = draft.apiKey;
      }
      if (draft.headerMode === "clear") input.headers = [];
      if (draft.headerMode === "replace") input.headers = parseHeaders(draft.headers);
      setFormError(null);
      mutate({ kind: "update-provider", providerUid: provider.uid, input });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Provider configuration is invalid.");
    }
  };

  const submitModel = (event: FormEvent) => {
    event.preventDefault();
    if (!modelEditor) return;
    try {
      const input = parseModelDraft(modelEditor.draft);
      setFormError(null);
      if (modelEditor.draft.uid) {
        mutate({
          kind: "update-model",
          providerUid: modelEditor.provider.uid,
          modelUid: modelEditor.draft.uid,
          input,
        });
      } else {
        mutate({ kind: "create-model", providerUid: modelEditor.provider.uid, input });
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Model configuration is invalid.");
    }
  };

  return (
    <section className="ms-chat-custom-providers__stack">
      <div className="ms-chat-custom-providers__intro">
        <div>
          <div className="ms-chat-custom-providers__heading">Organization custom providers</div>
          <div className="ms-chat-custom-providers__lead">
            Add OpenAI-compatible endpoints for this Organization. Their models join the platform's model catalog, which Agents and every model picker use.
          </div>
        </div>
        <Button variant="primary" onClick={openCreateProvider} disabled={!sessionUserUid}>
          <Plus className="ms-chat-icon-md" /> Add custom provider
        </Button>
      </div>

      {providersQuery.isLoading ? (
        <div className="ms-chat-custom-providers__loading">
          <Loader2 className="ms-chat-icon-md ms-chat-spin" /> Loading custom providers
        </div>
      ) : null}
      {providersQuery.isError ? (
        <div className="ms-chat-custom-providers__load-error">
          {providersQuery.error instanceof Error ? providersQuery.error.message : "Unable to load custom providers."}
        </div>
      ) : null}
      {!providersQuery.isLoading && !providersQuery.isError && providersQuery.data?.length === 0 ? (
        <div className="ms-chat-custom-providers__empty">
          No custom providers yet. Add one to publish its models to the Organization catalog.
        </div>
      ) : null}
      <div className="ms-chat-custom-providers__stack">
        {(providersQuery.data ?? []).map((provider) => (
          <CustomProviderCard
            key={provider.uid}
            provider={provider}
            onEditProvider={() => {
              resetMutation();
              setFormError(null);
              setProviderEditor({ provider, draft: createProviderDraft(provider) });
            }}
            onDeleteProvider={() => {
              resetMutation();
              setFormError(null);
              setProviderPendingDelete(provider);
            }}
            onAddModel={() => {
              resetMutation();
              setFormError(null);
              setModelEditor({ provider, draft: emptyModel(provider.models.length * 10) });
            }}
            onEditModel={(model) => {
              resetMutation();
              setFormError(null);
              setModelEditor({ provider, draft: modelToDraft(model) });
            }}
            onDeleteModel={(model) => {
              resetMutation();
              setFormError(null);
              setModelPendingDelete({ provider, model });
            }}
            onTestModel={(model) => setTestTarget(storedModelTestTarget(provider, model))}
          />
        ))}
      </div>

      {providerEditor ? (
        <ProviderEditor
          draft={providerEditor.draft}
          existingProvider={providerEditor.provider}
          error={formError}
          isPending={isPending}
          isTesting={Boolean(testTarget)}
          onChange={(draft) => setProviderEditor({ ...providerEditor, draft })}
          onClose={() => { if (!isPending) setProviderEditor(null); }}
          onSubmit={submitProvider}
          onTestModel={setTestTarget}
        />
      ) : null}
      {modelEditor ? (
        <ModelEditor
          draft={modelEditor.draft}
          provider={modelEditor.provider}
          error={formError}
          isPending={isPending}
          onChange={(draft) => setModelEditor({ ...modelEditor, draft })}
          onClose={() => { if (!isPending) setModelEditor(null); }}
          onSubmit={submitModel}
        />
      ) : null}
      {/* Kept outside the editor forms: React events bubble through portals, so a dialog nested in
          a form could reach that form's submit handler. */}
      {testTarget ? (
        <CustomModelTestChatDialog target={testTarget} onClose={() => setTestTarget(null)} />
      ) : null}

      <ConfirmationDialog
        open={Boolean(providerPendingDelete)}
        title="Delete custom provider"
        actionLabel="delete"
        objectLabel="custom provider"
        confirmWord="DELETE PROVIDER"
        confirmButtonLabel="Delete provider"
        tone="danger"
        description="This hard-deletes the Organization provider, all of its model rows, and its encrypted authentication configuration."
        specialText="Existing agent defaults or sessions that reference this provider will fail validation or execution until another model is selected. This action cannot be undone."
        objectSummary={providerPendingDelete ? `${providerPendingDelete.displayName} (${providerPendingDelete.identifier})` : null}
        error={providerPendingDelete && mutationFailed ? formError : undefined}
        isPending={isPending}
        onClose={() => { if (!isPending) setProviderPendingDelete(null); }}
        onConfirm={() => {
          if (!providerPendingDelete) return;
          return mutateAsync({ kind: "delete-provider", providerUid: providerPendingDelete.uid });
        }}
      />
      <ConfirmationDialog
        open={Boolean(modelPendingDelete)}
        title="Delete custom model"
        actionLabel="delete"
        objectLabel="custom model"
        confirmWord="DELETE MODEL"
        confirmButtonLabel="Delete model"
        tone="danger"
        description="This hard-deletes the model row and removes it from the standard Organization model catalog."
        specialText="Agent defaults or sessions that reference this model will require another model. This action cannot be undone."
        objectSummary={modelPendingDelete ? `${modelPendingDelete.model.displayName} (${modelPendingDelete.model.model})` : null}
        error={modelPendingDelete && mutationFailed ? formError : undefined}
        isPending={isPending}
        onClose={() => { if (!isPending) setModelPendingDelete(null); }}
        onConfirm={() => {
          if (!modelPendingDelete) return;
          return mutateAsync({
            kind: "delete-model",
            providerUid: modelPendingDelete.provider.uid,
            modelUid: modelPendingDelete.model.uid,
          });
        }}
      />
    </section>
  );
}
