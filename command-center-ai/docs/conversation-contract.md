# The Conversation Contract

This guide is for the people who design an Agent's answers: what the chat sends an Agent, what it
draws of the answer, what survives a reload, and how the session around the answers behaves. How
an Agent is built and how its runtime speaks to the platform are the platform's to document; this
is the contract as the chat renders it. Its agent skill is `design-agent-conversation-capabilities`.

## What the chat sends

Each message is one request, `POST {rpc_url}/api/chat`, carrying only the newest user message, the
session's canonical record with its provider, model, and thinking level, the person's user uid, the
application's `context`, and the run configuration
([ADR 060](./adr/adr-060-session-backed-chat-request-contract.md)). The conversation lives in the
session, not in the request. The chat sends only after the Agent has answered
`GET {rpc_url}/api/chat` ([ADR 093](./adr/adr-093-client-verified-agent-readiness.md)), and
"Stop" calls `POST {rpc_url}/api/chat/session/cancel` with the reason `user_requested`.

## What the thread draws

The answer streams back as `ui-message-stream`: server-sent `data:` frames of JSON chunks. The
scripted stand-in's Agent (`standalone/stand-in/agent-runtime.ts`) streams a complete example:
reasoning, a tool call with its result, a `data-sources` part, and text.

| Part | How the thread shows it |
| --- | --- |
| Text | GitHub-flavoured Markdown, with tables and fenced code that carries a copy control. Raw HTML is parsed and then sanitized. |
| Reasoning | Folded with the tool calls into a collapsed block, "Thinking" while it runs and "Reasoning" after, with a one-line preview and a count of the tools, on the page and in the rail. |
| Tool calls | The tool's name, its status (running, done, failed), its input as JSON, and its result. Tools named `mainsequence__...`, or whose result carries `details.mcp_tool`, are marked MCP and shown by their MCP name. |
| An `error` frame | Its `errorText` as the turn's error, with "Send again". The provider's reason belongs there, never the raw provider response ([provider errors](./main-sequence-ai-provider-errors.md)). |
| Notices | Starting, waking, updating, or blocked, from the platform's decisions rather than from the answer. |

Tool frames with the older AI SDK v5 names (`tool-input-available`, `tool-output-available`) are
translated; `tool-output-delta` frames are dropped, so only a tool's final result shows.

Not drawn:

- `data-<name>` parts. They reach the engine, which reads the provenance they carry, such as which
  Agent answers; the thread draws nothing for them.
- Files, sources, audio, and attachments.

## What a reload shows

After a reload, the transcript comes from the platform's history: text, reasoning, and tool calls,
each message stamped with who wrote it. Data parts and a run's live progress are not kept, so the
text and the tool calls should tell the answer on their own.

## Who is speaking

- The history stamps each message with its actor: a person or an Agent, with a uid and a name. The
  thread draws the viewer's messages, other people's with their initials, and the Agent's with its
  icon, and labels the actors when more than one takes part.
- Agent names are shown as the platform stores them.
- An Agent's icon comes from the platform's agent icon projection for the Environment, as a mask
  that follows the theme or as a colour image, with a robot as the fallback
  ([ADR 090](./adr/adr-090-agent-icons-in-command-center-surfaces.md)).
- Known issue: during a live turn the avatar is the robot until the next reload.

## The session around the answers

- **Model settings.** The session holds its provider, model, and thinking level, and the composer's
  picker changes them on the session. When the platform refuses to create a session without a
  model, the chat asks the person to choose one before it continues.
- **Readiness and wake.** The platform decides whether a session can take messages. When it says
  ready, the chat still checks that the Agent answers; while the Agent starts or wakes, the
  composer is locked, a draft is kept, and nothing is sent on the person's behalf.
- **Queued messages.** While the Agent works, the person can queue up to ten messages per session,
  sent one by one as runs finish. After a stop, a failed answer, a reload, or while the Agent cannot
  take messages, the queue is held with the reason until the person sends it
  ([ADR 087](./adr/adr-087-queued-chat-messages-while-the-agent-works.md)).
- **Insights.** The thread shows the context usage the platform reports for the session.
- **No edit or regenerate in place.** The transcript is the platform's. "Edit and send again" and
  "Send again" send a new message; the original stays.

The sequence from choosing a session to sending is [AgentSession resolution](./agent-session-resolution.md),
and the contract every Agent shares is [ADR 098](./adr/adr-098-one-communication-contract-for-every-agent.md).
