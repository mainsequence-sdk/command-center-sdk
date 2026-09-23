# Changelog

## Unreleased (0.1.0)

Compatibility axes: the first release of the npm public API (`src/index.ts`), the stylesheet
(`styles.css`, `ms-chat-` classes in the `ms-chat` cascade layer), the browser storage keys
`main_sequence_ai.message_queue.{session}` (`sessionStorage`) and
`ms.main-sequence-ai.agent-sessions:{user}:{environment}` (`localStorage`), and the packaged agent
skills with their namespace, `.agents/skills/chat/`.

- **SDK range:** a peer dependency on `@dev-mainsequence/command-center-sdk` from the first release
  that publishes the `--warning-tint` theme variable; React and React DOM `>=18 <20`, also as
  peers.
- **Dependencies:** `@assistant-ui/react`, `@assistant-ui/core`, `@assistant-ui/store`, and
  `assistant-stream` are pinned to the exact versions the chat is tested with; they move together,
  in a chat release.
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
  in `docs/`. The package's postinstall and `mainsequence-chat skills install` install them into
  `.agents/skills/chat/` with `PINNED_FROM.txt` and touch no other namespace.
