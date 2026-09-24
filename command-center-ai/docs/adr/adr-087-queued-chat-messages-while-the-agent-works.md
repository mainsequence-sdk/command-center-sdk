# ADR 087: Queued Chat Messages While the Agent Works

- Status: Accepted
- Date: 2026-09-13
- Implemented: 2026-09-13 (phase 1, Command Center only)
- Amended: 2026-09-13, after review: no Send now until the runtime can steer; reorder by drag
- Amended: 2026-09-17: the composer is locked while the Agent wakes (the platform's Agent
  projection), it no longer stays open for typing
- Related:
  - [ADR 060: Main Sequence AI Session-Backed Chat Request Contract](./adr-060-session-backed-chat-request-contract.md)
  - Command Center ADR 092: Environment Agent Shortcut and Unified Runtime
  - the platform's runtime interaction and its runtime wake signal and presence, which own the
    readiness decisions every send already passes through

## Context

While an agent turn is running, the Command Center composer is locked. `blockTyping` in
`ChatThread.tsx` includes `isSessionBusy` (a local run, session creation, a model update, or the
backend `working` flag), so the user cannot type; the send slot becomes Stop; the placeholder
reads "Waiting for response..." or "Session is working...". assistant-ui adds its own lock:
`ComposerPrimitive.Input` ignores Enter while the thread runs, and the Send primitive is disabled
while running unless the runtime declares the `queue` capability, which the local runtime does not.

Users expect the classic behaviour instead: keep writing, submit, and see the message wait in a
visible queue that sends when the agent is free. The ask includes reordering the queue.

Four facts about the stack shape the design.

1. **Appending to the thread while a run is active aborts the run.** The local runtime's `append`
   starts a new run, and `performRoundtrip` aborts the previous run's controller first
   (`@assistant-ui/core` `local-thread-runtime-core.js`). A queue cannot use the thread as its
   store; it must add to the thread only after the previous stream has ended.
2. **The runtime serialises turns with the connection open.** The active-session runtime holds the
   session lock for the whole turn, durability included. A second
   `/api/chat` for the same session waits on that lock with its request open; the chat stream has
   no keepalive and the load balancer closes idle connections after four minutes. Sending the
   next message before the previous stream ends is therefore unsafe, not merely wasteful.
3. **One user message per request.** The runtime reads the last user message of `messages` as the
   prompt (`api/models.py`, `ChatRequest.prompt_text`). Several queued messages cannot ride one
   request; each queued message is its own turn. ADR 060's request contract is unchanged.
4. **assistant-ui has a queue model nobody feeds.** `@assistant-ui/core` 0.1.13 defines
   `composer.queue` of `QueueItemState {id, prompt}`, `ComposerPrimitive.Queue` and
   `QueueItemPrimitive` (Text, Steer, Remove), but the composer runtime client hard-codes
   `queue: []` and every runtime declares `capabilities.queue: false`. The primitives cannot be
   used without a custom runtime client; the Command Center renders its own strip instead and
   keeps its store independent of `composer.queue`, so a future assistant-ui version that
   implements the capability does not collide with this feature.

The underlying harness supports steering and follow-up queues, but the current runtime transport
does not expose them. Reaching those queues is runtime work and is out of scope here; see
"Later: runtime steering".

The backend `working` flag is lease-based (`session_leases.py`) and reaches the client only when
the session list refreshes on specific events. A session busy because another tab or agent is
writing is therefore observed late; the design treats that case as best-effort.

A precedent exists: a draft written while the runtime wakes is kept and offered with one
"Send now" click (`SendDraftNowButton`). The queue generalises it.

## Decision

### 1. The queue is owned by the Command Center, per session

The chat provider keeps `queuedMessagesBySessionId: Record<sessionId, QueuedMessage[]>` with

```ts
type QueuedMessage = {
  id: string;            // client-generated
  text: string;          // the composer text at enqueue time, trimmed
  createdAt: string;     // ISO
  status: "queued" | "sending" | "held";
  holdReason?: "stopped" | "failed" | "away" | "blocked" | "unavailable";
  holdMessage?: string;  // plain-language reason shown on the strip
};
```

