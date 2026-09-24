---
name: build-chat-application
description: Mount the @dev-mainsequence/command-center-ai package in a Vite React application that uses @dev-mainsequence/command-center-sdk - install it next to the SDK, load the SDK stylesheets and then the chat stylesheet, build the backend connection, give ChatEngineProvider its inputs (the person's token, the Environment, an Agent's default session behind a stable handle, notifications), render ChatThread and ModelProviderSettings, and verify the result on the scripted stand-in and in a browser. Use for a new chat application or a chat screen inside a Command Center-compatible application. Do not use to change the platform, an Agent, or the chat package itself.
---

# Build A Chat Application

The chat package is everything a chat application needs to talk to the Main Sequence platform: the
backend connection, the session engine, the thread, and the model provider settings. The
application supplies who is chatting, with which Agent, and where the chat sits. The human guide is
`docs/build-a-chat-application.md` in the installed package.

## Confirm The Installed Surface

1. Read `node_modules/@dev-mainsequence/command-center-ai/package.json`: the version, the `exports`
   (`.`, `./styles.css`, `./package.json`), and the `peerDependencies`. Use only what the installed
   export map and declarations contain; an ADR or a newer checkout does not make an API available.
2. Install the chat next to the SDK it already uses:

   ```bash
   npm install @dev-mainsequence/command-center-ai @dev-mainsequence/command-center-sdk react react-dom
   ```

   The SDK, React, and React DOM are peers, so the application has exactly one of each. When npm
   reports `ERESOLVE` for the SDK peer, move the SDK into the chat's peer range. Never install a
   second SDK and never pass `--legacy-peer-deps`.
3. Import only `@dev-mainsequence/command-center-ai` and `@dev-mainsequence/command-center-ai/styles.css`. Never import
   `dist/`, `src/`, or a file inside the package.

## Load The Stylesheets Once, In Order

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/command-center-ai/styles.css";
```

Every chat rule is in the `ms-chat` cascade layer and every chat class starts with `ms-chat-`. The
SDK's component rules are not layered, so they win where both style one element, and the
application overrides the chat with ordinary rules. Do not copy the chat's CSS, do not add
Tailwind for it, and do not load the chat stylesheet before the SDK's.

## Mount The Engine

This is the shape of the package's standalone application, trimmed:

```tsx
import { useMemo, useState } from "react";

import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import {
  ChatEngineProvider,
  ChatThread,
  createChatBackendConnection,
  ModelProviderSettings,
  type ChatAuth,
  type ChatDefaultSession,
  type ChatNotify,
} from "@dev-mainsequence/command-center-ai";

const connection = createChatBackendConnection({ apiBaseUrl: "https://platform.example.com" });

interface ChatProps {
  agentUid: string;
  environmentUid: string;
  notify: ChatNotify;
  token: string | null;
  userUid: string;
}

