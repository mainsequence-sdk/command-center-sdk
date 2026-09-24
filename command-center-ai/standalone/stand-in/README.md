# Stand-in

## Purpose

A scripted stand-in for the backend the chat package calls: every platform API route and every
Agent runtime route of ADR 096, section 3. It keeps sessions, transcripts, and model providers in
memory and answers in the shapes the package's clients in `../../src/backend/` parse. The standalone
application's tests run against it (ADR 096, section 9), and `?stand-in` runs the application on it
in development, with no platform and no token.

## Entry Points

- `createStandIn(options)` (`index.ts`) returns a stand-in: `fetch`, to put in place of the global
  one, and what a test reads and scripts:
  - `requests`, `findRequests(method, path)`, and `unhandledRequests` (requests without a route;
    a complete stand-in keeps it empty);
  - `sessions`, with their transcripts, and `turns`, the chat turns with the body the chat sent,
    the frames streamed back, and how each ended;
  - `failNextTurn(errorText?)`: the next turn streams an error frame instead of a reply;
  - `holdReplies()` and `releaseReplies()`: replies wait after their reasoning, so a run can be
    stopped.
- `installStandIn(options)` replaces `window.fetch` for the page (`../main.tsx` calls it for
  `?stand-in`), prefills the connect form when nothing is stored under
  `chat-standalone.settings`, and puts the stand-in on `window.chatStandIn`, so its script can be
  driven from the browser console. It streams with a small delay per frame so a reply can be watched.
- `standInIdentity` (`identity.ts`): the platform URL, person, Environment, Agent, runtime URL, and
  runtime token it uses by default.

Modules: `http.ts` (reading requests, answers, abort), `identity.ts` (identities and the shared
context), `sessions.ts`, `model-providers.ts`, and `agent-runtime.ts` (the route families).

## Behaviour

- Platform requests are matched by path on any origin, with the application's `/__platform__`
  prefix removed, so they are answered absolute (tests) or through the development proxy prefix.
  Runtime requests are those under the runtime URL runtime access returns; none reaches the
  network. With `installStandIn()` anything else still goes to the network (a custom provider's own
  endpoint, which the direct test conversation calls, is not answered).
- Platform routes take any bearer token; runtime routes take only the runtime token.
- The stand-in's Agent answers under any Agent uid, and it serves the person and the Environment
  the chat names on its scoped reads, so a form filled with real values connects too.
- A new session gets the model `stand-in-cloud` / `swift-1`, thinking `medium`. A turn is answered
  with the model of the session the request carries (ADR 060): reasoning, a `stand_in_search` tool
  call with its input and output, a `data-sources` part, and text that echoes the message and names
  the model. A model whose provider is not signed in (`stand-in-labs` at first) answers with an
  error frame that says so.
- The history route returns the transcript so far, stamped with the session's Agent, and `404`
  for a session nobody has written to yet.
- A provider sign-in completes on the second read of its attempt. Custom providers and their
  models are validated and join the catalog.

## Maintenance Notes

- When a client in `../../src/backend/` changes what it sends or parses, change the route here in
  the same change. `../StandaloneApp.client.test.tsx` drives the package's own clients against
  every route, so a shape that drifts fails there.
- A new route the package calls gets a handler here; until it has one, it shows up in
  `unhandledRequests`.
- Keep it deterministic: uids count up per kind, and replies depend only on the message and the
  session's model.
- Name the platform, not its implementation, in messages and comments.
