# ADR 090: Agent Icons in Command Center Surfaces

- Status: Accepted
- Date: 2026-09-14
- Amended: 2026-09-16 for the unified Agent shortcut
- Amended: 2026-10-16 for animated and pixel-art icons (section 6), following the platform's
  ADR-033 amendment of the same day
- Moved: 2026-09-23 into the chat package with its code (ADR 096, step 4); the code paths below
  are the package's
- Related:
  - the platform, which owns the icon, its sanitization, the projection and the authenticated
    delivery
  - [ADR 087: Queued Chat Messages While the Agent Works](./adr-087-queued-chat-messages-while-the-agent-works.md),
    for the composer surfaces this touches

## Context

Agents may carry a custom icon on the platform. The platform exposes it through two endpoints and
nothing else:

- `GET /api/v1/command-center/agents/?organization_environment_uid=<uid>` lists the agents
  visible to the caller in one Organization Environment as
  `[{ agentUid, commandCenterIcon: { rendering, url } | null }]`.
- `GET /api/v1/command-center/agents/<agent_uid>/icon/` returns the sanitized SVG or PNG, at most
  512 KiB, with the normal bearer token. There is no signed query, no public mode and no storage
  URL. The response carries `Cache-Control: private, no-cache`, an `ETag` of the bytes and
  `Cross-Origin-Resource-Policy: cross-origin`. The URL does not change when the icon changes.

Two renderings exist: `mask`, a monochrome alpha mask meant to follow the theme through
`currentColor`, and `color`, a preserved-colour logo meant to be drawn as an image and never
tinted. The built-in robot icon is the documented loading and error fallback.

The Command Center draws agents in eight places (thread avatars, the participants strip, the
rail header, the connecting stage, the session catalog picker, the session explorer group
headers, the agents page, the agent detail view) and, since 2026-09-03, always with the robot.
People keep photos and monograms.

Because delivery needs the bearer header, an image tag cannot load it: the client must fetch the
bytes itself and render a local object URL. This ADR does not change the backend contract.

## Decision

### 1. One projection per environment, one lookup for every surface

`AgentIconsProvider` (`src/engine/agent-icons-context.tsx`), mounted by the chat engine, reads
one projection per active Organization Environment and trusts it for five minutes, shared by every
provider on the page; a failed read is retried once. Until ADR 096 moved the engine into the
package this was a TanStack query with the same staleness and no refetch on focus. It exposes
`useAgentIconLookup()`: agent uid in, `{ rendering, imageRendering, url }` or null out
(`imageRendering` is `auto` unless the platform sends `pixelated` for a colour icon), and `useAgentIconAuth()`:
the connection and the token the icon requests use. Without a provider (tests, surfaces outside the chat provider) the lookup returns null
and everything falls back. A failed projection never blocks a surface.

Agents outside the active environment have no icon.

### 2. One byte cache for the page

`src/engine/agent-icon-cache.ts` keeps, per delivery URL, a status, an object URL and a
fingerprint. One authenticated fetch per URL, in-flight requests shared, so a thread with forty
messages from one agent makes one request. `useAgentIconObjectUrl(url)` subscribes through
`useSyncExternalStore`.

The delivery URL is stable across icon changes, so a ready entry is revalidated after five
minutes: the browser sends `If-None-Match`, and the object URL is replaced only when the
fingerprint differs. The fingerprint is the ETag when the browser exposes it, otherwise a
SHA-256 of the bytes, and as a last resort size plus type. A failed revalidation keeps the icon
already shown; a failed first load is an error retried after a minute. Sign-out clears the
cache and revokes every object URL.

### 3. One component

`<AgentIcon agentUid className fallback />` (`src/ui/AgentIcon.tsx`) is
decorative (`aria-hidden`); the container keeps the agent's name as title and label, as today.
Sizing is by `className`, like the lucide icons it replaces.

- `mask`: a span with `mask-image: url(objectUrl)`, `mask-size: contain`,
  `background-color: currentColor`, so it takes the avatar's colour in both themes.
- `color`: an `img` with `object-fit: contain`, never tinted.
- No uid, no projection entry, loading, or error: `fallback`, the built-in icon, keeping the
  thread's `data-actor-icon="robot"` so existing tests hold. `data-agent-icon="mask|color"`
  marks a rendered icon.

### 4. Where it is drawn

| Surface | Identity | Slot |
| --- | --- | --- |
| Thread message avatars, both surfaces | session agent from the thread's target agent; calling agents from projected `actorUid` | inside the 32 px circle (20 px icon), 20 px circle in the participants strip (12 px icon) |
| Rail header badge | active session's agent | 24 px; sparkle only until a session is bound |
| Connecting stage | active session's agent (`agentUid` prop beside `agentName`) | 28 px in the 48 px circle |
| Session catalog picker, agent and session rows | `agent.uid`, `selectedAgent.uid` | 20 px |
| Session explorer group headers | `group.agent.uid` | 16 px |
| Agents page rows and cards | `agent.uid` | 16 px |
| Agent detail breadcrumb | the detail record's uid | 16 px beside the name |

