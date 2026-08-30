---
sidebar_position: 5
title: Application feedback
---

# Show truthful application loading progress

Use the public feedback primitives when a prerequisite blocks a complete application or another
large application-owned region and the producer can report meaningful progress or recovery
information. Typical examples include backend cold start, runtime attachment, transport
reconnection, schema preparation, and a long initialization pipeline.

Import the controlled React components from the public entrypoint:

```tsx
import {
  ApplicationStatusScreen,
  type ApplicationStatusScreenState,
  type ProgressStageDefinition,
} from "@dev-mainsequence/command-center-sdk/feedback";
```

Load the package theme and component styles once near the application root:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

## Map application state into the public model

Keep the readiness client, polling, cancellation, and retry policy in the application. Map only
the current presentation state:

```tsx
type RuntimeStage = {
  key: string;
  label: string;
  status: "not_started" | "starting" | "ready" | "error";
  detail: string;
  elapsed_seconds?: number | null;
  models: string[];
};

function progressStatus(status: RuntimeStage["status"]): ProgressStageDefinition["status"] {
  if (status === "starting") return "active";
  if (status === "ready") return "complete";
  if (status === "error") return "error";
  return "pending";
}

function toProgressStage(stage: RuntimeStage): ProgressStageDefinition {
  return {
    id: stage.key,
    label: stage.label,
    description: stage.detail,
    status: progressStatus(stage.status),
    statusLabel: stage.status === "starting" ? "Attaching" : undefined,
    elapsedSeconds: stage.elapsed_seconds,
    details: stage.models.map((model) => ({ id: model, label: model })),
  };
}
```

The application decides whether the status surface replaces its content:

```tsx
export function ApplicationBootstrap({
  failure,
  ready,
  retry,
  retryMessage,
  runtimeMessage,
  runtimeStages,
}: {
  failure: string | null;
  ready: boolean;
  retry: () => void;
  retryMessage: string | null;
  runtimeMessage: string;
  runtimeStages: RuntimeStage[];
}) {
  if (ready) return <ApplicationRouter />;

  const state: ApplicationStatusScreenState = failure
    ? "error"
    : retryMessage
      ? "retrying"
      : "loading";

  return (
    <ApplicationStatusScreen
      action={failure ? { label: "Retry startup", onSelect: retry } : undefined}
      emptyStagesMessage="Discovering runtime stages."
      eyebrow={failure ? "Runtime unavailable" : "Runtime startup"}
      message={failure ?? runtimeMessage}
      notice={retryMessage}
      stages={runtimeStages.map(toProgressStage)}
      state={state}
      title={failure ? "Application could not start" : "Preparing application"}
    />
  );
}
```

Do not pass the readiness promise, endpoint, token, API client, or `AbortController` into the
feedback component. The SDK does not decide which errors are retryable, how long startup may take,
or whether reconnection should unmount existing routes.

## Use real stages rather than a synthetic percentage

The stage list accepts `pending`, `active`, `complete`, and `error`. Map the producer's actual state
explicitly. Do not calculate a percentage from completed stage count unless the producer defines a
real measurable total; stages can represent radically different amounts of work.

Each stage can provide:

- a stable `id`;
- visible label and description;
- an optional domain-specific `statusLabel`;
- nonnegative `elapsedSeconds`; and
- stable detail items such as schema names, deployment steps, or files.

Details appear for active and failed stages by default. Use `detailVisibility="always"` only when
completed details remain important, or `never` when detail identifiers should not be exposed.

Use `ProgressStageList` independently when an operation needs the timeline but already has an
application-owned card, dialog, or page surface. Use `ActivityIndicator` independently for a small
indeterminate action. Supply its `label` only when it is the standalone accessible status; icons
inside an already labelled control should remain decorative.

## Choose viewport or contained presentation

`ApplicationStatusScreen` defaults to `variant="viewport"` and `as="main"`. It fills the dynamic
viewport and is appropriate before the application router mounts.

Use `variant="contained"`, an appropriate `as` element, and `titleAs="h2"` or `h3` inside an
existing page landmark:

```tsx
<ApplicationStatusScreen
  as="section"
  message="Rebuilding the scenario cache."
  stages={stages}
  title="Preparing scenario analysis"
  titleAs="h2"
  variant="contained"
/>
```

Use `ResourceTransitionShell` from `/views` instead when one resource activation is temporarily
resolving navigation to another resource. Keep list, detail, picker, widget, and action-dialog
loading inside the higher-level SDK component that already owns that lifecycle.

## Preserve accessible and accurate copy

The status screen announces one atomic summary instead of making the changing stage tree a live
region. Loading and retrying are polite statuses; terminal failure is an alert. Use `liveMessage`
when the best announcement differs from the visible title, message, and notice.

Derive durations in retry or timeout copy from the application policy. Do not hardcode “30
seconds” while accepting another retry interval, and do not hardcode “10 minutes” while tests
override the timeout. The SDK formats only producer-reported stage elapsed time.

The consumer owns focus restoration because it knows whether the feedback appeared on initial
load, interrupted interactive content, or lives inside another focus-managed surface.

## Verify in a real browser

Exercise viewport and contained feedback in at least one dark and one light SDK theme. Cover
375×812, 768×900, and 1280×800; loading, retrying, and error; no stages; long stage labels and
details; and reduced motion.

```ts
import { expect, test } from "@playwright/test";

test("startup feedback remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/startup-fixture");

  const screen = page.locator("[data-cc-application-status-screen]");
  await expect(screen).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Preparing application");
  await expect(page.getByRole("list", { name: "Application progress" })).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
```

Run the closed theme audit separately. Correct tokens cannot prove responsive geometry, and a good
layout cannot prove semantic theme usage:

```bash
npx command-center-sdk theme audit --path src
```

## Backend and storage boundary

The feedback types are React presentation input, not a backend contract. There is no feedback
contract ID, JSON Schema, fixture bundle, persisted state, or migration. Adapt each backend's
runtime response in application code. If independent backends later need one canonical progress
payload, evolve it as a separate versioned SDK contract rather than serializing these React props.
