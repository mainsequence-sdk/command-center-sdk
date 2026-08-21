# Command Center Workspace React

Read-only React renderer for workspace documents. It renders through caller-supplied registry,
permission, runtime-state, error, and telemetry adapters and does not mount Command Center auth,
routing, persistence, Zustand stores, or Studio authoring UI.

Import it from `@dev-mainsequence/command-center-sdk/workspace/react`.

React and React DOM are peer dependencies.

## Entry Points

- `WorkspaceRenderer`: responsive grid renderer for ordinary widget instances.
- `WorkspaceRuntimeAdapters`: injected host boundary.
- `UnavailableWidget`: deterministic missing-runtime and permission state.

## Important Constraints

- Structural rows/slides and advanced Command Center execution coordination remain host-owned; a
  host can supply a custom `renderWidget` adapter for those types.
- The renderer never mutates the input workspace.
- Unknown widget instances render an unavailable placeholder and remain serializable by the model.
- Navigation and telemetry are callbacks, not imports from a router or application singleton.
- Domain services, theme tokens, locale, and runtime data are injected through the SDK runtime
  provider; declaring or requesting a capability never grants it automatically.

## Minimal Usage

```tsx
import { WorkspaceRenderer } from "@dev-mainsequence/command-center-sdk/workspace/react";

<WorkspaceRenderer
  workspace={workspace}
  adapters={{
    resolveWidget: (widgetId) => widgetRegistry.getWidget(widgetId),
    hasPermission: (permission) => grantedPermissions.has(permission),
    onTelemetry: (event) => console.log(event),
  }}
/>;
```

Consult the exported TypeScript types for the complete adapter surface. Hosts that need structural
rows/slides or richer execution can provide a custom `renderWidget` adapter.

## Validation

Package tests cover normal rendering, unavailable widgets, permission states, and adapter behavior.
Changes must preserve input immutability and avoid application imports.

## Backend and Storage Impact

None. This package consumes workspace documents and reports runtime state through callbacks; it
does not persist or publish them.

## Architecture Documentation

- [Legacy-package migration](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/docs/packages/migrating-from-legacy-packages.md)
- [Workspace model](../README.md)
