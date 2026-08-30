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
