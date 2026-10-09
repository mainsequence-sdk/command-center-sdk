# Changelog

## Unreleased

- **Tool timeouts show as "Timed out", and returned tool errors no longer show "Done".**
  The thread honors `details.is_error` as well as the outer `isError`, including saved history.
  It shows a timeout badge only for `details.failure: "timeout"` and preserves the runtime's
  explanation; genuine `access_unavailable` failures stay distinct. The UI README, conversation
  contract, and `design-agent-conversation-capabilities` skill describe this behavior.
  For this correction there are no npm API, stylesheet class, browser storage, skill name/path,
  installer, SDK peer range, platform route, or payload changes. The existing payload is read;
  no backend deployment or storage migration is required for the rendering correction.

## 0.0.12

Compatibility axes: one new regular dependency, `zustand`; additive npm API (`describeToolActivity`
takes the call's arguments, `ToolActivity.application`, the `ToolActivityApplication` type); the
words people read for an application's tools; the content of the packaged skill
`design-agent-conversation-capabilities`. No stylesheet class, browser storage key, skill name or
path, installer behavior, SDK peer range, platform route, or payload changes.

- **The chat names an application's tool, not the runtime's `call_tool`.** Since ms-tau ADR 0021
  each application an Agent declares reaches the model as `<name>__list_tools` and
  `<name>__call_tool`, and a call names the application's tool in its arguments
  (`{ "tool": "list_namespaces", "arguments": { ... } }`). The tool card showed
  `metatables__call_tool` as a built-in tool while the call ran, and once it ran labelled
  `list_namespaces` as a Main Sequence MCP tool. It now shows `list_namespaces`, marked MCP and
  labelled `metatables`, from the first moment; its input shows only the tool's `arguments`;
  `<name>__list_tools` shows as `list_tools` of that application. The header counts both as MCP
  tools, and the run status and collapsed preview say "Using metatables MCP tool
  list_namespaces" and "Listing metatables MCP tools". `describeToolActivity(toolName, result,
  args)` takes the call's arguments as an optional third argument, and `ToolActivity` gains
  `application` (`{ name, operation }`, or `null`). The
  [conversation contract](./docs/conversation-contract.md) and
  `design-agent-conversation-capabilities` describe the application tools.
- **The chat installs the zustand `@assistant-ui/core` needs.** Core imports `useShallow` from
  `zustand/shallow` but declares zustand `^5.0.11` only as an optional peer. In an application
  whose own zustand is 4.x, for example through `@xyflow/react` 12, npm left core resolving that
  zustand 4 and Vite's dependency prebundle failed with `"useShallow" is not exported by
  node_modules/zustand/esm/shallow.mjs`. The package now depends on `zustand` `^5.0.11`, so npm
  installs zustand 5 next to core while the application's other packages keep their zustand 4. An
  application that added zustand 5 as its own dependency only for this can drop it.

## 0.0.11

Compatibility axes: the words people read, and the content of the packaged skills
`mount-agent-conversation` and `build-command-center-ai-application`. No export, stylesheet class,
browser storage key, skill name or path, installer behavior, SDK peer range, platform route, or
payload changes.

- **An embedded application gets its Environment and its Agent from its own API.** It no longer
  pins both as build values per Environment, which went stale when the Agent was re-created with a
  new UID. Its own API, a FastAPI release in the same Environment, knows the Environment
  (`MAINSEQUENCE_ORGANIZATION_ENVIRONMENT_UID`), finds the Agent its branch deploys once its
  `access` block names that Agent, and returns both from an endpoint the application already calls;
  the assistant shows as `loading` until then. `mount-agent-conversation` replaces "Name The
  Environment And The Agent Per Environment" with "Get The Environment And The Agent From Your
  API", and `build-command-center-ai-application`, the
  [application guide](./docs/build-an-ai-application.md) and the
  [AgentSession Resolution](./docs/agent-session-resolution.md) guide say the same. SDK `0.5.17`'s
  `maintain-command-center-code-repository` skill stops asking for the Agent's UIDs in the
  workflow file.
- **The sharing disclosure names Organization admins.** The Details and sharing dialog, the
  [model providers](./docs/model-providers.md) guide and the `manage-model-providers` skill now
  say that Organization admins can receive and use any configured provider in the Organization
  without a share, that their usage counts against it, and that an admin with none of their own
  for a provider gets the first one added in that Environment. The platform always behaved
  this way; only the words are new.
- **Messages people read use plain words.** The `Source:` label on an error now names what was
  happening ("Connecting to the Agent", "Loading the session", "Sending to the Agent", "Loading
  available models", …) instead of internal API names. A failed request reports the "Server
  response" instead of the "Backend response". Session, model and thread notices no longer
  mention AgentSession, the backend or the runtime.
- The session-reload notice now matches the engine's message. Before, the thread looked for a
  different sentence, so its "Session not loaded" title never showed.
- The [AgentSession Resolution](./docs/agent-session-resolution.md) guide quotes the new
  history-failure notice.

## 0.0.10

- Existing provider settings support multiple named configurations, Environment-scoped catalog reads, and per-configuration sign-in/revoke.
- Provider details show the credential-delivery disclosure before the host application’s sharing controls, for built-ins and custom endpoints. Command Center reuses its existing user/team/workload permissions editor.
- npm API: optional `organizationEnvironmentUid` and `renderSharing` props on `ModelProviderSettings`; configured names are additive catalog data. Platform paths and schema versions are unchanged; optional `custom_id` and Environment fields extend existing operations. Deploy the supporting platform before this package and its product integration.
- The existing provider guide and installed skill are updated. No skill names, stylesheet classes, browser storage keys, installer behavior or SDK peer range change. Catalog caches now distinguish Environments.

## 0.0.9

Compatibility axes: the skill installer's behavior, and the content of the packaged skills
`mount-agent-conversation` and `build-command-center-ai-application`. No export, skill name or
path, provenance field, platform route, storage, or SDK peer change: the peer range stays `^0.5.3`.
The skills route to the section "Point Each Environment At Its Own APIs" of the SDK's
`maintain-command-center-code-repository` skill, which SDK `0.5.14` and later install.

- **An embedded application names its Environment and its Agent for each Environment.** The
  engine's `environmentUid` must be the Agent's own Environment: an Agent belongs to the branch it
  was deployed from, and the platform lists only the sessions of Agents in the Environment passed,
  so a mismatched pair shows an empty session list without an error. An application embedded in
  Command Center gets no Environment from the host and must not use the person's Command Center
  Environment, which the platform keeps to Command Center's own screens. It now writes both as
  build values (`spec.build_environment`, for example `VITE_ENVIRONMENT_UID` and
  `VITE_AGENT_UID`) in the Environment-scoped workflow file that already names its API releases,
  shows the assistant as unavailable when either is missing, and keeps local values in
  `.env.development`. `mount-agent-conversation` gains "Name The Environment And The Agent Per
  Environment" and a check for every deployed Environment, `build-command-center-ai-application` a
  "Which Environment" decision, and the application and session-resolution guides the same.
- **Concurrent installs no longer fail.** Installing the package into several workspaces at once
  (`npm install @dev-mainsequence/command-center-ai --workspace a --workspace b`) nests one copy per
  workspace, and npm runs their postinstalls together into the same repository. One install renamed
  entries another was moving, failed with `ENOENT` or `ENOTEMPTY`, and failed the whole `npm
  install`. Installs now take turns through `.agents/skills/.command-center-ai.lock`: the first
  installs, the others wait, then install against what it left, and every one succeeds. A lock left
  by an install that exited is cleared. The SDK's installer has the same fix, for parity.
- The platform guide and the `connect-command-center-ai-to-the-platform` skill describe local
  development with the session `command-center-sdk login` saves (SDK ADR 017), and keep the
  environment token for an SDK without that command. The package itself is unchanged.

## 0.0.8

Compatibility axes: none beyond behaviour; no API, route, payload, stylesheet, storage, skill, or
SDK peer change.

- **The local source's model picker tells the truth.** Found against a real `ms-tau` in the CRM:
  before a local conversation's first answer the picker showed the catalog's first model while the
  runtime answered with its configured one, and after the answer it kept showing it, because the
  session's model was read while the turn was still running. The picker now leads with "Local
  Agent / Configured by the local Agent" until the runtime reports the session's model, reads it
  again whenever a run ends, and applies a model chosen before the first answer as soon as the
  session exists.

## 0.0.7

Compatibility axes: the npm public API, additively (`createLocalAgentSource`, `LocalAgentSource`,
`LocalAgentSourceOptions`, `LocalChatEngineProviderProps`, `ChatEngineCapabilities`, the provider's
`source` prop, and `capabilities` on `useChatEngine()`); browser storage, additively (a local
source keeps its selected session under `ms.command-center-ai.local-session:{baseUrl}`); and the
packaged agent skills (`connect-command-center-ai-to-the-platform`, `mount-agent-conversation`, and
`use-command-center-ai` cover a local Agent). No platform route, payload, stylesheet, or SDK peer
change; the platform engine is unchanged.

- **An Agent on the developer's machine** ([ADR 099](./docs/adr/adr-099-local-agents-through-the-same-engine.md)).
  `ChatEngineProvider source={createLocalAgentSource({ baseUrl: "/__agent__", displayName })}`
  talks to an Agent run with `ms-tau` in local mode, through the dev server's `localAgentProxy()`
  (Command Center SDK `^0.5.7`), instead of the platform. It uses the same `POST /api/chat` stream
  deployed Agents serve, so the rail, the expanded rail, the thread, streaming markdown, reasoning,
  tool calls, the queue, Stop, and the model picker are the same. Before, an application wrote its
  own chat for local development (the CRM's showed plain text over A2A).
  - The runtime's sessions and history come from the routes requested in
    [ms-tau-sdk#47](https://github.com/mainsequence-sdk/ms-tau-sdk/issues/47). Until a runtime
    serves them, a local conversation is live-only and the thread says so.
  - A new local conversation's first message uses the runtime's configured model; the picker
    applies from the next one.
  - `useChatEngine().capabilities` says what the mounted source offers. The explorer hides archive
    and archived sessions and searches only loaded sessions when the source cannot; a local source
    offers no archive, server search, insights, or provider settings.
- The standalone application runs the local source: `/?local` against `ms-tau` on
  `127.0.0.1:8787`, and `/?stand-in&local` against a scripted local runtime.
- Guide: [An Agent on your machine](./docs/local-agents.md).

## 0.0.6

Compatibility axes: the npm public API, additively; the stylesheet, additively (new `ms-chat-rail`,
`ms-chat-launcher`, `ms-chat-explorer`, `ms-chat-page`, and `ms-chat-composer-stack` classes); and
the packaged agent skills (`ui/compose-command-center-ai-rail` rewritten, the two general skills
reworded). No browser storage, platform route, or payload change, and the SDK peer range is
unchanged: the explorer calls the session search and archived-session routes the package already
exported.

- **The frame is the package's.** An application that imported the package got only the thread and
  drew its own rail, so it never looked like Command Center. The package now draws the frame
  Command Center draws, and Command Center uses the same components:
  - `ChatRail`: the right rail, `docked` or `overlay`, with the theme's gradient, tinted edge, and
    glows, a header with the Agent's icon tile, the title, a subtitle, an optional `detail` pill,
    Expand, and Close, and a body for the thread. `tone="accent"` draws a rail opened on one Agent.
    Close returns the engine to the default session when another Agent's session was open.
  - `ChatLauncher`: the floating button that opens the rail.
  - `ChatPageLayout`: the expanded rail, with the session explorer, the Agent, the session, the run
    status, New session, Show context, Collapse, Minimize, and a `blockingState`.
  - `AgentSessionExplorer`: the person's sessions under their Agents, with search, the working and
    queued marks, archive, and archived sessions. Opening a session stays the application's
    (`onOpenSession`, `onOpenSessionDetails`); `agents` lists the Agents without recent sessions.
    `groupAgentSessions` and the session title helpers are exported with it.
- **The composer and readiness on their own.** `ChatComposer` is the thread's composer for an
  application that draws its own transcript (Enter sends, Shift+Enter breaks the line, Enter queues
  while the Agent works), and `ChatQueueStrip` the queue strip. `useChatComposerState()` says
  whether the assistant can take a message: `status` (`ready`, `working`, `waking`, `loading`,
  `loading-models`, `no-session`, `unavailable`, `models-unavailable`, `choosing-model`, `stopping`,
  or `busy`), `canSend`, `queues`, `canWrite`, and `reason`. The thread, the standalone composer,
  and the hook compute it with the same code, so they never disagree.
- `useChatEngine()` also returns the `auth` and `environmentUid` the application passed.
- The rail's look is part of the theme: every colour of its gradient and glows is a theme variable,
  and the stylesheet passes `command-center-sdk theme audit`. The skill and the guide no longer tell
  applications to draw a flat panel of their own.

## 0.0.5

Compatibility axes: the connect guide and the `connect-command-center-ai-to-the-platform` skill. No
API, route, payload, stylesheet, storage, or skill-namespace change.

- **Local development.** A top-level page under `vite serve` has no host, so the Command Center
  SDK's `platformRequestProxy()` (SDK 0.5.6) sends its platform requests with the developer's
  `MAINSEQUENCE_ACCESS_TOKEN`, read by the dev server; the page never holds it. The guide and the
  skill show the sender that uses it only when `import.meta.env.DEV` is true on a top-level page, and
  the uid from `users/me`. The embedded path is unchanged and stays the one a deployed application
  takes.

## 0.0.4

Compatibility axes: the packaged agent skills and one guide. No API, route, payload, stylesheet,
storage, or skill-namespace change, and no platform rollout.

- An application embedded in Command Center needs Command Center SDK `^0.5.5`, the first release
  with `client.sendPlatformRequest`, although this package accepts older SDK versions. The
  `build-command-center-ai-application`, `connect-command-center-ai-to-the-platform`, and
  `use-command-center-ai` skills and `docs/connect-to-the-platform.md` now say so, and to upgrade
  an older SDK. Before, the architecture skill said to stop and report the sender as missing.

## 0.0.3

Compatibility axes: the npm public API, additively (the connection's `sendPlatformRequest`, the
`ChatPlatformRequestSender` type, and an optional `ChatAuth.token`); the packaged agent skills
(renamed, moved into lanes, and three added); the `command-center-ai` command line; and the
skills' provenance file (schema 2). No route, payload, stylesheet, or storage change, and no
platform rollout.

- The application owns authentication. `createChatBackendConnection` takes `sendPlatformRequest`:
  every platform request goes to it as a standard `Request` without any credential, and the
  application adds the person's credential, renews it after a `401`, and returns the response.
  With a sender, `auth` needs only `userUid`. Requests to the Agent's runtime keep the session's
  runtime token and never go through it. An application embedded in Command Center passes the
  SDK static-site client's `sendPlatformRequest`, so its host sends the requests as the person.
  Without a sender, clients send `auth.token` as before.

- **Skills in lanes, as the SDK's are.** An upgrade replaces the namespace and removes the old
  names by itself; update anything that routes to them:
  - `build-chat-application` is split into `general/build-command-center-ai-application`, the
    decisions, and `engine/mount-agent-conversation`, the engine;
  - `connect-chat-to-the-platform` is `backend/connect-command-center-ai-to-the-platform`, which now
    also covers the errors;
  - `manage-model-providers` and `design-agent-conversation-capabilities` move into the
    `model-providers/` and `contracts/` lanes.
- **Added:** `general/use-command-center-ai`, the router the Command Center SDK's skills send an
  agent to; `ui/compose-command-center-ai-rail`, the right rail and the expanded rail and their
  design; and `sessions/manage-agent-sessions`. Every skill routes with `$skill-name`.
- **The installer is the SDK's.** `command-center-ai skills install` takes `--dry-run`, `--json`,
  `-p`, and `--path=`; it refuses a namespace whose `PINNED_FROM.txt` names another package, a skill
  folder that differs from its skill's name, and a name used twice; and it records `skills_path` in
  `PINNED_FROM.txt`. Schema 1 files are read as before.
- **Guides:** `docs/getting-started.md` and `docs/rail-and-expanded-rail.md` are new, and
  `docs/build-a-chat-application.md` is now `docs/build-an-ai-application.md`.

## 0.0.2

Compatibility axes: documentation, source comments, one user-facing message, and one input
placeholder. No API, route, payload, stylesheet, storage, or skill-namespace change.

- The documentation and source comments describe the platform and the Agent runtime only as the
  chat sees them on the wire.
- Sending before a session's detail has loaded now says "Wait for the session detail to finish
  loading before sending."
- The custom provider form's identifier placeholder is `acme-models`.

## 0.0.1

Compatibility axes: the first release of the npm public API (`src/index.ts`), the stylesheet
(`styles.css`, `ms-chat-` classes in the `ms-chat` cascade layer), the browser storage keys
`main_sequence_ai.message_queue.{session}` (`sessionStorage`) and
`ms.main-sequence-ai.agent-sessions:{user}:{environment}` (`localStorage`), and the packaged agent
skills with their namespace, `.agents/skills/command-center-ai/`.

- **SDK range:** a peer dependency on `@dev-mainsequence/command-center-sdk` from the first release
  that publishes the `--warning-tint` theme variable; React and React DOM `>=18 <20`, also as
  peers.
- **Dependencies:** `@assistant-ui/react` `^0.12.19`, `@assistant-ui/core` `^0.1.13`,
  `@assistant-ui/store` `>=0.2.6 <0.2.14`, and `assistant-stream` `^0.3.10`; they move together, in
  a chat release. The store's upper bound keeps it on the releases that accept `@assistant-ui/tap`
  0.5, which `@assistant-ui/react` 0.12 and `@assistant-ui/core` 0.1 need.
- **Platform routes:** the platform API routes and the three Agent-runtime routes listed in
  section 3 of ADR 096 (`docs/adr/adr-096-independent-chat-package.md`), with the payloads the
  platform serves on 2026-09-23. No route is added or called differently, so no platform rollout
  is required.

Added:

- The backend connection, with a request-URL rewrite for applications served from origins the
  platform does not allow, and a client for every platform and Agent-runtime route the chat calls.
- The session engine, `ChatEngineProvider`: the default session behind a stable handle, hydration,
  runtime access and readiness, the model selection, sending, cancelling, and the message queue.
- The chat UI: `ChatThread`, `AgentConnectingState`, and `AgentIcon`, and the stylesheet.
- The model provider settings, `ModelProviderSettings`: built-in provider sign-in and sign-off,
  Organization custom providers, and the direct test conversation.
- A standalone application built only on the chat and the SDK, with a scripted stand-in for the
  platform and the Agent runtime.
- Four agent skills, `build-chat-application`, `connect-chat-to-the-platform`,
  `manage-model-providers`, and `design-agent-conversation-capabilities`, each with a human guide
  in `docs/`. The package's postinstall and `command-center-ai skills install` install them into
  `.agents/skills/command-center-ai/` with `PINNED_FROM.txt` and touch no other namespace.
