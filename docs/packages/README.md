---
id: packages-index
title: Package Architecture
slug: /packages
---

# Command Center SDK Package Architecture

This repository produces two public packages: `@dev-mainsequence/command-center-sdk` and
`@dev-mainsequence/command-center-ai` ([SDK ADR 012](./adr/adr-sdk-012-chat-as-a-second-public-package.md)).
The chat depends on the SDK as a peer; the SDK knows nothing about the chat.

The SDK's source lives under `command-center-sdk/` and the chat's under `command-center-ai/`. Each package's
README and `docs/` directory define its supported consumer API, while this section records
repository-level dependency, compatibility, and release policy.

## Reading Order

1. [Architecture and dependency rules](./architecture.md)
2. [Compatibility policy](./compatibility.md)
3. [Publishing and releases](./publishing.md)
4. [Packed consumer fixtures](./sdk-consumer-fixture.md)

New reusable capabilities become deliberate SDK subpath exports. Command Center application code,
product policy, authentication, persistence, and deployment configuration do not belong in this
repository. Product routes stay out of the SDK package; the chat is bound to the platform's routes
by design.

## Decisions

- [SDK ADR 012: The Chat as a Second Public Package](./adr/adr-sdk-012-chat-as-a-second-public-package.md)
  — Accepted

`SDK ADR` numbers form one sequence for the whole repository, and each record lives with what it
governs: the SDK's decisions in `command-center-sdk/docs/adr/`, the chat's in the chat's
`docs/adr/`, and decisions about the repository itself here. That is why the SDK's catalog skips
number 012. A new record takes the number after the highest one in all three places.
