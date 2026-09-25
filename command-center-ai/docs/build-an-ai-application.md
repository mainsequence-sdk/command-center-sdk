# Build an AI Application

This guide adds Command Center AI to a Vite React application that already uses the Command Center
SDK: a person signs in to the application and talks to one of the Organization's Agents through the
Main Sequence platform. Its agent skills are `build-command-center-ai-application`, for the
decisions, and `mount-agent-conversation`, for the engine.

## Decide first

Settle these before writing code:

- **Where the conversation lives.** In an application with pages of its own, a right rail beside
  them that expands into a full page, as in Command Center; see
  [The right rail and the expanded rail](./rail-and-expanded-rail.md). An application that is only
  a conversation shows the expanded rail as its main route.
- **Which Agent and session.** One Agent's default session behind a stable handle, or several
  sessions; see [AgentSession resolution](./agent-session-resolution.md).
- **How it reaches the platform.** The application's platform request sender, which adds the
  person's credential and renews it, the Environment, and, on its own origin, a forwarder; see
  [Connect to the platform](./connect-to-the-platform.md).
- **Where the model provider settings live.** See [Model providers](./model-providers.md).
- **Which deployment.** The production case is an application embedded in Command Center through
  the SDK's static-site iframe, with Command Center AI running inside it. Its host sends its
  platform requests as the person through the SDK's embed protocol; see
  [Connect to the platform](./connect-to-the-platform.md#inside-an-application-embedded-in-command-center).
  A standalone application on its own origin sends them itself.

## Install

```bash
npm install @dev-mainsequence/command-center-ai @dev-mainsequence/command-center-sdk react react-dom
npx command-center-ai skills install --path .
```

The SDK, React, and React DOM are peer dependencies, so an application has exactly one of each: one
SDK stylesheet and one set of `cc-*` classes. When npm reports `ERESOLVE` for the SDK, the
application's SDK is outside the package's peer range; move the SDK into it rather than forcing the
install. See [Getting started](./getting-started.md) for upgrades and the agent skills.

Import only `@dev-mainsequence/command-center-ai` and `@dev-mainsequence/command-center-ai/styles.css`.

## Load the stylesheets

Load the SDK's theme, component, and markdown stylesheets, then the package's, once:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/command-center-ai/styles.css";
```

Every rule of the package is in the `ms-chat` cascade layer, and every class starts with `ms-chat-`.
Because the SDK's component rules are not layered, they win where both style one element, and an
application restyles the package with ordinary rules. Its colours, type, radii, and shadows come
from the SDK theme's variables, so it follows the application's theme.

## Mount the engine, the thread, and the settings

`ChatEngineProvider` is the session engine: it opens the session, follows the Agent's readiness,
sends and cancels, and keeps the queue. `ChatThread` and `ModelProviderSettings` render inside it.
Mount it once, above both the right rail and the expanded rail, so they share the conversation.

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

// The application's own authentication: it adds the person's credential and renews it.
import { sendAuthenticatedRequest } from "./auth";

const connection = createChatBackendConnection({
  apiBaseUrl: "https://platform.example.com",
  sendPlatformRequest: sendAuthenticatedRequest,
});

interface AssistantProps {
  agentUid: string;
  environmentUid: string;
  notify: ChatNotify;
  userUid: string;
}

export function Assistant({ agentUid, environmentUid, notify, userUid }: AssistantProps) {
  const auth = useMemo<ChatAuth>(() => ({ userUid }), [userUid]);
  const defaultSession = useMemo<ChatDefaultSession>(
    () => ({ agentUid, handleUniqueId: "my_application_assistant", name: "My application assistant", status: "ready" }),
    [agentUid],
  );
  const [view, setView] = useState<"conversation" | "providers">("conversation");

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
      onRequestVisible={() => setView("conversation")}
    >
      <Button size="small" onClick={() => setView(view === "conversation" ? "providers" : "conversation")}>
        {view === "conversation" ? "Model providers" : "Back to the conversation"}
      </Button>
      {view === "conversation" ? (
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
| `auth` | Who is signed in: `{ userUid }`. The connection's `sendPlatformRequest` adds the credential and renews it. |
| `environmentUid` | The active Organization Environment. |
| `defaultSession`, `showsDefaultSession` | The Agent and a stable handle. The platform returns the same session for the same person, Agent, and handle, so every visit continues the same conversation. |
| `notify` | Shows a short notice (`title`, `description`, `variant`) the application's way; the package has no toaster. |
| `isVisible` | Whether the rail or the expanded rail is on screen. Off screen, the engine stops loading and checking. |
| `viewContext` | Sent with every request as its `context`. Small, JSON-safe, and without secrets. |
| `onRequestVisible` | Called when the engine needs the conversation on screen, for example to choose a model. |

`requestedSessionId`, `launchTarget`, `avoidImplicitSessionSelection`, and
`onRequestedSessionRemoved` serve applications that route to sessions; see
[AgentSession resolution](./agent-session-resolution.md) and the
[engine README](../src/engine/README.md).

`ChatThread` takes `surface` (`overlay` for the right rail, `page` for the expanded rail),
`compact`, `copy` (the thread's words over `DEFAULT_CHAT_THREAD_COPY`), `viewer`, and
`onOpenModelProviderSettings`. Without that callback, the picker's sign-in action and the "Open
model providers" button do not appear. The frame around it is in
[The right rail and the expanded rail](./rail-and-expanded-rail.md); the
[UI README](../src/ui/README.md) describes the thread.

## Start from the standalone application

The package ships a standalone application, [`standalone/`](../standalone/README.md): a form for the
platform, the person, and the Agent, then the engine with the Agent's default session, the thread,
the model provider settings, and a small stack for notices. It is the reference for every step
above. Its form is only for trying the package; a real application sends the platform requests with its
own sign-in and keeps the credential out of storage and out of the build.

## Verify

1. **On the scripted stand-in.** The [stand-in](../standalone/stand-in/README.md) answers every
   platform and Agent runtime route the package calls and streams reasoning, a tool call, and text,
   so the conversation runs with no platform and any token. The standalone application installs it
   for `?stand-in` in development. An application can copy `standalone/stand-in/` and
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

- The package owns the session engine, the thread and composer, the message queue, readiness, the
  model picker, the provider screens, and its stylesheet.
- The application owns sign-in and token refresh, the Agent and the handle, the right rail and the
  expanded rail, notifications, routing, and the forwarder to the platform.
- The platform owns authorization, sessions, and which Agents an Environment exposes. The Agent
  runtime owns the answers.

The package keeps two browser storage keys: `main_sequence_ai.message_queue.{session}` in
`sessionStorage`, one session's queued messages, and
`ms.main-sequence-ai.agent-sessions:{user}:{environment}` in `localStorage`, the person's session
list as summaries.
