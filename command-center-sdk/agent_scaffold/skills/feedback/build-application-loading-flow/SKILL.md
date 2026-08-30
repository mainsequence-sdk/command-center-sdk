---
name: build-application-loading-flow
description: Build or migrate truthful application-level loading, startup, retry, reconnection, and terminal failure feedback with the controlled @dev-mainsequence/command-center-sdk/feedback primitives. Use when a prerequisite blocks a complete application or large consumer-owned region and meaningful stages or recovery information exist. Do not use for loading already owned by resource views, pickers, widgets, or action dialogs.
---

# Build An Application Loading Flow

## Select The Correct Boundary

Use `ApplicationStatusScreen` when an application prerequisite blocks the router or another large
consumer-owned region. Use `ProgressStageList` inside an existing owned surface when only the
ordered timeline is needed, and `ActivityIndicator` for a small indeterminate operation.

Keep loading inside `ResourceListPage`, `ResourceDetailShell`, `ResourcePicker`, widget surfaces,
and action dialogs when those components already own it. Use `ResourceTransitionShell` for an
asynchronous resource-to-resource handoff. Do not replace a higher-level SDK lifecycle with a
global status screen merely because both display activity.

Import only the published entrypoint:

```tsx
import {
  ApplicationStatusScreen,
  type ApplicationStatusScreenState,
  type ProgressStageDefinition,
} from "@dev-mainsequence/command-center-sdk/feedback";
```

## Keep The Lifecycle Application-Owned

Readiness endpoints, authentication, parsing, polling, retryability, backoff, timeout, shared
requests, cancellation, reconnection events, and the decision to unmount or preserve application
content remain in the consumer. Do not move an application API client, endpoint, router, store, or
runtime-specific status into the SDK model.

Map the current application state into `loading`, `retrying`, or `error`. Map every producer stage
explicitly into `pending`, `active`, `complete`, or `error`. Preserve stable IDs and producer truth;
do not infer state from labels and do not calculate a percentage from stage count.

```tsx
const feedbackState: ApplicationStatusScreenState = failure
  ? "error"
  : retryMessage
    ? "retrying"
    : "loading";

const stages: ProgressStageDefinition[] = runtime.stages.map((stage) => ({
  id: stage.key,
  label: stage.label,
  description: stage.detail,
  status: mapRuntimeStatus(stage.status),
  elapsedSeconds: stage.elapsedSeconds,
  details: stage.models.map((model) => ({ id: model, label: model })),
}));
```

Conditionally render the application or controlled feedback. Pass retry only as an action callback;
the component must not own the retry loop:

```tsx
return ready ? <ApplicationRouter /> : (
  <ApplicationStatusScreen
    action={failure ? { label: "Retry startup", onSelect: retry } : undefined}
    eyebrow={failure ? "Runtime unavailable" : "Runtime startup"}
    message={failure ?? runtime.message}
    notice={retryMessage}
    stages={stages}
    state={feedbackState}
    title={failure ? "Application could not start" : "Preparing application"}
  />
);
```

## Make Feedback Accurate And Bounded

Show only details safe and useful to the current user. The default active-and-error disclosure is
appropriate for verbose model, file, or step identifiers. Do not expose credentials, headers,
tokens, internal traces, or unbounded logs as stage details.

Derive retry and timeout copy from the configured policy. Do not hardcode a duration that can drift
from an injected interval. Give automatic retries and manual retry actions an application-owned
stopping condition. Cancellation must stop obsolete work even though the feedback component itself
does not receive an `AbortSignal`.

Use `variant="viewport"` before the application root is available. Use `contained` with the correct
landmark and `titleAs` inside an existing page. Let the component own its spacing, status icons,
detail chips, action placement, live region, and reduced-motion behavior; do not recreate those
styles in application CSS.

## Verify The Finished Flow

Test the state adapter separately from presentation. Prove pending, active, complete, and error
mapping; cancellation; retry and timeout stopping conditions; and reconnection behavior owned by
the application.

In a real browser, cover viewport and contained surfaces, loading/retrying/error, empty stages,
long labels and details, the retry action, and the application becoming available only when its
actual readiness condition succeeds. Exercise 375×812, 768×900, and 1280×800 in at least one dark
and one light SDK preset. Emulate reduced motion and verify the indicator no longer rotates.

Run the closed theme audit separately:

```bash
npx command-center-sdk theme audit --path src
```

The React progress model is not a serialized SDK contract. Do not add backend fields, schemas, or
fixtures unless a separate contract-evolution task establishes a language-neutral wire format.
