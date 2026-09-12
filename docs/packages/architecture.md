# Package Architecture and Dependency Rules

## Public topology

This repository publishes one package:

```text
@dev-mainsequence/command-center-sdk
  navigation
  layout
  feedback
  resource
  views
  theme
  embed
  contracts
```

The SDK is a reusable dependency for Vite applications. It has no product application source,
routes, authentication state, deployment configuration, or persistence implementation.

## Boundary rules

- Consumers import declared package exports only.
- SDK modules may import sibling SDK modules through package-local relative paths.
- SDK source must not import application aliases or traverse outside the package.
- React and React DOM remain peer dependencies.
- Public exports, declarations, styles, schemas, fixtures, examples, and skills change together.

## Backend boundary

The schema manifest describes only SDK-owned wire contracts. Backends remain authoritative for
authorization, filtering, pagination, validation, storage, and transport policy. A contract change
requires aligned TypeScript, runtime parsing, schema, fixture, and compatibility coverage.
