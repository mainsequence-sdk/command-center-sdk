import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  ChainOfThoughtPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useThreadViewport,
  useComposerRuntime,
  useMessagePartText,
  type ReasoningMessagePartProps,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { useAuiState } from "@assistant-ui/store";
import type { MessageState } from "@assistant-ui/core";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  ChevronDown,
  Ellipsis,
  GripVertical,
  ListPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";

import { Badge, Button } from "@dev-mainsequence/command-center-sdk/controls";

import {
  isRuntimeInteractionOverdue,
  isTransientRuntimeInteraction,
} from "../backend/runtime-interaction.js";
import {
  describeToolActivity,
  describeToolStatus,
  summarizeToolActivities,
  type ToolActivity,
} from "../backend/tool-activity.js";
import { useChatEngine } from "../engine/ChatEngineProvider.js";
import {
  buildThreadParticipantsKey,
  findThreadTargetAgentUid,
  getActorInitials,
  getSessionAgentActor,
  parseThreadParticipantsKey,
  resolveMessageActor,
  type MessageActor,
  type MessageActorContext,
  type ThreadParticipants,
} from "../engine/message-actors.js";
import {
  describeMessageQueueCount,
  describeMessageQueueHold,
  getMessageQueueHold,
} from "../engine/message-queue.js";
import {
  ChatUiProvider,
  resolveChatThreadCopy,
  useChatUi,
  type ChatThreadCopy,
  type ChatViewer,
} from "./chat-ui-context.js";
import { ChatRunConfigRow } from "./ChatRunConfigRow.js";
import { cx } from "./class-names.js";
import { MarkdownContent } from "./MarkdownContent.js";
import { SessionModelRequiredState } from "./SessionModelRequiredState.js";
import {
  AgentConnectingState,
  AgentRuntimeStatusLines,
  useAgentConnectingState,
  type AgentRuntimeStatus,
} from "./AgentConnectingState.js";
import { AgentIcon } from "./AgentIcon.js";
import {
  AssistantErrorRetry,
  AssistantMessageActions,
  MessageActionsProvider,
  UserMessageActions,
  type MessageActionsValue,
} from "./MessageActions.js";

export interface ChatThreadProps {
  compact?: boolean;
  /** `page` is a full-width column; `overlay` is a narrow rail. */
  surface?: "overlay" | "page";
  /** The words the thread shows; each has a neutral default. */
  copy?: Partial<ChatThreadCopy>;
  /** The signed-in person, drawn on their own messages. */
  viewer?: ChatViewer | null;
  /** Opens the application's model provider settings; the button hides without it. */
  onOpenModelProviderSettings?: () => void;
}

type ComposerModelOption = string;
type ComposerReasoningEffort = string;


function formatModelsUnavailableMessage(error: string | null) {
  const normalized = error?.trim();
  const fallback =
    "Chat runtime available-models request failed. The assistant cannot accept a message until sendable models are loaded.";

  if (!normalized) {
    return fallback;
  }

  if (
    normalized === "Failed to fetch" ||
    normalized.includes("Failed to fetch") ||
    normalized.includes("ERR_ADDRESS_UNREACHABLE")
  ) {
    return `${fallback} The browser could not reach the assistant server.`;
  }

  if (
    normalized.startsWith("Source: ") ||
    normalized.includes("Available model catalog request failed") ||
    normalized.includes("Chat runtime available-models request failed") ||
    normalized.includes("Model provider catalog request failed")
  ) {
    return normalized;
  }

  return `Chat runtime available-models request failed. ${normalized}`;
}

function formatEmptyModelCatalogMessage() {
  return "The chat runtime did not return any sendable models. Open model providers to inspect catalog and credential state.";
}

function isGenericFetchFailure(message: string | null | undefined) {
  const normalized = message?.trim() ?? "";

  return (
    normalized === "Failed to fetch" ||
    normalized.includes("Failed to fetch") ||
    normalized.includes("ERR_ADDRESS_UNREACHABLE")
  );
}

function formatSessionUnavailableMessage(message: string | null | undefined, apiBaseUrl: string) {
  const normalized = message?.trim();

  if (!normalized) {
    return "This session failed to load.";
  }

  if (isGenericFetchFailure(normalized)) {
    return `Could not reach the platform API at ${apiBaseUrl}. Start the backend and try again.`;
  }

  return normalized;
}

function formatContextUsageNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat().format(value);
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function formatStructuredValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractToolTextContent(value: unknown) {
  if (!value || typeof value !== "object" || !("content" in value)) {
    return null;
  }

  const content = (value as Record<string, unknown>).content;
  if (!Array.isArray(content)) {
    return null;
  }

  const textParts = content
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      if (!("type" in entry) || entry.type !== "text") {
        return [];
      }

      if (!("text" in entry) || typeof entry.text !== "string") {
        return [];
      }

      return [entry.text];
    })
    .join("\n\n")
    .trim();

  return textParts || null;
}

function getToolResultDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const { content, ...rest } = value as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : null;
}

function TextPart() {
  return (
    <MessagePartPrimitive.Text className="ms-chat-text" />
  );
}

function getUserMessagePreview(text: string) {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length <= 2) {
    return text;
  }

  return paragraphs.slice(-2).join("\n\n");
}

function AssistantMarkdownTextPart() {
  const { text } = useMessagePartText();

  return (
    <MarkdownContent
      content={text}
      className="ms-chat-markdown--assistant"
    />
  );
}

function ReasoningPart(_props: ReasoningMessagePartProps) {
  return (
    <div className="ms-chat-reasoning">
      <MessagePartPrimitive.Text className="ms-chat-text" />
    </div>
  );
}

function trimThinkingPreview(value: string, maxLength = 84) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

type ChainOfThoughtPartLike =
  | { type: "reasoning"; text?: string }
  | {
      type: "tool-call";
      toolName?: string;
      result?: unknown;
      isError?: boolean;
      status?: { type?: string };
    };

function getToolActivities(parts: ReadonlyArray<ChainOfThoughtPartLike>): ToolActivity[] {
  const activities: ToolActivity[] = [];
  for (const part of parts) {
    if (part.type === "tool-call" && typeof part.toolName === "string" && part.toolName.trim()) {
      activities.push(describeToolActivity(part.toolName, part.result));
    }
  }
  return activities;
}

function getToolPhase(part: {
  result?: unknown;
  isError?: boolean;
  status?: { type?: string };
}): "running" | "done" | "failed" {
  if (part.isError) {
    return "failed";
  }
  if (part.status?.type === "running" || part.result === undefined) {
    return "running";
  }
  return "done";
}

function getThinkingPreview(parts: ReadonlyArray<ChainOfThoughtPartLike>) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];

    if (part.type === "reasoning") {
      const preview = trimThinkingPreview(part.text ?? "");
      if (preview) {
        return preview;
      }
    }

    if (part.type === "tool-call" && typeof part.toolName === "string" && part.toolName.trim()) {
      return trimThinkingPreview(
        describeToolStatus(describeToolActivity(part.toolName, part.result), getToolPhase(part)),
      );
    }
  }

  return "Working through intermediate steps";
}

function ToolFallbackPart({ argsText, isError, result, toolName }: ToolCallMessagePartProps) {
  const parsedArgs = argsText ? tryParseJson(argsText) : null;
  const formattedArgs = argsText ? formatStructuredValue(parsedArgs ?? argsText) : null;
  const resultText = extractToolTextContent(result);
  const resultDetails = getToolResultDetails(result);
  const formattedResultDetails =
    resultDetails !== null && resultDetails !== undefined
      ? formatStructuredValue(resultDetails)
      : null;
  const statusLabel = result === undefined ? "Running" : isError ? "Failed" : "Done";
  const statusVariant = result === undefined ? "neutral" : isError ? "danger" : "success";
  const activity = describeToolActivity(toolName, result);

  return (
    <div
      className="ms-chat-tool"
      data-tool-kind={activity.kind}
      data-tool-name={activity.toolName}
    >
      <div className="ms-chat-tool__header">
        <div className="ms-chat-tool__title">
          <Wrench className="ms-chat-icon-sm" />
          <span className="ms-chat-tool__name" title={activity.toolName}>
            {activity.displayName}
          </span>
          {activity.kind === "mcp" ? (
            <>
              <Badge variant="primary" data-tool-badge="mcp">
                MCP
              </Badge>
              <span className="ms-chat-tool__provider">{activity.providerLabel}</span>
            </>
          ) : null}
        </div>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      {formattedArgs ? (
        <div className="ms-chat-tool__section">
          <div className="ms-chat-tool__label">
            Input
          </div>
          <pre className="ms-chat-tool__code">
            <code>{formattedArgs}</code>
          </pre>
        </div>
      ) : null}

      {resultText ? (
        <div className="ms-chat-tool__section">
          <div className="ms-chat-tool__label">
            Output
          </div>
          <div
            className={cx("ms-chat-tool__output", isError && "ms-chat-tool__output--error")}
          >
            <MarkdownContent
              content={resultText}
              className="ms-chat-markdown--tool"
              openLinksInNewTab
            />
          </div>
        </div>
      ) : null}

      {formattedResultDetails ? (
        <div className="ms-chat-tool__section">
          <div className="ms-chat-tool__label">
            Details
          </div>
          <pre className="ms-chat-tool__code">
            <code>{formattedResultDetails}</code>
          </pre>
        </div>
      ) : null}
    </div>
  );
}

// Hoisted: an inline `Layout` closure would be a new component TYPE on every
// render, forcing React to unmount and remount every chain-of-thought part
// (reasoning boxes, tool cards) on each streaming delta — flicker, lost text
// selection, and re-fetched images while the accordion is expanded.
function ChainOfThoughtPartsLayout({ children }: { children?: ReactNode }) {
  return <div className="ms-chat-cot__parts">{children}</div>;
}

