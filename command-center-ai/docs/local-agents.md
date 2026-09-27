# An Agent on Your Machine

A developer who runs an Agent with `ms-tau` in local mode gets the same chat as a deployed
application: the rail, the expanded rail, streaming markdown, reasoning, tool calls, the queue,
Stop, and the model picker. Only the source changes: `ChatEngineProvider` talks to the runtime on
the developer's machine instead of the platform
([ADR 099](./adr/adr-099-local-agents-through-the-same-engine.md)).

## Start the Agent

In the Agent's project, with the `ms-tau-sdk` settings for local mode (its quick start lists them):

```bash
export TAU_LOCAL_MODE=true
export MAINSEQUENCE_AUTH_MODE=jwt
export MAINSEQUENCE_ACCESS_TOKEN="<your access token>"
export MAINSEQUENCE_REFRESH_TOKEN="<your refresh token>"
export TAU_LOCAL_PROVIDER="<provider>"
export TAU_LOCAL_MODEL="<model>"
uv run ms-tau
```

It listens on `http://127.0.0.1:8787`. It has no inbound authentication: whoever reaches it acts as
you, with your platform credential. Keep it on this machine.

## Forward it from the dev server

The page never calls the runtime directly. The Command Center SDK's `localAgentProxy()` (SDK
`^0.5.7`, from `/vite`) forwards the chat's routes from the application's own dev server:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localAgentProxy } from "@dev-mainsequence/command-center-sdk/vite";

export default defineConfig({ plugins: [react(), localAgentProxy()] });
```

It serves `/__agent__` under `vite serve` only, to the page it serves, from this machine, and only
for the chat's routes; it strips credentials and caller headers. `MAINSEQUENCE_TAU_LOCAL_ORIGIN` or
`localAgentProxy({ target })` points it at another port on this machine.

## Mount the local source

```tsx
import { ChatEngineProvider, ChatRail, ChatThread, createLocalAgentSource } from "@dev-mainsequence/command-center-ai";

const localAgent = createLocalAgentSource({ baseUrl: "/__agent__", displayName: "CRM assistant" });

<ChatEngineProvider source={localAgent} isVisible={visible} notify={notify} viewContext={context}>
  <ChatRail title="CRM assistant" onClose={close} onExpand={expand}>
    <ChatThread surface="overlay" />
  </ChatRail>
</ChatEngineProvider>
```

With a source, the provider takes no `connection`, `auth`, `environmentUid`, or `defaultSession`.
`createLocalAgentSource` refuses an address on another origin. The application chooses the source,
for example from its own bootstrap in development, and builds for the platform source: a production
build has no `/__agent__`.

## What differs from the platform

| | Platform source | Local source |
| --- | --- | --- |
| Sessions | The platform's AgentSessions | The runtime's sessions; the page's first one is the runtime's default conversation, and New session starts another |
| Reload | The platform's history | The runtime's history, once it serves it (`ms-tau-sdk` issue #47). Until then a reload starts over and the thread says so |
| Readiness | The platform's runtime decision, then the Agent's check | `/ready`, then the Agent's check. An Agent that is not running is unavailable, and the chat looks for it again every few seconds |
| Model picker | The session's model on the platform | The session's model on the runtime. A new conversation's first message uses the model the runtime was started with |
| Archive, search, insights, provider settings, Agent icons | Yes | Not offered; the explorer and footer hide them |

`useChatEngine().capabilities` says which of these the mounted source offers.

## Try it without an Agent

The package's standalone application runs the local source against a scripted runtime:
`npm run ai:dev` and open `/?stand-in&local`. Open `/?local` to talk to a real `ms-tau` on
`127.0.0.1:8787` through the dev server's `localAgentProxy()`.
