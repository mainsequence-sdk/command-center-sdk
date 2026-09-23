# ADR 096: The Chat as One Independent Package

- Status: Implemented
- Date: 2026-09-20
- Amended: 2026-09-23 by ADR 097: the package depends on the Command Center SDK as a peer, in
  one direction only
- Owners: Main Sequence AI maintainers
- Related:
  - [ADR 060: Session-Backed Chat Requests](./adr-060-session-backed-chat-request-contract.md)
  - [ADR 087: Queued Chat Messages While The Agent Works](./adr-087-queued-chat-messages-while-the-agent-works.md)
  - Command Center ADR 092: Environment Agent Shortcut And Unified Runtime
  - [ADR 093: Client-Verified Agent Readiness](./adr-093-client-verified-agent-readiness.md)
  - [ADR 098: One Communication Contract For Every Agent](./adr-098-one-communication-contract-for-every-agent.md)
  - The Main Sequence AI assistant UI (`apps/mainsequence-ai/src/assistant-ui/README.md` in
    Command Center), [the package's backend connection](../../src/backend/README.md)

## Context

The chat has to become reusable so that someone can build a chat application that talks to the
same backend Command Center talks to: the same agents, agent sessions, runtime access, chat
endpoint, and model catalog. The objective is not to abstract the chat over different backends. If
a seam of that kind appears along the way, that is fine, but it is not the goal.

To be reusable the chat first has to stand alone from the Command Center application. Today it
does not. Measured on 2026-09-20:

- It lives inside the Main Sequence AI application: `src/assistant-ui` (about 8,900 lines plus
  3,000 in `components/`) and `src/runtime` (about 6,900 lines).
- The connection to the backend is already close to free. The clients in `runtime/` take the token
  as a parameter, and their only host imports are configuration: `env.apiBaseUrl`, `env.DEV`, and
  the stream protocol in `config/command-center`.
- `ChatProvider.tsx` (4,607 lines) is almost entirely chat against that backend: selecting or
  getting and creating a session, loading detail, insights, and history, polling runtime access,
  model state, sending, cancelling, the queue. What it takes from the host is six things, the auth
  store, the active Environment, the preferences (for the shortcut Agent), the toaster, and two
  configuration objects, plus the router. The Command Center specifics inside it are thin: about
  13 mentions of the shortcut, 29 of the rail, 7 of routing.
- `components/ChatThread.tsx` (2,390 lines) reads 40 fields of the provider's context at 11 call
  sites. It also imports the host's `button`, `badge`, `select`, `markdown-content`, `cn`, the
  auth store, the shell store, and `env`, and it is styled with the host's Tailwind classes.
- Model providers sit beside the chat in the same application: five clients in `runtime/` (the
  catalog, provider sign-in, Organization custom providers, their model JSON, and the direct test
  turn) and three screens in `features/settings/` (the provider section, 607 lines; the
  custom-provider workflow, 1,364; the test conversation, 437). Their host imports are the auth
  store, the toaster, `cn`, the settings section type, and the host's form and dialog primitives.
- The chat's documentation is spread over the repository: five of the seven records in
  `docs/adr/mainsequence_ai/` (ADR 060, 087, 090, 092, 093), two guides in `docs/extensions/`
  (AgentSession resolution, provider errors), and the module READMEs beside the code. About 33
  files link to them. ADR 092 and the resolution guide each mix the Command Center shortcut with
  the contract every Agent uses.
- Nothing in this repository can show that a package is independent. Application packages are
  source packages the host compiles: the application's `tsconfig.json` extends the host's and
  inherits its `@/*` alias, the host's `globals.css` scans application sources for Tailwind,
  application tests run on the host's Vite configuration, and
  `scripts/check-application-packages.mjs` validates manifests, not imports.
- The safety net is about 250 tests: 24 files in `runtime/`, 10 in `assistant-ui/`, 7 in
  `assistant-ui/components/`.

## Decision

The chat becomes one independent package inside this repository: independent of the Command
Center application, and connected to the same backend. The Main Sequence AI application is its
first consumer. This decision is only about independence. Names, releases, and upstreaming are out
of scope.

### 1. One package, with the backend connection inside it

One workspace package, outside `apps/`, because it is a library and not an application the host
composes. It contains everything a chat application needs:

- **The backend connection**, from `runtime/`: agent sessions (list, detail, create, get or
  create, archive, the session's model settings), runtime access and readiness (ADR 093), the
  chat request (ADR 060) and its stream, history, insights, session configuration, cancel, the
  model catalog and run-configuration selection, tool activity, and the error helpers.
- **Model providers**, resolved from the same backend: the catalog, signing in to and out of
  built-in providers, Organization custom providers with their models, and the direct test
  conversation, with their screens. A chat application needs a model to chat with, so connecting
  and choosing one is part of the chat.
- **The session engine**, from `ChatProvider`: choosing or creating the session for an Agent,
  hydrating it, following runtime access, holding the model selection, sending and cancelling,
  and the queue (ADR 087).
- **The chat itself**, from `assistant-ui/`: the assistant-ui runtime adapter, the thread, the
  composer with its provider, model, and thinking picker, the connecting and readiness states, the
  model-required state, actors and provenance, agent icons, and its own stylesheet.

This is what lets a builder set the Agent, the provider, and the model, and render richer
answers: those are backend capabilities, and the package carries the code that reaches them.

### 2. Independent of the application, not of the backend

The package receives from whoever mounts it what `ChatProvider` takes from the host today, as
inputs instead of imports:

- the API base URL, with an optional request-URL rewrite (section 4);
- the authentication token, with a way to obtain a fresh one;
- the active Organization Environment and the signed-in user;
- a notification callback, in place of the toaster;
- navigation callbacks, in place of the router, for the few places the chat sends the person
  somewhere (settings, the expanded page).

Enforcement:

- The package has its own `tsconfig.json`. It does not extend the host's and defines no `@/*`
  path, so an import of a host module does not compile.
- It type-checks, builds, and runs its tests on its own configuration, without the host's Vite
  configuration.
- It ships its own stylesheet with prefixed class names. Colours come from the theme variables
  the SDK publishes (`--primary`, `--foreground`, `--danger`, `--muted-foreground`, `--border`,
  `--warning`, `--muted`, `--card`, `--background`, `--primary-foreground`, `--accent`), so it
  matches the theme of every application that loads the SDK theme. It does not need Tailwind.
- It depends on the Command Center SDK as a peer dependency, not a regular one, so an application
  has exactly one SDK: one stylesheet and one set of `cc-*` classes. React is a peer for the same
  reason. The dependency goes one way only: the SDK knows nothing about the package (ADR 097).
- It does not depend on any application package, holds no router and no host store, and does not
  read `import.meta.env`.
- A boundary check fails the build on a dependency outside the allowlist, an `@/` import, an
  import outside the package root, or an environment read. It is part of the repository's
  `check`.

### 3. The backend routes the package calls

These are the routes the code that moves calls today. The package calls the same ones with the
same payloads and adds none.

**The platform API.** Base URL from configuration; the person's bearer token on every request.
Session collection reads carry `organization_environment_uid`, and user-scoped lists also carry
`created_by_user_uid`.

| Route | Used for |
| --- | --- |
| `GET /api/v1/agent-sessions/` | Latest, archived, and searched sessions (`is_archived`, `agent_uid`, `q`, `ordering`, `limit`) |
| `GET /api/v1/agent-sessions/{session}/` | Session detail, the canonical payload of ADR 060 |
| `PATCH /api/v1/agent-sessions/{session}/` | The session's provider, model, and thinking |
| `DELETE /api/v1/agent-sessions/{session}/` | Delete a session |
| `POST /api/v1/agent-sessions/{session}/archive/` and `/unarchive/` | Archive and restore |
| `POST /api/v1/agents/{agent}/start-new-session/` | A new session for an Agent |
| `POST /api/v1/agents/{agent}/sessions/get-or-create-session/` | The session behind a stable handle, with an optional run configuration |
| `POST /api/v1/agent-sessions/{session}/resolve-runtime-access/` | The Agent's `rpc_url`, its token, and the `runtime_interaction` and `runtime_presence` envelopes |
| `GET /api/v1/agent-sessions/{session}/history/` | The transcript |
| `GET /api/v1/agent-sessions/{session}/insights/` | Context usage and session insights |
| `GET /api/v1/model-providers/` | The provider and model catalog |
| `POST /api/v1/model-provider-sign-in-attempts/` | Start signing in to a built-in provider |
| `GET /api/v1/model-provider-sign-in-attempts/{attempt}/` | Poll the attempt |
| `POST /api/v1/model-provider-sign-in-attempts/{attempt}/cancel/` | Cancel it |
| `POST /api/v1/model-provider-credentials/revoke/` | Sign out of a provider |
| `GET` and `POST /api/v1/custom-model-providers/` | List and create Organization custom providers |
| `PATCH` and `DELETE /api/v1/custom-model-providers/{provider}/` | Edit and delete one |
| `POST /api/v1/custom-model-providers/{provider}/models/` | Add a model |
| `PATCH` and `DELETE /api/v1/custom-model-providers/{provider}/models/{model}/` | Edit and delete a model |
| `GET /api/v1/command-center/agents/` | The agent icon projection for an Environment |
| `GET /api/v1/command-center/agents/{agent}/icon/` | An icon's bytes; the URL comes from the projection |

**The Agent's runtime.** Base URL and token are the `rpc_url` and token that
`resolve-runtime-access` returned for the session. They are never configured.

| Route | Used for |
| --- | --- |
| `POST {rpc_url}/api/chat` | Send a message; the answer streams back as `ui-message-stream` |
| `GET {rpc_url}/api/chat` | The check that the Agent answers (ADR 093) |
| `POST {rpc_url}/api/chat/session/cancel` | Stop the current run |

**A custom provider's own endpoint.** Only the direct test conversation calls it:
`POST {provider endpoint}/chat/completions` or `/responses`, with the provider's key and never the
platform token or cookies.

Routes that stay with the application: `/api/v1/user-preferences/` (the shortcut Agent) and
`/api/v1/agent-tasks/`.

### 4. Configuration

The package reads no environment variable and no configuration file. It needs four values, and
whoever mounts it supplies them. Today they come from these places:

| Value | Today | In the package |
| --- | --- | --- |
| Platform API base URL | `VITE_API_BASE_URL` through `env.apiBaseUrl`, read in ten client files | Required input |
| Authentication | The auth store: token, token type, and its refresh | Required input: the current token and a way to get a fresh one |
| Active Organization Environment and signed-in user | Their providers in the host | Required input |
| Stream protocol | `assistant_ui.protocol`, only `ui-message-stream` is supported | Fixed in the package; not configurable |

**The request-URL rewrite.** The platform API and the Agent's runtime answer browser requests
only from the origins on their allow-lists. In production the platform's list is Command Center's
own origins, and the Agent's runtime has a list of trusted origins of its own. A chat application
served from any other origin is refused by the browser before the request is sent. It has two ways
to reach the backend: the platform adds its origin, which the backend controls, or the application
forwards the calls through an address on its own origin. The package can only serve the second
one, so it is part of the connection and not a development detail:

- The connection takes an optional `rewriteRequestUrl(url, target)`. It receives the full URL the
  package is about to request and where the request is going, `platform` or `agent-runtime`, and
  returns the address the browser should request instead.
- Every request the package makes passes through it: every platform route of section 3, the
  icon delivery URL the platform returns, and the three runtime routes. A test holds each client to
  that, because one client that skipped the rewrite would break the application that depends on
  it. The one exception is the direct test turn to a custom provider's own endpoint, which must
  never pass through a proxy.
- Whether and when to rewrite is the application's decision. The package does not detect a
  development build and does not know about a proxy.

Command Center uses the rewrite for its development proxy, `/__command_center_auth__`. Before this
work three clients (the catalog, provider sign-in, and custom providers) each carried their own
copy of that rule, tied to `import.meta.env.DEV`, and the rest called the API directly. Now the
application states the rule once, in `runtime/chat-backend-connection.ts`, and every platform
request follows it. The standalone application uses the rewrite for a proxy of its own.

Two others were removed from the repository before this work, so the chat has one path: the
`VITE_DEBUG_CHAT` logging flag, and the local runtime proxy (`assistant_ui.endpoint`,
`VITE_ASSISTANT_UI_ENDPOINT`, `VITE_ASSISTANT_UI_PROXY_TARGET`, and the `local-proxy` access
mode). The Agent's runtime is reached only through the `rpc_url` the platform returns.

Browser storage keeps its keys and shapes: `main_sequence_ai.message_queue.{session}` in
`sessionStorage` and `ms.main-sequence-ai.agent-sessions:{user}:{environment}` in `localStorage`.

Nothing is needed from the backend: no new route, setting, or permission.

### 5. The proof: a standalone chat application

The package includes a minimal application that is nothing but the chat. Given the API base URL,
a token, and an Agent, it gets or creates a session and chats with the same backend Command Center
uses, with no Command Center shell, stores, or Tailwind build. It loads the Command Center SDK's
theme and controls, the package's one Command Center dependency (ADR 097). A person can send a
message, watch text, reasoning, and tool calls stream in, connect a provider and change the model,
stop a run, see an error, and reload into the same transcript. (`data-<name>` parts reach the engine,
which reads the provenance they carry; the thread does not draw them, in Command Center or here.) Its tests run
against a scripted stand-in for the backend routes the package calls. It is also the development
bed and the browser-test target.

### 6. What stays in the Main Sequence AI application

What belongs to Command Center and not to chat:

- the shortcut: the `agentShortcutUid` preference, the `command_center_shortcut` handle session,
  and its blocking state (ADR 092);
- the rails: `ChatOverlay`, `ChatMount`, the CodeRepository Agent rail, their stores, and the
  keyboard shortcut;
- route synchronisation (`?session=`) and the view context built from the host's registry and
  route;
- the Settings registration: the application contributes the package's model-provider screens to
  Command Center's routed Settings, and keeps the Agent shortcut setting, which writes the
  `agentShortcutUid` preference;
- agent tasks and the surfaces.

`ChatProvider` becomes a thin Command Center wrapper around the package's engine: it supplies the
inputs of sections 2 and 4 and adds the shortcut, the rails, and the routing. The session explorer
is chat and can follow in a later step.

### 7. The documentation moves with the code

The package owns the documentation of what it owns. Chat documents move into the package's own
`docs/` directory, ADRs included, and are removed from their old place. Moved ADRs keep their
numbers and titles, so references in code and in other records stay valid. While the package lives
in this repository, its new ADRs continue the repository's single ADR sequence.

| Document | What happens |
| --- | --- |
| ADR 060 (chat request), ADR 087 (queue), ADR 090 (agent icons), ADR 093 (readiness) | Move. |
| ADR 092 (shortcut and unified runtime) | Split. "All Agents use one communication contract" and "Retire the compatibility service clients" move as their own record. The shortcut preference, its blocking state, and the CodeRepository surfaces stay as ADR 092. Each links to the other. |
| ADR 089 (Agent capability UI), ADR 094 (agent tasks) | Stay. They are not chat. |
| `docs/extensions/main-sequence-ai-agent-session-resolution.md` | Split the same way. Identities, hydration, runtime access, sending, the shared states, the model catalog, the failure rules, and the invariants move. The Command Center shortcut and explicit session navigation stay. |
| `docs/extensions/main-sequence-ai-provider-errors.md` | Moves. |
| The READMEs of `runtime/`, `assistant-ui/`, and `features/settings/` | Move with their code. What describes the shortcut, the rails, and the Agent shortcut setting stays with the wrapper. |
| The READMEs of `features/chat/` and `surfaces/chat/` | Stay. The session explorer's follows it when it moves. |
| The user guides in `user-docs/main-sequence-ai/` | Stay. They explain the Command Center product to the people who use it, and the public site may not reach into internal documentation. |
| This record | Moves into the package once the package exists. |

Each document moves in the same step as the code it describes, and every link to it is updated
in that change. The catalogs in `docs/adr/mainsequence_ai/` and `docs/extensions/` drop the moved
entries and keep one pointer to the package's documentation.

### 8. Order of work

Each step ships on its own, gated by the existing chat tests plus the package's tests.

1. Scaffold the package, the boundary check, and the standalone application's skeleton.
2. The backend connection: the chat and model-provider clients of `runtime/` move, taking the
   base URL as an input. The application imports them from the package.
3. The session engine: `ChatProvider` is split. The engine moves; the shortcut, rails, and routing
   stay as the wrapper.
4. The chat: the runtime adapter, then the leaf renderers with the package stylesheet, then the
   thread and the composer. `ChatThread`'s host imports are replaced by the package's own
   primitives and by the inputs of sections 2 and 4.
5. Model providers: the three screens move onto the SDK's controls and the package's own
   primitives. The application's Settings entry renders them from the package.
6. The standalone application runs the full chat of section 5.

### 9. Done when

- The package type-checks, builds, and passes its tests with none of the host on its import
  graph, and the boundary check is part of the repository's `check`.
- The standalone application chats with the same backend Command Center uses, and its tests pass
  against the scripted stand-in.
- The application imports the package only through its public exports.
- The existing chat tests passed at every step.
- No chat document remains outside the package except the ones section 7 keeps, and no link in
  the repository points at a moved document's old path.

## Implementation status

All six steps of section 8 are done: steps 1 and 2 on 2026-09-21, steps 3 to 6 on 2026-09-23.

- The package is `packages/chat`, a private workspace package. Its name and folder are working
  labels; nothing is published.
- It type-checks and runs its tests on its own configuration, and its standalone application
  builds from it alone. The boundary check is part of the repository's `check`.
- The backend connection moved into `src/backend/`: 24 modules and their tests. Every client
  takes the connection as an input. The application passes one connection, built in
  `apps/mainsequence-ai/src/runtime/chat-backend-connection.ts`, and imports the package only
  through its public exports.
- The standalone application is a skeleton: given the platform API URL, a token, the person, the
  Environment, and an Agent, it gets or creates a session, reads the model catalog, and checks
  that the Agent answers. It has its own development proxy and shows the rewrite at work. The chat
  itself arrives with steps 3 to 6.
- The two shortcut constants (`command_center_shortcut`, its session name) were defined inside a
  runtime client. They stayed with the application, in `assistant-ui/command-center-shortcut.ts`.
- Two modules of `runtime/` were deleted instead of moved, because they were leftovers of removed
  features with no caller. `agent-session-stream.ts` was the transport of the Agent Terminal
  workspace widget, removed with the workspaces on 2026-09-12; it was a second way to send a chat
  request. `session-config-api.ts` was the compaction switch of the old session detail panel,
  whose only caller was removed in April; it called `PATCH {rpc_url}/api/chat/session-config`,
  a route the current Agent runtime does not serve. Section 3 lists the three runtime routes the
  package calls.
- Documents moved in steps 1 and 2: ADR 060, ADR 093, the provider-errors guide, the `runtime/`
  README (now the backend connection's README), and this record.

Step 3:

- The session engine moved into `src/engine/`. `ChatEngineProvider` chooses or creates the session
  for an Agent, hydrates it, follows runtime access and readiness, holds the model selection,
  sends and cancels, and keeps the queue. What it read from Command Center arrives as inputs; the
  [engine README](../../src/engine/README.md) lists them. The session detail model and its hook
  moved into `src/session-detail/`.
- The Command Center shortcut is the engine's default session: the session behind a stable handle
  for one Agent. `ChatProvider` is the wrapper of section 6: it supplies the inputs and keeps the
  shortcut, the rails, and the route. The stored session marker keeps its value,
  `command_center_shortcut`, so saved session lists stay readable.
- The engine uses no react-query. The model catalog and the agent icon projection keep small
  stores of their own with the same staleness, and the provider screens call
  `invalidateModelProviderCatalog()` when a provider changes.
- Documents moved in step 3: ADR 087; the contract half of ADR 092, as ADR 098; the contract half
  of the AgentSession resolution guide; and the parts of the `assistant-ui/` and
  `agent-session-detail/` READMEs that describe moved code, as the engine and session-detail
  READMEs.

Step 4:

- The chat UI moved into `src/ui/`: the thread with its composer, queue, notices, and model
  picker; the "choose a model" state; the connecting stage; the message actions; the agent icon;
  and a markdown renderer and a select of its own. The package exports `ChatThread`,
  `AgentConnectingState`, and `AgentIcon`; the [UI README](../../src/ui/README.md) describes
  them.
- What the thread read from Command Center arrives as `ChatThread`'s inputs: its words (`copy`),
  the signed-in person (`viewer`), and the way to open the model provider settings
  (`onOpenModelProviderSettings`). Command Center passes them from
  `assistant-ui/command-center-thread.ts`, with its own words for the Main Sequence AI rail and
  for a CodeRepository's Agent.
- The package's stylesheet, `styles.css`, replaces the Tailwind classes: `ms-chat-` classes in the
  `ms-chat` cascade layer, built on the SDK's theme variables, and it passes the SDK's theme audit
  but for two declarations the audit misreads (the UI README has the details). It was generated
  from the Tailwind classes and checked rule by rule against Tailwind's output in Command
  Center's page. Two things now come from the theme instead of fixed values: small shadows and
  the success colour.
- The package depends on the Command Center SDK as a peer, and on React as a peer; the boundary
  check fails if either is listed as a regular dependency.
- The UI tests moved with the code. Documents moved in step 4: ADR 090, and the parts of the
  `assistant-ui/` README that describe the thread.

Step 5:

- The model provider screens moved into `src/model-providers/`: the settings page with built-in
  provider sign-in, the Organization's custom providers, and the direct test conversation. The
  package exports `ModelProviderSettings`; Command Center's Settings section renders it with the
  person's session, its connection, and its toaster.
- They hold their own state instead of react-query. The catalog comes from the engine's store, now
  shared by the settings and every model picker (`useModelProviderCatalog`); the custom provider
  list, the sign-in polling, and the changes are the screens' own, with the one retry the
  application's queries had.
- The dialog, the confirmation dialog, and the password input are the package's own, in `src/ui/`,
  with their rules in the stylesheet.
- The screens name the platform, not its implementation, as ADR 097 requires of a published
  package: "Secrets are encrypted by the platform", "the platform's model catalog", "the Agent
  runtime".
- The tests moved with the code, and a new one covers the sign-in polling. Documents moved in step
  5: the parts of the `features/settings/` README that describe the screens, as the package's model
  providers README.

Step 6:

- The standalone application is the full chat: a form for the platform, the person, the
  Environment, and the Agent, then `ChatEngineProvider` with the Agent's default session behind the
  handle `standalone_chat`, `ChatThread`, and `ModelProviderSettings`. It loads the SDK's theme,
  component, and markdown stylesheets and the chat's, and has no Tailwind build.
- `standalone/stand-in/` is the scripted stand-in: it answers every platform and Agent-runtime route
  of section 3 in the shapes the clients parse, and streams reasoning, a tool call, and text. The
  standalone's tests run the application against it: connecting, streaming, stopping a run, a
  failed turn, reloading into the transcript, and the model provider settings. In development,
  `?stand-in` runs the application on it in a browser.
- The stylesheet gained an element reset for the chat's own elements (box model, margins, form
  controls), which pages without Tailwind's preflight lack. It changes nothing in Command Center:
  the computed styles of every chat element on the chat page and the settings page are the same
  with and without it.
- The engine asked for the default session once per key, and an aborted request kept its key.
  Under React's StrictMode, which runs effects twice on mount, the first request was aborted and
  the session never opened. An aborted request now releases its key. Command Center did not show
  it only because its Agent setting is still loading during that double mount.
- Checked in a browser against the stand-in and in the tests. The standalone was not run against
  the live platform in this step: that needs a person's token typed into its form.

The package also meets the preconditions ADR 097 sets before it leaves this repository: it holds no
react-query, router, or store library; its stylesheet passes the SDK's theme audit; every relative
import names its `.js` file, and `tsconfig.build.json` builds it with NodeNext into `dist`, as the
SDK repository builds; it has `CHANGELOG.md` and `LICENSE`; `npm pack --dry-run` with the publish
manifest of SDK ADR 012 lists only `dist`, the stylesheet, the documentation, the standalone
example without its tests, and the three files at the root; and its code, tests, and documentation
name the platform and the Agent runtime, not their implementations. Values the platform sends keep
their names. The manifest here still points at `src`, because Command Center consumes the package
from source until it moves.

## Backend and storage impact

None. The package calls the same routes with the same payloads. The chat's browser storage, the
queue in `sessionStorage` and the session summaries in `localStorage`, moves with the engine under
the same keys and shapes.

## Alternatives considered

- **Abstract the chat over any backend.** Not the objective. It would hide the capabilities a
  builder wants: the Agent, the provider, the model, the readiness of the runtime.
- **Leave the backend connection in the application and move only the thread.** Rejected. A chat
  application would have to rebuild the session engine and every client to reach the same backend.
- **Keep Tailwind in the package.** Rejected. A chat application would need the host's Tailwind
  build and theme configuration to render a chat.
- **Reuse the chat by importing the application.** Rejected. A consumer would inherit the host
  alias, the stores, the shortcut, and the rails.

## Consequences

- A chat application reaches the same backend through the package, with the same behaviour
  Command Center has: readiness, held sends, the queue, model selection.
- Independence is demonstrated by tooling and a running application, not by convention.
- Command Center uses the package for its own chat, so the two cannot drift apart.
- The `ChatProvider` split that the audit deferred happens here, along boundaries the code
  already has. It and the thread restyle touch audited code; the steps are small, ordered, and
  gated by about 250 tests.
- Buttons, badges, inputs and textareas come from the SDK's `/controls`. The package keeps its
  own select, dialog, password input, confirmation dialog, markdown renderer and notification
  surface, because the SDK publishes no equivalent (ADR 097).
- Two styling systems coexist in the chat until steps 4 and 5 complete.
- The package carries its own decisions and guides, so the reasons behind the chat travel with
  it. The Main Sequence AI catalog shrinks to the shortcut, Agent configuration, and agent tasks.
