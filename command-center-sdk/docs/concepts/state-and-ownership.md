---
title: State and ownership
description: Decide which layer owns state, cancellation, errors, navigation, and session transitions.
---

# State and ownership

Most integration bugs are ownership bugs: two layers both believe they control a value, or neither
layer handles a transition. The SDK uses controlled inputs, normalized async results, and semantic
callbacks to make the owner explicit.

## Three kinds of state

### Application state

The host owns state that survives or coordinates SDK surfaces:

- authenticated user and permission results;
- routes, URL parameters, and navigation history;
- query-cache and mutation policy;
- persisted theme preference;
- notifications and product error reporting; and
- environment configuration and backend clients.

This state enters the SDK as props, definitions, adapters, or callbacks. SDK modules do not reach
into application-global stores.

### Workflow state

The SDK owns transient state needed to make one reusable interaction correct. Examples include a
debounced list search, pending row activation, picker focus, current-page selection, bulk-action
preflight, iframe request correlation, and accessible loading announcements.

The owner is normally the highest-level component or client that exposes the workflow. If you drop
to smaller primitives, you inherit more of this coordination work.

### Backend state

The backend owns authoritative records, authorization, totals, discovery results, action effects,
and one-time credential validity. A frontend may cache or present those facts, but must not invent
them from incomplete local observations.

## Controlled does not mean stateless

A controlled SDK component may keep internal interaction details while the host owns the durable
value. `ResourceDetailShell`, for example, receives `activeTabId` and calls `onTabChange`; it still
owns tab semantics, layout, and accessible presentation. The host can encode the selected tab in
the URL without reimplementing the tab interface.

Use controlled props when another part of the application must observe, persist, or restore the
value. Keep ephemeral focus, measurement, request correlation, and presentation state inside the
component that owns the interaction.

## Every async transition needs a stale-result rule

Abort signals are part of SDK adapter contracts because cancellation is correctness, not merely an
optimization. A typical latest-request-wins lifecycle is:

```text
input changes
  → abort previous request
  → mark the new generation pending
  → start with its AbortSignal
  → accept only a result from the current generation
  → ignore a late result from any older generation
```

Pass the provided signal through every transport layer. If a client library cannot cancel the
wire request, still reject or ignore its late result by generation. Never let a slower old query
overwrite a newer page, search, user, or route.

Cancellation should not surface as a generic failure. It means the result is no longer relevant.
Explicit user cancellation may deserve visible feedback; internal supersession usually does not.

## Loading and failure belong at the narrowest truthful boundary

Choose feedback by what is actually unavailable:

| Condition | Presentation owner |
| --- | --- |
| Whole application cannot mount | Viewport `ApplicationStatusScreen` |
| Existing application is reconnecting | Controlled status screen or preserved shell, chosen by host |
| One resource collection is loading | `ResourceListPage` |
| Row activation blocks a route handoff | `ResourceTransitionShell` |
| Picker options are loading | `ResourcePicker` |
| Bulk action is being checked | Confirmation/preflight surface |
| Embedded transport is authorizing | Static-site client state callback |

Do not block the entire viewport for a local list refresh. Do not hide a whole-application startup
failure inside a small spinner. Presentation should match the scope of the unavailable capability.

## Model errors by recovery, not by raw transport

The application adapter translates backend or network failures into the narrow meaning the SDK
needs. Useful distinctions are:

- retryable transient failure;
- authentication expired and reacquisition allowed;
- authenticated but forbidden;
- target or route missing;
- invalid integration contract;
- unsupported capability; and
- cancellation.

Do not pass raw backend bodies, credentials, stack traces, or internal hostnames into reusable UI
or iframe messages. Preserve diagnostic detail in trusted application logging while showing a
sanitized, actionable message to the user.

Retries belong to the layer that understands idempotency. A presentation component must not retry a
mutation because a spinner timed out. The static-site HTTP bridge retries only replay-safe requests
under its documented bounded policy; application clients own their own policy elsewhere.

## Navigation is a committed host effect

Navigation definitions and resource activation return semantic intents. The host maps an intent to
the current route model and commits it. This keeps definitions portable across React Router,
another router, full-page navigation, or an embedding host.

When an `href` is available, navigation components preserve native browser behavior for modified
clicks, middle clicks, link menus, and copied URLs. Intercept only the plain primary-button
activation that the host can faithfully handle. Disabled and unavailable destinations do not
produce intents.

## Session and document transitions invalidate delegated work

Authentication-sensitive integrations need a stronger boundary than component unmount alone.
Changing the initialized user, replacing an auth session for the same user, navigating an iframe,
or disposing its host invalidates pending delegated requests and cached credentials.

For a static-site iframe, each accepted `ready` message starts a new child-document generation. The
host sends current context again and rejects work from the previous generation. The child keeps
credentials only in memory and direct-link mode fails closed because no trusted parent is present.

Apply the same principle to application data: a cache entry scoped to one user or tenant must not
be reused merely because its component tree stayed mounted.

## Persistence requires an explicit compatibility decision

Persist only values that have stable meaning across releases. Theme IDs, contract IDs, schema IDs,
and documented persisted fields are compatibility boundaries. Transient SDK state such as open
pickers, pending request IDs, iframe credentials, or `AbortSignal` values must never be serialized.

When a persisted or wire value changes, the work is larger than a TypeScript edit: version the
contract, define mixed-version behavior, add migration coverage, update schemas and fixtures, and
coordinate the backend rollout.

## Ownership checklist

For every new interaction, answer these questions before coding:

1. Which layer has the authoritative value?
2. Is the value durable, navigable, transient, or backend-owned?
3. Who starts the async work and who can cancel it?
4. What makes an old result stale?
5. Which failures are retryable, forbidden, invalid, or cancelled?
6. What UI scope is actually unavailable while work is pending?
7. Does a user, route, document, or session transition invalidate it?
8. Is any part serialized, persisted, or sent across a trust boundary?

Continue with the task guide for [application feedback](../application-feedback.md),
[navigation](../navigation.md), [resources](../resources.md), or
[static-site embeds](../static-site-embeds.md).
