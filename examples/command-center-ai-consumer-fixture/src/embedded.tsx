import { useEffect, useMemo, useState } from "react";

import {
  createStaticSiteIframeClient,
  type StaticSiteIframeContext,
} from "@dev-mainsequence/command-center-sdk/embed";
import {
  ChatEngineProvider,
  ChatThread,
  createChatBackendConnection,
  type ChatAuth,
  type ChatNotify,
} from "@dev-mainsequence/command-center-ai";

// An application embedded in Command Center. It holds no platform credential: its host sends its
// platform requests as the person through the SDK's static-site client.
let hostContext: StaticSiteIframeContext | null = null;
const contextListeners = new Set<() => void>();

const client = createStaticSiteIframeClient({
  channel: "mainsequence.reports",
  hostOrigin: "https://command-center.example.com",
  parentWindow: window.parent,
  onContext: (context) => {
    hostContext = context;
    contextListeners.forEach((listener) => listener());
  },
});
window.addEventListener("message", (event) => client.handleMessage(event));
client.announceReady();

// The base URL only builds the request paths; the host sends each request to its platform.
const connection = createChatBackendConnection({
  apiBaseUrl: window.location.origin,
  sendPlatformRequest: (request) => client.sendPlatformRequest(request),
});

function useHostContext() {
  const [context, setContext] = useState(hostContext);
  useEffect(() => {
    const listener = () => setContext(hostContext);
    contextListeners.add(listener);
    return () => {
      contextListeners.delete(listener);
    };
  }, []);
  return context;
}

export function EmbeddedAssistant({ environmentUid, notify }: { environmentUid: string; notify: ChatNotify }) {
  const userUid = useHostContext()?.userUid ?? null;
  const auth = useMemo<ChatAuth>(() => ({ userUid }), [userUid]);

  return (
    <ChatEngineProvider
      auth={auth}
      connection={connection}
      environmentUid={environmentUid}
      isVisible
      notify={notify}
      viewContext={{ app: "embedded-reports" }}
    >
      <ChatThread surface="page" viewer={{ uid: userUid ?? undefined }} />
    </ChatEngineProvider>
  );
}
