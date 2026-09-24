import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";

import { Button, Input } from "@dev-mainsequence/command-center-sdk/controls";

import {
  ChatEngineProvider,
  ChatThread,
  ModelProviderSettings,
  type ChatAuth,
  type ChatDefaultSession,
  type ChatNotice,
} from "../src";
import { createStandaloneConnection } from "./connection";

// The session this application keeps per person and Agent. The platform returns the same session
// for the same handle, so a reload opens the same transcript.
const sessionHandleUniqueId = "standalone_chat";
const sessionName = "Standalone chat";
const settingsStorageKey = "chat-standalone.settings";
const noticeLifetimeMs = 6_000;

interface StandaloneSettings {
  agentUid: string;
  apiBaseUrl: string;
  environmentUid: string;
  userUid: string;
}

interface ConnectedChat {
  settings: StandaloneSettings;
  token: string;
}

function readInitialSettings(): StandaloneSettings {
  const defaults: StandaloneSettings = {
    agentUid: import.meta.env.VITE_CHAT_AGENT_UID ?? "",
    apiBaseUrl: import.meta.env.VITE_CHAT_API_BASE_URL ?? "",
    environmentUid: import.meta.env.VITE_CHAT_ENVIRONMENT_UID ?? "",
    userUid: import.meta.env.VITE_CHAT_USER_UID ?? "",
  };

  try {
    const stored = window.localStorage.getItem(settingsStorageKey);
    return stored ? { ...defaults, ...(JSON.parse(stored) as Partial<StandaloneSettings>) } : defaults;
  } catch {
    return defaults;
  }
}

function rememberSettings(settings: StandaloneSettings) {
  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Storage is optional here.
  }
}

/**
 * A chat application built only on the chat package and the SDK: a form for the platform, the
 * person, and the Agent, then the chat with that Agent and the model provider settings.
 */
export function StandaloneApp() {
  const [settings, setSettings] = useState(readInitialSettings);
  // The token stays in memory only.
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState<ConnectedChat | null>(null);

  function update(field: keyof StandaloneSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function connect(event: FormEvent) {
    event.preventDefault();
    rememberSettings(settings);
    setConnected({ settings: { ...settings }, token });
  }

  if (connected) {
    return <StandaloneChat chat={connected} onDisconnect={() => setConnected(null)} />;
  }

  return (
    <main className="standalone">
      <h1>Chat</h1>
      <p className="standalone__lead">
        A chat application built only on the chat package. It talks to the same backend Command
        Center does.
      </p>

      <form className="standalone__form" onSubmit={connect}>
        <label>
          Platform API URL
          <Input
            required
            type="url"
            value={settings.apiBaseUrl}
            onChange={(event) => update("apiBaseUrl", event.target.value)}
          />
        </label>
        <label>
          Access token
          <Input
            required
            autoComplete="off"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <label>
          User UID
          <Input required value={settings.userUid} onChange={(event) => update("userUid", event.target.value)} />
        </label>
        <label>
          Organization Environment UID
          <Input
            required
            value={settings.environmentUid}
            onChange={(event) => update("environmentUid", event.target.value)}
          />
        </label>
        <label>
          Agent UID
          <Input required value={settings.agentUid} onChange={(event) => update("agentUid", event.target.value)} />
        </label>
        <Button className="standalone__submit" type="submit" variant="primary">
          Connect
        </Button>
      </form>
    </main>
  );
}

function StandaloneChat({ chat, onDisconnect }: { chat: ConnectedChat; onDisconnect: () => void }) {
  const { agentUid, apiBaseUrl, environmentUid, userUid } = chat.settings;
  const connection = useMemo(() => createStandaloneConnection(apiBaseUrl), [apiBaseUrl]);
  const auth = useMemo<ChatAuth>(
    () => ({ token: chat.token, tokenType: "Bearer", userUid }),
    [chat.token, userUid],
  );
  const defaultSession = useMemo<ChatDefaultSession>(
    () => ({
      agentUid,
      handleUniqueId: sessionHandleUniqueId,
      name: sessionName,
      status: "ready",
      unavailableMessage: "The Agent's session could not be opened. Check the Agent UID and try again.",
    }),
    [agentUid],
  );
  const viewer = useMemo(() => ({ uid: userUid }), [userUid]);
  const viewContext = useMemo(() => ({ app: "standalone-chat" }), []);
  const [view, setView] = useState<"chat" | "providers">("chat");
  const [notices, setNotices] = useState<Array<ChatNotice & { id: number }>>([]);
  const nextNoticeId = useRef(0);

  const notify = useCallback((notice: ChatNotice) => {
    nextNoticeId.current += 1;
    const id = nextNoticeId.current;
    setNotices((current) => [...current, { ...notice, id }]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((entry) => entry.id !== id));
    }, noticeLifetimeMs);
  }, []);

  return (
    <ChatEngineProvider
      auth={auth}
      connection={connection}
      defaultSession={defaultSession}
      environmentUid={environmentUid}
      isVisible
      notify={notify}
      showsDefaultSession
      viewContext={viewContext}
      onRequestVisible={() => setView("chat")}
    >
      <div className="standalone-chat">
        <header className="standalone-chat__header">
          <div className="standalone-chat__title">Chat</div>
          <nav className="standalone-chat__nav">
            <Button
              aria-pressed={view === "providers"}
              size="small"
              variant="outline"
              onClick={() => setView(view === "chat" ? "providers" : "chat")}
            >
              {view === "chat" ? "Model providers" : "Back to chat"}
            </Button>
            <Button size="small" variant="ghost" onClick={onDisconnect}>
              Disconnect
            </Button>
          </nav>
        </header>
        <main className="standalone-chat__main">
          {view === "chat" ? (
            <ChatThread surface="page" viewer={viewer} onOpenModelProviderSettings={() => setView("providers")} />
          ) : (
            <div className="standalone-chat__settings">
              <ModelProviderSettings auth={auth} connection={connection} notify={notify} />
            </div>
          )}
        </main>
        <div className="standalone-chat__notices" role="status" aria-live="polite">
          {notices.map((notice) => (
            <div key={notice.id} className={`standalone-chat__notice standalone-chat__notice--${notice.variant ?? "info"}`}>
              <strong>{notice.title}</strong>
              {notice.description ? <span>{notice.description}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </ChatEngineProvider>
  );
}
