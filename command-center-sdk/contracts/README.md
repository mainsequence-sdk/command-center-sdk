# Backend Contract Schemas

This directory is the language-neutral schema bundle shipped with
`@dev-mainsequence/command-center-sdk`. Backend teams can validate SDK-owned payloads without
reading TypeScript source.

[`manifest.json`](./manifest.json) is authoritative. Each entry names the stable contract and
schema `$id`, public npm path, payload role, TypeScript type, and valid/invalid fixtures. All schemas
use JSON Schema draft 2020-12.

Resolve package paths from the manifest, pin an exact SDK release, register every indexed schema
by `$id`, accept every valid fixture, and reject every invalid fixture. Do not validate against a
moving branch.

Portable JSON Schema cannot express every cross-field uniqueness and browser-origin rule. Runtime
parsers additionally enforce unique action IDs and discovery fields, valid resource references,
and exact iframe origins and windows. For `command-center.static_site_iframe@v1`, runtime checks
also enforce WebSocket request/response correlation, exact ticket UID/Origin/path binding, future
expiry, secure scheme, reserved protocol ordering, application-protocol limits, cancellation, and
lifecycle invalidation. Tests keep those parsers aligned with indexed fixtures.

Schema filenames and contract IDs are immutable after release. Additive changes require fixtures;
breaking semantics require a new versioned schema, a migration plan, mixed-version tests, and a
coordinated frontend/backend rollout and rollback.
