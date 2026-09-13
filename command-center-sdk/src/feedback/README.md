# Application feedback

This module provides controlled React presentation for application-level loading, retrying, and
failure feedback. Import it from `@dev-mainsequence/command-center-sdk/feedback` and load the
package theme plus component styles once in the application.

## Public entrypoint

- `/feedback`: `ActivityIndicator`, `ProgressStageList`, `ApplicationStatusScreen`, and their
  public prop and model types.

The SDK owns semantic status presentation, responsive stage layout, elapsed-duration formatting,
detail-chip layout, reduced-motion behavior, and accessible status/error announcements. Consumers
own readiness endpoints, response parsing, stage mapping, retry/backoff/timeout policy,
cancellation, reconnection, copy, and the decision to block or preserve application content.

`ApplicationStatusScreen` is controlled and has no transport, timer, router, or persistence
dependency. Use its `viewport` variant before mounting a complete application and `contained`
inside an already owned surface. `ProgressStageList` can also be composed independently for a
truth-based long-running operation. Do not invent a percentage when the producer reports only
discrete stages.

`ResourceTransitionShell` remains the higher-level `/views` component for resource-to-resource
handoffs. It reuses the shared activity indicator but intentionally does not expose application
startup policy or staged progress.

See `docs/application-feedback.md` for the complete workflow and copyable example.

## Model truthful progress

Map producer state into a controlled presentation model. Do not calculate a percentage when the
producer reports only ordered phases:

```tsx
import {
  ApplicationStatusScreen,
  type ProgressStageDefinition,
} from "@dev-mainsequence/command-center-sdk/feedback";

const stages: ProgressStageDefinition[] = [
  { id: "authorize", label: "Authorize", status: "complete", elapsedSeconds: 0.4 },
  {
    id: "runtime",
    label: "Start runtime",
    status: "active",
    description: "Waiting for a healthy instance.",
  },
  { id: "data", label: "Load data", status: "pending" },
];

<ApplicationStatusScreen
  state="loading"
  title="Opening the application"
  message="This can take a moment after an idle period."
  stages={stages}
/>;
```

`ProgressStageList` supports `pending`, `active`, `complete`, and `error`. Stage details default to
active and failed stages, keeping a long completed history compact. Invalid or negative elapsed
values are omitted rather than presented as misleading time.

## Choose the presentation scope

Use `variant="viewport"` when the complete application cannot mount. Use `contained` inside a
surface whose surrounding navigation and context remain usable. `state="loading"` and
`state="retrying"` set a busy state; `state="error"` uses assertive error announcement semantics
and may expose a host-supplied retry or recovery action.

The host decides whether a reconnect blocks content, which request to retry, and when a timeout is
terminal. The component does not start timers, poll, fetch, navigate, or persist. Keep those effects
in application lifecycle code and pass the current truth as props.

`ActivityIndicator` is for local indeterminate activity. Supply `label` when the indicator itself
is the status; omit it when nearby text already provides the accessible name.

## Failure and accessibility behavior

- Keep stable stage IDs across updates so ordered progress retains meaning.
- Use `liveMessage` when visible copy is too verbose or changes too frequently for an accessible
  announcement.
- Keep retry actions disabled while the host is already retrying.
- Preserve reduced-motion behavior; do not reintroduce unconditional animation in wrappers.
- Do not show completed stages for work the producer has not confirmed.
- Place backend diagnostics in trusted logs and show sanitized, actionable copy in the component.

## Maintenance constraints

- Presentation changes remain transport-neutral and controlled.
- New states require semantic, visual, reduced-motion, and assistive-technology review.
- Coordinate component styles, public types, examples, and tests when props or status meanings
  change.
- Test loading, retrying, terminal error, zero/many stages, long copy, 375×812, desktop, dark and
  one light theme, keyboard operation, and live-region behavior.
