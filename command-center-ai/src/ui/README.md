# Chat UI

## Purpose

This directory is the chat as people see it: the thread with its messages, reasoning, tool calls,
errors, notices, queue, composer, model picker, and context usage; the "choose a model" state; the
connecting stage; the message actions; agent icons; and markdown.

## Entry Points

The package exports three components:

- `ChatThread`: the active session of the nearest `ChatEngineProvider`. Its props:
  - `surface`: `page` is a full-width column, `overlay` a narrow rail;
  - `compact`: the smaller empty state;
  - `copy`: the words the thread shows (`ChatThreadCopy`). Each has a neutral default
    (`DEFAULT_CHAT_THREAD_COPY`); an application passes its own, for example to name its assistant;
  - `viewer`: the signed-in person (`ChatViewer`), drawn on their own messages;
  - `onOpenModelProviderSettings`: opens the application's model provider settings. The picker's
    "Sign in to provider" action and the "Open model providers" button appear only with it.
- `AgentConnectingState`: the connecting stage. The thread shows it while an Agent starts; an
  application can show it while it prepares a session, as Command Center's shortcut does.
- `AgentIcon`: an Agent's custom icon with a built-in fallback
  ([ADR 090](../../docs/adr/adr-090-agent-icons-in-command-center-surfaces.md)). It reads the
  projection and the credentials from the engine's icon provider, so outside the engine it draws
  the fallback.

The thread draws text, reasoning, tool calls, errors, and notices. `data-<name>` parts reach the
engine, which reads the provenance they carry; the thread does not draw them.

The rest is internal: `MessageActions.tsx`, `SessionModelRequiredState.tsx`,
`ChatRunConfigRow.tsx`, `Select.tsx` (a native-select contract drawn by the SDK's picker),
`MarkdownContent.tsx`, `chat-ui-context.tsx` (the copy, the viewer, and the settings callback), and
`class-names.ts`. `Dialog.tsx`, `ConfirmationDialog.tsx` (the person types a word to confirm), and
`PasswordInput.tsx` serve the [model provider settings](../model-providers/README.md).

## Dependencies

- The [session engine](../engine/README.md). Every part reads `useChatEngine()`, so the thread
  renders inside `ChatEngineProvider`.
- The Command Center SDK, a peer dependency (SDK ADR 012):
  `Button` and `Badge` from `/controls`, the picker from `/views`, and the theme variables.
- assistant-ui's thread, message, and composer primitives; lucide icons; `react-markdown` with
  `remark-gfm`, `rehype-raw`, and `rehype-sanitize`.

## Readiness in the Thread

The engine owns runtime access and its re-checks; the thread renders its decision. A selected
session is locked and silent while it is `checking`, an Agent that does not answer is `waking`
with a notice that names it, and "\<Agent> is ready" is shown only after a wait of a few seconds or
more. The composer asks the engine to confirm an old decision again when it takes focus
(`revalidateStaleRuntimeAccess`). Transient states (checking, starting, waking, updating) lock the
composer: a draft already written is kept, nothing is sent on the user's behalf, and writing
resumes, with focus returned on the surfaces that focus the composer, once the Agent can take
messages. Terminal states surface the backend notice. Existing history stays visible while a
runtime wakes or restarts.

Nothing serves a repo diff, so there is no repo diff viewer, session tools types, or
`react-diff-view` dependency here.

There is no Agent type. The platform does not serialize one and the Agent runtime does not read
one, so requests carry no `agentType` and no `sessionMetadata.workflow_key`, and no record,
context value, or page column models it. An Agent deployed from a code repository is recognized
only by its `code_repository_branch_uid`.


## Message Actions

Both surfaces carry the per-message actions of a classical chat, cut to what this transcript can
honestly do. The row is revealed by hover or by keyboard focus and stays mounted, so the actions
keep their place in the tab order.

The backend owns the canonical history and the send path carries only the newest user message, so
nothing edits or regenerates a message in place. A local branch would be a browser-only fiction
that the next history load erases and that no other viewer of the session ever sees. So:

- **Copy** (user and assistant) is pure clipboard and copies the message's text parts, never the
  reasoning or tool cards. Fenced code blocks carry their own copy control, from
  `MarkdownContent.tsx`.
- **Edit and send again** puts the message's text in the composer, replacing the draft, and focuses
  it. Nothing is sent: the edit goes out as a new message when the person sends it.
- **Send again** sends the same text as a new turn. The original message stays where it is.
- A failed turn carries a **Send again** that resends the prompt above it, instead of being the
  dead end it was.

Both resend actions reuse the composer's own lock (`isComposerBlocked`) and the composer's own
send, so they obey every readiness rule the composer obeys: while the agent works the message
joins the queue of
[ADR 087](../../docs/adr/adr-087-queued-chat-messages-while-the-agent-works.md) instead of racing
the run, and while the runtime is waking the resend is disabled and the edit only prepares a
draft.

Regenerating an answer in place, true in-place editing and branch navigation are not here. They
need a platform capability — message identity plus an edit/branch or regenerate route on the
session — that the chat request contract does not have.

The expanded page shows the tail of a long prompt so one message cannot take the whole column; the
hidden part is behind a `Show full message` toggle, never dropped, and a copy always yields the
whole message.


## The Stylesheet

The components use `ms-chat-` classes, named block, element, and modifier. Their rules are in
`styles.css` at the package root, which applications import as
`@dev-mainsequence/command-center-ai/styles.css` after the SDK's stylesheets (`theme/styles.css`, `styles.css`,
and `theme/markdown.css`). Command Center imports it in its global stylesheet, right after the SDK.

- Every rule is in the `ms-chat` cascade layer. The SDK's component rules are not layered, so where
  both style one element, a button for example, the SDK's rule wins, as it did when these classes
  were Tailwind utilities. An application overrides the chat with ordinary rules.
- Values come from the variables the SDK theme publishes, and the stylesheet passes the SDK's
  theme audit (`command-center-sdk theme audit`). Text sizes follow the SDK's scale, which is what
  the SDK gave the Tailwind classes the chat used before.
- Markdown elements take their look from the SDK's markdown stylesheet. The chat's rules add only
  heading tracking, list spacing and markers, the table and code-block frames, and the copy
  control.

Maintenance notes:

- The warning panels use `--warning-tint`, which the SDK has not released yet. The chat needs the
  SDK release that publishes it.
- The compact provider, model, and thinking picker overrides the SDK picker's trigger with
  `!important`, the only way a layered rule wins over an unlayered one. The SDK's theme audit
  reads the flag as part of the value and reports those two declarations; the fix belongs in the
  audit.
- Fixed pixel radii are written `max(18px, var(--radius))`, so they keep their size whatever the
  theme's radius.
- Small shadows come from the theme's shadow tokens (`--card-nested-shadow`, `--shadow-picker`),
  because the audit refuses fixed shadow colours. The success colour is the theme's `--success`.
- The stylesheet was generated from the Tailwind classes these components had in Command Center
  and checked rule by rule against Tailwind's output in Command Center's page. From now on it is
  maintained by hand. Keep modifier rules after their block's rules: they override it at the same
  specificity.

## Tests

The `*.client.test.tsx` files mount the thread in assistant-ui's external-store runtime with the
engine mocked: message actions, message authors, the connecting stage, agent icons, the queue, and
tool calls. The "choose a model" state and the agent icon have their own.
