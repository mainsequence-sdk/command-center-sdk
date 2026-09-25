# Getting Started

Command Center AI adds AI capabilities to an application that uses the Command Center SDK: a
conversation with a Main Sequence Agent, the right rail and the expanded rail that hold it, agent
sessions, and model provider settings. Its agent skill is `use-command-center-ai`.

## Install

Check that the registry has a version whose peer range includes the application's SDK, then install
both and refresh the agent skills:

```bash
npm view @dev-mainsequence/command-center-ai peerDependencies --json
npm install @dev-mainsequence/command-center-ai @dev-mainsequence/command-center-sdk react react-dom
npx command-center-ai skills install --path .
```

The SDK, React, and React DOM are peers, so the application has exactly one of each. Never install a
second SDK or pass `--legacy-peer-deps`. Import only `@dev-mainsequence/command-center-ai` and
`@dev-mainsequence/command-center-ai/styles.css`.

## The agent skills

Installation copies version-matched skills into `.agents/skills/command-center-ai/`, the way the SDK
copies its own into `.agents/skills/command-center/`. Refresh them explicitly when lifecycle scripts
were disabled:

```bash
npx command-center-ai skills install --path . --dry-run
npx command-center-ai skills install --path .
```

The namespace belongs to the package: each install removes what the package no longer ships and
records the version in `PINNED_FROM.txt`. Keep the application's own guidance in another namespace.
See the [agent scaffold](../agent_scaffold/README.md) and the [CLI](../cli/README.md).

## Upgrade with the SDK

While the SDK is 0.x, each SDK minor needs a Command Center AI release whose peer range accepts it,
and a 0.0.x version of this package matches only itself. Upgrade the two together, then refresh the
skills and run the application's checks, including `command-center-sdk theme audit`.

## Next

- [Build an AI application](./build-an-ai-application.md): decide where AI lives, and mount the
  engine.
- [The right rail and the expanded rail](./rail-and-expanded-rail.md): how the conversation sits in
  the application.
- [AgentSession resolution](./agent-session-resolution.md), [Connect to the platform](./connect-to-the-platform.md),
  [Model providers](./model-providers.md), and [The conversation contract](./conversation-contract.md).
