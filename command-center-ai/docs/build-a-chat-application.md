# Build a Chat Application

This guide mounts the chat in a Vite React application that already uses the Command Center SDK:
a person signs in to the application, and the chat talks to one of the Organization's Agents
through the Main Sequence platform. Its agent skill is `build-chat-application`.

## Install

```bash
npm install @dev-mainsequence/command-center-ai @dev-mainsequence/command-center-sdk react react-dom
```

The SDK, React, and React DOM are peer dependencies of the chat, so an application has exactly one
of each: one SDK stylesheet and one set of `cc-*` classes. When npm reports `ERESOLVE` for the SDK,
the application's SDK is outside the chat's peer range; move the SDK into it rather than forcing
the install.

Import only `@dev-mainsequence/command-center-ai` and `@dev-mainsequence/command-center-ai/styles.css`.

## Load the stylesheets

Load the SDK's theme, component, and markdown stylesheets, then the chat's, once:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/command-center-ai/styles.css";
```

Every chat rule is in the `ms-chat` cascade layer, and every chat class starts with `ms-chat-`.
Because the SDK's component rules are not layered, they win where both style one element, and an
application restyles the chat with ordinary rules. The chat's colours, type, radii, and shadows come
from the SDK theme's variables, so the chat follows the application's theme.

## Mount the engine, the thread, and the settings

`ChatEngineProvider` is the session engine: it opens the session, follows the Agent's readiness,
sends and cancels, and keeps the queue. `ChatThread` and `ModelProviderSettings` render inside it.

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

The engine's inputs:

| Input | What the application passes |
| --- | --- |
| `connection` | The connection to the platform; see [Connect to the platform](./connect-to-the-platform.md). |
| `auth` | The person's current token, its type, and their user uid. When the application refreshes the token it passes the new one; there is no refresh callback. With no token the chat makes no platform request. |
| `environmentUid` | The active Organization Environment. |
| `defaultSession`, `showsDefaultSession` | The Agent and a stable handle. The platform returns the same session for the same person, Agent, and handle, so every visit continues the same conversation. |
| `notify` | Shows a short notice (`title`, `description`, `variant`) the application's way; the chat has no toaster. |
| `isVisible` | Whether the chat is on screen. Off screen, the engine stops loading and checking. |
| `viewContext` | Sent with every chat request as its `context`. Small, JSON-safe, and without secrets. |
| `onRequestVisible` | Called when the engine needs the chat on screen, for example to choose a model. |

`requestedSessionId`, `launchTarget`, `avoidImplicitSessionSelection`, and
`onRequestedSessionRemoved` serve applications that route to sessions; the
[engine README](../src/engine/README.md) describes them.

`ChatThread` takes `surface` (`page` or `overlay`), `compact`, `copy` (the thread's words over
`DEFAULT_CHAT_THREAD_COPY`), `viewer`, and `onOpenModelProviderSettings`. Without that callback,
the picker's sign-in action and the "Open model providers" button do not appear. The
[UI README](../src/ui/README.md) describes the thread.

## Start from the standalone application

The package ships a standalone chat application, [`standalone/`](../standalone/README.md): a form
for the platform, the person, and the Agent, then the engine with the Agent's default session, the
thread, the model provider settings, and a small stack for notices. It is the reference for every
step above. Its form is only for trying the chat; a real application gets the token from its own
sign-in and keeps it out of storage and out of the build.

## Verify

1. **On the scripted stand-in.** The [stand-in](../standalone/stand-in/README.md) answers every
   platform and Agent runtime route the chat calls and streams reasoning, a tool call, and text, so
   the chat runs with no platform and any token. The standalone application installs it for
   `?stand-in` in development. An application can copy `standalone/stand-in/` and
   `standalone/platform-proxy.ts` from the installed package into development-only code and install
   it the same way:

   ```ts
   if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("stand-in")) {
     const { installStandIn } = await import("./stand-in");
     installStandIn();
   }
   ```

   In the browser console, `chatStandIn.failNextTurn()` fails the next turn and
   `chatStandIn.holdReplies()` holds replies so a run can be stopped. Keep it out of production.
2. **In a browser.** Connect, send a message and watch it stream in, stop a run, fail a turn and send
   it again, reload into the same transcript, and open the model provider settings.
3. **Against the platform**, through the application's forwarder.

## What stays where

- The chat owns the session engine, the thread and composer, the message queue, readiness, the
  model picker, the provider screens, and its stylesheet.
- The application owns sign-in and token refresh, the Agent and the handle, where the chat sits,
  notifications, routing, and the forwarder to the platform.
- The platform owns authorization, sessions, and which Agents an Environment exposes. The Agent
  runtime owns the answers.

The chat keeps two browser storage keys: `main_sequence_ai.message_queue.{session}` in
`sessionStorage`, one session's queued messages, and
`ms.main-sequence-ai.agent-sessions:{user}:{environment}` in `localStorage`, the person's session
list as summaries.
