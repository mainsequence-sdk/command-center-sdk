# Chat

The chat as one independent package: everything a chat application needs to talk to the same
backend Command Center talks to. It is independent of the Command Center application, not of the
backend. See [ADR 096](./docs/adr/adr-096-independent-chat-package.md).

The chat uses the assistant-ui front end (`@assistant-ui/react`): the engine runs an assistant-ui
runtime against the platform and the Agent runtime, and the thread is built from assistant-ui's
primitives, styled by the chat's stylesheet on the Command Center SDK's theme.

The Main Sequence AI application is its first consumer and imports it only through its public
exports (`src/index.ts`).

## What Is Here

- `src/backend/`: the connection to the backend. Agent sessions, runtime access and readiness, the
  chat request, history, insights, cancel, model providers, agent icons, and the error helpers.
  See its [README](./src/backend/README.md).
- `src/engine/`: the session engine, `ChatEngineProvider`. It chooses or creates the session for an
  Agent, hydrates it, follows runtime access and readiness, holds the model selection, sends and
  cancels, and keeps the queue. See its [README](./src/engine/README.md).
- `src/session-detail/`: the AgentSession detail model and the hook that loads a session's detail
  and insights. See its [README](./src/session-detail/README.md).
- `src/ui/`: the chat UI, `ChatThread`, with `AgentConnectingState` and `AgentIcon`. See its
  [README](./src/ui/README.md).
- `src/model-providers/`: the model provider settings, `ModelProviderSettings`: custom providers,
  built-in provider sign-in, and the direct test conversation. See its
  [README](./src/model-providers/README.md).
- `styles.css`: the chat UI's stylesheet, exported as `@dev-mainsequence/command-center-ai/styles.css`.
- `standalone/`: a minimal application that is nothing but the chat, built only on this package
  and the SDK, with `standalone/stand-in/`, a scripted stand-in for the platform and the Agent
  runtime. It is the proof of independence, the development bed, and the browser-test target.
- `scripts/check-boundary.mjs`: the boundary check.
- `docs/`: the package's [decisions and guides](./docs/README.md).
- `agent_scaffold/skills/`: the package's agent skills, and `cli/`, their installer. See
  [Agent Skills](#agent-skills).
- `CHANGELOG.md`, `LICENSE` (Apache-2.0), and `tsconfig.build.json`: what the package needs to be
  published from this repository ([SDK ADR 012](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/adr/adr-sdk-012-chat-as-a-second-public-package.md)).

## Inputs

The package reads no environment variable and no configuration file. Whoever mounts it supplies:

- the platform API base URL and, when the application is not served from an origin the platform
  allows, a request-URL rewrite (`createChatBackendConnection`);
- the person's token, on every call;
- the active Organization Environment and the signed-in user, where a call is scoped by them;
- to the session engine, a notification callback, the view context of each request, whether the
  chat is on screen, and which session to show: a requested one, a default session behind a
  stable handle, or a launch target. The [engine README](./src/engine/README.md) lists them;
- to the thread, its words, the signed-in person, and how to open the application's model
  provider settings. The [UI README](./src/ui/README.md) lists them;
- to the model provider settings, the connection, the person's token and user uid, and a
  notification callback.

An application also loads the SDK's stylesheets and then this package's:

```css
@import "@dev-mainsequence/command-center-sdk/theme/styles.css";
@import "@dev-mainsequence/command-center-sdk/styles.css";
@import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
@import "@dev-mainsequence/command-center-ai/styles.css";
```

## The Request-URL Rewrite

The platform API and the Agent's runtime answer browser requests only from the origins on their
allow-lists. An application on another origin has two ways to reach them: the platform adds its
origin, or the application forwards the calls through an address on its own origin. The package
serves the second one:

```ts
const connection = createChatBackendConnection({
  apiBaseUrl: "https://api.example.com",
  rewriteRequestUrl: (url, target) =>
    target === "platform" ? `/__platform__${url.pathname}${url.search}` : url.toString(),
});
```

Every request the package makes passes through it, with `target` saying whether it goes to the
platform API or to the Agent's runtime. Whether and when to rewrite is the application's decision.

## Independence

- Its own `tsconfig.json`: it does not extend the host's and defines no `@/*` path.
- Its own Vite and Vitest configuration.
- No dependency on an application package, no router, no host store, no `import.meta.env` in
  `src/`.
- The Command Center SDK is its one Command Center dependency, as a peer, for its controls and
  theme (SDK ADR 012). The dependency goes one way only: the SDK knows nothing about this package.
- `npm run check` runs the boundary check, which fails on a dependency outside the allowlist, a
  peer (the SDK or React) listed as a regular dependency, an `@/` import, an import that leaves
  the package, or an environment read, and then type-checks the package and the standalone
  application. It is part of the repository's `check`.

## Agent Skills

The package ships four agent skills, each with a human guide in `docs/`:
`build-chat-application`, `connect-chat-to-the-platform`, `manage-model-providers`, and
`design-agent-conversation-capabilities` ([the map](./docs/README.md#task-and-agent-skill-map)).
Installing the package installs them into `.agents/skills/command-center-ai/` of the repository that runs
`npm install`; install or refresh them explicitly with:

```bash
npx command-center-ai skills install --path .
```

The package owns `.agents/skills/command-center-ai/` alone: every install replaces it and records the package
version in `PINNED_FROM.txt`, and no other namespace is touched, the Command Center SDK's
`.agents/skills/command-center/` included. The skills may refer to the SDK's skills; the SDK's
never refer to these. See the [agent scaffold](./agent_scaffold/README.md) and the
[CLI](./cli/README.md).

## Commands

From the repository root:

```bash
npm run chat:check
npm run chat:test
npm run chat:build
npm run chat:dev
```

`chat:check` runs the boundary check and the SDK's theme audit over the stylesheet, and
type-checks the package, its NodeNext library build, and the standalone application. `chat:build`
builds the library into `dist/` with `tsc`;
`npm --workspace @dev-mainsequence/command-center-ai run build:standalone` bundles the standalone application
into `standalone/dist/`. `npm --workspace @dev-mainsequence/command-center-ai run test:browser` runs the
standalone application on the stand-in in Chromium with Playwright (`tests/browser/`): it connects,
sends a message and watches the reply stream in, and opens the model provider settings.

`chat:dev` serves the standalone application on port 5183. Open `/?stand-in` to run it on the
scripted stand-in, with no platform and no token. To reach a platform that does not allow
that origin, put the platform API URL in `command-center-ai/.env.local`:

```bash
VITE_CHAT_API_BASE_URL=http://127.0.0.1:8000
```

The dev server then forwards `/__platform__` to it, and the application's connection points
platform requests there (`standalone/connection.ts`).
