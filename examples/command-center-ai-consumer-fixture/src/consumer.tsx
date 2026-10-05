import { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import {
  AgentConnectingState,
  ChatEngineProvider,
  ChatLauncher,
  ChatPageLayout,
  ChatRail,
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
  useChatComposerState,
} from "@dev-mainsequence/command-center-ai";

// The SDK's theme, component, and markdown stylesheets, then the chat's, once, in this order.
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/command-center-ai/styles.css";

// The application's own sign-in state. The chat never sees it: the application owns authentication.
let accessToken: string | null = null;

/** The application's own renewal, for example a refresh-token exchange. */
async function renewAccessToken(): Promise<boolean> {
  return false;
}

function withAccessToken(request: Request) {
  const headers = new Headers(request.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return new Request(request, { headers });
}

/** Sends the chat's platform requests as the signed-in person, renewing once when refused. */
async function sendPlatformRequest(request: Request): Promise<Response> {
  // A request's body can be sent once, so the retry needs its own copy.
  const retry = request.clone();
  const response = await fetch(withAccessToken(request));
  if (response.status !== 401 || !(await renewAccessToken())) {
    return response;
  }
  return fetch(withAccessToken(retry));
}

// The application's own origin forwards platform requests; the Agent's runtime is called directly.
const connection = createChatBackendConnection({
  apiBaseUrl: "https://platform.example.com",
  rewriteRequestUrl: (url, target) =>
    target === "platform" ? `/__platform__${url.pathname}${url.search}` : url.toString(),
  sendPlatformRequest,
});

/** The application signed someone in, or renewed their token. */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

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

/** Whether the assistant can take a message, in the words the composer shows. */
function AssistantStatusLine() {
  const { reason, status } = useChatComposerState();
  return <p data-assistant-status={status}>{reason ?? "Ready"}</p>;
}

/**
 * A chat application built only from the packed chat and SDK tarballs: the engine with the
 * Agent's default session, the right rail and the expanded rail from the package, and the model
 * provider settings.
 */
export function PackedChatApplication({ userUid }: { userUid: string }) {
  // The connection sends every platform request with the application's authentication, so the
  // chat only needs to know who is signed in.
  const auth = useMemo<ChatAuth>(() => ({ userUid }), [userUid]);
  const [view, setView] = useState<"chat" | "rail" | "providers">("chat");
  const [sessionId, setSessionId] = useState<string | null>(null);
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
      requestedSessionId={sessionId}
      showsDefaultSession
      viewContext={{ app: "command-center-ai-consumer-fixture" }}
      onRequestVisible={() => setView("chat")}
    >
      <Button size="small" onClick={() => setView(view === "chat" ? "providers" : "chat")}>
        {view === "chat" ? "Model providers" : "Back to chat"}
      </Button>
      <AssistantStatusLine />
      {view === "chat" ? (
        <ChatPageLayout
          explorer={{ onOpenSession: setSessionId }}
          onCreateSession={() => setSessionId(null)}
          onMinimize={() => setView("rail")}
        >
          <ChatThread
            copy={copy}
            surface="page"
            viewer={{ uid: userUid }}
            onOpenModelProviderSettings={() => setView("providers")}
          />
        </ChatPageLayout>
      ) : view === "rail" ? (
        <ChatRail
          title="Packed agent"
          subtitle="Assistant rail."
          mode="overlay"
          onExpand={() => setView("chat")}
          onClose={() => setView("providers")}
        >
          <ChatThread copy={copy} surface="overlay" viewer={{ uid: userUid }} />
        </ChatRail>
      ) : (
        <ModelProviderSettings
          auth={auth}
          connection={connection}
          notify={notify}
          organizationEnvironmentUid="00000000-0000-4000-8000-000000000002"
          renderSharing={(provider) => (
            <p data-provider-uid={provider.uid} data-resource={provider.resource}>
              {provider.name} in {provider.organizationEnvironmentUid}
            </p>
          )}
        />
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

export const launcherMarkup = renderToStaticMarkup(
  <ChatLauncher label="Ask the packed agent" onClick={() => {}} />,
);
