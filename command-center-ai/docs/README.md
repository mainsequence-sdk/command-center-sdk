# Command Center AI Documentation

The package owns the documentation of what it owns. Decisions and guides move here in the
same step as the code they describe ([ADR 096](./adr/adr-096-independent-chat-package.md),
section 7).

## Decisions

- [ADR 060: Session-Backed Chat Requests](./adr/adr-060-session-backed-chat-request-contract.md)
- [ADR 087: Queued Chat Messages While the Agent Works](./adr/adr-087-queued-chat-messages-while-the-agent-works.md)
- [ADR 090: Agent Icons In Command Center Surfaces](./adr/adr-090-agent-icons-in-command-center-surfaces.md)
- [ADR 093: Client-Verified Agent Readiness](./adr/adr-093-client-verified-agent-readiness.md)
- [ADR 096: The Chat as One Independent Package](./adr/adr-096-independent-chat-package.md)
- [ADR 098: One Communication Contract for Every Agent](./adr/adr-098-one-communication-contract-for-every-agent.md)

These records moved here from Command Center and keep their numbers and titles, because the code
cites them. New decisions about the package are `SDK ADR` records in `adr/` with
`Package: @dev-mainsequence/command-center-ai`, numbered in the repository's one `SDK ADR` sequence
([SDK ADR 012](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/adr/adr-sdk-012-chat-as-a-second-public-package.md)).

## Guides

- [Getting started](./getting-started.md): install the package next to the SDK, its agent skills,
  and upgrades.
- [Build an AI application](./build-an-ai-application.md): the decisions first, then the
  stylesheets, the engine, the thread, and the settings, verified on the stand-in.
- [The right rail and the expanded rail](./rail-and-expanded-rail.md): where the conversation sits
  in the application, and how it looks.
- [Connect to the platform](./connect-to-the-platform.md): the connection, the request-URL rewrite
  and the forwarder, tokens, and the failure states.
- [Model providers](./model-providers.md): built-in provider sign-in, Organization custom providers,
  and the test conversation.
- [The conversation contract](./conversation-contract.md): what the package sends an Agent, what
  the thread draws of the answer, and what a reload keeps.
- [Backend connection](../src/backend/README.md): the connection input, the clients, and the
  runtime contract.
- [Session engine](../src/engine/README.md): the engine's inputs, the default session, its context
  and hooks, the model catalog store, and browser storage.
- [Thread UI](../src/ui/README.md): the thread and its inputs, the stylesheet, readiness in the
  thread, and the message actions.
- [Model providers](../src/model-providers/README.md): the settings screens, their state, and the
  rules for credentials, custom providers, and the test conversation.
- [AgentSession resolution](./agent-session-resolution.md): how the engine chooses, hydrates, and
  connects a session and enables sending, the same for every Agent, and the sessions an
  application lists and manages.
- [Provider errors](./main-sequence-ai-provider-errors.md)

## Task and agent-skill map

The package ships one agent skill per task below, and each has a human guide with the same public
entrypoints and rules. `tests/cli/docs-skills.node.mjs` fails when a packaged skill is missing from
this table or its guide does not exist. The skills sit in lanes, as the SDK's do.

| Task | Human guide | Agent skill |
| --- | --- | --- |
| Install the package next to the SDK, refresh its skills, upgrade, and choose the focused skill | [Getting started](./getting-started.md) | `general/use-command-center-ai` |
| Decide where AI lives in the application and which pieces it needs | [Build an AI application](./build-an-ai-application.md) | `general/build-command-center-ai-application` |
| Mount the engine, the thread, and the settings, and verify on the stand-in | [Build an AI application](./build-an-ai-application.md) | `engine/mount-agent-conversation` |
| Compose the right rail and the expanded rail | [The right rail and the expanded rail](./rail-and-expanded-rail.md) | `ui/compose-command-center-ai-rail` |
| Open, list, archive, and link Agent sessions | [AgentSession resolution](./agent-session-resolution.md) | `sessions/manage-agent-sessions` |
| Reach the platform and the Agent runtime from the application's origin | [Connect to the platform](./connect-to-the-platform.md) | `backend/connect-command-center-ai-to-the-platform` |
| Connect providers, administer custom providers, and test a custom model | [Model providers](./model-providers.md) | `model-providers/manage-model-providers` |
| Design an Agent's answers for what the thread shows | [The conversation contract](./conversation-contract.md) | `contracts/design-agent-conversation-capabilities` |

The skills install into `.agents/skills/command-center-ai/` of the repository that installs the
package; see the [agent scaffold](../agent_scaffold/README.md). The Command Center SDK's general
skills send an agent here when an SDK application needs a chat or AI capabilities.
