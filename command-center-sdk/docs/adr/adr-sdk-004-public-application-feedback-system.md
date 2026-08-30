# SDK ADR 004: Public Application Feedback System

- Status: Accepted
- Date: 2026-08-27
- Owners: Command Center SDK maintainers

## Context

Complete applications frequently wait for prerequisites before their routes are usable: a backend
runtime may be starting, schemas may be attaching, a delegated transport may be reconnecting, or
an application-level cache may be preparing. A production analytics consumer demonstrated a
useful pattern: block incomplete application content, show the producer's real ordered stages,
surface elapsed time and active details, explain retries, and end in an actionable failure state.

The SDK already owns several narrower async presentations. `ResourceListPage` owns collection
loading and errors, `ResourceDetailShell` uses `ResourceTransitionShell` for resource handoffs,
and pickers and action dialogs own their local pending states. `ResourceTransitionShell`, however,
contains only an indeterminate spinner, title, and description. It cannot represent application
startup stages, a retry notice, elapsed stage metadata, or a terminal action.

Leaving this presentation entirely application-owned causes otherwise compatible applications to
invent different full-screen spacing, status colors, icons, responsive behavior, motion policy,
and accessibility semantics. The problem is reusable presentation, not shared backend authority.
Readiness endpoints, response shapes, retry rules, and what “ready” means vary by application and
must not move into the public package.

## Decision

Publish a new React entrypoint:

```text
@dev-mainsequence/command-center-sdk/feedback
```

The entrypoint contains three controlled primitives:

| Primitive | SDK-owned behavior | Consumer-owned input |
| --- | --- | --- |
| `ActivityIndicator` | Theme-aware indeterminate icon, standard sizes, reduced motion, optional standalone accessible label | Whether activity is occurring and its accessible label |
| `ProgressStageList` | Ordered stage layout, state icons and labels, elapsed formatting, active/error detail disclosure, responsive collapse | Stable stage IDs, true producer state, labels, descriptions, elapsed seconds, and details |
| `ApplicationStatusScreen` | Viewport/contained surface, loading/retrying/error tone, one atomic announcement, progress composition, primary-action placement | Current state, all copy, stages, retry callback, and whether the screen replaces application content |

These components are presentation-only. `ApplicationStatusScreen` does not accept a promise and
does not start, poll, retry, time out, cache, or cancel work. The consumer conditionally renders it
from application-owned state:

```tsx
return ready ? <Application /> : <ApplicationStatusScreen {...feedback} />;
```

The package therefore standardizes observable feedback without turning a consumer backend or
runtime lifecycle into SDK policy.

## Public state vocabulary

`ApplicationStatusScreen` accepts:

```ts
type ApplicationStatusScreenState = "loading" | "retrying" | "error";
```

`ProgressStageList` accepts:

```ts
type ProgressStageStatus = "pending" | "active" | "complete" | "error";
```

Consumers explicitly map domain status values into this vocabulary. The SDK does not infer that
`starting`, `warming`, `attaching`, `running`, or an HTTP status means `active`; such mappings are
part of the application's backend adapter. Consumers may override visible status labels without
changing semantic status.

The progress list has no percentage API in this decision. A discrete stage producer does not
provide enough information for a truthful determinate percentage. Applications must not derive a
percentage from stage count when stage duration or work is nonuniform.

## Details and elapsed time

Each stage may include stable detail items and nonnegative elapsed seconds. By default, details
render only for `active` and `error` stages. This keeps completed work compact while preserving the
information useful during a long wait or failure. Consumers can select `always` or `never` when
their product requires another disclosure policy.

The SDK formats elapsed seconds for display. The producer remains authoritative for the numeric
measurement and may omit it. Invalid or negative elapsed values are not displayed.

Details are React presentation input, not a serialized SDK payload. A consumer can map schema
names, deployment steps, files, or another bounded list without the SDK knowing those domains.

## Accessibility

The status screen exposes one visually hidden, atomic live region. Loading and retrying use a
polite `status`; error uses an assertive `alert`. The visible progress tree is not itself a live
region, avoiding repeated announcement of every stage and detail whenever one value changes.

The screen identifies its visible heading through `aria-labelledby` and reports `aria-busy` while
loading or retrying. Icons are decorative inside an already labelled status. A standalone
`ActivityIndicator` becomes a labelled `status` only when its `label` prop is supplied.

The consumer owns focus policy because only it knows whether the screen was present at initial
navigation, replaced already interactive content, or appeared inside a dialog. A retry action is
an ordinary accessible button delivered through a controlled callback.