A pure reducer in `src/engine/message-queue.ts` implements `enqueue`,
`remove`, `edit`, `move`, `clear`, `takeNext`, `hold` and `release`, with unit tests. Nothing in
the queue exists on the platform until it is sent: the platform, the Agent runtime and the history
projection are untouched by this ADR.

The queue is keyed by the session record id used by the other per-session maps. When a new chat is
promoted from the stream to its backend session id (`promoteCurrentSessionFromStream`), the queue
is re-keyed with it.

### 2. The composer keeps working while the agent works

- `blockTyping` drops the busy condition. It keeps session creation and model updates, which are
  short and change what a message means.
- While the thread runs, or the session is working because of another writer, the primary control
  becomes **Add to queue** (queue icon, `aria-label="Add to queue"`, title "Add to queue · Enter").
  Enter without Shift adds to the queue and clears the composer. This is done in the existing
  `onKeyDownCapture` handler on `ComposerPrimitive.Input`, which runs before assistant-ui's own
  handler and calls `preventDefault`, so no fork of the primitive is needed.
- **Stop** stays available as a secondary control next to the primary one while a local run is
  active. Escape keeps its current meaning (cancel the run).
- Placeholder while working: "\{Agent} is working. Your message will send when it finishes." with
  the session's Agent name, never a fixed shortcut-Agent name (see ADR 092).
- The wake and readiness gates stay in front of the queue: while the Agent is checking, starting,
  waking, or updating, the composer is locked (the draft already written is kept and never sent on
  the user's behalf), and a queued message sent later passes through the same `fetch` gate as a
  typed one.

### 3. The queue is a strip above the composer, on both surfaces

The strip is its own panel directly above the composer, outside the composer's box and framed
like it, on the chat page and on the rail. It is hidden when the queue is empty. Each row, in
order:

- a grip handle;
- the message text on one line, truncated, with the full text on hover and when the row has
  focus;
- a delete button;
- an overflow menu with **Edit** and **Remove**.

Above the rows, one line: "2 queued · will send when \{Agent} finishes" and a **Clear** action.
When the queue is held, the line states the reason in the user's words ("Held after you stopped
\{Agent}.", "Held because the last answer failed.", "Held while you were in another session.",
"Held: \{notice message}.") and a **Send next** action appears next to it.

Rows carry `data-message-queue`, `data-queue-item`, `data-queue-index`, `data-queue-status`,
`data-queue-handle`, `data-dragging`, `data-drop-edge` and
`data-queue-action="send-next|edit|remove|clear"` for tests.

### 4. Ordering and editing

- The first row is always the next message to send. Rows reorder by drag and drop: the whole
  row drags, the grip is the affordance, and an insertion line shows where the row will land.
  Keyboard users reorder with the arrow keys on a focused row. The reorder is immediate and
  persisted. Native drag events are used; no drag library is added.
- Edit removes the row and puts its text back into the composer, replacing the current draft only
  when the draft is empty; otherwise the draft is kept and the row's text is appended after a blank
  line. The user can re-queue from the composer.
- Remove and Clear ask for no confirmation: the text is the user's own, and Edit offers recovery
  for a single row.

### 5. Sending rules

- **One turn per queued message.** A queued message is sent by calling
  `runtime.thread.append({ role: "user", content: [{ type: "text", text }] })`, the same path the
  composer uses, so the request body builder, provenance stamping, the readiness and wake gates,
  and the runtime's persistence all apply unchanged. The runtime sees one ordinary turn.
- **Only after a clean finish, only on screen.** The provider drains in the runtime hook's
  `onFinish`, in the branch where the run belongs to the session on screen and no error was
  recorded: it takes the first row, marks it `sending`, and appends it. The row leaves the strip
  when the run starts; the message appears in the thread as a normal user message. The next row
  waits for that run's `onFinish`.
