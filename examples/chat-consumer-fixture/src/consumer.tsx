import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import {
  AgentConnectingState,
  ChatEngineProvider,
  ChatThread,
  createChatBackendConnection,
  DEFAULT_CHAT_THREAD_COPY,
  invalidateModelProviderCatalog,
  ModelProviderSettings,
  type ChatAuth,
  type ChatDefaultSession,
  type ChatNotice,
  type ChatNotify,
  type ChatThreadCopy,
} from "@dev-mainsequence/chat";

// The SDK's theme, component, and markdown stylesheets, then the chat's, once, in this order.
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/chat/styles.css";

// The application's own origin forwards platform requests; the Agent's runtime is called directly.
const connection = createChatBackendConnection({
  apiBaseUrl: "https://platform.example.com",
  rewriteRequestUrl: (url, target) =>
    target === "platform" ? `/__platform__${url.pathname}${url.search}` : url.toString(),
});

const defaultSession: ChatDefaultSession = {
  agentUid: "00000000-0000-4000-8000-000000000003",
  handleUniqueId: "packed_consumer_chat",
  name: "Packed consumer chat",
  status: "ready",
  unavailableMessage: "The Agent's session could not be opened.",
};

const copy: Partial<ChatThreadCopy> = {
  emptyTitle: "Ask the packed agent",
  composerPlaceholder: DEFAULT_CHAT_THREAD_COPY.composerPlaceholder,
};

/**
 * A chat application built only from the packed chat and SDK tarballs: the engine with the
 * Agent's default session, the thread, and the model provider settings.
 */
export function PackedChatApplication({ token, userUid }: { token: string | null; userUid: string }) {
  // A refreshed token arrives here as a new value; the engine uses it for the next request.
  const auth = useMemo<ChatAuth>(() => ({ token, tokenType: "Bearer", userUid }), [token, userUid]);
  const [view, setView] = useState<"chat" | "providers">("chat");
  const [notices, setNotices] = useState<ChatNotice[]>([]);
  const notify: ChatNotify = (notice) => setNotices((current) => [...current, notice]);

  return (
    <ChatEngineProvider
      auth={auth}
      connection={connection}
      defaultSession={defaultSession}
      environmentUid="00000000-0000-4000-8000-000000000002"
      isVisible
      notify={notify}
      showsDefaultSession
      viewContext={{ app: "chat-consumer-fixture" }}
      onRequestVisible={() => setView("chat")}
    >
      <Button size="small" onClick={() => setView(view === "chat" ? "providers" : "chat")}>
        {view === "chat" ? "Model providers" : "Back to chat"}
      </Button>
      {view === "chat" ? (
        <ChatThread
          copy={copy}
          surface="page"
          viewer={{ uid: userUid }}
          onOpenModelProviderSettings={() => setView("providers")}
        />
      ) : (
        <ModelProviderSettings auth={auth} connection={connection} notify={notify} />
      )}
      <output>{notices.map((notice) => notice.title).join("\n")}</output>
    </ChatEngineProvider>
  );
}

export const connectingStageMarkup = renderToStaticMarkup(
  <AgentConnectingState activeStep="runtime" agentName="Packed Agent" />,
);

export function refreshModelCatalog() {
  invalidateModelProviderCatalog();
}
