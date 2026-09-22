---
sidebar_position: 1
title: Command Center SDK
slug: /
---

# Build with the Command Center SDK

`@dev-mainsequence/command-center-sdk` supplies the reusable contracts, lifecycle, and interface
primitives needed by Command Center-compatible applications. It standardizes resource workflows,
navigation, responsive layout, application feedback, themes, backend contracts, and secure
static-site embedding.

Your application remains in control of authentication, API clients, routes, permissions, query
caching, persistence, notifications, and product-specific behavior.

## Start with the mental model

The SDK is organized in layers:

```text
definition → adapter → reusable lifecycle → controlled view → host-owned effect
```

- A **definition** gives stable meaning to a resource, destination, column, stage, or action.
- An **adapter** converts an external system into an SDK-owned model.
- A **lifecycle** coordinates loading, cancellation, selection, preflight, or handshake state.
- A **view** renders normalized state with consistent interaction and accessibility.
- A **host effect** commits a route, mutation, notification, credential decision, or persistence
  change under application policy.

Read [SDK architecture](./concepts/sdk-architecture.md) for the complete model and
[State and ownership](./concepts/state-and-ownership.md) before designing a cross-surface workflow.

## Choose a learning path

### Build your first screen

Use [Getting started](./getting-started.md) to install the package, define a resource, render a
working list, compose an application page, and verify it. The tutorial uses only declared package
exports and makes every application-owned dependency visible.

### Understand resource applications

Read [Resource applications](./concepts/resource-applications.md) for the definition/adapter/view
model, collection versus discovery, UI versus action identity, selection, activation, and the
bulk-action lifecycle. Then use [Resources](./resources.md) for complete list, detail, picker, and
action examples.

### Compose application chrome

- [Navigation](./navigation.md) covers hierarchy, contributions, native link behavior, controlled
  selection, and router ownership.
- [Application layout](./application-layout.md) covers page geometry, cards, responsive grids, and
  browser verification.
- [Application feedback](./application-feedback.md) covers staged startup, reconnect, retry, and
  terminal failure presentation.
- [Application controls](./application-controls.md) covers buttons, badges, labels, labelled
  fields, inputs, and textareas that inherit the SDK's theme, focus, and touch rules.

### Theme or embed an application

- [Themes](./themes.md) covers CSS ordering, presets, the closed token contract, density, surface
  hierarchy, data visualization, persistence, and visual verification.
- [Static-site embeds](./static-site-embeds.md) covers exact-origin messaging, sandbox policy,
  context synchronization, local Vite/FastAPI development, delegated FastAPI HTTP and WebSocket
  access, cancellation, and security testing.
- [Backend contracts](./backend-contracts.md) explains the manifest, schemas, fixtures, roles, and
  compatibility rules for non-TypeScript implementations.

### Operate or extend

- [Application operations](./application-operations.md) separates SDK updates, skill refresh,
  deployment synchronization, mutation boundaries, and recovery.
- [Application documentation](./application-documentation.md) builds a task-focused end-user guide
  whose folder hierarchy mirrors the application menu and ships at `/docs/` in the same artifact.
- [Extending and releasing](./extending-and-releasing.md) covers SDK-source changes, public
  boundaries, contracts, packaging, and release verification.
- [Architecture decisions](./adr/README.md) records why compatibility-sensitive designs were
  chosen. A `Proposed` ADR is not a released API.

## The ownership boundary

| SDK owns | Consuming application owns |
| --- | --- |
| Normalized resource and discovery models | Raw endpoints, authentication, and response adaptation |
| List/detail/picker interaction lifecycle | Routes, query cache, mutation policy, and notifications |
| Controlled navigation chrome and semantic intents | Permission filtering and route commitment |
| Page gutters, section rhythm, cards, and geometry checks | Domain section ordering and specialized layouts |
| Status/progress presentation and accessibility | Readiness APIs, polling, retry, and timeout policy |
| Button, badge, and labelled-field presentation and accessible wiring | Form values, validation rules, submission, and mutation policy |
| Theme presets, variables, and helper functions | Persisting and restoring the selected theme ID |
| Iframe protocol validation and request correlation | Origin allowlists, CSP, backend authorization, and audit |
| Versioned schema/fixture bundle | Backend implementation and coordinated rollout |

