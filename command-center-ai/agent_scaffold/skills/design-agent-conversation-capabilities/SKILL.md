---
name: design-agent-conversation-capabilities
description: Design what an Agent streams for what the @dev-mainsequence/command-center-ai thread can show - the ui-message-stream parts it draws (text as sanitized Markdown, reasoning, tool calls with name, status, input, and result, the MCP marker, errors, notices), the data-<name> parts it reads but does not draw, what the platform's history keeps after a reload, who is speaking (provenance, actors, avatars, Agent names and icons), the session's model settings and the model-required state, readiness and wake, queued messages, insights, and cancel. Use when planning or reviewing an Agent's answers for this chat, or when an answer does not appear as expected. Do not use to implement the Agent runtime; use the platform's own skills for that.
---

# Design Agent Conversation Capabilities

The chat renders a conversation with an Agent through the platform. This skill describes what that
rendering can show, so an Agent's answers are designed for it. The Agent runtime's protocol is the
platform's to document: for building the Agent itself, use the platform's own skills. The human
guide is `docs/conversation-contract.md` in the installed package.

## What The Chat Sends

- One request per message: `POST {rpc_url}/api/chat` with only the newest user message, the
  canonical session record (its provider, model, and thinking), the person's user uid, the
  application's `context`, and the run configuration. The conversation lives in the session, not in
  the request.
- The chat sends only after the Agent has answered `GET {rpc_url}/api/chat`.
- "Stop" calls `POST {rpc_url}/api/chat/session/cancel` with the reason `user_requested`; a stopped
  run is not an error, and the cut-short answer stays cut short.

## What The Thread Draws

The answer streams back as `ui-message-stream`: server-sent `data:` frames of JSON chunks. The
scripted stand-in in `node_modules/@dev-mainsequence/command-center-ai/standalone/stand-in/agent-runtime.ts` is a
complete example: `start`, `start-step`, `reasoning-start`, `reasoning-delta`, `reasoning-end`,
`tool-call-start`, `tool-call-delta`, `tool-call-end`, `tool-result`, `data-sources`, `text-start`,
`text-delta`, `text-end`, `finish-step`, `finish`, and `error`.

- **Text**: GitHub-flavoured Markdown, with tables and fenced code that carries a copy control. Raw
  HTML is parsed and then sanitized, so scripts, event handlers, and unsafe URLs never render.
- **Reasoning**: folded, with the tool calls around it, into a collapsed block labelled "Thinking"
  while it runs and "Reasoning" afterwards, with a one-line preview and a count of the tools. Both
  the page and the rail show it. Keep reasoning worth reading; it is visible.
- **Tool calls**: the tool's name, its status (running, done, failed), its input as JSON, and its
  result. A tool whose name starts with `mainsequence__`, or whose result carries
  `details.mcp_tool`, is marked MCP and shown by its canonical MCP name. The older AI SDK v5 tool
  frames (`tool-input-available`, `tool-output-available`) are translated; `tool-output-delta`
  frames are dropped, so only a final result shows.
- **Errors**: an `error` frame's `errorText` is shown as the turn's error, with "Send again". Put the
  provider's reason in `errorText` and never the raw provider response.
- **Notices**: readiness and the platform's runtime notices (starting, waking, updating, blocked)
  are drawn by the thread from the platform's decisions, not from the answer.

## What The Thread Does Not Draw

- `data-<name>` parts reach the engine, which reads the provenance they carry, such as which Agent
  answers; the thread draws nothing for them.
- Files, sources, audio, and attachments are not drawn. An answer that needs them is not ready for
  this chat.

## What A Reload Shows

After a reload the transcript comes from the platform's history: text, reasoning, and tool calls,
each message stamped with who wrote it. Data parts and a run's live progress are not kept. Design
answers so the text and the tool calls tell the story on their own.

## Who Is Speaking

- The history stamps each message with its actor: a person or an Agent, with its uid and name. The
  thread draws the viewer's own messages, other people's messages with their initials, and the
  Agent's with its icon, and labels actors when several take part.
- Agent names are shown as the platform stores them; the chat does not shorten or rewrite them.
- An Agent's icon comes from the platform's agent icon projection for the Environment, as a
  theme-following mask or a colour image, with a robot as the fallback. During a live turn the avatar
  is the robot until the next reload; that is reported to the chat's owner.

## The Session Around The Answers

- **Model settings**: the session holds its provider, model, and thinking level; the composer's
  picker changes them on the session. When the platform refuses to create a session without a
  model, the chat asks the person to choose one before it continues.
- **Readiness and wake**: the platform decides whether a session can take messages. When it says
  ready, the chat still checks that the Agent answers; while it starts or wakes, the composer is
  locked and a draft is kept. Answer the `GET {rpc_url}/api/chat` check quickly.
- **Queued messages**: while the Agent works, the person can queue up to ten messages per session;
  they are sent one by one as runs finish. After a stop, a failed answer, a reload, or while the
  Agent cannot take messages they are held, with the reason, until the person sends them.
- **Insights**: the thread shows the context usage the platform reports for the session.
- **No edit or regenerate in place**: the transcript is the platform's; "Edit and send again" and
  "Send again" send a new message.

## Verify

1. Stream a representative answer to the scripted stand-in's shapes, or run the package's standalone
   application on the stand-in, and compare what appears with the lists above.
2. Reload and confirm the text and tool calls tell the answer without the data parts.
3. Fail a turn with an `errorText` and confirm the reason reads well next to "Send again".