Reduced-motion media preferences disable indicator rotation. Status remains distinguishable by
text and icon shape rather than animation or color alone.

## Responsive and theme behavior

The `viewport` variant fills the dynamic viewport with a `100vh` fallback and responsive SDK page
gutters. The `contained` variant provides a bounded minimum block size for a status surface inside
an application-owned region. Both variants use the active SDK theme's semantic colors,
typography, radii, shadows, and spacing metrics.

On narrow viewports, stage state metadata moves below stage copy instead of shrinking labels or
causing horizontal overflow. Detail chips wrap and allow long identifiers to break safely.

## Ownership boundary

The SDK owns:

- controlled status and progress React components;
- public TypeScript types and package exports;
- DOM hooks and browser-ready component styles;
- semantic icons, default labels, responsive composition, and reduced motion;
- accessible announcements and action placement;
- unit, packed-consumer, theme-audit, and real-browser coverage; and
- human and agent guidance for selecting and composing the primitives.

The consumer owns:

- readiness endpoints and authentication;
- backend response parsing and domain-to-public-state mapping;
- polling, long-polling, streams, retry, backoff, timeout, and stopping conditions;
- cancellation and shared-request lifetimes;
- reconnection and transport-interruption events;
- product copy and detail vocabulary;
- whether incomplete or disconnected state blocks the whole application; and
- whether mounted application content is discarded, hidden, or preserved.

The backend owns its runtime state and the truth of every reported stage. It does not need to
implement an SDK feedback schema.

## Relationship to existing views

`ResourceTransitionShell` remains public from `/views` for a resource activation that temporarily
replaces one resource surface with another. It reuses `ActivityIndicator` internally without
changing its existing props or purpose.

`ResourceListPage`, `ResourceDetailShell`, `ResourcePicker`, widget surfaces, and action dialogs
retain their current local loading contracts. Consumers should not replace those owned states with
an application status screen.

Use application feedback when a prerequisite blocks a complete application or another large
consumer-owned region and meaningful progress or recovery information exists.

## Serialized contracts and backend impact

This decision adds no serialized, persisted, iframe, or backend protocol. Public props contain
React nodes and callbacks and cannot be treated as wire data. Existing contract IDs, JSON Schemas,
fixtures, manifest entries, workspace documents, widget state, and iframe versions remain
unchanged.

If multiple independent backends later need to exchange one canonical progress payload, that is a
separate versioned-contract decision requiring TypeScript/runtime normalization, JSON Schema,
fixtures, manifest indexing, rollout, and backend conformance. This UI decision must not be used as
an undocumented wire format.

## Verification

The public surface is verified through:

- server-rendered component tests for state, labels, details, elapsed time, and roles;
- client tests for controlled recovery actions;
- TypeScript compilation from the public subpath;
- the closed SDK theme audit;
- packed-consumer import and tarball assertions;
- real Chromium checks at 375×812, 768×900, and 1280×800 in dark and light themes;
- contained and viewport variants, loading/retrying/error states, long copy and detail values; and
- computed reduced-motion behavior.

## Compatibility and rollout

The change is additive. Existing applications and existing `/views` imports continue to work.
Applications migrate by adapting their current runtime state into `ProgressStageDefinition[]` and
replacing only application-owned loading markup and CSS. Their polling, cancellation, retry, and
backend code remain unchanged.

The release must include the `/feedback` export, declarations, component CSS, nearest README,
human guide, copyable packed-consumer example, browser tests, changelog entry, and the
`build-application-loading-flow` packaged skill. The general application-building skill routes
application startup and reconnection feedback to that focused workflow.

## Rejected alternatives

### Extend `ResourceTransitionShell` with every application state

Rejected because a resource handoff and an application prerequisite have different ownership and
composition. Expanding the resource view would make `/views` the accidental home for non-resource
startup behavior and complicate a deliberately small component.

### Publish a runtime polling hook

Rejected because endpoint shapes, retryability, timeouts, authentication, shared work, and
reconnection policy are product-specific. One hook would either encode one backend or expose so
many callbacks that it no longer owns meaningful behavior.

### Publish the analytics runtime response as a contract

Rejected because `core`, `pricing`, model names, and attachment semantics describe one backend.
The reusable boundary is controlled feedback presentation, not those bytes.

### Continue with application-owned CSS

Rejected because responsive layout, semantic status styling, motion policy, and accessibility are
repeated presentation concerns already within the SDK's public UI responsibility.
