---
name: mount-agent-conversation
description: Mount Command Center AI's session engine (@dev-mainsequence/command-center-ai) in a Vite React application that uses @dev-mainsequence/command-center-sdk - load the SDK stylesheets and then the package's, build the backend connection, give ChatEngineProvider its inputs (the person's token, the Environment, an Agent's default session behind a stable handle, notifications, visibility), render ChatThread and ModelProviderSettings, and verify on the scripted stand-in and in a browser. Use when wiring the conversation into an application. Do not use to change the platform, an Agent, or the package itself.
---

# Mount An Agent Conversation

The engine is everything the conversation needs to talk to the Main Sequence platform: the session,
the thread's state, readiness, the queue, and the model selection. The application supplies who is
talking, with which Agent, and where the conversation sits. The human guide is
`docs/build-an-ai-application.md` in the installed package.

## Confirm The Installed Surface

Install and resolve the package with `$use-command-center-ai`. Import only
`@dev-mainsequence/command-center-ai` and `@dev-mainsequence/command-center-ai/styles.css`; an ADR
or a newer checkout does not make an API available.

## Load The Stylesheets Once, In Order

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/command-center-ai/styles.css";
```

Every rule of the package is in the `ms-chat` cascade layer, and every class starts with `ms-chat-`.
The SDK's component rules are not layered, so they win where both style one element, and the
application overrides the package with ordinary rules that use SDK tokens. Do not copy the
package's CSS, do not add Tailwind for it, and do not load its stylesheet before the SDK's.

## Mount The Engine Once

Mount one `ChatEngineProvider` above everything that shows the conversation: the right rail and the
expanded rail share it (`$compose-command-center-ai-rail`). This is the shape of the package's
standalone application, trimmed:

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

interface AssistantProps {
  agentUid: string;
  environmentUid: string;
  notify: ChatNotify;
  token: string | null;
  userUid: string;
}

export function Assistant({ agentUid, environmentUid, notify, token, userUid }: AssistantProps) {
  const auth = useMemo<ChatAuth>(() => ({ token, tokenType: "Bearer", userUid }), [token, userUid]);
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

Rules for the inputs:

- `connection`: from `createChatBackendConnection`. When the application is not served from an
  origin the platform allows, it also takes a request-URL rewrite; follow
  `$connect-command-center-ai-to-the-platform`.
- `auth`: the person's current token, its type, and their user uid. When the application refreshes
  the token, it passes the new one in a new `auth` value; there is no refresh callback, and the
  package never refreshes the person's token. With a `null` token the engine makes no platform
  request.
- `environmentUid`: the active Organization Environment. Session lists and details are scoped by it.
- `defaultSession` with `showsDefaultSession`: the Agent (`agentUid`), a stable `handleUniqueId`,
  the `name` a new session gets, `status` (`loading` until the application knows the Agent), and
  an optional `unavailableMessage`. The platform returns the same session for the same person,
  Agent, and handle, so choose one handle per application and keep it.
- `notify`: `(notice: ChatNotice) => void`. The package renders no toaster; show `title`,
  `description`, and `variant` (`info`, `success`, `error`) the application's way.
- `isVisible`: true only while the rail is open or the expanded rail is on screen; off screen the
  engine stops hydrating, checking runtime access, and loading the catalog.
- `viewContext`: sent with every request as its `context`, opaque to the engine. Keep it small and
  JSON-safe, and put no secret in it.
- `onRequestVisible`: the engine asks for the conversation to come on screen, for example when a
  session needs a model choice.
- `requestedSessionId`, `launchTarget`, `avoidImplicitSessionSelection`, and
  `onRequestedSessionRemoved` choose other sessions; follow `$manage-agent-sessions`.

## Render The Thread And The Settings

- `ChatThread` renders inside the provider. Its frame, surface, words, and viewer are in
  `$compose-command-center-ai-rail`.
- `ModelProviderSettings` takes `connection`, `auth`, and `notify`; follow `$manage-model-providers`.
- `AgentConnectingState` shows the connecting stage when the application prepares a session itself.
- The application's own buttons, badges, labels, and fields come from the SDK's `/controls`
  (`$compose-command-center-controls`). The package's own controls stay the package's.

## Use The Standalone Application As The Golden Asset

The package ships its standalone application in
`node_modules/@dev-mainsequence/command-center-ai/standalone/`:

- `main.tsx`: the stylesheets in order, the mount, and `?stand-in` in development;
- `StandaloneApp.tsx`: a connect form, then the engine with the Agent's default session, the
  thread, the model provider settings, and a small stack for notices;
- `connection.ts` and `platform-proxy.ts`: the connection and its request-URL rewrite.

Read it before writing and follow its structure. Its form is only for trying the package: a real
application takes the token from its own sign-in and keeps it out of storage and the build.

## Do Not Rebuild Owned Behavior

- The package owns the session engine, the thread and composer, the queue of messages written while
  the Agent works, readiness, the model picker, the provider screens, and its stylesheet.
- The application owns sign-in and token refresh, which Agent and which handle, where the
  conversation sits, notifications, routing, and the forwarder.
- The platform owns authorization, sessions, and which Agents an Environment exposes; the Agent
  runtime owns the answers.
- The package keeps two browser keys, `main_sequence_ai.message_queue.{session}` in
  `sessionStorage` and `ms.main-sequence-ai.agent-sessions:{user}:{environment}` in
  `localStorage`, and reads no environment variable.

## Verify

1. Type-check and build the application, and run `command-center-sdk theme audit` over its CSS.
2. Run it on the scripted stand-in, which answers every platform and Agent runtime route the package
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
4. Against the platform, through the forwarder of `$connect-command-center-ai-to-the-platform`.
