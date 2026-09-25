# Changelog

## Unreleased

Compatibility axes: the packaged agent skills (renamed, moved into lanes, and three added), the
`command-center-ai` command line, and the skills' provenance file (schema 2). No API, route,
payload, stylesheet, or storage change, and no platform rollout.

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