export function Chat({ agentUid, environmentUid, notify, token, userUid }: ChatProps) {
  const auth = useMemo<ChatAuth>(() => ({ token, tokenType: "Bearer", userUid }), [token, userUid]);
  const defaultSession = useMemo<ChatDefaultSession>(
    () => ({ agentUid, handleUniqueId: "my_application_chat", name: "My application chat", status: "ready" }),
    [agentUid],
  );
  const [view, setView] = useState<"chat" | "providers">("chat");

  return (
    <ChatEngineProvider
      auth={auth}
      connection={connection}
      defaultSession={defaultSession}
      environmentUid={environmentUid}
      isVisible
      notify={notify}
      showsDefaultSession
      viewContext={{ app: "my-application" }}
      onRequestVisible={() => setView("chat")}
    >
      <Button size="small" onClick={() => setView(view === "chat" ? "providers" : "chat")}>
        {view === "chat" ? "Model providers" : "Back to chat"}
      </Button>
      {view === "chat" ? (
        <ChatThread surface="page" viewer={{ uid: userUid }} onOpenModelProviderSettings={() => setView("providers")} />
      ) : (
        <ModelProviderSettings auth={auth} connection={connection} notify={notify} />
      )}
    </ChatEngineProvider>
  );
}
```

Rules for the inputs:

- `connection`: from `createChatBackendConnection`. When the application is not served from an
  origin the platform allows, it also takes a request-URL rewrite; follow
  `connect-chat-to-the-platform`.
- `auth`: the person's current token, its type, and their user uid. When the application refreshes
  the token, it passes the new one in a new `auth` value; there is no refresh callback and the
  package never refreshes the person's token. With a `null` token the chat makes no platform
  request.
- `environmentUid`: the active Organization Environment. Session lists and details are scoped by it.
- `defaultSession` with `showsDefaultSession`: the Agent (`agentUid`), a stable
  `handleUniqueId`, the `name` a new session gets, `status` (`loading` until the application knows
  the Agent), and an optional `unavailableMessage`. The platform returns the same session for the
  same person, Agent, and handle, so choose one handle per application and keep it; the standalone
  application uses `standalone_chat`.
- `notify`: `(notice: ChatNotice) => void`. The chat renders no toaster; show `title`,
  `description`, and `variant` (`info`, `success`, `error`) the application's way.
- `isVisible`: false while the chat is off screen; the engine then stops hydrating, checking
  runtime access, and loading the catalog.
- `viewContext`: sent with every chat request as its `context`, opaque to the engine. Keep it
  small and JSON-safe, and put no secret in it.
- `onRequestVisible`: the engine asks for the chat to come on screen, for example when a session
  needs a model choice.
- `requestedSessionId`, `launchTarget`, `avoidImplicitSessionSelection`, and
  `onRequestedSessionRemoved` exist for applications that route to sessions; leave them out
  otherwise.

## Render The Thread And The Settings

- `ChatThread` renders inside `ChatEngineProvider`: `surface` (`page`, a full-width column, or
  `overlay`, a narrow rail), `compact`, `copy` (a partial `ChatThreadCopy` over
  `DEFAULT_CHAT_THREAD_COPY`, for the application's own words), `viewer` (`uid`, `name`,
  `avatarUrl`), and `onOpenModelProviderSettings`. Without that callback the picker's "Sign in to
  provider" action and the "Open model providers" button do not appear.
- `ModelProviderSettings` takes `connection`, `auth`, and `notify`; follow `manage-model-providers`.
- `AgentConnectingState` shows the connecting stage when the application prepares a session itself.
- The application's own buttons, badges, labels, and fields come from the SDK's `/controls`; follow
  the SDK skill `compose-command-center-controls`. The chat's own controls stay the chat's.

## Use The Standalone Application As The Golden Asset

The package ships its standalone application in `node_modules/@dev-mainsequence/command-center-ai/standalone/`:

- `main.tsx`: the stylesheets in order, the mount, and `?stand-in` in development;
- `StandaloneApp.tsx`: a connect form, then the engine with the Agent's default session, the
  thread, the model provider settings, and a small stack for notices;
- `connection.ts` and `platform-proxy.ts`: the connection and its request-URL rewrite.

Read it before writing and follow its structure. Its form is for trying the chat: a real
application takes the token from its own sign-in and keeps it out of storage and the build.

## Verify

1. Type-check and build the application.
2. Run it on the scripted stand-in, which answers every platform and Agent runtime route the chat
   calls and streams reasoning, a tool call, and text. Copy `standalone/stand-in/` and
   `standalone/platform-proxy.ts` from the installed package into development-only code and install
   it the way `standalone/main.tsx` does:

   ```ts
   if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("stand-in")) {
     const { installStandIn } = await import("./stand-in");
     installStandIn();
   }
   ```

   Any token works. `window.chatStandIn.failNextTurn()` makes the next turn fail, and
   `holdReplies()` holds replies so a run can be stopped. Keep it out of production bundles.
3. In a browser, on the stand-in: connect, send a message and watch the reasoning, the tool call,
   and the text stream in; stop a run; see a failed turn and its "Send again"; reload into the same
   transcript; open the model provider settings. Automate it with Playwright when the application
   has browser tests.
4. Against the platform, through the forwarder of `connect-chat-to-the-platform`.

## Ownership

- The chat owns the session engine, the thread and composer, the queue of messages written while
  the Agent works, readiness, the model picker, the provider screens, and its stylesheet.
- The application owns sign-in and token refresh, which Agent and which handle, where the chat sits,
  notifications, routing, and the forwarder.
- The platform owns authorization, sessions, and which Agents an Environment exposes; the Agent
  runtime owns the answers.
- The chat stores two browser keys: `main_sequence_ai.message_queue.{session}` in `sessionStorage`
  and `ms.main-sequence-ai.agent-sessions:{user}:{environment}` in `localStorage`. It reads no
  environment variable.
