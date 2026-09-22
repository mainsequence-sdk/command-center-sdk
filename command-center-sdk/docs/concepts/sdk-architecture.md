---
title: SDK architecture
description: Understand the layers, data flow, and ownership boundaries of a Command Center application.
---

# SDK architecture

The Command Center SDK is a set of composable contracts and UI primitives, not an application
framework that takes over the host. It standardizes the parts that should behave consistently
across applications while leaving product policy and infrastructure in the consuming application.

The most useful mental model is a one-way pipeline:

```text
backend bytes
    ↓ application-owned client
normalized adapter result
    ↓ SDK definition and lifecycle
controlled React view
    ↓ semantic intent or callback
application-owned router, mutation, or notification
```

Each boundary has a different job. Keeping those jobs separate makes an application easier to
test and prevents routing, credentials, or backend-specific payloads from leaking into reusable
SDK code.

## The five layers

### 1. Definitions describe stable meaning

Definitions name resources, columns, navigation destinations, actions, and detail tabs. They are
plain typed data plus narrow callbacks. IDs in definitions are compatibility identifiers: they are
used to reconcile controlled state and should remain stable after release.

Examples include `ResourceApplicationDefinition`, `NavigationApplicationDefinition`, and
`ProgressStageDefinition`.

Definitions do not fetch data or decide routes. A resource definition may say that a row resolves
to `{ resource: "services", uid: "…" }`; the host decides which URL that intent opens.

### 2. Adapters normalize external systems

Adapters isolate backend shape and transport policy. They accept SDK requests and return SDK
models. The application supplies authentication, base URLs, headers, retries, error translation,
and any product-specific endpoint behavior.

For a conventional HTTP service, `createHttpResourceAdapter` removes repetitive endpoint and
normalization plumbing. For GraphQL, RPC, local-first storage, or an existing client library,
implement `ResourceAdapter` directly.

The normalized result is the important boundary. A server may return `{ count, results }`, but a
resource list consumes `{ items, pageInfo }` with authoritative pagination.

### 3. Lifecycle code owns reusable interaction state

High-level SDK views own state that must behave the same in every application: debounced search,
stale-request cancellation, loading and empty states, selection, bulk-action preflight,
confirmation, refresh, and accessible feedback.

The host still owns durable or navigable state such as route parameters, query cache policy,
selected detail tabs encoded in the URL, authentication sessions, and notification systems.

This division explains why the SDK favors controlled props and semantic callbacks. The SDK can
coordinate an interaction without becoming the owner of application policy.

### 4. Views render normalized models

Use the highest-level view that owns the workflow you need:

| Workflow | Preferred surface |
| --- | --- |
| Searchable, pageable collection | `ResourceListPage` |
| One entity with summary and tabs | `ResourceDetailShell` |
| Single, multiple, or action selection | `ResourcePicker` |
| Complete responsive page composition | `/layout` primitives |
| Actions, badges, and labelled fields | `/controls` primitives |
| Application startup or reconnect status | `ApplicationStatusScreen` |
| Application hierarchy and destinations | `/navigation` components |

Drop to smaller exported components only when the high-level composition does not own your
workflow. Rebuilding a list from `DataTable`, `ResourceSearch`, and `ResourcePagination` also means
you take responsibility for coordinating their state correctly.

### 5. The host owns policy and effects

The consuming application supplies the decisions that cannot be safely generalized:

- who the current user is and which resources they may access;
- which API client and credentials to use;
- how URLs map to screens and how navigation is committed;
- which errors produce notifications, retries, or support guidance;
- what is persisted and how it is migrated; and
- which deployment, CSP, CORS, and iframe policies apply.

The SDK may validate or present the result of those decisions, but it does not replace them.

## Compose the embedded root before its routes

A production application is embedded in the main Command Center. The host owns top/global chrome;
the child never adds a top navigation bar. From its first frame the child gates host context,
delegated transport, and critical API readiness. Only then does it mount exactly one selected
navigation depth and route content:

```tsx
import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationNavigationPanelShell } from "@dev-mainsequence/command-center-sdk/navigation";
import { ApplicationPage, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";

export function ApplicationRoot() {
  if (!readiness.ready) {
    return (
      <ApplicationStatusScreen
        action={readiness.failure ? { label: "Retry startup", onSelect: retry } : undefined}
        message={readiness.message}
        stages={readiness.stages}
        state={readiness.failure ? "error" : "loading"}
        title={readiness.failure ? "Application could not start" : "Preparing application"}
        variant="viewport"
      />
    );
  }

  return (
    <ApplicationNavigationPanelShell
      application={operationsNavigation}
      activeDestinationId="services"
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      onNavigate={openNavigationIntent}
      presentation="auto"
    >
      <ApplicationPage>
        <ApplicationPageStack>
          <ResourceListPage
            definition={serviceResource}
            searchable
            refreshable
            navigation={{ open: openResourceIntent }}
          />
        </ApplicationPageStack>
      </ApplicationPage>
    </ApplicationNavigationPanelShell>
  );
}
```

This example selected navigation depth one: one cohesive operations area with several durable
destinations. Use no shell for one destination. Use the rail + panel
`ApplicationNavigationShell` only when multiple independent work areas each contain several
destinations; set `presentation="auto"` and `overlayTrigger="floating"`. Page subdivisions use
tabs, never a third sidebar level.

In this composition:

- the shell and routes do not exist until real application readiness succeeds;
- navigation definitions describe the hierarchy;
- the host converts navigation intents to routes;
- layout primitives own page geometry;
- the resource definition and adapter normalize domain data;
- `ResourceListPage` owns the collection interaction lifecycle; and
- the host converts a resource-open intent to a route.

No SDK object needs access to a global router, credential store, or product registry.

## Choose the right extension seam

Before adding a wrapper or forking a component, identify what varies:

| What varies | Extension seam |
| --- | --- |
| Backend envelope or endpoint | Adapter and normalizer |
| Column value or rich cell | `ResourceColumnDefinition` |
| Route opened by an interaction | Navigation adapter or callback |
| Allowed navigation entries | Filter definitions before rendering |
| Product action | Public action definition or contribution prop |
| Detail content | Controlled tab body or child content |
| Visual tokens | Published theme variables and helpers |
| Reusable SDK behavior missing everywhere | SDK source change and public contract review |

Avoid broad render overrides when a narrow definition, adapter, callback, or child slot represents
the actual variation. Broad overrides make lifecycle and accessibility behavior impossible for the
SDK to guarantee.

## Framework and runtime boundaries

The `/resource` and `/contracts` JavaScript entrypoints are framework-neutral. React components and
hooks live in `/views`, `/navigation`, `/layout`, `/feedback`, `/controls`, `/resource/react`, and `/embed/react`.
Browser-only work should remain behind browser entrypoints or be executed only after a DOM exists.

The package root currently re-exports the framework-neutral resource surface for compatibility.
Prefer the explicit subpath for new code so dependencies and intent stay clear:

```ts
import { defineResourceApplication } from "@dev-mainsequence/command-center-sdk/resource";
```

CSS is opt-in and must be imported once by the browser application. JavaScript imports do not
silently install global styles.

## What to read next

- [Resource applications](./resource-applications.md) explains definition, adapter, discovery,
  identity, selection, and action concepts.
- [State and ownership](./state-and-ownership.md) explains controlled state, cancellation, errors,
  and session transitions.
- [Public API map](../public-api.md) lists every supported package entrypoint.
- [Getting started](../getting-started.md) builds the first working screen.
