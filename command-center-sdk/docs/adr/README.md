---
sidebar_position: 9
title: SDK Architecture Decisions
---

# Command Center SDK Architecture Decisions

This catalog records durable decisions owned by the independently publishable
`@dev-mainsequence/command-center-sdk` package. Application integration decisions belong to their
owning application repositories; backend implementation decisions are out of scope.

## Current decisions

- [SDK ADR 001: Static-Site Delegated FastAPI Credential Bridge](./adr-sdk-001-static-site-delegated-fastapi-credential-bridge.md) — Accepted
- [SDK ADR 002: Controlled Application Navigation](./adr-sdk-002-controlled-application-navigation.md) — Accepted
- [SDK ADR 003: Public Application Layout System](./adr-sdk-003-public-application-layout-system.md) — Accepted
- [SDK ADR 004: Public Application Feedback System](./adr-sdk-004-public-application-feedback-system.md) — Accepted
- [SDK ADR 005: Static-Site FastAPI WebSocket Ticket Bridge](./adr-sdk-005-static-site-fastapi-websocket-ticket-bridge.md) — Accepted
- [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md) — Accepted
- [SDK ADR 007: Responsive Column Importance and Stacked Tables](./adr-sdk-007-responsive-column-importance-and-stacked-tables.md) — Accepted
- [SDK ADR 008: Immersive Embedded Presentation](./adr-sdk-008-immersive-embedded-presentation.md) — Accepted
- [SDK ADR 009: Opinionated Embedded Application Shell](./adr-sdk-009-opinionated-embedded-application-shell.md) — Accepted
- [SDK ADR 010: Host Navigation Drawer and the Wide-Screen Embedded Frame](./adr-sdk-010-host-navigation-drawer-and-wide-screen-embedded-frame.md) — Accepted
- [SDK ADR 011: Public Control and Form Primitives](./adr-sdk-011-public-control-and-form-primitives.md) — Accepted
- [SDK ADR 013: Static-Site Platform Request Bridge](./adr-sdk-013-static-site-platform-request-bridge.md) — Accepted
- [SDK ADR 014: Local Platform Request Proxy](./adr-sdk-014-local-platform-request-proxy.md) — Accepted

## Rules

- Keep reusable SDK APIs, protocol behavior, schemas, compatibility, documentation, and packaged
  skill decisions here.
- Keep product endpoints, authentication stores, routes, and viewer-specific wiring outside this
  catalog.
- Record only the public contract and observable behavior; do not link to or name records in
  private repositories.
- Use the `SDK ADR` prefix so package decisions remain unambiguous beside other records.
