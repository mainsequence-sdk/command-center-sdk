# Command Center SDK Workspace Instructions

## Repository Boundary

- This repository owns only `@dev-mainsequence/command-center-sdk` and its SDK-specific examples,
  contracts, documentation, tests, skills, and release tooling.
- Do not add the private Command Center application, product routes, authentication, backend
  transports, persistence policy, deployment configuration, or application environment files.
- Consumers must use declared package exports. Do not introduce aliases into repository source or
  imports from `dist`.

## Documentation

- Every major SDK module must include a nearest `README.md` describing purpose, public entrypoints,
  dependencies, behavior, and maintenance constraints.
- Update `command-center-sdk/README.md`, the relevant guide under `command-center-sdk/docs/`, and
  consumer examples whenever a public surface changes.
- Keep repository release and compatibility policy under `docs/packages/`.

## SDK Maintenance

- Follow `command-center-sdk/.agents/skills/maintenance/SKILL.md` after every SDK change.
- Run package boundary validation, type checking, tests, packed-consumer verification, and package
  size checks before release.
- Framework-neutral modules must not import React or browser-only code.

## Compatibility And Storage

- Treat exported identifiers, contract IDs, schema IDs, widget IDs, protocol versions, theme IDs,
  and persisted workspace fields as compatibility boundaries.
- Any serialized workspace, widget, binding, runtime-state, connection, or iframe contract change
  requires explicit migration coverage and a backend/storage impact assessment.
