# Command Center Widget APIs

Public widget authoring and runtime contracts exported from
`@dev-mainsequence/command-center-sdk/widget`. Authors define a JSON-safe manifest and an
executable runtime, then export an explicitly composed extension. Hosts decide which extensions
are trusted and installed.

React and React DOM are peer dependencies. A host and every installed widget package must share
the same compatible React runtime.

## Entry Points

- `@dev-mainsequence/command-center-sdk/widget`: definitions, module adapters, runtime types, and
  `defineWidget`, `defineWidgetModule`, and `defineExtension`.
- `@dev-mainsequence/command-center-sdk/widget/ui`: small stable, theme-token-based controls.
- `@dev-mainsequence/command-center-sdk/widget/testing`: manifest and preview-fixture assertions.
- `withWidgetRuntimeOverrides(...)`: trusted-host composition for richer runtime integrations while
  retaining the package manifest as the only persisted/backend-visible identity.
- `WidgetRuntimeProvider`, `useWidgetRuntime`, `useWidgetCapability`,
  `useRequiredWidgetCapability`, and `useWidgetTheme`: injected host services without application
  globals.

## Authoring Rules

- Manifests are JSON-safe and use `command-center-widget@v1`.
- React components, resolvers, execution hooks, settings renderers, migrations, snapshots, and
  preview fixtures belong in `runtime`.
- Every widget needs representative `mockProps` or `exampleProps` and structured usage guidance.
- React and React DOM are peers so widget packages share the host runtime.
- Import only this SDK, contracts, themes, and deliberately declared integration dependencies.

## Minimal Module

```tsx
import {
  defineExtension,
  defineWidgetModule,
  type WidgetComponentProps,
} from "@dev-mainsequence/command-center-sdk/widget";

interface GreetingProps extends Record<string, unknown> {
  message?: string;
}

function Greeting({ props }: WidgetComponentProps<GreetingProps>) {
  return <p>{props.message ?? "Hello"}</p>;
}

export const greetingWidget = defineWidgetModule<GreetingProps>({
  manifest: {
    id: "acme__greeting",
    widgetVersion: "1.0.0",
    title: "Greeting",
    description: "Displays a short message.",
    category: "Examples",
    kind: "custom",
    source: "acme",
    registryContract: {
      usageGuidance: {
        buildPurpose: "Show a short static greeting in a workspace.",
        whenToUse: ["A dashboard needs a lightweight text callout."],
        whenNotToUse: ["The content needs rich Markdown or live data."],
        authoringSteps: ["Set the message text."],
      },
    },
  },
  runtime: {
    definition: {
      component: Greeting,
      mockProps: { message: "Preview" },
    },
  },
});

export const acmeExtension = defineExtension({
  id: "acme",
  title: "Acme widgets",
  packageName: "@acme/command-center-widgets",
  packageVersion: "1.0.0",
  widgets: [greetingWidget],
});
```

Production widgets should resolve catalog description and structured guidance from a local
`USAGE_GUIDANCE.md`; see the basic-widget example for the complete pattern.

## Compatibility

`defineWidget(...)` remains the legacy mixed-definition adapter through the 0.x release line. New
packages should use `defineWidgetModule(...)`.

## Backend and Storage Impact

The module adapter projects the same legacy definition fields; it does not publish runtime
functions. Optional props and user-state versions are migration metadata and require coordinated
backend preservation before they become required.

## Validation

- `npm run check`: TypeScript public surface.
- `npm run test`: module, runtime-provider, and guidance behavior.
- `/testing`: manifest and preview-fixture assertions for downstream packages.

## Architecture Documentation

- [Legacy-package migration](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/migrating-from-legacy-packages.md)
- [Basic widget example](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/examples/basic-widget/README.md)
- [Compatibility policy](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/compatibility.md)
