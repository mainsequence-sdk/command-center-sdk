import { createContext, useContext } from "react";

/**
 * The words the thread shows. Each has a neutral default; an application passes its own through
 * `ChatThread`'s `copy`, for example to name its assistant.
 */
export interface ChatThreadCopy {
  /** The empty thread's title. */
  emptyTitle: string;
  /** The empty thread's line under the title. */
  emptyDescription: string;
  /** The composer's placeholder while a message can be written. */
  composerPlaceholder: string;
  /** The title while the session loads. */
  sessionLoadingTitle: string;
  /** The line while the session loads and nothing more precise is known. */
  sessionLoadingMessage: string;
  /** The title when the session cannot be opened. */
  sessionUnavailableTitle: string;
  /** The line under the composer. */
  disclaimer: string;
}

export const DEFAULT_CHAT_THREAD_COPY: ChatThreadCopy = {
  emptyTitle: "Ask the agent",
  emptyDescription: "Start a conversation with the agent.",
  composerPlaceholder: "Write a message",
  sessionLoadingTitle: "Loading session",
  sessionLoadingMessage: "Loading this session.",
  sessionUnavailableTitle: "Session unavailable",
  disclaimer: "Agents can make mistakes. Verify important outputs before acting.",
};

/** The defaults with the application's words laid over them. */
export function resolveChatThreadCopy(copy?: Partial<ChatThreadCopy> | null): ChatThreadCopy {
  if (!copy) {
    return DEFAULT_CHAT_THREAD_COPY;
  }

  const resolved = { ...DEFAULT_CHAT_THREAD_COPY };
  (Object.keys(DEFAULT_CHAT_THREAD_COPY) as Array<keyof ChatThreadCopy>).forEach((key) => {
    const value = copy[key];
    if (typeof value === "string" && value.trim()) {
      resolved[key] = value;
    }
  });
  return resolved;
}

/** The signed-in person, drawn on their own messages. */
export interface ChatViewer {
  uid?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

/** What the thread's parts read from the application, besides the engine. */
export interface ChatUiValue {
  copy: ChatThreadCopy;
  /** Opens the application's model provider settings; the actions that need it hide without it. */
  onOpenModelProviderSettings?: () => void;
  viewer: ChatViewer | null;
}

const ChatUiContext = createContext<ChatUiValue>({
  copy: DEFAULT_CHAT_THREAD_COPY,
  viewer: null,
});

export const ChatUiProvider = ChatUiContext.Provider;

export function useChatUi() {
  return useContext(ChatUiContext);
}
