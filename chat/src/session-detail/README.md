# Session Detail

## Purpose

This directory owns the AgentSession detail model and the hook that loads one session's detail and
insights. The session engine uses it for the session on screen, and applications use it for their
own session screens. The package exports `useAgentSessionDetail`, its option and state types, and
`AgentSessionDetailSnapshot`.

## Entry Points

- `model.ts`: the normalized detail types (`AgentSessionCoreDetail`, `AgentSessionDetailSnapshot`,
  `ActiveSessionSummary`) and the helpers for a session's lookup id, display id, and label, the
  context snapshot, and the active session summary. The engine uses `resolveAgentSessionLookupId`
  for the platform id of a session record.
- `useAgentSessionDetail.ts`: loads the detail, then the insights, of one session, keeps them per
  session, and composes them into one `AgentSessionDetailSnapshot`. `refreshSessionDetail()` and
  `refreshSessionInsights()` read them again.

## Routes

- Detail: `GET /api/v1/agent-sessions/{session_uid}/`, with `organization_environment_uid`.
- Insights: `GET /api/v1/agent-sessions/{session_uid}/insights/`.

The snapshot composes the two; it does not merge them into one endpoint.

## Behavior

- A `404` from the detail is a `not_found` state. The session's insights are then cleared and not
  loaded.
- Insights load only after the detail has loaded.
- A refetch (a token refresh, a manual refresh, a re-selection) keeps a loaded session `ready` while
  it runs.
- The snapshot keeps the platform's serialized session record, so the chat sends the canonical
  session (ADR 060) without rebuilding it.
- Beside the platform's detail, the snapshot's `context` carries what the client knows of the
  selected session, such as its runtime session id, thread id, and session key.
- Insights are discriminated by the `harness` value the platform sends
  (`../backend/session-insights.ts`): the checkpoint fields of the `pi` harness and the entry fields
  of the `tau` harness are separate variants, not one mixed payload.
- Missing harness metadata (`harness`, `harness_protocol`, `harness_version`) stays unknown; it is
  never defaulted.
- The snapshot is not readiness. The engine's readiness needs the detail and the history; insights
  never gate the chat ([AgentSession Resolution](../../docs/agent-session-resolution.md#hydration)).

## Maintenance Notes

- When the platform's detail record changes, update `model.ts` first so every consumer stays
  aligned.
- Keep handle normalization on the singular `bound_handle` contract.
- Usage and context summaries come from the insights. Keep them off `AgentSessionCoreDetail`.
- Keep this directory free of presentation. Screens that render the detail belong to the
  application or to the chat UI.
