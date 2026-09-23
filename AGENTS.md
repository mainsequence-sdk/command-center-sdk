# Command Center SDK Repository Instructions

## Repository Boundary

- This repository owns two public packages, `@dev-mainsequence/command-center-sdk` and
  `@dev-mainsequence/chat` (SDK ADR 012 in `docs/packages/adr/`), with their examples, contracts,
  documentation, tests, skills, and release tooling.
- The chat depends on the SDK as a peer. The SDK knows nothing about the chat: nothing under
  `command-center-sdk/` may name `@dev-mainsequence/chat` or reach into `chat/`, and
  `npm run check` fails if it does.
- Do not add the private Command Center application, authentication, persistence policy,
  deployment configuration, or application environment files. Product routes and backend
  transports stay out of the SDK package; the chat is bound to the platform's routes by design.
- Consumers must use declared package exports. Do not introduce aliases into repository source or
  imports from `dist`.

## Documentation

- Every major SDK module must include a nearest `README.md` describing purpose, public entrypoints,
  dependencies, behavior, and maintenance constraints.
- Update `command-center-sdk/README.md`, the relevant guide under `command-center-sdk/docs/`, and
  consumer examples whenever a public surface changes.
- Keep repository release and compatibility policy, and decisions about the repository itself,
  under `docs/packages/`.

## SDK Maintenance

- Follow `command-center-sdk/.agents/skills/maintenance/SKILL.md` after every SDK change.
- Run package boundary validation, type checking, tests, packed-consumer verification, and package
  size checks before release.
- Framework-neutral modules must not import React or browser-only code.

## Compatibility And Storage

- Treat exported identifiers, contract IDs, schema IDs, protocol versions, theme IDs, and persisted
  fields as compatibility boundaries.
- Any serialized resource or iframe contract change
  requires explicit migration coverage and a backend/storage impact assessment.
