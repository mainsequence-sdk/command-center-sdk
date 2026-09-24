# Chat Package Documentation

The chat package owns the documentation of what it owns. Decisions and guides move here in the
same step as the code they describe ([ADR 096](./adr/adr-096-independent-chat-package.md),
section 7).

## Decisions

- [ADR 060: Session-Backed Chat Requests](./adr/adr-060-session-backed-chat-request-contract.md)
- [ADR 087: Queued Chat Messages While the Agent Works](./adr/adr-087-queued-chat-messages-while-the-agent-works.md)
- [ADR 090: Agent Icons In Command Center Surfaces](./adr/adr-090-agent-icons-in-command-center-surfaces.md)
- [ADR 093: Client-Verified Agent Readiness](./adr/adr-093-client-verified-agent-readiness.md)
- [ADR 096: The Chat as One Independent Package](./adr/adr-096-independent-chat-package.md)
- [ADR 098: One Communication Contract for Every Agent](./adr/adr-098-one-communication-contract-for-every-agent.md),
  split out of Command Center ADR 092, which keeps the Command Center shortcut

These records moved here from Command Center and keep their numbers and titles, because the code
cites them. New decisions about the chat are `SDK ADR` records in `adr/` with
`Package: @dev-mainsequence/command-center-ai`, numbered in the repository's one `SDK ADR` sequence
([SDK ADR 012](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/adr/adr-sdk-012-chat-as-a-second-public-package.md)).

## Guides

- [Build a chat application](./build-a-chat-application.md): install the chat next to the SDK,
  load the stylesheets, mount the engine, the thread, and the settings, and verify on the stand-in.
- [Connect to the platform](./connect-to-the-platform.md): the connection, the request-URL rewrite
  and the forwarder, tokens, and the failure states.
- [Model providers](./model-providers.md): built-in provider sign-in, Organization custom providers,
  and the test conversation.
- [The conversation contract](./conversation-contract.md): what the chat sends an Agent, what it
  draws of the answer, and what a reload keeps.
- [Backend connection](../src/backend/README.md): the connection input, the clients, and the
  runtime contract.
- [Session engine](../src/engine/README.md): the engine's inputs, the default session, its context
  and hooks, the model catalog store, and browser storage.
- [Chat UI](../src/ui/README.md): the thread and its inputs, the stylesheet, readiness in the
  thread, and the message actions.
- [Model providers](../src/model-providers/README.md): the settings screens, their state, and the
  rules for credentials, custom providers, and the test conversation.
- [AgentSession resolution](./agent-session-resolution.md): how the engine chooses, hydrates, and
  connects a session and enables sending, the same for every Agent. Command Center's shortcut and
  `?session=` route stay in the application's half of the guide.
- [Provider errors](./main-sequence-ai-provider-errors.md)

## Task and agent-skill map

The package ships one agent skill per task below, and each has a human guide with the same public
entrypoints and rules. `tests/cli/docs-skills.node.mjs` fails when a packaged skill is missing from
this table or its guide does not exist.

| Task | Human guide | Agent skill |
| --- | --- | --- |
| Mount the chat in a Vite application that uses the SDK, and verify it | [Build a chat application](./build-a-chat-application.md) | `build-chat-application` |
| Reach the platform and the Agent runtime from the application's origin | [Connect to the platform](./connect-to-the-platform.md) | `connect-chat-to-the-platform` |
| Connect providers, administer custom providers, and test a custom model | [Model providers](./model-providers.md) | `manage-model-providers` |
| Design an Agent's answers for what the chat shows | [The conversation contract](./conversation-contract.md) | `design-agent-conversation-capabilities` |

The skills install into `.agents/skills/command-center-ai/` of the repository that installs the package; see
the [agent scaffold](../agent_scaffold/README.md).
