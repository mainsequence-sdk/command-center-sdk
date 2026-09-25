---
name: use-command-center-ai
description: Set up, inspect, upgrade, or troubleshoot Command Center AI (@dev-mainsequence/command-center-ai) in an application that uses @dev-mainsequence/command-center-sdk, and route AI work to the right focused skill. Use when adding a chat or AI capabilities (a conversation with a Main Sequence Agent, the right rail, the expanded rail, agent sessions, model providers), checking the installed version and its SDK peer range, refreshing these skills, or choosing which Command Center AI skill applies.
---

# Use Command Center AI

Command Center AI gives an SDK application its AI capabilities: a conversation with a Main Sequence
Agent, the right rail and the expanded rail that hold it, agent sessions, and model provider
settings. The human guide is `docs/getting-started.md` in the installed package.

## Install It Next To The SDK

1. Confirm the registry has a version whose peer range includes the application's SDK:

   ```bash
   npm view @dev-mainsequence/command-center-ai peerDependencies --json
   npm ls @dev-mainsequence/command-center-sdk
   ```

2. Install both as dependencies of the application, so each is declared:

   ```bash
   npm install @dev-mainsequence/command-center-ai @dev-mainsequence/command-center-sdk react react-dom
   ```

   The SDK, React, and React DOM are peers, so the application has exactly one of each. When npm
   reports `ERESOLVE` for the SDK, move the SDK into the peer range. Never install a second SDK and
   never pass `--legacy-peer-deps`.

## Refresh These Skills

Installation copies version-matched skills into `.agents/skills/command-center-ai/`, the way the
SDK copies its own into `.agents/skills/command-center/`. Refresh them explicitly when lifecycle
scripts were disabled or the package changed:

```bash
npx command-center-ai skills install --path . --dry-run
npx command-center-ai skills install --path .
```

The namespace is authoritative: an install prunes every entry the installed package does not ship,
and `PINNED_FROM.txt` records the version and the skill paths. Keep application-owned guidance in
another namespace. The command refuses a namespace whose `PINNED_FROM.txt` names another package,
and `--json` prints the result for other tools.

## Resolve The Installed Package

1. Read `node_modules/@dev-mainsequence/command-center-ai/package.json`: the version, the `exports`
   (`.`, `./styles.css`, `./package.json`), and the `peerDependencies`.
2. Read the installed `README.md` and the declarations of what you import. The installed version is
   authoritative; a plan, an ADR, or a newer checkout does not make an API available.
3. Import only `@dev-mainsequence/command-center-ai` and
   `@dev-mainsequence/command-center-ai/styles.css`. Never import `dist/`, `src/`, or a file inside
   the package.
4. An application embedded in Command Center needs SDK `^0.5.5`, the first release with
   `client.sendPlatformRequest`, although this package accepts older SDK versions. Read the version
   in `node_modules/@dev-mainsequence/command-center-sdk/package.json` and upgrade an older one.

## Upgrade With The SDK

While the SDK is 0.x, each SDK minor needs a Command Center AI release whose peer range accepts it,
and a 0.0.x version of this package matches only itself. Move the two together:

```bash
npm view @dev-mainsequence/command-center-ai version peerDependencies --json
npm install @dev-mainsequence/command-center-ai@<version> @dev-mainsequence/command-center-sdk@<a version in its range>
npx command-center-ai skills install --path .
```

Then run the application's checks, including `command-center-sdk theme audit`. The SDK's own status
and update workflow is in `$use-command-center-sdk`.

## Choose The Focused Skill

| Task | Skill |
| --- | --- |
| Decide where AI lives in the application and which pieces it needs | `$build-command-center-ai-application` |
| Mount the engine: stylesheets, inputs, the Agent's default session, the stand-in | `$mount-agent-conversation` |
| The right rail, the expanded rail, and how they look | `$compose-command-center-ai-rail` |
| Several sessions: a session explorer, search, archive, a new session, a session in the URL | `$manage-agent-sessions` |
| Reach the platform and the Agent runtime, tokens, and failure states | `$connect-command-center-ai-to-the-platform` |
| Model provider sign-in, custom providers, and the test conversation | `$manage-model-providers` |
| Design an Agent's answers for what the thread shows | `$design-agent-conversation-capabilities` |

For a new AI capability, start with `$build-command-center-ai-application`.

## Preserve The Package Boundary

- Command Center AI owns the session engine, the thread and composer, the message queue, readiness,
  the model picker, the provider screens, and its stylesheet. Do not rebuild them from SDK
  primitives, and do not call the platform's agent session, Agent runtime, or model provider routes
  from application code.
- The application owns sign-in and token refresh, which Agent, the frame of the right rail and the
  expanded rail, notifications, routing, and the forwarder.
- The SDK owns the application's shell, pages, controls, and theme:
  `$compose-command-center-application-shell`, `$compose-command-center-page`,
  `$compose-command-center-controls`, and `$theme-command-center-app`.

If the installed package cannot do what the application needs, for example files, sources, or
attachments in an answer, which the thread does not draw, do not patch `node_modules` or import an
internal module. Record the installed version, the missing capability, the public inputs and outputs
it needs, and whether a platform route or payload changes. Stop and hand that to a separate task for
this package.

## Verify

Type-check and build the application through public imports, run `command-center-sdk theme audit`,
and run the focused skill's verification. Confirm `.agents/skills/command-center-ai/PINNED_FROM.txt`
names the installed version.