If code needs a product route, access token, private endpoint, permission store, or persistence
decision, it belongs in the consuming application or backend—not in a reusable SDK definition or
view.

## Public entrypoint families

| Concept | Entry points |
| --- | --- |
| Resource model | `/resource`, `/resource/react`, `/views` |
| Application chrome | `/navigation`, `/navigation/testing`, `/layout`, `/layout/testing`, `/feedback`, `/controls` |
| Visual language | `/theme`, `/theme/presets`, `/theme/data-viz`, theme CSS exports |
| Static-site integration | `/embed`, `/embed/react` |
| Language-neutral contracts | `/contracts`, `/contracts/manifest.json`, schemas and fixtures |

The package root is a compatibility re-export of the resource surface. Prefer explicit subpaths in
new code. See the [public API map](./public-api.md) for symbols, runtime assumptions, CSS exports,
and compatibility rules.

## Install

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Load browser styles once:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

The SDK ships ESM and TypeScript declarations and does not require Vite. Use only declared package
exports; `dist`, `src`, and another application's internal modules are not consumer contracts.

## Task and agent-skill map

The npm package installs version-matched task guidance under `.agents/skills/command-center/`.
Human guides explain the concepts and tradeoffs; skills give an agent an execution checklist for a
specific consuming-application task.

| Task | Guide | Installed skill path |
| --- | --- | --- |
| Install and use the SDK | [Getting started](./getting-started.md) | `general/use-command-center-sdk` |
| Compose an application | [SDK architecture](./concepts/sdk-architecture.md) | `general/build-command-center-application` |
| Compose the embedded shell and navigation | [Navigation](./navigation.md) | `navigation/compose-command-center-application-shell` |
| Inspect, version, and deploy an application | [Application operations](./application-operations.md) | `general/maintain-command-center-code-repository` |
| Build and ship an application user guide | [Application documentation](./application-documentation.md) | `documentation/document-command-center-application` |
| Compose a responsive page | [Application layout](./application-layout.md) | `layout/compose-command-center-page` |
| Present startup or reconnect progress | [Application feedback](./application-feedback.md) | `feedback/build-application-loading-flow` |
| Compose actions and labelled fields | [Application controls](./application-controls.md) | `controls/compose-command-center-controls` |
| Adapt an external backend | [Resources](./resources.md#adapt-a-backend) | `resource/adapt-resource-backend` |
| Build a resource list | [Resources](./resources.md#build-a-resource-list) | `views/build-resource-list` |
| Build a resource detail | [Resources](./resources.md#build-a-resource-detail) | `views/build-resource-detail` |
| Build a resource picker | [Resources](./resources.md#build-a-resource-picker) | `views/build-resource-picker` |
| Add resource actions | [Resources](./resources.md#add-actions) | `views/add-resource-actions` |
| Implement the contract catalog | [Backend contracts](./backend-contracts.md) | `contracts/implement-command-center-contract` |
| Implement resource collections | [Backend contracts](./backend-contracts.md) | `contracts/implement-resource-collection-contract` |
| Implement bulk actions | [Backend contracts](./backend-contracts.md) | `contracts/implement-bulk-actions-contract` |
| Theme an application | [Themes](./themes.md) | `theme/theme-command-center-app` |
| Integrate a static site locally or as a hosted iframe | [Static-site embeds](./static-site-embeds.md) | `embed/integrate-static-site-iframe` |

Refresh packaged guidance after an upgrade or when lifecycle scripts were disabled:

```bash
npx command-center-sdk skills install --path .
```

Use `skills sync` only when the backend-owned MCP catalog must also be refreshed and validated.
See [Application operations](./application-operations.md) for authentication and ownership rules.

## Current release versus design work

These guides describe exports in the current package unless a section explicitly says otherwise.
ADRs explain decisions and may be marked `Proposed`. Do not treat a proposed identifier, message,
or code sample as a released capability. For the version actually installed in an application,
inspect its `package.json` exports, declarations, README, contract manifest, and changelog.
