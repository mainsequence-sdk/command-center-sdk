---
sidebar_position: 9
title: SDK Architecture Decisions
---

# Command Center SDK Architecture Decisions

This catalog records durable decisions owned by the independently publishable
`@dev-mainsequence/command-center-sdk` package. Application integration decisions belong to their
owning application repositories, and backend implementation decisions belong to their backend
repositories.

## Current decisions

- [SDK ADR 001: Static-Site Delegated FastAPI Credential Bridge](./adr-sdk-001-static-site-delegated-fastapi-credential-bridge.md) — Accepted
- [SDK ADR 002: Controlled Application Navigation](./adr-sdk-002-controlled-application-navigation.md) — Accepted
- [SDK ADR 003: Public Application Layout System](./adr-sdk-003-public-application-layout-system.md) — Accepted

## Rules

- Keep reusable SDK APIs, protocol behavior, schemas, compatibility, documentation, and packaged
  skill decisions here.
- Keep product endpoints, authentication stores, routes, and viewer-specific wiring outside this
  catalog.
- Link to application and backend ADRs instead of copying their implementation plans.
- Use the `SDK ADR` prefix so package decisions remain unambiguous when this package moves to its
  own repository.
