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
4. [Migrating from legacy packages](./migrating-from-legacy-packages.md)
5. [Packed consumer fixture](./sdk-consumer-fixture.md)

New reusable capabilities become deliberate SDK subpath exports. Command Center application code,
product policy, routes, authentication, persistence, and deployment configuration do not belong in
this repository.
