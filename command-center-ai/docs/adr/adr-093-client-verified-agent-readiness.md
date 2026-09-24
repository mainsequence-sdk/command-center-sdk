# ADR 093: Client-Verified Agent Readiness

- Status: Accepted
- Date: 2026-09-17
- Amended: 2026-09-18: an old decision is confirmed again when the chat comes into view, and a
  held message stays held through a second "starting" answer
- Related:
  - [ADR 060: Main Sequence AI Session-Backed Chat Request Contract](./adr-060-session-backed-chat-request-contract.md)
  - [ADR 087: Queued Chat Messages While the Agent Works](./adr-087-queued-chat-messages-while-the-agent-works.md)
  - [ADR 098: One Communication Contract for Every Agent](./adr-098-one-communication-contract-for-every-agent.md)

## Context

Command Center admits a message when `resolve-runtime-access` answers
`runtime_interaction.can_submit: true`. The platform answers `ready` / `serving` for every deployed
Agent, whether or not it is running, and an idle Agent does not answer until a request reaches it
and starts it.

So a session on an idle Agent loads, the composer opens, the person writes and sends, and the
browser's own request to the Agent fails at the network level while the Agent is still starting.
The thread shows `Source: Agent runtime HTTP. Failed to fetch`. Nothing told the person the Agent
was not up, and nothing waited for it.

The platform does not report today whether a deployed Agent is running, and the chat cannot change
the platform.

## Decision

Until the platform reports activation truthfully, Command Center verifies that the Agent answers
before it treats a `ready` decision as ready.

1. **Verification.** After every `resolve-runtime-access` that returns `can_submit: true` with a
   token and an `rpc_url`, Command Center sends `GET {rpc_url}/api/chat` with that token. This is
   the Agent's own information route and shares its address, authorization and CORS handling with
   the message request, so an answer proves the message request can be delivered.
   - Any HTTP answer other than `502`, `503` or `504` means the Agent is serving.
   - A network failure, a timeout, or `502` / `503` / `504` means it is not serving yet.
2. **A `ready` that does not answer becomes `waking`.** The access result keeps the platform's
   token and address but carries a client-built transient decision: state `waking`,
   `can_submit: false`, a notice that names the Agent, a retry interval, and a wake clock
   (`requestedAt` from the first failed verification, `deadlineAt` five minutes later). Every
   existing consumer then behaves as it already does for a platform-reported wake: the shared
   poller keeps asking, the connecting stage and the notice show progress with elapsed time, the
   composer is locked with its draft kept (ADR 087 amendment), "taking longer than expected" and
   "Check again" appear past the deadline, and a message the person already sent is held and
   delivered once the Agent answers, or fails with "was not sent" when the wait runs out.
3. **The verification request is the wake.** The first request is what makes an idle Agent start,
   so opening a session on an idle Agent starts it, as the platform's wake did before.
4. **Locked until verified.** While the first verification for a selected session is in flight
   the decision is `checking` with no notice: the composer is locked and nothing flashes for an
   Agent that answers at once. The "Agent is ready" confirmation is shown only after a wait that
   a person could notice.
5. **No blind re-send.** A message request is sent only after a verification succeeded. If that
   request still fails at the network level, it is not retried (the Agent may have received it);
   the verification memo is dropped and runtime access is re-resolved so the surface shows the
   truth.

   A message that meets `waking` when it is sent has not gone out yet, so holding it is safe.
   `requestThroughRuntimeWake` owns that hold: it publishes the blocking decision before it
   waits, so the wait never mistakes the older `ready` the composer was opened on for the end of
   the start, and it tries again after every settle, so a second `waking` keeps the message held
   instead of surfacing the block as an error. One deadline, from the first block, bounds it.
6. **Old decisions.** A `ready` can become `waking` at any moment, and the platform does not say
   when. A decision older than one minute is therefore confirmed again at the moments a person is
   about to use it:
   - the chat coming into view (the rail opening, the chat page, another session selected): the
     session drops to `checking`, locked and silent, before the composer opens;
   - the tab returning after it was hidden;
   - the composer taking focus (in the background; the composer locks only if the answer is not
     `ready`).
7. **Cost control.** A successful verification is remembered for fifteen seconds per address, so
   one send costs at most one extra short request. While waking, the first check gives up after
   three seconds so the surface can say "starting" quickly; later checks wait up to twenty
   seconds, so they return the moment the Agent is up.

`runtime_interaction` from the platform stays authoritative in every other respect: a blocked or
transient platform decision is never upgraded by the client, only a `ready` can be downgraded.

## Consequences

- People no longer type into, or send to, an Agent that is not up, and they no longer see a
  transport error for a cold start.
- Opening a session on an idle Agent starts it. This matches the behaviour before the platform's
  wake reporting was removed.
- The client cannot know why an Agent does not start; past the deadline it can only say so and
  offer a re-check. Phases, failure categories and support references come when the platform
  reports them.
- When the platform reports `waking` itself, this verification only confirms it. It can then be
  reduced to the send-time check or removed; that is a follow-up decision, not part of this one.

## Backend Contract Impact

None. The verification uses the existing `GET /api/chat` route of the Agent and the token the
platform already issues.
