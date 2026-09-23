# Package Architecture and Dependency Rules

## Public topology

This repository publishes two packages:

```text
@dev-mainsequence/command-center-sdk        command-center-sdk/
  navigation
  layout
  feedback
  resource
  views
  theme
  embed
  contracts

@dev-mainsequence/chat                      chat/
  backend connection, session engine, chat UI, model providers
  peers: @dev-mainsequence/command-center-sdk, react, react-dom
```

The SDK is a reusable dependency for Vite applications. It has no product application source,
routes, authentication state, deployment configuration, or persistence implementation.

The chat talks to the Main Sequence platform and is bound to its routes by design: it calls them
through a connection the application gives it, reads no environment variable, and stores no
credential ([SDK ADR 012](./adr/adr-sdk-012-chat-as-a-second-public-package.md)).

## Dependency direction

- The chat depends on the SDK as a peer dependency, never a regular one, so an application has
  exactly one SDK: one stylesheet and one set of `cc-*` classes.
- The SDK knows nothing about the chat. Nothing under `command-center-sdk/` names
  `@dev-mainsequence/chat`, reaches into `chat/`, or tests, verifies or installs the chat, and the
  SDK's manifest lists it in no dependency field. `npm run direction:check`, part of
  `npm run check`, enforces this.

## Boundary rules

- Consumers import declared package exports only.
- A package's modules may import its sibling modules through package-local relative paths.
- Package source must not import application aliases or traverse outside the package.
- React and React DOM remain peer dependencies.
- Public exports, declarations, styles, schemas, fixtures, examples, and skills change together.

## Backend boundary

The schema manifest describes only SDK-owned wire contracts. Backends remain authoritative for
authorization, filtering, pagination, validation, storage, and transport policy. A contract change
requires aligned TypeScript, runtime parsing, schema, fixture, and compatibility coverage.

The chat's backend contract is the platform's: the routes and payloads it calls are listed in its
documentation and named in each release's compatibility axes. The platform remains the owner of
authorization, session ownership, and which Agents an Environment exposes.
