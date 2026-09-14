# SDK ADR 009: Opinionated Embedded Application Shell

- Status: Accepted
- Date: 2026-09-14
- Implementation: `@dev-mainsequence/command-center-sdk` 0.4.0
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 002: Controlled Application Navigation](./adr-sdk-002-controlled-application-navigation.md)
  - [SDK ADR 004: Public Application Feedback System](./adr-sdk-004-public-application-feedback-system.md)
  - [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md)
  - [Application navigation](../navigation.md), [Application feedback](../application-feedback.md)

## Decision summary

Complete production Command Center applications use one embedded-child skeleton: no child top
navigation, an explicit zero/one/two-level left-navigation decision, an SDK-owned responsive
drawer trigger, and a viewport readiness gate that keeps navigation and routes unmounted until
host context, delegated transport, and critical application APIs are ready.

The SDK adds `ApplicationNavigationPanelShell` for depth one, an opt-in floating trigger on the
existing depth-two `ApplicationNavigationShell`, semantic depth markers, and a framework-neutral
Playwright-compatible conformance verifier. A packaged focused skill and golden TSX asset make the
same decision the default for agents.

## Context

The previous SDK exposed flexible rail, panel, trigger, feedback, and layout pieces but did not
select one application-root composition. Consumers produced materially different applications:
some repeated the host top bar, some used a two-level rail for one work area, some invented mobile
sidebar controls, and some marked startup complete after iframe context while critical APIs were
still loading. Documentation also told a child to place its mobile trigger in a “host top bar,”
which encouraged duplicate chrome.

The missing piece was not another low-level primitive. It was a stable decision rule, a one-level
composition, a golden root template, and an executable assertion.

## Decision

### Production ownership

- Production applications are embedded in the main Command Center.
- The host owns global/top navigation, application switching, account/settings/session controls,
  and global branding.
- The child owns routes and page headers inside its application. It never renders a top navigation
  bar. Standalone mode is explicitly local development or test only.

### Navigation depth

- Depth 0: one durable destination; no sidebar shell.
- Depth 1: one cohesive work area with multiple destinations;
  `ApplicationNavigationPanelShell`.
- Depth 2: multiple independent work areas, each with multiple destinations;
  `ApplicationNavigationShell` rail + contextual panel.
- Tabs subdivide a page. No third sidebar level, one-item rail, one-route sidebar, filler group, or
  disabled planned primary destination is created.

Both shells publish `data-cc-navigation-depth`. The depth-one shell defaults to `auto` presentation
and owns a floating trigger in overlay mode. The depth-two shell preserves its prior defaults for
compatibility and adds `overlayTrigger="floating"` for complete embedded children. This amends ADR
006's recommendation that every consumer place an external trigger; real hosts can still use the
backward-compatible `external` option.

### Readiness

The application owns an ordered root state machine for host context/theme, delegated
transport/authentication, and a critical readiness endpoint. Until all succeed, one
`ApplicationStatusScreen variant="viewport"` is rendered and navigation plus `ApplicationPage`
routes are absent. Reconnection invalidates readiness. Transient retries are bounded, terminal
failures expose manual retry, and obsolete attempts are cancelled.

This is a presentation and application-composition rule. It does not add a readiness backend
schema or move authentication, API clients, retry policy, or endpoints into the SDK.

### Verification and guidance

`/navigation/testing` exports verification and assertion functions that check startup/ready phase,
navigation depth, root count, viewport status count, early route content, and child topbar chrome.
The package ships `navigation/compose-command-center-application-shell` with a golden app-root
asset. The general application skill routes shell work to it.

## Compatibility and storage impact

The npm API is additive. Existing `ApplicationNavigationShell` output remains docked with an
external trigger unless new props are selected. Direct `ApplicationNavigationPanel` usage keeps
visible section labels by default. New data attributes and the new testing report vocabulary are
public compatibility identifiers.

There is no backend contract, JSON Schema, fixture, iframe protocol, theme ID, or remote storage
change. The agent-skill provenance sentinel advances to schema 3 solely to record authoritative
namespace ownership and prune obsolete local installed skills; installer migration and rollback
tests cover prior sentinels.

## Consequences

- New applications converge on one predictable root lifecycle and information architecture.
- Existing applications can migrate without changing route IDs or backend contracts.
- Consumers must make readiness truthful; a successful handshake cannot stand in for API
  readiness.
- The SDK accepts compatibility responsibility for the panel shell, floating-trigger behavior,
  depth markers, and conformance report vocabulary.
