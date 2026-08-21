# AppComponent built-in

This directory owns the portable `core__app-component` package manifest, Mock JSON target, manual no-auth HTTP runtime, settings UI, dynamic IO projection, and usage guidance.

Main entry points:

- `definition.tsx`: SDK widget module and stable manifest identity.
- `model.ts`: JSON-safe props, Mock JSON, compiled binding, runtime-state, and IO contracts.
- `execution.ts`: portable execution plus an injectable transport factory.
- `AppComponentWidget.tsx`: portable runtime and authoring UI.

Trusted hosts may compose runtime overrides with `withWidgetRuntimeOverrides`. Authentication, internal gateway routing, product resource selectors, and application navigation do not belong in this package. `mock-json` is a target mode of AppComponent, not a separate widget.

The extraction preserves widget ID `core__app-component`, widget version `1.2.0`, and existing persisted property names. It does not change backend storage or serialization semantics.

Cross-language authors should validate the
`command-center.app_component_authoring@v1` envelope through
`contracts/schemas/app-component-authoring-v1.schema.json`. The manifest indexes complete manual
and Mock JSON examples plus invalid binding/version fixtures. The widget manifest references the
same schema's `$defs.props` definition.
