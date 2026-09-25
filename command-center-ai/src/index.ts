// The package's public exports. Applications import the chat from here and nowhere else.

// The connection to the backend
export {
  buildPlatformApiUrl,
  createChatBackendConnection,
  resolvePlatformApiUrl,
  resolveRequestUrl,
  type ChatBackendConnection,
  type ChatBackendConnectionInput,
  type ChatBackendRequestTarget,
  type ChatBackendRequestUrlRewrite,
  type ChatPlatformRequestSender,
} from "./backend/connection.js";

// Agent sessions
export {
  AgentSessionModelRequiredError,
  archiveAgentSessionRequest,
  deleteAgentSessionRequest,
  fetchAgentSessionDetail,
  fetchArchivedAgentSessions,
  fetchLatestAgentSessions,
  getAgentSessionRecordAgentId,
  getAgentSessionRecordAgentLookupId,
  getAgentSessionRecordAgentName,
  getAgentSessionRecordHandleUniqueId,
  getAgentSessionRecordSessionId,
  getAgentSessionRecordSummary,
  getAgentSessionRecordTitle,
  getAgentSessionRecordUpdatedAt,
  getOrCreateAgentSessionRequest,
  isAgentSessionNotFoundError,
  normalizeAgentSessionLookupId,
  patchAgentSessionModelConfig,
  searchAgentSessions,
  startNewAgentSessionRequest,
  unarchiveAgentSessionRequest,
  type AgentSessionApiRecord,
  type AgentSessionSerializedRecord,
  type StartedAgentSessionResult,
} from "./backend/agent-sessions-api.js";
export { buildAgentSessionRequestBodyFragment } from "./backend/agent-session-request.js";
export { fetchSessionHistory } from "./backend/session-history-api.js";
export { type SessionHistorySnapshot } from "./backend/session-history.js";
export { fetchSessionInsights } from "./backend/session-insights-api.js";
export { type SessionInsightsSnapshot } from "./backend/session-insights.js";
export {
  buildMessageProvenanceMetadata,
  getMessageProvenanceFromMetadata,
  normalizeMessageProvenance,
  type MainSequenceAiMessageProvenance,
} from "./backend/message-provenance.js";

// Runtime access and readiness (ADR 093)
export { type AgentSessionRuntimeAccess } from "./backend/agent-session-runtime-access.js";
export {
  createErrorAgentSessionReadiness,
  createIdleAgentSessionReadiness,
  createLoadingAgentSessionReadiness,
  createReadyAgentSessionReadiness,
  type AgentSessionInteractionReadiness,
} from "./backend/agent-session-readiness.js";
export { buildClientCheckingRuntimeInteraction } from "./backend/agent-runtime-serving.js";
export {
  isRuntimeInteractionOverdue,
  isTransientRuntimeInteraction,
  requestThroughRuntimeWake,
  type AgentRuntimeInteraction,
  type AgentRuntimePresence,
} from "./backend/runtime-interaction.js";
export {
  clearMainSequenceAiResolvedRuntimeAccess,
  fetchMainSequenceAiAssistantResponse,
  fetchVerifiedAgentSessionRuntimeAccess,
  resolveMainSequenceAiAssistantAccess,
  type MainSequenceAiResolvedAssistantAccess,
} from "./backend/assistant-endpoint.js";
export { cancelChatSession, type CancelChatSessionRequest } from "./backend/session-cancel-api.js";

// Model providers
export {
  buildModelProviderCatalogQueryKey,
  fetchAvailableRunConfigOptions,
  fetchModelProviderCatalog,
  type AvailableChatModelOption,
  type AvailableChatProviderOption,
  type AvailableChatReasoningEffortOption,
  type AvailableChatRunConfigOptions,
  type ModelCatalogItem,
  type ModelProviderCatalog,
  type ModelProviderCatalogProvider,
} from "./backend/model-catalog-api.js";
export { normalizeRunConfigKey, resolveRunConfigSelection } from "./backend/run-config-selection.js";
export {
  cancelModelProviderSignIn,
  fetchModelProviderSignInAttempt,
  ModelProviderApiError,
  signOffModelProvider,
  startModelProviderSignIn,
  type ProviderSignInStartResult,
  type SignInAttempt,
} from "./backend/model-provider-auth-api.js";
export {
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
  type CustomModelThinkingLevel,
  type UpdateCustomModelProviderInput,
} from "./backend/custom-model-provider-api.js";
export {
  formatCustomModelProviderModelsJson,
  parseCustomModelProviderModelsJson,
} from "./backend/custom-model-provider-model-json.js";
export {
  buildCustomModelDirectChatUrl,
  CustomModelDirectChatError,
  getCustomModelDirectChatBlockReason,
  streamCustomModelDirectChat,
  type CustomModelDirectChatErrorStage,
  type CustomModelDirectChatMessage,
  type CustomModelDirectChatResult,
} from "./backend/custom-model-direct-chat.js";

