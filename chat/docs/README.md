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
  split out of ADR 092, which keeps the Command Center shortcut

Moved records keep their numbers and titles. While the package lives in this repository, new
records continue the repository's single ADR sequence.

## Guides

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