- **Status line.** While a queued message is being sent the run status detail reads
  "Sending queued message 1 of 2". The provider exposes it through the run-status
  context; no component renders the detail text today, so it becomes visible when
  one does.
- **Settings at send time.** A queued message uses the provider, model and reasoning effort
  selected when it goes out, exactly like a message typed at that moment.
- **Busy because of another writer.** While the session is `working` without a local run,
  queueing is allowed. The provider refreshes the session detail every ten seconds while a queue
  waits and the session is working; when `working` turns false it drains as after a clean finish.
  The thread is not reloaded first: a reload resets the thread and would race the send, and the
  runtime's own history is what the turn is built from, so the visible thread catches up on the
  next history load. This is best-effort coordination between tabs and agents and is documented
  as such on the strip's tooltip.

### 6. Hold rules and Send now

The queue is **held** and nothing sends automatically when:

- the run ended in error (`onError`): reason `failed`;
- the user stopped the run (`onCancel` from Stop or Escape): reason `stopped`;
- the user switched sessions while a run was active: reason `away`;
- the runtime decision blocks sending and is not transient (ADR-026 `can_submit=false` with a
  non-transient state): reason `blocked`, with the decision's notice message;
- `thread.append` throws before a run starts: reason `unavailable`, with the thrown message. A
  guard that fires inside the run (the readiness guard in the request body builder) surfaces as
  an errored turn in the thread and holds the rest with reason `failed`, because the message has
  already left the queue.

A held queue resumes only when the user clicks **Send next**. There is no automatic resume, so
nothing fires while the user is reacting to a failure.

There is no per-row **Send now** in this phase. The only thing the client could do with it today
is stop the answer in progress and send the row, which is not what a user reading "Send now" or
"Steer" expects; that action exists as Stop plus Send next. A per-row Steer arrives with the
runtime capability (see "Later").

### 7. Persistence and limits

- The queue is stored in `sessionStorage` under `main_sequence_ai.message_queue.<sessionId>`,
  written on every change, read when a session loads, removed when the queue empties. It survives
  a reload in the same tab; it is not shared across tabs or users because the platform has not
  seen the text.
- At most ten queued messages per session. The eleventh is refused with the notice "The queue is
  full. Send or remove a message first." No new per-message length limit is introduced.
- Queued messages are text only. The composer has no attachments today; if it gains them, queued
  attachments need their own decision.
- Where sessions are listed (`AgentSessionExplorer`, next to the working indicator), a session with
  queued messages shows a small count.

### 8. Copy

User-facing text names the agent and what the user can do. It never names the runtime, the
platform, pods, the backend or the queue's implementation. Held reasons use the wording in §3.

## Non-goals

- Joining several queued messages into one turn.
- Sending a queued message before the previous stream has ended, on the client or on the runtime.
- Automatic resume after an error, a stop, or a session switch.
- A server-side queue, or persistence of unsent text on the platform.
- Steering the answer in progress (runtime work, see below).
- Sharing a queue across tabs or users.

## Implementation Scope

### `src/engine/message-queue.ts` (new)

Types, the reducer (`enqueue`, `remove`, `edit`, `reorder`, `clear`, `takeNext`, `hold`, `release`),
the limit, and the `sessionStorage` helpers (`readQueue`, `writeQueue`, `rekeyQueue`). Pure;
unit-tested in `message-queue.test.ts`.

### `src/engine/ChatEngineProvider.tsx`

- State: `queuedMessagesBySessionId`; actions exposed on the engine's context:
  `messageQueue` (current session), `enqueueMessage(text)`, `removeQueuedMessage(id)`,
  `editQueuedMessage(id)`, `reorderQueuedMessage(id, toIndex)`, `clearMessageQueue()`,
  `sendNextQueuedMessage()`.
- Drain in `onFinish` (clean, current session); hold in `onError`, `onCancel`, and on session
  switch.
- Working poll and history refresh for the other-writer case; re-keying on promotion;
  `sessionStorage` sync.
- Run status "Sending queued message n of N".

### `ChatThread.tsx`