const CHAIN_OF_THOUGHT_PART_COMPONENTS = {
  Layout: ChainOfThoughtPartsLayout,
  Reasoning: ReasoningPart,
  tools: {
    Fallback: ToolFallbackPart,
  },
};

function ChainOfThoughtBlock() {
  const collapsed = useAuiState((s) => s.chainOfThought.collapsed);
  const parts = useAuiState((s) => s.chainOfThought.parts);
  const threadIsRunning = useAuiState((s) => s.thread.isRunning);
  const isLastAssistantMessage = useAuiState(
    (s) => s.message.index === s.thread.messages.length - 1,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const isActiveThinking = isLastAssistantMessage && threadIsRunning;
  const thinkingLabel = isActiveThinking ? "Thinking" : "Reasoning";
  const thinkingPreview = getThinkingPreview(parts);
  const toolActivities = getToolActivities(parts);
  const toolSummary = summarizeToolActivities(toolActivities);
  const usesMcp = toolActivities.some((activity) => activity.kind === "mcp");

  useEffect(() => {
    if (collapsed || typeof window === "undefined") {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: "nearest" });
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [collapsed]);

  return (
    <ChainOfThoughtPrimitive.Root
      ref={rootRef}
      className="ms-chat-cot"
    >
      <ChainOfThoughtPrimitive.AccordionTrigger
        aria-expanded={!collapsed}
        className="ms-chat-cot__trigger"
      >
        <div className="ms-chat-cot__summary">
          <div className="ms-chat-cot__label-row">
            <span className={cx("ms-chat-cot__label", isActiveThinking && "ms-chat-cot__label--active")}>
              {thinkingLabel}
            </span>
            {usesMcp ? (
              <Badge variant="primary" data-tool-badge="mcp">
                MCP
              </Badge>
            ) : null}
          </div>
          {collapsed ? (
            <div className="ms-chat-cot__preview">
              {thinkingPreview}
            </div>
          ) : null}
        </div>
        <div className="ms-chat-cot__meta">
          {toolSummary ? (
            <span className="ms-chat-cot__tools" data-tool-summary>
              {toolSummary}
            </span>
          ) : null}
          <ChevronDown className={cx("ms-chat-cot__chevron", !collapsed && "ms-chat-cot__chevron--open")} />
        </div>
      </ChainOfThoughtPrimitive.AccordionTrigger>
      {!collapsed ? (
        <div
          ref={contentRef}
          className="ms-chat-cot__content"
        >
          <ChainOfThoughtPrimitive.Parts components={CHAIN_OF_THOUGHT_PART_COMPONENTS} />
        </div>
      ) : null}
    </ChainOfThoughtPrimitive.Root>
  );
}

function formatMessageTimestamp(createdAt: Date | string | number | null | undefined) {
  if (!createdAt) {
    return null;
  }

  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) {
    return time;
  }

  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });

  return `${dateLabel}, ${time}`;
}

function MessageTimestamp({ className }: { className?: string }) {
  const createdAt = useAuiState((s) => s.message.createdAt);
  const label = formatMessageTimestamp(createdAt);

  if (!label) {
    return null;
  }

  return (
    <div
      className={cx("ms-chat-timestamp", className)}
    >
      {label}
    </div>
  );
}

type ActorAvatarVariant = "assistant" | "caller-agent" | "human";

function getActorAvatarVariant(actor: MessageActor, context: MessageActorContext): ActorAvatarVariant {
  if (actor.kind !== "agent") {
    return "human";
  }

  return actor.key === getSessionAgentActor(context).key ? "assistant" : "caller-agent";
}

/**
 * Avatar for whoever produced a message: the viewer's picture, initials for
 * other humans, a monogram for agents, with the icon fallbacks the thread
 * used before names were available.
 */
function ActorAvatar({
  actor,
  active = false,
  className,
  size = "md",
  variant,
}: {
  actor: MessageActor;
  active?: boolean;
  className?: string;
  size?: "md" | "sm";
  variant: ActorAvatarVariant;
}) {
  // Agents are drawn with the robot, always; monograms and pictures are for
  // people.
  const monogram =
    actor.kind !== "agent" && actor.initialsName ? getActorInitials(actor.initialsName) : "";

  return (
    <div
      className={cx(
        "ms-chat-avatar",
        size === "md" ? "ms-chat-avatar--md" : "ms-chat-avatar--sm",
        `ms-chat-avatar--${variant}`,
        active && "ms-chat-avatar--active",
        className,
      )}
      title={actor.name}
      aria-label={actor.name}
      data-actor-kind={actor.kind}
    >
      {actor.avatarUrl ? (
        <img src={actor.avatarUrl} alt="" className="ms-chat-avatar__image" />
      ) : monogram ? (
        <span
          className={cx(
            "ms-chat-avatar__monogram",
            size === "md" ? "ms-chat-avatar__monogram--md" : "ms-chat-avatar__monogram--sm",
            active && "ms-chat-pulse",
          )}
        >
          {monogram}
        </span>
      ) : actor.kind === "agent" ? (
        <AgentIcon
          agentUid={actor.uid}
          className={cx(size === "md" ? "ms-chat-icon-lg" : "ms-chat-icon-xs", active && "ms-chat-pulse")}
          fallback={
            <Bot
              className={cx(size === "md" ? "ms-chat-icon-md" : "ms-chat-icon-xs", active && "ms-chat-pulse")}
              data-actor-icon="robot"
            />
          }
        />
      ) : (
        <UserRound className={size === "md" ? "ms-chat-icon-md" : "ms-chat-icon-xs"} />
      )}
    </div>
  );
}

function ActorNameLabel({ actor, align }: { actor: MessageActor; align: "start" | "end" }) {
  return (
    <div
      className={cx(
        "ms-chat-actor-name",
        align === "end" ? "ms-chat-actor-name--end" : "ms-chat-actor-name--start",
      )}
      data-actor-name
    >
      {actor.name}
    </div>
  );
}

/**
 * The actor of the current message, selected as a string so the store
 * subscription compares by value; a fresh object per read would re-render
 * every message on every streaming delta.
 */
function useMessageActor(context: MessageActorContext) {
  const actorJson = useAuiState((s) => JSON.stringify(resolveMessageActor(s.message, context)));
  return useMemo(() => JSON.parse(actorJson) as MessageActor, [actorJson]);
}

/**
 * True when the previous message has the same role and the same actor, so the
 * avatar and name label collapse into a run the way multi-party chats read.
 */
function useContinuesActorRun(context: MessageActorContext) {
  return useAuiState((s) => {
    const index = s.message.index;
    if (index <= 0) {
      return false;
    }

    const previous = s.thread.messages[index - 1];
    if (!previous || previous.role !== s.message.role) {
      return false;
    }

    return (
      resolveMessageActor(previous, context).key === resolveMessageActor(s.message, context).key
    );
  });
}

function useMessageActorContext(): MessageActorContext {
  const { activeAgentLabel, activeAgentName, activeSessionSummary } = useChatEngine();
  const { viewer } = useChatUi();
  const viewerUid = viewer?.uid ?? null;
  const viewerName = viewer?.name ?? null;
  const viewerAvatarUrl = viewer?.avatarUrl ?? null;
  // The summary knows the agent's label but not its uid; the platform's history
  // stamps the uid on every message, so read it from the thread.
  const sessionAgentUid = useAuiState((s) => findThreadTargetAgentUid(s.thread.messages));
  // Every agent has a name. The session record carries it (the page header
  // shows the same one); the summary label and the resolved label are
  // fallbacks for sessions whose record has not loaded yet.
  const sessionAgentName =
    activeAgentName?.trim() ||
    activeSessionSummary?.displayLabel?.trim() ||
    activeAgentLabel?.trim() ||
    null;

  return useMemo(
    () => ({
      viewer: { uid: viewerUid, name: viewerName, avatarUrl: viewerAvatarUrl },
      sessionAgent: { uid: sessionAgentUid, name: sessionAgentName },
    }),
    [sessionAgentName, sessionAgentUid, viewerAvatarUrl, viewerName, viewerUid],
  );
}

function useThreadParticipants(context: MessageActorContext): ThreadParticipants {
  const participantsKey = useAuiState((s) =>
    buildThreadParticipantsKey(s.thread.messages, context),
  );
  return useMemo(() => parseThreadParticipantsKey(participantsKey), [participantsKey]);
}

function ThreadParticipantsStrip({
  context,
  participants,
}: {
  context: MessageActorContext;
  participants: ThreadParticipants;
}) {
  if (!participants.multiParty) {
    return null;
  }

  return (
    <div
      className="ms-chat-participants"
      aria-label="Participants"
      data-thread-participants
    >
      <span className="ms-chat-participants__label">
        Participants
      </span>
      {participants.actors.map((actor) => (
        <span
          key={actor.key}
          className="ms-chat-participants__chip"
        >
          <ActorAvatar
            actor={actor}
            size="sm"
            variant={getActorAvatarVariant(actor, context)}
          />
          <span className="ms-chat-participants__name">{actor.name}</span>
        </span>
      ))}
    </div>
  );
}

