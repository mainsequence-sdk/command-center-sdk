---
name: manage-agent-sessions
description: Work with several Main Sequence Agent sessions in an application that uses @dev-mainsequence/command-center-ai - open a requested session from the URL, launch an Agent's latest or a new session, list, search, archive, unarchive, and delete sessions, start a new one, and show a session's detail and insights. Use when the application needs more than one Agent's default session, a session explorer beside the expanded rail, or links to a session. Do not use to change how the platform stores sessions.
---

# Manage Agent Sessions

The engine shows one session at a time, and the application decides which. The human guide is
`docs/agent-session-resolution.md` in the installed package.

## Choose How The Session Is Chosen

`ChatEngineProvider` (`$mount-agent-conversation`) takes the application's choice:

- `defaultSession` with `showsDefaultSession`: one Agent's session behind a stable handle. The
  platform returns the same session for the same person, Agent, and handle.
- `requestedSessionId`: the session the application asks to show, for example `?session=<id>` on
  the expanded rail's route (`$compose-command-center-ai-rail`). Pass `onRequestedSessionRemoved`
  so the application drops the request when that session is archived.
- `launchTarget`: an Agent to open once the conversation is visible, its latest session or a new
  one. A new `launchKey` opens it again.
- `avoidImplicitSessionSelection`: start from nothing instead of resuming the newest session.

## Work With Sessions Through The Engine

Inside the provider, `useChatEngine()` holds the list and the actions, so every surface sees the
same state:

- `agentSessions`, `currentSessionId`, `activeSessionSummary`, and `activeSessionDetail`;
- `createAgentSession()`, `startAgentSessionById()`, and `openLatestOrStartAgentSessionById()`;
- `archiveAgentSession()`, `unarchiveAgentSession()`, and `deleteAgentSession()`. Deleting is
  permanent: confirm it in the application first;
- `defaultSessionStatus` (`idle`, `loading`, `missing`, `opening`, `ready`, or `error`),
  `retryDefaultSession()`, and `restoreDefaultSessionSelection()`;
- `refreshSessionDetail()` and `refreshSessionInsights()`.

Outside the provider, for example on a page that only lists sessions, the package's functions call
the same platform routes through the connection, whose sender adds the person's credential: `fetchLatestAgentSessions`,
`searchAgentSessions`, `fetchArchivedAgentSessions`, `startNewAgentSessionRequest`,
`archiveAgentSessionRequest`, `unarchiveAgentSessionRequest`, `deleteAgentSessionRequest`, and
`fetchAgentSessionDetail`. Lists are scoped by the Environment and the person. `useAgentSessionDetail()`
loads one session's detail and then its insights; a `404` is `not_found`.

## Build The Session Explorer

The explorer beside the expanded rail lists sessions with the Agent's `AgentIcon`, the title, and
the last update, and its header holds New session. Build its rows, buttons, and search field with
the SDK's `/controls` (`$compose-command-center-controls`); for a paged, searchable collection use
`$build-resource-list`. Activating a row selects the session and puts its id in the URL.

## Do Not Rebuild Owned Behavior

- Do not resolve, hydrate, or check the readiness of a session yourself; the engine owns selection,
  hydration, runtime access, and readiness.
- Do not keep a second session list. The engine keeps one per person and Environment in
  `localStorage` (`ms.main-sequence-ai.agent-sessions:{user}:{environment}`).

## Verify

On the scripted stand-in (`$mount-agent-conversation`): open the default session, then a requested
one from the URL. Archive it and confirm `onRequestedSessionRemoved` runs, start a new session,
reload into the same session, and open its detail and insights.