- Composer: typing while busy, **Add to queue** primary control with Enter, Stop as secondary,
  placeholder copy.
- `ComposerQueueStrip`: the strip described in §3, rendered above the composer on both surfaces.
- Session list count in `AgentSessionExplorer.tsx`.

### Tests

- `message-queue.test.ts`: reducer semantics, limit, reorder clamping, edit, storage round trip,
  re-keying.
- `ChatThread.queue.client.test.tsx` (jsdom, external-store harness as in the existing thread
  tests): typing while running is allowed; Enter and the primary control queue instead of sending;
  rows render in order with the count line; drag and drop and the arrow keys reorder; Edit returns
  text to the composer; Remove and Clear; held state shows the reason and Send next; Stop remains
  available; no Send now.
- The drain, hold and restore wiring in the provider is exercised through the pure reducer
  tests (take, hold, release, return, storage) and the type-checker; it has no component-level
  test, because the provider cannot be rendered in isolation. Verifying the end-to-end drain
  against the dev runtime is a manual step.

### Docs

This ADR, listed in the chat package's decisions. The chat rendering map gets a pointer.

## Acceptance

- While an answer streams, the user can type, press Enter, and see the message appear as the last
  row of the strip within the same frame; the composer is empty afterwards.
- Reordering by drag, or with the arrow keys on a focused row, changes which row is sent first, and
  the order survives a reload of the tab.
- When the answer finishes cleanly, the first row is sent by itself and appears in the thread as
  a normal user message; the second row waits for the new answer to finish.
- After Stop or an error, no queued message is sent until the user clicks Send next.
- Switching sessions during a run leaves that session's queue intact and held; returning shows it
  with "Held while you were in another session." and Send next.
- Nothing about the request body, provenance, readiness gates or persisted history changes; the
  platform's and the Agent runtime's tests are unaffected.

## Consequences

- Each queued message costs one model call, which is what the user asked for by writing them
  separately. Joining messages would change what the agent is asked and was rejected.
- Without Send now, a row cannot jump ahead of the answer in progress; the user stops the answer
  and clicks Send next. Steering arrives with the runtime capability.
- The other-writer case adds a ten-second detail poll only while a queue exists, so idle sessions
  add no traffic.
- The strip is independent of assistant-ui's `composer.queue`. If a later assistant-ui release
  implements the `queue` capability in the local runtime, the composer override in `ChatThread.tsx`
  keeps precedence until this feature is migrated deliberately.

## Later: runtime steering

The Agent runtime can inject a message between agent steps (steer) or run it as the next turn
inside the same run (follow-up). Exposing that needs Agent-runtime work: a route such as
`POST /api/sessions/{session_uid}/queue` with `{content, mode: "steer" | "follow_up"}` that bypasses
the turn lock, the same caller identity and provenance stamp as the chat route, and the runtime's
queue updates forwarded as a `data-queue` chunk so the strip can show rows that are already inside
the run. With that in place, Send now becomes Steer without cancelling, and the strip's rows move
from "queued here" to "queued in the run". That is a separate decision for the Agent runtime and an
amendment of this one.

## Answered Questions

### One turn per queued message, or join consecutive rows?

One turn per message. The transcript stays faithful to what the user wrote, the runtime's
persistence and the history projection need no change, and the cost is the model calls the user
asked for. Joining is available to the user by editing rows into one.

### Resume automatically after Stop or an error?

No. Every mainstream chat client holds after an interruption, and an automatic send would land in
a session the user is trying to redirect. Send next is one click.

### Why is there no Send now before steering exists?

The only client-side meaning would be "stop the current answer, then send this row", which reads
as steering and is not. Stop plus Send next covers that case honestly; a per-row Steer ships with
the runtime capability.

### Does the queue survive a reload?

Yes, per tab and per session, in `sessionStorage`. Not across tabs or users: the text has not
reached the platform.

### How many?

Ten per session. Enough for a burst of thoughts, small enough that a forgotten queue cannot send a
long series of turns unattended.
