---
name: implement-command-center-contract
description: Implement or validate an existing language-neutral contract from @dev-mainsequence/command-center-sdk in a backend, worker, CLI, plugin, or non-TypeScript consumer. Use when selecting a contract from contracts/manifest.json, generating language models, validating JSON with the published schema and fixtures, or proving wire compatibility without changing contract IDs, schemas, or SDK implementation.
---

# Implement A Command Center Contract

## Stay In Consumer Scope

Work only in the backend, worker, CLI, plugin, or other consumer implementing the installed
contract bundle. Do not edit the Command Center SDK source, schema bundle, or fixtures during this
skill.

If the installed contract cannot represent the requirement, report the exact failing rule or
missing capability and stop this implementation task. Produce a separate SDK-source handoff with
the pinned version, contract ID, failing fixture or payload, and compatibility requirement. Do not
continue into SDK maintenance from this consumer skill.

## Treat The Installed Bundle As Authoritative

Resolve the installed `@dev-mainsequence/command-center-sdk` version. Read
`/contracts/manifest.json`, select the entry by exact contract ID and role, then load its schema and
all indexed valid and invalid fixtures through published package paths. TypeScript declarations are
supporting documentation, not the cross-language source of truth.

The manifest, referenced JSON Schema, and indexed fixtures are the only canonical wire definition.
Human documentation explains intent but does not redefine fields. Never copy a schema or fixture
into this skill.

Use a more specific implementation skill when available: `$implement-table-widget`,
`$implement-app-component`, `$implement-tabular-transform`,
`$implement-adapter-from-api-contract`, `$implement-resource-collection-contract`,
`$implement-bulk-actions-contract`, `$adapt-resource-backend`, or
`$build-command-center-workspace`.

## Implement The Existing Wire Shape

1. Compile the declared draft-2020-12 schema without weakening strictness or ignoring references.
2. Generate language-native models and serializers that preserve required fields, nullability,
   enums, additional-property policy, and numeric constraints.
3. Validate at the actual trust boundary: persistence, API input/output, worker message, import, or
   publication.
4. Preserve the exact contract ID, schema `$id`, canonical IDs, and version. Do not substitute the
   npm package version for a wire version.
5. Preserve unknown fields only where the schema explicitly permits them.
6. Exclude secrets and runtime-only values such as clients, callbacks, `AbortSignal`, or React
   nodes from serialized payloads.
7. Match SDK runtime parser or normalizer behavior when the manifest names a corresponding public
   TypeScript type.

## Do Not Evolve While Implementing

Do not edit schemas, fixtures, IDs, defaults, or semantic meaning merely to make an implementation
pass. Report the incompatible payload and identify the failing schema rule.

## Verify

Accept every indexed valid fixture and reject every indexed invalid fixture in the target
language. Add implementation-owned round-trip and boundary tests. Report the pinned SDK version,
contract ID, schema `$id`, validator dialect, mixed-version assumptions, and any validation that
remains intentionally unenforced.
