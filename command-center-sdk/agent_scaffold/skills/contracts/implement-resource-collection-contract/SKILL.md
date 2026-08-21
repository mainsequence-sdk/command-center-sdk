---
name: implement-resource-collection-contract
description: Implement or validate the existing normalized resource-collection contract published by @dev-mainsequence/command-center-sdk. Use in a backend, worker, CLI, or non-TypeScript integration that explicitly adopts the manifest-declared rows and authoritative pagination boundary, including schema validation and conformance fixtures without changing the SDK contract.
---

# Implement The Resource Collection Contract

## Stay In Implementation Scope

Work only in the backend or integration consuming the installed SDK contract bundle. Do not edit
the SDK, its manifest, schemas, fixtures, or installed package during this skill.

If the contract cannot represent the requirement, record the pinned package version, contract ID,
failing schema rule and representative payload, then stop. Hand that evidence to a separate
SDK-source maintenance task.

## Resolve The Canonical Definition

1. Resolve the installed `@dev-mainsequence/command-center-sdk` version.
2. Open `@dev-mainsequence/command-center-sdk/contracts/manifest.json`.
3. Select the `command-center.resource_collection@v1` entry.
4. Load the schema and every valid and invalid fixture from the paths indexed by that entry.
5. Use `docs/backend-contracts.md` only for explanatory guidance; the manifest bundle remains the
   sole wire definition.

Do not copy fields, examples, schemas, or fixtures into this skill or another local contract
document.

## Choose Direct Conformance Or Adaptation

Implement the schema directly only when the boundary explicitly declares this contract. An
existing product API may retain its established raw envelope when a frontend adapter maps it into
the normalized SDK type. Do not claim conformance for an unvalidated raw payload.

## Implement The Existing Boundary

1. Generate language-native models and validation from the selected schema.
2. Preserve schema-required rows, authoritative pagination, nullability, and strictness exactly as
   declared. For a canonical backend-driven list, implement
   `command-center.resource_discovery@v1` separately for identity, controls, columns, and actions;
   do not copy those concerns into the collection envelope.
3. Keep authorization, query construction, ORM behavior, and transport policy implementation-owned.
4. Validate at the API, persistence, worker, or publication boundary that claims the contract.
5. Keep the package version distinct from the contract version and schema `$id`.

## Verify

Compile the manifest-selected draft-2020-12 schema, accept every indexed valid fixture, reject
every indexed invalid fixture, and add implementation-owned tests for authorization, query
propagation, pagination boundaries, empty collections, and semantic checks that JSON Schema cannot
express.
