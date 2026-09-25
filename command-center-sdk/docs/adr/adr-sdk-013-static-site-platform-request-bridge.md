# SDK ADR 013: Static-Site Platform Request Bridge

- Status: Accepted
- Date: 2026-09-25
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Contract: `command-center.static_site_iframe@v1`, additively
- Related:
  - [SDK ADR 001: Static-Site Delegated FastAPI Credential Bridge](./adr-sdk-001-static-site-delegated-fastapi-credential-bridge.md)
  - [SDK ADR 005: Static-Site FastAPI WebSocket Ticket Bridge](./adr-sdk-005-static-site-fastapi-websocket-ticket-bridge.md)
  - [Static-site embeds](../static-site-embeds.md#send-platform-requests-through-the-host)

## Decision summary

An application embedded in a host as a static site never holds a platform credential. When it
needs the platform, it asks its host to send the request. The child gives the SDK a standard Fetch
`Request`; the host sends it as the signed-in person, with its own credential and renewal, if the
path is one the host chooses to serve and the request names the person the host has signed in; the
child receives a standard Fetch `Response`. The iframe protocol gains four additive version-one
messages. The SDK knows no platform path: the host decides which ones it serves.

## Context

Authentication belongs to the application that owns the person's session. In Command Center that
is the host. An application embedded in it runs as a static site in a sandboxed iframe on its own
origin, and speaks `command-center.static_site_iframe@v1`.

Until now the protocol gave the child its theme, the person's public uid, and credentials that
open one FastAPI release (SDK ADR 001 and 005). An embedded application that needs the platform
itself, for example to list the person's resources or to run AI capabilities, had no way to call
it as the person.

Giving the child a platform credential would put that credential in application code the host
does not control, and would make every embedded application own its scope, renewal, and
revocation. The application that owns the person's session should send the request for it.

## Decision drivers

- The child never receives a platform credential, in any form.
- The host keeps the one session: its credential, its renewal, and its audit.
- The host, not the SDK and not the child, decides which platform paths an embedded application
  can use.
- The child works with standard Fetch objects, so an existing transport adapts in one line.
- A request the child sends for one person is never sent for another.
- Every request is bounded in size, concurrency, and time, can be cancelled, and is parsed
  strictly. The protocol version does not change.
- The platform does not change.

## Decision

### 1. Four additive version-one messages

| Message | Direction | Payload |
| --- | --- | --- |
| `platform-request` | child to host | `requestId`; `userUid`; `method`; `path`; optional `headers`; optional `body` |
| `platform-response` | host to child | `requestId`; `status`; `headers`; `body`; `bodyEncoding` |
| `platform-error` | host to child | `requestId`; `code` |
| `platform-cancel` | child to host | `requestId` |

- `userUid` is the person the child believes is signed in, from its current host context: the
  public uid the host sends in `initialize`, a non-empty string of at most 1,024 characters. It
  identifies a person and proves nothing; the host compares it with its own current person.
- `method` is `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`.
- `path` is an absolute path with an optional query, as the URL parser serializes one, of at most
  4,096 characters. It is printable ASCII with well-formed percent-encoding and has no scheme,
  host, fragment, or backslash. Before the query it has no empty segment (so no `//` prefix), no
  `.` or `..` segment even percent-encoded, and no percent-encoded slash or backslash.
- Request `headers` holds only `accept` and `content-type`; response `headers` holds only
  `content-type`. Each value is printable ASCII of at most 1,024 characters.
- The request `body` is text of at most 1 MiB (1,048,576 bytes) of UTF-8. A `GET` has none.
- `status` is an integer from 100 to 599. The response `body` is at most 8 MiB (8,388,608 bytes)
  once decoded. `bodyEncoding` is `text` for JSON (`application/json` and `+json` types) and
  `text/*` when the charset is UTF-8 or unstated and the bytes are valid UTF-8, and `base64`
  otherwise, images included. Text keeps a byte-order mark, so the child receives the platform's
  exact bytes either way.
- `code` is `invalid_request`, `access_denied`, `not_allowed`, `temporarily_unavailable`, or
  `unsupported`.
- Parsing is strict: a message with any other field, any other header, or a value outside these
  rules is malformed. A credential cannot cross in either direction.
- Platform requests and responses have their own caps and are exempt from `maxPayloadBytes`,
  which still bounds every other message.

### 2. The host

`createStaticSiteIframeHost` and the React `StaticSiteIframe` take
`sendPlatformRequest(request, { signal, userUid })`, and the host has
`updatePlatformRequestSender()`. `request` is `{ method, path, headers, body }` and the sender
returns `Promise<Response>`, typically the host's own authenticated fetch after it checks the path
and method against the ones it serves.

- It calls the sender only when the request's `userUid` is the person in its current context, and
  passes that person to the sender. It answers `access_denied` when the request names anyone else
  or the host has no person, and `unsupported` without a sender. A request the child sent just
  before a person change therefore reaches the host naming the previous person and is refused,
  never sent for the new one.
- It reads the Response's status, content type, and body, choosing the encoding above. A body past
  8 MiB is `unsupported`. A network error or an opaque response (status 0) is
  `temporarily_unavailable`. An HTTP error status is a response, not an error.
- A sender that throws `StaticSitePlatformRequestError` maps to that error's code; any other
  failure maps to `temporarily_unavailable`. No failure message, header, or body crosses.
- The sender's `signal` aborts on `platform-cancel`, a person change, a new handshake from the
  child, a replaced sender, and disposal. A replaced sender also answers the child
  `temporarily_unavailable`, since the child is still waiting and may retry.
- After `platformRequestTimeoutMs` (60 seconds) the answer is `temporarily_unavailable`.
- At most 16 requests are in flight per child; past that the answer is `temporarily_unavailable`.
- A repeated `requestId` is `invalid_request`, and so is a malformed request whose `requestId` can
  be read.

### 3. The child

`createStaticSiteIframeClient(...)` gains `sendPlatformRequest(request: Request): Promise<Response>`.

- It sends the person in its current host context as `userUid`, the method (upper-cased), the URL's
  pathname and search, `accept`, `content-type`, and the body as text. The URL's origin and
  fragment stay behind: the host decides where the request goes. Every other header is dropped,
  including any credential the child sets.
- It refuses, locally and with `invalid_request`, a request the rules exclude: another method, an
  unsafe path, a header value out of bounds, a body past 1 MiB or not UTF-8, a body already read,
  or a person's uid past 1,024 characters.
- It resolves `new Response(body, { status, headers })` with the content type, decoding base64
  into bytes. A null-body status (204, 205, 304) has no body. A status below 200 cannot be a Fetch
  `Response` and is `unsupported`. The status text, the URL, and every other header are not
  carried.
- It rejects with `StaticSitePlatformRequestError`, carrying the code, for `platform-error`.
- It honours `request.signal`: on abort it sends `platform-cancel` and rejects with an
  `AbortError`.
- It keeps at most 16 requests in flight and queues the rest in order, so it never meets the
  host's cap.
- After `platformRequestTimeoutMs` (65 seconds, longer than the host's, so only a host that never
  answers reaches it) it sends `platform-cancel` and rejects with `unsupported`.
- A person change rejects every pending request, queued or in flight, with `access_denied`, and
  cancels the ones in flight. Before the handshake or after disposal the answer is
  `unsupported`; without a person it is `access_denied`, and nothing is sent.

### 4. What is not bridged

The bridge carries one request and one complete response. It does not stream: the Agent runtime's
live stream is not bridged, and neither are server-sent events or WebSockets. Bodies sent to the
platform are text; a binary upload is refused.

## Compatibility and Mixed Versions

- A new host and an old child: the child never sends the messages; nothing changes.
- An old host and a new child: the host reports the unknown message through its protocol-error
  callback and never answers, and the child reports `unsupported` after its timeout. The first
  request to an older host therefore takes the full client timeout to fail; a child treats
  `unsupported` as final for the session.
- A new host without a sender: `unsupported`, at once.
- A person change: the host aborts the sender's work and refuses every request that names the
  previous person, and the child rejects its pending requests. The `userUid` field is part of
  `platform-request` from the first release that has the message, so no host or child exists
  without it.

No existing message, field, channel rule, version, or context changes. The `/embed` and
`/embed/react` TypeScript API, the JSON Schema, and the fixtures change additively.

## Host Handoff and Backend Impact

- **Host.** Command Center passes `sendPlatformRequest` where it embeds applications. It serves
  only the paths it chooses and answers `not_allowed` for any other path or method, and it sends
  each request as the person with its own credential and renewal. It passes a stable sender, since
  replacing one abandons the requests in flight.
- **Platform.** No backend change. The host calls routes it can already call, as the same person,
  with the credential it already holds, from its own origin; the platform sees no new origin,
  credential, or route.
- **Storage.** None. Nothing persists on either side.

## Alternatives Considered

- **A platform endpoint that mints an AI token for the embedded application.** Rejected. It needs
  a platform change, puts a credential in application code, and makes every child own that
  credential's scope, renewal, and revocation, while the host already holds a session that can
  send the same requests.
- **The person's platform token in `initialize`.** Rejected. It hands application code the whole
  session.

## Consequences

- An embedded application calls the platform with standard Fetch objects and never holds a
  credential.
- The host's path allow-list is the control: whatever it serves, the embedded application can
  reach as the person. Hosts keep it to what their embedded applications need.
- Every request crosses two `postMessage` hops and the host's fetch. The caps bound the memory it
  costs the host.
- A request is sent only for the person it names. When the person changes between the child's
  sending and the host's receiving, the host refuses the request with `access_denied` instead of
  sending it for the new person, and the child, told of the change, has already rejected it.
- The `platform-request` fields, `userUid` among them, the `platform-response`,
  `platform-error`, and `platform-cancel` fields, the error codes, the caps, the host's person
  check, and the child's unsupported-on-silence behaviour are compatibility boundaries.
