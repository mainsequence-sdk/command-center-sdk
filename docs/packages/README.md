---
id: packages-index
title: Package Architecture
slug: /packages
---

# Command Center SDK Package Architecture

This repository produces one public package: `@dev-mainsequence/command-center-sdk`.

The package source lives under `command-center-sdk/`. Its README and `docs/` directory define the
supported consumer API, while this section records repository-level dependency, compatibility, and
release policy.

## Reading Order

1. [Architecture and dependency rules](./architecture.md)
2. [Compatibility policy](./compatibility.md)
3. [Publishing and releases](./publishing.md)
4. [Packed consumer fixture](./sdk-consumer-fixture.md)

New reusable capabilities become deliberate SDK subpath exports. Command Center application code,
product policy, routes, authentication, persistence, and deployment configuration do not belong in
this repository.

## Decisions

- [SDK ADR 012: The Chat as a Second Public Package](./adr/adr-sdk-012-chat-as-a-second-public-package.md)
  — Accepted

`SDK ADR` numbers form one sequence for the whole repository, and each record lives with what it
governs: the SDK's decisions in `command-center-sdk/docs/adr/`, the chat's in the chat's
`docs/adr/`, and decisions about the repository itself here. That is why the SDK's catalog skips
number 012. A new record takes the number after the highest one in all three places.
