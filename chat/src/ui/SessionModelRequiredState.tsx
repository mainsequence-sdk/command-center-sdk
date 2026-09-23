import { Bot } from "lucide-react";
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import { useEffect, useMemo, useState } from "react";

import { resolveRunConfigSelection } from "../backend/run-config-selection.js";
import { useChatEngine } from "../engine/ChatEngineProvider.js";
import { pickDefaultSessionModel } from "../engine/session-model-default.js";
import { AgentIcon } from "./AgentIcon.js";
import { useChatUi } from "./chat-ui-context.js";
import { ChatRunConfigRow } from "./ChatRunConfigRow.js";

/**
 * Shown in place of the thread when a session cannot start because the Agent
 * has no default model. What is missing is the session's own model settings
 * (provider, model, thinking), not the person's model provider settings: those
 * live in Settings and are only mentioned here when no model can run at all.
 *
 * The person sets them with the chat's provider, model and thinking picker,
 * resolved by the same run-config selection the session model editor and the
 * handle dialog use, and the session is created with exactly that choice, so
 * the picker and the session agree from the first message.
 *
 * The choice is local to this state: it never touches the model settings of a
 * session that is already open.
 */
export function SessionModelRequiredState() {
  const {
    availableModels,
    availableModelsError,
    availableProviders,
    cancelSessionModelSelection,
    isLoadingAvailableModels,
    requestAvailableModels,
    resolveSessionModelSelection,
    sessionModelLastUsed,
    sessionModelSelectionRequest,
  } = useChatEngine();
  const { onOpenModelProviderSettings } = useChatUi();
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [selectedThinking, setSelectedThinking] = useState<string>("");
  const requestId = sessionModelSelectionRequest?.id ?? null;

  useEffect(() => {
    if (requestId !== null && availableModels.length === 0 && !isLoadingAvailableModels) {
      requestAvailableModels();
    }
    // Ask once per request; the catalog query owns retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    setSelectedProvider("");
    setSelectedModelId("");
    setSelectedThinking("");
  }, [requestId]);

  // Where the picker starts: the model settings of the most recent session when they can
  // still run, otherwise the first usable model.
  const seed = useMemo(
    () => pickDefaultSessionModel({ lastUsed: sessionModelLastUsed, models: availableModels, providers: availableProviders }),
    [availableModels, availableProviders, sessionModelLastUsed],
  );
  const selection = useMemo(
    () =>
      resolveRunConfigSelection({
        availableModels: [...availableModels],
        availableProviders: [...availableProviders],
        currentModel: seed?.value ?? null,
        currentProvider: seed?.provider ?? null,
        currentThinking: null,
        selectedModelId,
        selectedProvider,
        selectedThinking: null,
      }),
    [availableModels, availableProviders, seed, selectedModelId, selectedProvider],
  );
  const selectedModel = selection.selectedCatalogModel;
  const reasoningEffortOptions = selectedModel?.reasoningEfforts ?? [];
  const thinking = reasoningEffortOptions.some((option) => option.value === selectedThinking)
    ? selectedThinking
    : (selectedModel?.defaultReasoningEffort ?? reasoningEffortOptions[0]?.value ?? "");
  const canStart = Boolean(selectedModel && selectedModel.selectable !== false && selection.resolvedProvider && selection.resolvedModel);
  const hasModels = availableModels.length > 0;
  const catalogError = !isLoadingAvailableModels && !hasModels && Boolean(availableModelsError?.trim());
  const emptyCatalog = !isLoadingAvailableModels && !hasModels && !catalogError;

  if (!sessionModelSelectionRequest) {
    return null;
  }

  const agentLabel = sessionModelSelectionRequest.agentLabel?.trim() || "this agent";

  return (
    <div
      className="ms-chat-model-required"
      data-session-model-required
    >
      <div className="ms-chat-state__badge">
        <AgentIcon agentUid={sessionModelSelectionRequest.agentUid} className="ms-chat-icon-xl" fallback={<Bot className="ms-chat-icon-xl" />} />
      </div>
      <div className="ms-chat-state__title">Choose a model for {agentLabel}</div>
      <p className="ms-chat-model-required__description">
        {agentLabel.charAt(0).toUpperCase()}
        {agentLabel.slice(1)} has no default model. Set this session's provider, model and thinking.
      </p>

      {isLoadingAvailableModels && !hasModels ? (
        <p className="ms-chat-model-required__status" data-session-model-state="loading">
          Loading your models…
        </p>
      ) : catalogError ? (
        <div className="ms-chat-model-required__error" data-session-model-state="error">
          <span>{availableModelsError}</span>
          <Button onClick={requestAvailableModels} size="small">
            Retry
          </Button>
        </div>
      ) : emptyCatalog ? (
        <div className="ms-chat-model-required__empty" data-session-model-state="empty">
          <span>No model can run yet. Providers are connected in Model Providers.</span>
          {onOpenModelProviderSettings ? (
            <Button onClick={onOpenModelProviderSettings} size="small">
              Open model providers
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className="ms-chat-model-required__picker"
          data-session-model-state="ready"
        >
          <ChatRunConfigRow
            provider={selection.effectiveProvider}
            providerOptions={selection.providerOptions}
            onProviderChange={(nextProvider) => {
              // A provider change picks that provider's first model that can run, like the composer.
              const first =
                availableModels.find((model) => model.provider === nextProvider && model.selectable) ??
                availableModels.find((model) => model.provider === nextProvider) ??
                null;
              setSelectedProvider(nextProvider);
              setSelectedModelId(first?.id ?? "");
              setSelectedThinking("");
            }}
            model={selection.effectiveModelId}
            modelOptions={selection.modelOptions}
            onModelChange={(nextModelId) => {
              setSelectedModelId(nextModelId);
              setSelectedThinking("");
            }}
            reasoningEffort={thinking}
            reasoningEffortOptions={reasoningEffortOptions}
            onReasoningEffortChange={setSelectedThinking}
            listboxPlacement="bottom"
          />
        </div>
      )}

      <div className="ms-chat-model-required__actions">
        <Button
          variant="primary"
          disabled={!canStart}
          data-session-model-start
          onClick={() => {
            if (canStart) {
              resolveSessionModelSelection({
                provider: selection.resolvedProvider,
                model: selection.resolvedModel,
                thinking: thinking || null,
              });
            }
          }}
        >
          Start session
        </Button>
        <button
          type="button"
          className="ms-chat-model-required__cancel"
          data-session-model-cancel
          onClick={cancelSessionModelSelection}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
