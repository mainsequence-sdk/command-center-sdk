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

// Deployed, the host sends each request to its platform. A top-level page under `vite serve` has no
// host, so in local development the dev server's platformRequestProxy() sends it instead; a
// production build replaces import.meta.env.DEV with false and always takes the host path.
const runsWithoutHost = import.meta.env.DEV && window.parent === window;

// The base URL only builds the request paths.
const connection = createChatBackendConnection({
  apiBaseUrl: window.location.origin,
  sendPlatformRequest: runsWithoutHost
    ? sendThroughDevServer
    : (request) => client.sendPlatformRequest(request),
});

// Local development only: the dev server adds the developer's token.
async function sendThroughDevServer(request: Request): Promise<Response> {
  const { pathname, search } = new URL(request.url);
  return fetch(`/__mainsequence__${pathname}${search}`, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" ? undefined : await request.text(),
    signal: request.signal,
  });
}

// Without a host there is no context: the developer's uid comes from the platform.
function useDeveloperUid() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    if (!runsWithoutHost) return;
    const abort = new AbortController();
    void fetch("/__mainsequence__/api/v1/users/me/", {
      headers: { accept: "application/json" },
      signal: abort.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<{ uid?: unknown }>) : null))
      .then((user) => {
        if (typeof user?.uid === "string") setUid(user.uid);
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, []);
  return uid;
}

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
  const hostUserUid = useHostContext()?.userUid ?? null;
  const developerUid = useDeveloperUid();
  const userUid = runsWithoutHost ? developerUid : hostUserUid;
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