// Agent icons (ADR 090)
export {
  fetchCommandCenterAgentIconBytes,
  fetchCommandCenterAgentIcons,
  type CommandCenterAgentIcon,
  type CommandCenterAgentIconBytes,
} from "./backend/command-center-agent-icons-api.js";

// Tool activity and errors
export {
  describeToolActivity,
  describeToolStatus,
  summarizeToolActivities,
  type ToolActivity,
} from "./backend/tool-activity.js";
export {
  MainSequenceAiError,
  toMainSequenceAiError,
  withMainSequenceAiErrorSource,
} from "./backend/error-source.js";
export { buildRuntimeHttpErrorMessage, readRuntimeBackendErrorMessage } from "./backend/http-error.js";

// The session engine (ADR 096, step 3)
export {
  ChatEngineProvider,
  useChatEngine,
  useChatRunStatus,
  useOptionalChatEngine,
  type ChatEngineProviderProps,
  type ChatEngineValue,
  type ChatRunStatus,
  type ChatRunStatusValue,
} from "./engine/ChatEngineProvider.js";
export {
  type ChatAuth,
  type ChatDefaultSession,
  type ChatLaunchTarget,
  type ChatNotice,
  type ChatNoticeVariant,
  type ChatNotify,
  type DefaultSessionStatus,
} from "./engine/types.js";
export { invalidateModelProviderCatalog, useRunConfigOptions } from "./engine/run-config-options.js";
export {
  describeMessageQueueCount,
  describeMessageQueueHold,
  getMessageQueueHold,
  type MessageQueue,
  type QueuedMessage,
} from "./engine/message-queue.js";
export {
  DEFAULT_SESSION_ORIGIN,
  toAgentSessionRecordFromApi,
  type AgentSessionAgent,
  type AgentSessionAgentSource,
  type AgentSessionRecord,
  type AgentSessionSummary,
} from "./engine/agent-sessions.js";
export { pickDefaultSessionModel } from "./engine/session-model-default.js";
export {
  SESSION_MODEL_NEEDED_MESSAGE,
  type SessionModelChoice,
  type SessionModelSelectionRequest,
} from "./engine/session-model-fallback.js";
export {
  buildThreadParticipantsKey,
  findThreadTargetAgentUid,
  getActorInitials,
  getSessionAgentActor,
  parseThreadParticipantsKey,
  resolveMessageActor,
  type MessageActor,
  type MessageActorContext,
  type ThreadParticipants,
} from "./engine/message-actors.js";
export { clearAgentIconCache } from "./engine/agent-icon-cache.js";
export {
  AgentIconAuthContext,
  AgentIconsContext,
  AgentIconsProvider,
  useAgentIconAuth,
  useAgentIconLookup,
  useAgentIconObjectUrl,
  type AgentIconAuth,
  type AgentIconLookup,
} from "./engine/agent-icons-context.js";

// The chat UI (ADR 096, step 4). Its stylesheet is `@dev-mainsequence/command-center-ai/styles.css`.
export { ChatThread, type ChatThreadProps } from "./ui/ChatThread.js";
export {
  DEFAULT_CHAT_THREAD_COPY,
  resolveChatThreadCopy,
  type ChatThreadCopy,
  type ChatViewer,
} from "./ui/chat-ui-context.js";
export {
  AgentConnectingState,
  type AgentConnectionStep,
} from "./ui/AgentConnectingState.js";
export { AgentIcon } from "./ui/AgentIcon.js";

// Model provider settings (ADR 096, step 5)
export {
  ModelProviderSettings,
  type ModelProviderSettingsProps,
} from "./model-providers/ModelProviderSettings.js";
export { useModelProviderCatalog } from "./engine/run-config-options.js";

// Session detail
export {
  useAgentSessionDetail,
  type AgentSessionDetailControllerState,
  type UseAgentSessionDetailOptions,
} from "./session-detail/useAgentSessionDetail.js";
export { type AgentSessionDetailSnapshot } from "./session-detail/model.js";