function UserMessageBubble({
  context,
  multiParty,
  preview = false,
}: {
  context: MessageActorContext;
  multiParty: boolean;
  preview?: boolean;
}) {
  const actor = useMessageActor(context);
  const continuesRun = useContinuesActorRun(context);
  const isAgentOrigin = actor.kind === "agent";
  // A one-to-one chat keeps its plain look: the viewer's bubbles carry no
  // avatar or label. Identity appears once a calling agent or another human
  // is in the thread, and collapses inside a run of the same actor.
  const showIdentity = multiParty || isAgentOrigin;
  const showAvatar = showIdentity && !continuesRun;
  const showLabel = multiParty && !continuesRun;

  return (
    <MessagePrimitive.Root className="ms-chat-message ms-chat-message--user" data-actor-key={actor.key}>
      <div className="ms-chat-message__row">
        {showAvatar ? (
          <ActorAvatar
            actor={actor}
            className="ms-chat-message__user-avatar"
            variant={getActorAvatarVariant(actor, context)}
          />
        ) : showIdentity ? (
          <div className="ms-chat-message__avatar-space" aria-hidden="true" />
        ) : null}
        <div className="ms-chat-message__column">
          {showLabel ? <ActorNameLabel actor={actor} align="end" /> : null}
          <div
            className={cx(
              "ms-chat-bubble",
              isAgentOrigin
                ? "ms-chat-bubble--agent"
                : actor.kind === "user"
                  ? "ms-chat-bubble--human"
                  : "ms-chat-bubble--viewer",
            )}
          >
            <MessagePrimitive.Parts components={{ Text: preview ? PageUserTextPart : TextPart }} />
          </div>
          <div className="ms-chat-message__meta ms-chat-message__meta--end">
            <UserMessageActions />
            <MessageTimestamp />
          </div>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * The page shows the tail of a long prompt so one message cannot take the
 * whole column — but the rest has to stay reachable, so the cut is a toggle
 * and not a silent truncation.
 */
function PageUserTextPart() {
  const { text } = useMessagePartText();
  const [expanded, setExpanded] = useState(false);
  const preview = getUserMessagePreview(text);
  const isTruncated = preview !== text;

  if (!isTruncated) {
    return (
      <div className="ms-chat-text">{text}</div>
    );
  }

  return (
    <div className="ms-chat-text-block">
      <div className="ms-chat-text-block__body">{expanded ? text : preview}</div>
      <button
        type="button"
        className="ms-chat-message__toggle"
        data-user-message-toggle={expanded ? "collapse" : "expand"}
        onClick={() => setExpanded((current) => !current)}
      >
        {expanded ? "Show less" : "Show full message"}
      </button>
    </div>
  );
}

function AssistantMessage({
  context,
  multiParty,
  surface = "overlay",
}: {
  context: MessageActorContext;
  multiParty: boolean;
  surface?: "overlay" | "page";
}) {
  const { activeSessionSummary } = useChatEngine();
  const actor = useMessageActor(context);
  const continuesRun = useContinuesActorRun(context);
  const showLabel = multiParty && !continuesRun;
  // Both surfaces show the work (reasoning and tool cards): the user must be
  // able to see which tools ran, and that an MCP tool was used, on the rail
  // as much as on the page. The accordion opens collapsed with a one-line
  // preview, so the rail stays compact.
  const showThinkingDetails = surface === "page" || surface === "overlay";
  const threadIsRunning = useAuiState((s) => s.thread.isRunning);
  const isLastAssistantMessage = useAuiState(
    (s) => s.message.index === s.thread.messages.length - 1,
  );
  const hasRenderableContent = useAuiState((s) =>
    s.message.parts.some((part: { type: string; text?: string }) => {
      if (part.type === "text" || part.type === "reasoning") {
        return typeof part.text === "string" && part.text.trim().length > 0;
      }

      return true;
    }),
  );
  const isPendingAssistant =
    isLastAssistantMessage &&
    !hasRenderableContent &&
    (threadIsRunning || Boolean(activeSessionSummary?.working));
  const isActiveAssistant =
    isLastAssistantMessage &&
    (threadIsRunning || Boolean(activeSessionSummary?.working));

  return (
    <MessagePrimitive.Root
      className="ms-chat-message ms-chat-message--assistant"
      data-actor-key={actor.key}
    >
      <ActorAvatar
        actor={actor}
        active={isActiveAssistant}
        className="ms-chat-message__assistant-avatar"
        variant={getActorAvatarVariant(actor, context)}
      />
      <div className="ms-chat-message__content">
        {showLabel ? <ActorNameLabel actor={actor} align="start" /> : null}
        <MessagePrimitive.Parts
          components={
            showThinkingDetails
              ? { ChainOfThought: ChainOfThoughtBlock, Text: AssistantMarkdownTextPart }
              : { Text: AssistantMarkdownTextPart }
          }
        />
        <MessagePrimitive.Error>
          <div className="ms-chat-message__error">
            <ErrorPrimitive.Root>
              <ErrorPrimitive.Message />
            </ErrorPrimitive.Root>
            <AssistantErrorRetry />
          </div>
        </MessagePrimitive.Error>
        {hasRenderableContent ? (
          <div className="ms-chat-message__meta">
            <AssistantMessageActions />
            <MessageTimestamp />
          </div>
        ) : null}
      </div>
    </MessagePrimitive.Root>
  );
}

function EmptyState({
  compact = false,
  surface = "overlay",
}: {
  compact?: boolean;
  surface?: "overlay" | "page";
}) {
  const { copy } = useChatUi();
  const isPage = surface === "page";
  const title = copy.emptyTitle;
  const description = copy.emptyDescription;

  return (
    <div
      className={cx(
        "ms-chat-state",
        isPage ? "ms-chat-state--page" : "ms-chat-state--rail",
        compact && "ms-chat-state--compact",
      )}
    >
      <div className="ms-chat-state__badge">
        <Sparkles className="ms-chat-icon-lg" />
      </div>
      <div className="ms-chat-state__title">{title}</div>
      <p className="ms-chat-state__description">{description}</p>
    </div>
  );
}

function SessionReadinessState({
  message,
  status,
}: {
  message: string;
  status: "loading" | "error" | "not_found";
}) {
  const { connection, isDirectLaunchSession, retryDefaultSession } = useChatEngine();
  const { copy } = useChatUi();
  const failure = status === "error" || status === "not_found";
  // A launched session has no handle to open again; the default session does.
  const showRetryAction = failure && !isDirectLaunchSession;
  const displayMessage = formatSessionUnavailableMessage(message, connection.apiBaseUrl);

  return (
    <div className="ms-chat-state">
      <div
        className={cx("ms-chat-state__badge", failure && "ms-chat-state__badge--failure")}
      >
        {failure ? <AlertTriangle className="ms-chat-icon-lg" /> : <Loader2 className="ms-chat-icon-lg ms-chat-spin" />}
      </div>
      <div className="ms-chat-state__title">
        {failure ? copy.sessionUnavailableTitle : copy.sessionLoadingTitle}
      </div>
      <p className="ms-chat-state__description">{displayMessage}</p>
      {showRetryAction ? (
        <Button className="ms-chat-state__action" onClick={retryDefaultSession} size="small">
          <RefreshCw className="ms-chat-icon-sm" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function formatSessionNotice(value: string) {
  const normalized = value.trim();

  if (normalized.startsWith("Failed to rehydrate the selected session.")) {
    return {
      detail:
        "The selected session could not be restored from the backend. A locally cached transcript is being shown and may be stale.",
      tone: "warning" as const,
      title: "Session restore failed",
    };
  }

  if (normalized.startsWith("This new conversation did not receive the required session assignment.")) {
    return {
      detail:
        "The backend did not assign a runtime session to this conversation. Retry before continuing.",
      tone: "danger" as const,
      title: "Session assignment missing",
    };
  }

  return {
    detail: normalized,
    tone: "warning" as const,
    title: "Session status",
  };
}

function SessionNotice({ surface = "overlay" }: { surface?: "overlay" | "page" }) {
  const { sessionNotice } = useChatEngine();

  if (!sessionNotice) {
    return null;
  }

  const formatted = formatSessionNotice(sessionNotice);

  return (
    <div
      className={cx(
        "ms-chat-notice",
        surface === "page" && "ms-chat-notice--page",
        formatted.tone === "danger" ? "ms-chat-notice--danger" : "ms-chat-notice--warning",
      )}
    >
      <div className="ms-chat-notice__row">
        <div
          className={cx(
            "ms-chat-notice__icon",
            formatted.tone === "danger" ? "ms-chat-notice__icon--danger" : "ms-chat-notice__icon--warning",
          )}
        >
          <AlertTriangle className="ms-chat-icon-md" />
        </div>
        <div className="ms-chat-notice__body">
          <div className="ms-chat-notice__title">{formatted.title}</div>
          <div className="ms-chat-notice__detail">{formatted.detail}</div>
        </div>
      </div>
    </div>
  );
}

// A one-second clock, ticking only while something is worth timing.
function useNow(active: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      window.clearInterval(interval);
    };
  }, [active, intervalMs]);
  return now;
}

/**
 * What the runtime step shows while the backend decision is transient: the
 * notice, the presence detail, how long the wake has run, and the belt for a
 * wake that outlived its deadline (the platform can keep reporting "waking"
 * past the deadline; the user gets a way to re-check).
 */
// A check or an update that has shown no progress for this long gets the
// "taking longer than expected" line and the re-check button.
const TRANSIENT_STATE_OVERDUE_MS = 5 * 60_000;

function useRuntimeStatus(): AgentRuntimeStatus | null {
  const {
    activeRuntimeInteraction,
    activeRuntimePresence,
    refreshActiveSessionRuntimeAccess,
  } = useChatEngine();
  const state = activeRuntimeInteraction?.state ?? null;
  const transient = isTransientRuntimeInteraction(activeRuntimeInteraction);
  const now = useNow(transient);
  // Remember when this surface first saw the current transient state, so a
  // check or an update can be timed even though no wake is involved.
  const firstSeenRef = useRef<{ state: string; at: number } | null>(null);
  if (!transient) {
    firstSeenRef.current = null;
    return null;
  }
  if (firstSeenRef.current?.state !== state) {
    firstSeenRef.current = { state: state ?? "", at: Date.now() };
  }
  const wake = activeRuntimePresence?.wake ?? null;
  // Only a wake that is still running describes the waking state. A finished
  // or expired wake from an earlier attempt must not lend its detail or its
  // clock to a later check.
  const activeWake =
    state === "waking" && wake && (wake.state === "requested" || wake.state === "in_progress")
      ? wake
      : null;
  const requestedAt = activeWake ? Date.parse(activeWake.requestedAt) : NaN;
  const message = activeRuntimeInteraction?.notice?.message ?? null;
  const detail = activeWake ? (activeRuntimePresence?.detail ?? null) : null;
  const elapsedMs = Number.isFinite(requestedAt)
    ? now - requestedAt
    : now - firstSeenRef.current.at;
  const overdue = activeWake
    ? isRuntimeInteractionOverdue(activeRuntimeInteraction, activeRuntimePresence, now)
    : elapsedMs > TRANSIENT_STATE_OVERDUE_MS;
  return {
    message,
    detail: detail && detail !== message ? detail : null,
    elapsedSeconds: Math.max(0, elapsedMs / 1000),
    overdue,
    onCheckAgain: () => {
      void refreshActiveSessionRuntimeAccess();
    },
  };
}

// A wait shorter than this is not worth an "is ready" confirmation.
const READY_AFTER_WAIT_MIN_MS = 4_000;

// Offers to send the draft that was kept while the agent was waking. The
// draft is never auto-submitted; this is one explicit click.
function SendDraftNowButton() {
  const composerRuntime = useComposerRuntime();
  const draft = useAuiState((s) => s.composer.text.trim());
  if (!draft) {
    return null;
  }
  return (
    <Button
      variant="primary"
      type="button"
      size="small"
      className="ms-chat-no-shrink"
      onClick={() => {
        composerRuntime.send();
      }}
      data-send-draft-now
    >
      Send now
    </Button>
  );
}

function RuntimeInteractionNotice({
  hidden = false,
  surface = "overlay",
}: {
  hidden?: boolean;
  surface?: "overlay" | "page";
}) {
  const { activeAgentName, activeRuntimeInteraction, activeRuntimePresence } = useChatEngine();
  const readyAgentName = activeAgentName?.trim() || "The agent";
  const runtimeStatus = useRuntimeStatus();
  const transient = isTransientRuntimeInteraction(activeRuntimeInteraction);
  const canSubmit = activeRuntimeInteraction?.canSubmit === true;
  // "Ready" is an event: when the decision goes from transient to ready, show
  // it once so a draft kept through the wake has an obvious next step.
  const [readyAfterWait, setReadyAfterWait] = useState(false);
  // When the current wait began; null while nothing is being waited for.
  const transientSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (transient) {
      transientSinceRef.current ??= Date.now();
      setReadyAfterWait(false);
      return undefined;
    }
    const waitedMs =
      transientSinceRef.current === null ? 0 : Date.now() - transientSinceRef.current;
    transientSinceRef.current = null;
    // Every session is checked once when it opens (ADR 093); an Agent that answers at once
    // needs no confirmation, only a wait the person sat through does.
    if (waitedMs >= READY_AFTER_WAIT_MIN_MS && canSubmit) {
      setReadyAfterWait(true);
      const timeout = window.setTimeout(() => setReadyAfterWait(false), 12_000);
      return () => {
        window.clearTimeout(timeout);
      };
    }
    return undefined;
  }, [canSubmit, transient]);
  const notice =
    activeRuntimeInteraction?.notice ??
    (readyAfterWait
      ? {
          code: "agent_runtime_ready_after_wait",
          severity: "success" as const,
          title: `${readyAgentName} is ready`,
          message: "You can write and send your message now.",
        }
      : null);

  if (!notice || hidden) {
    return null;
  }

  const showSendDraft = notice.severity === "success" && canSubmit;
  void activeRuntimePresence;
  const tone =
    notice.severity === "error"
      ? "danger"
      : notice.severity === "success"
        ? "success"
        : notice.severity === "warning"
          ? "warning"
          : "info";

  return (
    <div className={cx("ms-chat-runtime-notice", surface === "page" && "ms-chat-runtime-notice--page")}>
      <div
        className={cx(
          "ms-chat-runtime-notice__box",
          surface === "page" && "ms-chat-runtime-notice__box--page",
          `ms-chat-runtime-notice__box--${tone}`,
        )}
        role={notice.severity === "error" ? "alert" : "status"}
      >
        <div className="ms-chat-notice__row">
          <div
            className={cx("ms-chat-notice__icon", `ms-chat-notice__icon--${tone}`)}
          >
            {transient ? (
              <Loader2 className="ms-chat-icon-md ms-chat-spin" />
            ) : notice.severity === "success" ? (
              <Sparkles className="ms-chat-icon-md" />
            ) : (
              <AlertTriangle className="ms-chat-icon-md" />
            )}
          </div>
          <div className="ms-chat-notice__body">
            <div className="ms-chat-notice__title">{notice.title}</div>
            <div className="ms-chat-notice__detail">{notice.message}</div>
            {runtimeStatus ? (
              <AgentRuntimeStatusLines status={{ ...runtimeStatus, message: null }} />
            ) : null}
            {notice.severity === "error" && activeRuntimeInteraction?.operation?.supportReference ? (
              <div className="ms-chat-notice__reference">
                Support reference: {activeRuntimeInteraction.operation.supportReference}
              </div>
            ) : null}
          </div>
          {showSendDraft ? (
            <SendDraftNowButton />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The composer's own lock. It is shared with the message actions so a resend
 * can never put a message through a door the composer has closed: the actions
 * queue or hand back a draft instead.
 */
function isComposerBlocked({
  isSessionIdle,
  isSessionBusy,
  isSessionReady,
  queueMode,
  runtimeStartingOrWaking,
  sessionLoading,
  sessionUnavailable,
}: {
  isSessionIdle: boolean;
  isSessionBusy: boolean;
  isSessionReady: boolean;
  queueMode: boolean;
  runtimeStartingOrWaking: boolean;
  sessionLoading: boolean;
  sessionUnavailable: boolean;
}) {
  return (
    isSessionIdle ||
    sessionUnavailable ||
    sessionLoading ||
    !isSessionReady ||
    runtimeStartingOrWaking ||
    (isSessionBusy && !queueMode)
  );
}

function Composer({
  availableModelsError,
  hasAvailableModels,
  availableProviders,
  busyPlaceholder = "Session is working...",
  compact = false,
  inputRef,
  isLoadingAvailableModels,
  isSessionIdle = false,
  isCancellingSession,
  isSessionReady = true,
  isSessionLoading = false,
  isSessionBusy,
  showStopControl = false,
  model,
  modelOptions,
  onProviderChange,
  provider,
  providerOptions,
  onModelChange,
  onReasoningEffortChange,
  onStop,
  reasoningEffortOptions,
  reasoningEffort,
  surface = "overlay",
  sessionUnavailableMessage = null,
  sessionLoadingMessage = null,
  runtimeTransient = false,
  queueMode = false,
}: {
  availableModelsError: string | null;
  hasAvailableModels: boolean;
  availableProviders?: ReadonlyArray<{ label: string; value: string }>;
  busyPlaceholder?: string;
  compact?: boolean;
  /** Owned by ChatThread so the message actions can focus the composer. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  isLoadingAvailableModels: boolean;
  isSessionIdle?: boolean;
  isCancellingSession?: boolean;
  isSessionReady?: boolean;
  isSessionLoading?: boolean;
  isSessionBusy?: boolean;
  showStopControl?: boolean;
  model: ComposerModelOption;
  modelOptions: ReadonlyArray<{ disabled?: boolean; label: string; value: ComposerModelOption }>;
  onProviderChange?: (value: string) => void;
  provider?: string;
  providerOptions?: ReadonlyArray<{ label: string; value: string }>;
  onModelChange: (value: ComposerModelOption) => void;
  onReasoningEffortChange: (value: ComposerReasoningEffort) => void;
  onStop?: () => void;
  reasoningEffortOptions: ReadonlyArray<{ label: string; value: ComposerReasoningEffort }>;
  reasoningEffort: ComposerReasoningEffort;
  surface?: "overlay" | "page";
  sessionUnavailableMessage?: string | null;
  sessionLoadingMessage?: string | null;
  runtimeTransient?: boolean;
  /** ADR 087: the agent is working; Enter and the primary control queue the draft. */
  queueMode?: boolean;
}) {
  const composerRuntime = useComposerRuntime();
  const {
    activeAgentName,
    activeRuntimeInteraction,
    enqueueMessage,
    isAssistantRuntimeStarting,
    connection,
    hasRequestedAvailableModels,
    isDirectLaunchSession,
    requestAvailableModels,
    revalidateStaleRuntimeAccess,
  } = useChatEngine();
  const { copy, onOpenModelProviderSettings } = useChatUi();
  const isPage = surface === "page";
  const placeholder = copy.composerPlaceholder;
  const hasModelOptions = modelOptions.length > 0;
  const hasProviderOptions = (providerOptions?.length ?? 0) > 0;
  const hasReasoningEffortOptions = reasoningEffortOptions.length > 0;
  const modelsAwaitingInteraction =
    !isSessionIdle &&
    isSessionReady &&
    !isSessionBusy &&
    !hasRequestedAvailableModels;
  const modelsResolving =
    !isSessionIdle &&
    hasRequestedAvailableModels &&
    isLoadingAvailableModels;
  const modelsUnavailable =
    !isSessionIdle &&
    isSessionReady &&
    hasRequestedAvailableModels &&
    !isLoadingAvailableModels &&
    !hasAvailableModels;
  const modelCatalogError = modelsUnavailable && Boolean(availableModelsError?.trim());
  const emptyModelCatalog = modelsUnavailable && !modelCatalogError;
  // The config row waits for the session to be ready: rendering it earlier
  // showed a transient fallback selection (first provider/model in the
  // catalog, e.g. an unauthenticated entry) before the session's stored
  // preference could be applied.
  const showConfigRow =
    !isSessionIdle &&
    isSessionReady &&
    hasAvailableModels && (hasProviderOptions || hasModelOptions || hasReasoningEffortOptions);
  const sessionUnavailable = Boolean(sessionUnavailableMessage);
  const sessionLoading = isSessionLoading && !sessionUnavailable;
  // Session hydration and runtime readiness are separate axes. While the
  // agent is waking the composer stays locked: a draft already written is
  // kept, nothing is ever sent on the user's behalf, and writing resumes once
  // the agent can take messages.
  const runtimeStartingOrWaking = isAssistantRuntimeStarting || runtimeTransient;
  const blockTyping = isComposerBlocked({
    isSessionIdle,
    isSessionBusy: Boolean(isSessionBusy),
    isSessionReady,
    queueMode,
    runtimeStartingOrWaking,
    sessionLoading,
    sessionUnavailable,
  });
  // A locked input cannot take the mount-time autofocus, so the surfaces that
  // focus the composer get it back when the waking lock lifts, unless the user
  // has already moved to another control.
  const ownInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerInputRef = inputRef ?? ownInputRef;
  const wasLockedWhileWakingRef = useRef(false);
  const focusesComposer = isPage || isDirectLaunchSession;
  useEffect(() => {
    if (runtimeStartingOrWaking) {
      wasLockedWhileWakingRef.current = true;
      return;
    }
    if (!wasLockedWhileWakingRef.current || blockTyping) {
      return;
    }
    wasLockedWhileWakingRef.current = false;
    const focused = document.activeElement;
    if (focusesComposer && (!focused || focused === document.body)) {
      composerInputRef.current?.focus();
    }
  }, [blockTyping, focusesComposer, runtimeStartingOrWaking]);
  const agentDisplayName = activeAgentName?.trim() || "The agent";
  // Every session is checked once when it opens; only an agent that does not answer is waking.
  const agentWaitingCopy =
    activeRuntimeInteraction?.state === "checking"
      ? `Checking that ${activeAgentName?.trim() || "the agent"} is ready...`
      : `${agentDisplayName} is waking up`;
  const enqueueDraft = () => {
    const text = composerRuntime.getState().text;
    if (!text.trim()) {
      return;
    }
    if (enqueueMessage(text)) {
      composerRuntime.setText("");
    }
  };
  const canShowStopControl = Boolean(isSessionBusy && showStopControl);
  const modelsUnavailableMessage = modelCatalogError
    ? formatModelsUnavailableMessage(availableModelsError)
    : formatEmptyModelCatalogMessage();
  const formattedSessionUnavailableMessage = sessionUnavailableMessage
    ? formatSessionUnavailableMessage(sessionUnavailableMessage, connection.apiBaseUrl)
    : null;

  const composerBody = (
    <ComposerPrimitive.Root
      className={cx("ms-chat-composer", isPage ? "ms-chat-composer--page" : "ms-chat-composer--rail")}
    >
      <div className="ms-chat-composer__row">
        <ComposerPrimitive.Input
          ref={composerInputRef}
          autoFocus={focusesComposer}
          disabled={blockTyping}
          onFocus={() => {
            revalidateStaleRuntimeAccess();
            if (!hasRequestedAvailableModels) {
              requestAvailableModels();
            }
          }}
          onKeyDownCapture={(event) => {
            if (
              queueMode &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              enqueueDraft();
              return;
            }
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              (modelsAwaitingInteraction || modelsResolving || modelsUnavailable)
            ) {
              event.preventDefault();
              if (modelsAwaitingInteraction) {
                requestAvailableModels();
              }
            }
          }}
          minRows={1}
          maxRows={10}
          placeholder={
            isSessionIdle
              ? "Select or start a session to continue."
              : sessionUnavailable
                ? "Session unavailable."
                : sessionLoading
                  ? "Loading session..."
                  : runtimeStartingOrWaking
                    ? activeRuntimeInteraction?.state === "checking"
                      ? agentWaitingCopy
                      : `${agentWaitingCopy}. You can write once it is ready.`
                    : modelsResolving
                    ? "Loading models..."
                    : modelsUnavailable
                      ? "Models unavailable."
                      : isCancellingSession
                        ? "Stopping session..."
                        : queueMode
                          ? `${agentDisplayName} is working. Your message will send when it finishes.`
                          : isSessionBusy
                            ? busyPlaceholder
                            : placeholder
          }
          className="ms-chat-composer__input"
        />
        {queueMode ? (
          <div className="ms-chat-composer__controls">
            {canShowStopControl ? (
              <Button
                aria-label={isCancellingSession ? "Stopping session" : "Stop session"}
                title={isCancellingSession ? "Stopping session" : "Stop session"}
                className="ms-chat-no-shrink"
                iconOnly
                disabled={isCancellingSession || sessionUnavailable || sessionLoading || !onStop}
                onClick={onStop}
                data-composer-stop
              >
                <Square className="ms-chat-icon-sm ms-chat-icon-filled" />
              </Button>
            ) : null}
            <QueueDraftButton onEnqueue={enqueueDraft} />
          </div>
        ) : canShowStopControl ? (
          <Button
            aria-label={isCancellingSession ? "Stopping session" : "Stop session"}
            title={isCancellingSession ? "Stopping session" : "Stop session"}
            className="ms-chat-composer__end-control"
            iconOnly
            disabled={isCancellingSession || sessionUnavailable || sessionLoading || !isSessionReady || !onStop}
            onClick={onStop}
            variant="primary"
          >
            <Square className="ms-chat-icon-sm ms-chat-icon-filled" />
          </Button>
        ) : isSessionBusy ? (
          <div
            aria-label={busyPlaceholder}
            title={busyPlaceholder}
            className="ms-chat-composer__busy"
          >
            <Loader2 className="ms-chat-icon-md ms-chat-spin" />
          </div>
        ) : (
          <ComposerPrimitive.Send
            aria-label="Send message"
            title={runtimeStartingOrWaking ? agentWaitingCopy : undefined}
            className="ms-chat-composer__send"
            disabled={
              isSessionIdle ||
              modelsAwaitingInteraction ||
              modelsResolving ||
              modelsUnavailable ||
              sessionUnavailable ||
              sessionLoading ||
              runtimeStartingOrWaking ||
              !isSessionReady
            }
          >
            <ArrowUp className="ms-chat-icon-md" />
          </ComposerPrimitive.Send>
        )}
      </div>
      {showConfigRow ? (
        <ChatRunConfigRow
          className="ms-chat-composer__config"
          disabled={!isSessionReady || Boolean(isSessionBusy)}
          provider={provider}
          providerOptions={hasProviderOptions ? providerOptions : undefined}
          onProviderChange={onProviderChange}
          model={model}
          modelOptions={modelOptions}
          onModelChange={(value) => onModelChange(value as ComposerModelOption)}
          reasoningEffort={reasoningEffort}
          reasoningEffortOptions={hasReasoningEffortOptions ? reasoningEffortOptions : []}
          onReasoningEffortChange={(value) => onReasoningEffortChange(value as ComposerReasoningEffort)}
        />
      ) : null}
      {sessionUnavailable ? (
        <div className="ms-chat-composer__status ms-chat-composer__status--danger">
          <span>{formattedSessionUnavailableMessage}</span>
        </div>
      ) : null}
      {sessionLoading ? (
        <div className="ms-chat-composer__note">
          {sessionLoadingMessage ?? "Loading this session."}
        </div>
      ) : null}
      {modelsUnavailable ? (
        <div
          className={cx(
            "ms-chat-composer__status",
            modelCatalogError ? "ms-chat-composer__status--danger" : "ms-chat-composer__status--muted",
          )}
        >
          <span>{modelsUnavailableMessage}</span>
          {modelCatalogError ? (
            <Button onClick={requestAvailableModels} size="small">
              Retry
            </Button>
          ) : null}
          {emptyModelCatalog && onOpenModelProviderSettings ? (
            <Button onClick={onOpenModelProviderSettings} size="small">
              Open model providers
            </Button>
          ) : null}
        </div>
      ) : null}
    </ComposerPrimitive.Root>
  );

  return composerBody;
}

function QueueDraftButton({ onEnqueue }: { onEnqueue: () => void }) {
  const hasDraft = useAuiState((s) => s.composer.text.trim().length > 0);
  return (
    <Button
      aria-label="Add to queue"
      title="Add to queue · Enter"
      className="ms-chat-no-shrink"
      iconOnly
      disabled={!hasDraft}
      onClick={onEnqueue}
      data-queue-add
      variant="primary"
    >
      <ListPlus className="ms-chat-icon-md" />
    </Button>
  );
}

// ADR 087: the messages waiting to send, above the composer input. Hidden
// when the queue is empty. Rows reorder by drag (the whole row drags; the
// grip is the affordance) or with the arrow keys on a focused row. Rows
// carry data attributes for tests.
function ComposerQueueStrip({ surface }: { surface: "overlay" | "page" }) {
  const {
    activeAgentName,
    activeSessionSummary,
    clearMessageQueue,
    editQueuedMessage,
    messageQueue,
    removeQueuedMessage,
    reorderQueuedMessage,
    sendNextQueuedMessage,
  } = useChatEngine();
  const composerRuntime = useComposerRuntime();
  const threadIsRunning = useAuiState((s) => s.thread.isRunning);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: "before" | "after" } | null>(
    null,
  );
  if (messageQueue.length === 0) {
    return null;
  }
  const agentDisplayName = activeAgentName?.trim() || "The agent";
  const hold = getMessageQueueHold(messageQueue);
  const otherWriterWorking = !threadIsRunning && Boolean(activeSessionSummary?.working);
  const headline = hold
    ? describeMessageQueueHold(hold.reason, agentDisplayName, hold.message)
    : describeMessageQueueCount(messageQueue.length, agentDisplayName);
  const editRow = (id: string) => {
    const text = editQueuedMessage(id);
    if (text === null) {
      return;
    }
    const draft = composerRuntime.getState().text;
    composerRuntime.setText(draft.trim() ? `${draft.trimEnd()}\n\n${text}` : text);
  };
  const endDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };
  const dropOn = (targetId: string) => {
    if (!dragId || !dropTarget || dropTarget.id !== targetId) {
      endDrag();
      return;
    }
    const from = messageQueue.findIndex((item) => item.id === dragId);
    const targetIndex = messageQueue.findIndex((item) => item.id === targetId);
    if (from !== -1 && targetIndex !== -1) {
      let to = dropTarget.edge === "before" ? targetIndex : targetIndex + 1;
      if (from < to) {
        to -= 1;
      }
      if (to !== from) {
        reorderQueuedMessage(dragId, to);
      }
    }
    endDrag();
  };
  return (
    <div
      className={cx("ms-chat-queue", surface === "page" ? "ms-chat-queue--page" : "ms-chat-queue--rail")}
      data-message-queue
      data-queue-surface={surface}
      data-queue-held={hold ? hold.reason : undefined}
      title="Messages you write while the agent works wait here and send in order. Drag a row to reorder."
    >
      <div className="ms-chat-queue__header">
        <span
          className={cx("ms-chat-queue__headline", hold && "ms-chat-queue__headline--held")}
          data-queue-headline
        >
          {headline}
        </span>
        <div className="ms-chat-queue__actions">
          {hold ? (
            <Button
              variant="primary"
              type="button"
              size="small"
              className="ms-chat-queue__send-next"
              onClick={sendNextQueuedMessage}
              disabled={otherWriterWorking}
              data-queue-action="send-next"
            >
              Send next
            </Button>
          ) : null}
          <button
            type="button"
            className="ms-chat-queue__clear"
            onClick={clearMessageQueue}
            data-queue-action="clear"
          >
            Clear
          </button>
        </div>
      </div>
      <ul className="ms-chat-queue__list" role="list">
        {messageQueue.map((item, index) => {
          const menuOpen = openMenuId === item.id;
          const dragging = dragId === item.id;
          const dropEdge = dropTarget?.id === item.id ? dropTarget.edge : null;
          return (
            <li
              key={item.id}
              className={cx(
                "ms-chat-queue__item",
                dragging && "ms-chat-queue__item--dragging",
                dropEdge === "before" && "ms-chat-queue__item--drop-before",
                dropEdge === "after" && "ms-chat-queue__item--drop-after",
              )}
              draggable
              onDragStart={(event) => {
                event.dataTransfer?.setData("text/plain", item.id);
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = "move";
                }
                setOpenMenuId(null);
                setDragId(item.id);
              }}
              onDragOver={(event) => {
                if (!dragId || dragId === item.id) {
                  return;
                }
                event.preventDefault();
                if (event.dataTransfer) {
                  event.dataTransfer.dropEffect = "move";
                }
                const rect = event.currentTarget.getBoundingClientRect();
                const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                setDropTarget((current) =>
                  current?.id === item.id && current.edge === edge ? current : { id: item.id, edge },
                );
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTarget((current) => (current?.id === item.id ? null : current));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropOn(item.id);
              }}
              onDragEnd={endDrag}
              onKeyDown={(event) => {
                if (event.altKey || event.ctrlKey || event.metaKey || menuOpen) {
                  return;
                }
                if (event.key === "ArrowUp" && index > 0) {
                  event.preventDefault();
                  reorderQueuedMessage(item.id, index - 1);
                } else if (event.key === "ArrowDown" && index < messageQueue.length - 1) {
                  event.preventDefault();
                  reorderQueuedMessage(item.id, index + 1);
                }
              }}
              tabIndex={0}
              title={item.text}
              aria-label={`Queued message ${index + 1} of ${messageQueue.length}. Drag, or use the arrow keys, to reorder.`}
              data-queue-item
              data-queue-index={index}
              data-queue-status={item.status}
              data-dragging={dragging ? "true" : undefined}
              data-drop-edge={dropEdge ?? undefined}
            >
              <span
                className="ms-chat-queue__handle"
                aria-hidden="true"
                data-queue-handle
              >
                <GripVertical className="ms-chat-icon-sm" />
              </span>
              <span className="ms-chat-queue__text" data-queue-text>
                {item.text}
              </span>
              <button
                type="button"
                aria-label="Remove from queue"
                title="Remove from queue"
                className="ms-chat-queue__icon-button"
                onClick={() => {
                  removeQueuedMessage(item.id);
                }}
                data-queue-action="remove"
              >
                <Trash2 className="ms-chat-icon-sm" />
              </button>
              <button
                type="button"
                aria-label="More actions"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                title="More actions"
                className="ms-chat-queue__icon-button"
                onClick={() => {
                  setOpenMenuId(menuOpen ? null : item.id);
                }}
                data-queue-action="menu"
              >
                <Ellipsis className="ms-chat-icon-sm" />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="ms-chat-queue__menu"
                  data-queue-menu
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="ms-chat-queue__menu-item"
                    onClick={() => {
                      setOpenMenuId(null);
                      editRow(item.id);
                    }}
                    data-queue-action="edit"
                  >
                    <Pencil className="ms-chat-icon-sm" />
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="ms-chat-queue__menu-item ms-chat-queue__menu-item--danger"
                    onClick={() => {
                      setOpenMenuId(null);
                      removeQueuedMessage(item.id);
                    }}
                    data-queue-action="remove-menu"
                  >
                    <Trash2 className="ms-chat-icon-sm" />
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ComposerFooter({ surface = "page" }: { surface?: "overlay" | "page" }) {
  const { activeSessionSummary } = useChatEngine();
  const { copy } = useChatUi();
  const insights =
    activeSessionSummary &&
    !activeSessionSummary.insightsError
      ? activeSessionSummary.sessionInsights ?? null
      : null;
  const context = insights?.context ?? null;
  const model = insights?.model ?? null;
  const usage = insights?.usage ?? null;
  const resolvedTokens = usage?.tokens?.total ?? context?.tokens ?? null;
  const resolvedContextWindow = model?.contextWindow ?? context?.contextWindow ?? null;
  const windowTokens = formatContextUsageNumber(resolvedContextWindow);
  const derivedPercentUsed =
    resolvedTokens !== null &&
    resolvedTokens !== undefined &&
    resolvedContextWindow !== null &&
    resolvedContextWindow !== undefined &&
    Number.isFinite(resolvedTokens) &&
    Number.isFinite(resolvedContextWindow) &&
    resolvedContextWindow > 0
      ? (resolvedTokens / resolvedContextWindow) * 100
      : null;
  const percentUsed =
    context?.percentOfContextWindow !== null &&
    context?.percentOfContextWindow !== undefined &&
    Number.isFinite(context.percentOfContextWindow)
      ? Math.min(Math.max(context.percentOfContextWindow, 0), 100)
      : derivedPercentUsed !== null
        ? Math.min(Math.max(derivedPercentUsed, 0), 100)
        : null;
  const resolvedUsedTokensLabel = formatContextUsageNumber(resolvedTokens);
  const usageLabel =
    percentUsed !== null
      ? `${percentUsed}%`
      : null;
  const usageDetail =
    resolvedUsedTokensLabel && windowTokens
      ? `${resolvedUsedTokensLabel} / ${windowTokens} tokens`
      : null;

  return (
    <div className={cx("ms-chat-footer", surface === "overlay" && "ms-chat-footer--rail")}>
      {percentUsed !== null ? (
        <div className="ms-chat-usage">
          <div className="ms-chat-usage__header">
            <span>Window used</span>
            <span className="ms-chat-usage__value">
              {usageLabel}
              {usageDetail ? ` • ${usageDetail}` : ""}
            </span>
          </div>
          <div className="ms-chat-usage__track">
            <div
              className={cx(
                "ms-chat-usage__bar",
                percentUsed >= 90
                  ? "ms-chat-usage__bar--danger"
                  : percentUsed >= 70
                    ? "ms-chat-usage__bar--warning"
                    : "ms-chat-usage__bar--ok",
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="ms-chat-footer__disclaimer">{copy.disclaimer}</div>
    </div>
  );
}

/**
 * The viewport store is created by `ThreadPrimitive.Viewport`, so a control
 * outside the scroller needs an outer provider: the inner one reports whether
 * it is at the bottom up to this store and takes `scrollToBottom` back down.
 */
function ThreadViewportShell({ children }: { children: ReactNode }) {
  return (
    <ThreadPrimitive.ViewportProvider>
      <div className="ms-chat-thread__shell">{children}</div>
    </ThreadPrimitive.ViewportProvider>
  );
}

/** Hidden (and out of reach) while the transcript is already at the bottom. */
function ScrollToLatestButton() {
  return (
    <ThreadPrimitive.ScrollToBottom
      aria-label="Scroll to latest"
      className="ms-chat-thread__scroll-latest"
      data-scroll-to-latest
      title="Scroll to latest"
    >
      <ChevronDown className="ms-chat-icon-md" aria-hidden="true" />
    </ThreadPrimitive.ScrollToBottom>
  );
}

// The footer element arrives via state (a callback ref on the footer div),
// not a ref object: the footer is a later sibling of the viewport, so during
// the mounting commit a plain ref is still null when this layout effect runs
// — and with stable deps it would never retry. StrictMode's dev-only second
// effect pass masked that, so the inset silently failed to register in
// production builds and the composer covered the tail of the thread.
function FooterInsetSpacer({
  target,
}: {
  target: HTMLDivElement | null;
}) {
  const registerInset = useThreadViewport((s) => s.registerContentInset);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (!target || typeof ResizeObserver === "undefined") {
      setHeight(0);
      return;
    }

    const handle = registerInset();

    const update = () => {
      const marginTop = parseFloat(getComputedStyle(target).marginTop) || 0;
      const nextHeight = target.offsetHeight + marginTop;
      setHeight(nextHeight);
      handle.setHeight(nextHeight);
    };

    update();

    const observer = new ResizeObserver(() => {
      update();
    });

    observer.observe(target);

    return () => {
      observer.disconnect();
      handle.unregister();
    };
  }, [registerInset, target]);

  if (height <= 0) {
    return null;
  }

  return <div aria-hidden className="ms-chat-no-shrink" style={{ height }} />;
}

export function ChatThread({
  copy,
  onOpenModelProviderSettings,
  viewer = null,
  ...props
}: ChatThreadProps) {
  const uiValue = useMemo(
    () => ({ copy: resolveChatThreadCopy(copy), onOpenModelProviderSettings, viewer }),
    [copy, onOpenModelProviderSettings, viewer],
  );

  return (
    <ChatUiProvider value={uiValue}>
      <ChatThreadBody {...props} />
    </ChatUiProvider>
  );
}

function ChatThreadBody({
  compact = false,
  surface = "overlay",
}: Pick<ChatThreadProps, "compact" | "surface">) {
  const isPage = surface === "page";
  const {
    activeAgentName,
    activeAgentUid,
    activeSessionReadiness,
    activeSessionSummary,
    activeRuntimeInteraction,
    availableModels,
    availableModelsError,
    availableProviders,
    availableReasoningEfforts,
    cancelActiveSession,
    enqueueMessage,
    isAssistantRuntimeStarting,
    isCancellingSession,
    isActiveSessionReady,
    isActiveSessionLoading,
    isCreatingAgentSession,
    isUpdatingSessionModel,
    isLoadingAvailableModels,
    selectedModelValue,
    selectedProviderValue,
    selectedReasoningEffortValue,
    sessionModelSelectionRequest,
    sessionNotice,
    setSelectedModelValue,
    setSelectedProviderValue,
    setSelectedReasoningEffortValue,
  } = useChatEngine();
  const hasMessages = useAuiState((s) => s.thread.messages.length > 0);
  const threadIsRunning = useAuiState((s) => s.thread.isRunning);
  const threadComposer = useComposerRuntime();
  const actorContext = useMessageActorContext();
  const participants = useThreadParticipants(actorContext);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  // The page hosts the same connecting stage as the rail. The rail hides the
  // whole thread behind it; here it replaces the loading panel and the
  // centered composer while the session or the runtime is not ready.
  // Errors and not-found keep the readiness state below, which carries the
  // deployment action and the retry.
  const connecting = useAgentConnectingState({ surface });
  const runtimeStatus = useRuntimeStatus();
  // Both surfaces host the stage inside the thread, keeping the composer:
  // while the session loads or the runtime is not ready, and while a
  // transient decision (waking, starting) holds a thread that has nothing
  // to read yet. With history on screen the compact notice carries the
  // same status instead, so the conversation stays readable.
  const multiParty = participants.multiParty;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [footerElement, setFooterElement] = useState<HTMLDivElement | null>(null);
  const historyAutoScrollSessionIdRef = useRef<string | null>(null);
  const providerOptions = availableProviders.map((entry) => ({
    label: entry.label,
    value: entry.value,
  }));
  const filteredModels =
    selectedProviderValue
      ? availableModels.filter((entry) => entry.provider === selectedProviderValue)
      : availableModels;
  const modelOptions = filteredModels.map((entry) => ({
    disabled: !entry.selectable,
    label:
      !entry.selectable
        ? `${entry.label} • Unavailable`
        : entry.auth.required && !entry.auth.authenticated
          ? `${entry.label} • Sign in required to run`
          : entry.label,
    value: entry.id,
  }));
  const reasoningEffortOptions = availableReasoningEfforts;
  const selectedModel = selectedModelValue ?? modelOptions[0]?.value ?? "";
  const selectedProvider = selectedProviderValue ?? providerOptions[0]?.value ?? "";
  const selectedReasoningEffort =
    selectedReasoningEffortValue ?? reasoningEffortOptions[0]?.value ?? "";
  const sessionBusy =
    threadIsRunning ||
    isCreatingAgentSession ||
    isUpdatingSessionModel ||
    Boolean(activeSessionSummary?.working);
  const showStopControl =
    !isCreatingAgentSession && (threadIsRunning || Boolean(activeSessionSummary?.working));
  // ADR 087: while the agent works (a local run, or another writer), the
  // composer stays open and queues the draft instead of blocking.
  const queueMode =
    !isCreatingAgentSession &&
    !isUpdatingSessionModel &&
    (threadIsRunning || Boolean(activeSessionSummary?.working));
  const busyPlaceholder = isCreatingAgentSession
    ? "Connecting to your session..."
    : isUpdatingSessionModel
      ? "Saving model selection..."
    : activeSessionSummary?.working
    ? "Session is working..."
    : "Waiting for response...";
  const readinessLoadingParts = [
    !activeSessionReadiness.detailReady ? "detail" : null,
    !activeSessionReadiness.historyReady ? "history" : null,
  ].filter(Boolean);
  const sessionLoadingMessage =
    isActiveSessionLoading
      ? readinessLoadingParts.length > 0
        ? `Loading session ${readinessLoadingParts.join(", ")}.`
        : "Loading session."
      : null;
  const readinessUnavailableMessage =
    activeSessionReadiness.status === "error" || activeSessionReadiness.status === "not_found"
      ? activeSessionReadiness.error ?? "This session failed to load."
      : null;
  const runtimeTransient = isTransientRuntimeInteraction(activeRuntimeInteraction);
  // A terminal blocked decision (failed wake, update required) reads as
  // unavailable; a transient one (waking, starting) locks the composer with
  // its draft intact until the agent is ready.
  const runtimeUnavailableMessage =
    activeRuntimeInteraction?.canSubmit === false && !runtimeTransient
      ? activeRuntimeInteraction.notice?.message ??
        "The agent cannot take a new message right now."
      : null;
  const sessionUnavailableMessage = readinessUnavailableMessage ?? runtimeUnavailableMessage;
  const runtimeCanSubmit = activeRuntimeInteraction?.canSubmit !== false || runtimeTransient;
  const isSessionSelectionIdle =
    activeSessionReadiness.status === "idle" &&
    !activeSessionReadiness.sessionId;
  const showReadinessState =
    isActiveSessionLoading ||
    activeSessionReadiness.status === "error" ||
    activeSessionReadiness.status === "not_found";
  const { copy: threadCopy } = useChatUi();
  const readinessStateMessage =
    sessionUnavailableMessage ?? sessionLoadingMessage ?? threadCopy.sessionLoadingMessage;
  const activeSessionId = activeSessionSummary?.sessionId ?? null;
  const showThreadConnectingState =
    connecting.showConnectingState || (runtimeTransient && !hasMessages && !showReadinessState);
  // The message actions reuse the composer's lock and the composer's send, so
  // a resend obeys every readiness and queue rule the composer obeys.
  const composerLocked = isComposerBlocked({
    isSessionIdle: isSessionSelectionIdle,
    isSessionBusy: sessionBusy,
    isSessionReady: isActiveSessionReady && runtimeCanSubmit,
    queueMode,
    runtimeStartingOrWaking: isAssistantRuntimeStarting || runtimeTransient,
    sessionLoading: isActiveSessionLoading && !sessionUnavailableMessage,
    sessionUnavailable: Boolean(sessionUnavailableMessage),
  });
  const loadIntoComposer = useCallback(
    (text: string) => {
      const value = text.trim();

      if (!value) {
        return;
      }

      threadComposer.setText(value);
      // The value reaches the textarea on the next render; the caret goes to
      // the end so the draft reads as something to continue writing.
      window.requestAnimationFrame(() => {
        const input = composerInputRef.current;

        if (!input) {
          return;
        }

        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    },
    [threadComposer],
  );
  const resend = useCallback(
    (text: string) => {
      const value = text.trim();

      if (!value) {
        return;
      }

      // ADR 087: while the agent works the message joins the queue, where it
      // stays visible and reorderable, instead of racing the running turn.
      if (queueMode) {
        if (enqueueMessage(value)) {
          return;
        }

        loadIntoComposer(value);
        return;
      }

      if (composerLocked) {
        loadIntoComposer(value);
        return;
      }

      threadComposer.setText(value);
      threadComposer.send();
    },
    [composerLocked, enqueueMessage, loadIntoComposer, queueMode, threadComposer],
  );
  const messageActions = useMemo<MessageActionsValue>(
    () => ({
      canEdit: !isSessionSelectionIdle && !sessionUnavailableMessage,
      canResend: queueMode || !composerLocked,
      loadIntoComposer,
      resend,
    }),
    [
      composerLocked,
      isSessionSelectionIdle,
      loadIntoComposer,
      queueMode,
      resend,
      sessionUnavailableMessage,
    ],
  );

  // ThreadPrimitive.Messages is memoized on `prev.children === next.children`;
  // an inline render-prop would defeat that memo and reconcile the entire
  // transcript (re-parsing every message's markdown) on every ChatThread
  // render — which happens per streaming delta. isPage/surface are constant
  // per mount, so this callback identity is stable.
  const renderThreadMessage = useCallback(
    ({ message }: { message: MessageState }) => {
      if (message.role === "assistant") {
        return (
          <AssistantMessage context={actorContext} multiParty={multiParty} surface={surface} />
        );
      }

      if (message.role === "user") {
        return (
          <UserMessageBubble
            context={actorContext}
            multiParty={multiParty}
            preview={isPage}
          />
        );
      }

      return null;
    },
    [actorContext, isPage, multiParty, surface],
  );

  useEffect(() => {
    if (!activeSessionId || activeSessionReadiness.status !== "ready" || !hasMessages) {
      if (activeSessionReadiness.status !== "ready") {
        historyAutoScrollSessionIdRef.current = null;
      }
      return;
    }

    if (historyAutoScrollSessionIdRef.current === activeSessionId) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      viewport.scrollTop = viewport.scrollHeight;
      historyAutoScrollSessionIdRef.current = activeSessionId;
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeSessionId, activeSessionReadiness.status, hasMessages]);

  // A session is waiting for a model: the chat's own picker takes the place of the thread.
  if (sessionModelSelectionRequest) {
    return (
      <div className="ms-chat-thread">
        <SessionModelRequiredState />
      </div>
    );
  }

  return (
    <div className="ms-chat-thread">
      <RuntimeInteractionNotice surface={surface} hidden={showThreadConnectingState} />
      <ThreadPrimitive.Root className="ms-chat-thread">
        {isPage && !showThreadConnectingState && (showReadinessState || !hasMessages) ? (
          <div className="ms-chat-thread__stage">
            <div className="ms-chat-thread__stage-inner">
              <div className="ms-chat-thread__stage-content">
                {showReadinessState ? (
                  <SessionReadinessState
                    message={readinessStateMessage}
                    status={
                      activeSessionReadiness.status === "error" ||
                      activeSessionReadiness.status === "not_found"
                        ? activeSessionReadiness.status
                        : "loading"
                    }
                  />
                ) : (
                  <EmptyState compact={compact} surface={surface} />
                )}
              </div>
            </div>
            <div className="ms-chat-thread__center">
              <div className="ms-chat-thread__center-content">
                <ComposerQueueStrip surface={surface} />
                <Composer
                  availableModelsError={availableModelsError}
                  hasAvailableModels={availableModels.length > 0}
                  availableProviders={providerOptions}
                  busyPlaceholder={busyPlaceholder}
                  compact={compact}
                  inputRef={composerInputRef}
                  isLoadingAvailableModels={isLoadingAvailableModels}
                  isSessionIdle={isSessionSelectionIdle}
                  isCancellingSession={isCancellingSession}
                  isSessionReady={isActiveSessionReady && runtimeCanSubmit}
                  runtimeTransient={runtimeTransient}
                  isSessionLoading={isActiveSessionLoading}
                  isSessionBusy={sessionBusy}
                  queueMode={queueMode}
                  showStopControl={showStopControl}
                  model={selectedModel}
                  modelOptions={modelOptions}
                  onProviderChange={setSelectedProviderValue}
                  provider={selectedProvider}
                  providerOptions={providerOptions}
                  onModelChange={setSelectedModelValue}
                  onReasoningEffortChange={setSelectedReasoningEffortValue}
                  onStop={() => {
                    void cancelActiveSession();
                  }}
                  reasoningEffortOptions={reasoningEffortOptions}
                  reasoningEffort={selectedReasoningEffort}
                  sessionUnavailableMessage={sessionUnavailableMessage}
                  sessionLoadingMessage={sessionLoadingMessage}
                  surface={surface}
                />
                <ComposerFooter surface={surface} />
              </div>
            </div>
          </div>
        ) : (
          <ThreadViewportShell>
            <ThreadPrimitive.Viewport
              ref={viewportRef}
              turnAnchor="top"
              className={cx(
                "ms-chat-thread__viewport",
                isPage ? "ms-chat-thread__viewport--page" : "ms-chat-thread__viewport--rail",
              )}
              style={isPage ? { scrollbarGutter: "stable" } : undefined}
            >
              <div
                className={cx("ms-chat-thread__messages", isPage && "ms-chat-thread__messages--page")}
              >
                {showThreadConnectingState ? (
                  <AgentConnectingState
                    activeStep={runtimeTransient ? "runtime" : connecting.activeStep}
                    agentName={activeAgentName ?? activeSessionSummary?.displayLabel ?? null}
                    agentUid={activeAgentUid}
                    runtimeStatus={runtimeStatus}
                  />
                ) : showReadinessState ? (
                  <SessionReadinessState
                    message={readinessStateMessage}
                    status={
                      activeSessionReadiness.status === "error" ||
                      activeSessionReadiness.status === "not_found"
                        ? activeSessionReadiness.status
                        : "loading"
                    }
                  />
                ) : (
                  <>
                    {!isPage && !sessionNotice ? (
                      <ThreadPrimitive.Empty>
                        <EmptyState compact={compact} surface={surface} />
                      </ThreadPrimitive.Empty>
                    ) : null}
                    <ThreadParticipantsStrip context={actorContext} participants={participants} />
                    <MessageActionsProvider value={messageActions}>
                      <ThreadPrimitive.Messages>{renderThreadMessage}</ThreadPrimitive.Messages>
                    </MessageActionsProvider>
                  </>
                )}
                <SessionNotice surface={surface} />
                <FooterInsetSpacer target={footerElement} />
              </div>
            </ThreadPrimitive.Viewport>
            {isPage ? (
              <div
                ref={setFooterElement}
                className="ms-chat-thread__footer ms-chat-thread__footer--page"
              >
                <div className="ms-chat-thread__footer-content ms-chat-thread__footer-content--page">
                  <ScrollToLatestButton />
                  <ComposerQueueStrip surface={surface} />
                  <Composer
                    availableModelsError={availableModelsError}
                    hasAvailableModels={availableModels.length > 0}
                    availableProviders={providerOptions}
                    busyPlaceholder={busyPlaceholder}
                    compact={compact}
                    inputRef={composerInputRef}
                    isLoadingAvailableModels={isLoadingAvailableModels}
                    isSessionIdle={isSessionSelectionIdle}
                    isCancellingSession={isCancellingSession}
                    isSessionReady={isActiveSessionReady && runtimeCanSubmit}
                  runtimeTransient={runtimeTransient}
                    isSessionLoading={isActiveSessionLoading}
                    isSessionBusy={sessionBusy}
                    queueMode={queueMode}
                    showStopControl={showStopControl}
                    model={selectedModel}
                    modelOptions={modelOptions}
                    onProviderChange={setSelectedProviderValue}
                    provider={selectedProvider}
                    providerOptions={providerOptions}
                    onModelChange={setSelectedModelValue}
                    onReasoningEffortChange={setSelectedReasoningEffortValue}
                    onStop={() => {
                      void cancelActiveSession();
                    }}
                    reasoningEffortOptions={reasoningEffortOptions}
                    reasoningEffort={selectedReasoningEffort}
                    sessionUnavailableMessage={sessionUnavailableMessage}
                    sessionLoadingMessage={sessionLoadingMessage}
                    surface={surface}
                  />
                  <ComposerFooter surface={surface} />
                </div>
              </div>
            ) : null}
            {!isPage ? (
              <div
                ref={setFooterElement}
                className="ms-chat-thread__footer"
              >
                <div className="ms-chat-thread__footer-content">
                  <ScrollToLatestButton />
                  <ComposerQueueStrip surface={surface} />
                  <Composer
                    availableModelsError={availableModelsError}
                    hasAvailableModels={availableModels.length > 0}
                    availableProviders={providerOptions}
                    busyPlaceholder={busyPlaceholder}
                    compact={compact}
                    inputRef={composerInputRef}
                    isLoadingAvailableModels={isLoadingAvailableModels}
                    isSessionIdle={isSessionSelectionIdle}
                    isCancellingSession={isCancellingSession}
                    isSessionReady={isActiveSessionReady && runtimeCanSubmit}
                  runtimeTransient={runtimeTransient}
                    isSessionLoading={isActiveSessionLoading}
                    isSessionBusy={sessionBusy}
                    queueMode={queueMode}
                    showStopControl={showStopControl}
                    model={selectedModel}
                    modelOptions={modelOptions}
                    onProviderChange={setSelectedProviderValue}
                    provider={selectedProvider}
                    providerOptions={providerOptions}
                    onModelChange={setSelectedModelValue}
                    onReasoningEffortChange={setSelectedReasoningEffortValue}
                    onStop={() => {
                      void cancelActiveSession();
                    }}
                    reasoningEffortOptions={reasoningEffortOptions}
                    reasoningEffort={selectedReasoningEffort}
                    sessionUnavailableMessage={sessionUnavailableMessage}
                    sessionLoadingMessage={sessionLoadingMessage}
                    surface={surface}
                  />
                  <ComposerFooter surface={surface} />
                </div>
              </div>
            ) : null}
          </ThreadViewportShell>
        )}
      </ThreadPrimitive.Root>
    </div>
  );
}