Status indicators (the run status pill, the working sparkle in session rows) and the app's own
navigation entry are not agents and do not change.

### 5. Rules the user sees

- An agent with an icon looks the same everywhere it appears, at the size of the slot.
- Nothing flickers: the robot is there first, the icon replaces it in place.
- Mask icons follow the theme; colour icons keep their colours.
- People keep photos and monograms; only agents get icons.
- An icon that fails to load is invisible as a failure: the robot stays.
- The configured shortcut Agent keeps whatever icon it has on the platform; Command Center adds no
  shortcut-specific default.

### 6. Animated and pixel-art icons

Amended 2026-10-16. The platform may now deliver a colour icon as an animated PNG (APNG) whose
frame 0 is its still, and may mark a colour icon `imageRendering: "pixelated"`.

- **Still unless asked.** `AgentIcon` takes `motion`, `"still"` by default. An animated icon
  animates only with `motion="animate"`, which three places pass: the rail header badge, the
  connecting stage, and the thread avatar of the agent that is working. Every other place,
  including the application's own agent surfaces, shows frame 0. Lists and repeated avatars are
  where many icons would move at once and keep the page from ever going idle.
- **Reduced motion.** When the person asks for reduced motion
  (`useCommandCenterViewport().reducedMotion`), every place shows frame 0.
- **The still comes from the same bytes.** The cache makes it once per delivery URL: an APNG is a
  PNG plus `acTL`, `fcTL` and `fdAT` chunks, and dropping them leaves a static PNG of the default
  image, which the platform guarantees is frame 0 (`src/engine/apng-still.ts`). No second request,
  canvas or decoding; the still object URL lives and is revoked with the icon's. The platform's
  projection and delivery are unchanged.
- **One motion at a time.** An animated avatar is marked `data-agent-icon-motion="animated"` and
  the stylesheet stops the working pulse (`ms-chat-pulse`) on it.
- **Pixel art stays sharp.** A colour icon marked `pixelated` is drawn with CSS
  `image-rendering: pixelated`. Mask icons are always smooth.

## Non-goals

- Uploading or editing icons from the Command Center; the repository workflow owns that.
- Icons for agents outside the active Organization Environment.
- Tinting or recolouring `color` icons.
- Any change to the platform's projection or delivery.

## Implementation Scope

- `src/backend/command-center-agent-icons-api.ts`: URL builder, projection fetch and normaliser,
  bytes fetch with the bearer header; tested.
- `src/engine/agent-icon-cache.ts`: the cache and `useAgentIconObjectUrl`; tested for
  de-duplication, revalidation with and without an ETag, error handling and clearing.
- `src/engine/agent-icons-context.tsx`: `AgentIconsProvider`, `AgentIconsContext`,
  `AgentIconAuthContext`, `useAgentIconLookup`, `useAgentIconAuth`.
- `src/ui/AgentIcon.tsx`, exported by the package; tested for mask, colour, fallback and failure,
  and since 2026-10-16 for the still default, `motion="animate"`, reduced motion and pixelated
  scaling.
- `src/engine/apng-still.ts`: frame 0 of an APNG as a static PNG; tested with the platform's own
  sanitizer output beside the cache tests.
- `ChatEngineProvider` mounts the provider and exposes `activeAgentUid`; the package's
  `ChatThread.tsx` (`ActorAvatar`, the connecting stage prop) and `AgentConnectingState.tsx` use
  the component, and so do the application's own agent surfaces in section 4.
- `ChatThread.icons.client.test.tsx`: the session agent's messages show its icon after the
  robot, a calling agent without one keeps the robot, one request per agent, people unchanged.

## Consequences

- One projection request per environment every five minutes of use, one bytes request per
  distinct icon per page load, and a cheap revalidation per icon every five minutes.
- Object URLs live for the page; at most 512 KiB per icon, plus a still of at most the same size
  for an animated one.
- Animated icons cost nothing where they are shown still; only the few single places that animate
  keep the page drawing frames.
- Should the platform later add a version or digest to the projection, the cache can key on it
  and skip revalidation; nothing here depends on that.

## Answered Questions

### Does the shortcut Agent get an icon?

It keeps whatever it has on the platform. There is no client-side shortcut default.

### Does the agent detail view show the icon?

Yes, beside the name in the breadcrumb, with the robot as fallback like everywhere else.

### Why not ask the platform for a version field?

Because the contract as shipped is enough: the ETag and a byte fingerprint make revalidation
exact, and the backend stays untouched.
