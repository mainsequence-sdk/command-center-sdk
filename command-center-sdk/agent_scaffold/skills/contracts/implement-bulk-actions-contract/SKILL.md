---
name: implement-bulk-actions-contract
description: Implement or validate the existing bulk-action contracts published by @dev-mainsequence/command-center-sdk. Use in a backend, worker, CLI, or non-TypeScript integration for action discovery, explicit or all-matching selection, optional preflight, confirmation metadata, execution, authorization, and conformance validation without changing the SDK contracts.
---

# Implement The Bulk-Actions Contracts

## Stay In Implementation Scope

Work only in the backend or integration consuming the installed SDK contract bundle. Do not edit
the SDK, its manifest, schemas, fixtures, or installed package during this skill.

If a contract cannot represent the requirement, record the pinned package version, contract ID,
failing schema rule and representative payload, then stop. Hand that evidence to a separate
SDK-source maintenance task.

## Resolve The Canonical Definitions

1. Resolve the installed `@dev-mainsequence/command-center-sdk` version.
2. Open `@dev-mainsequence/command-center-sdk/contracts/manifest.json`.
3. Select the bulk-action entries by their manifest roles and contract IDs. For a canonical
   resource list, also select `command-center.resource_discovery@v1`; its `bulk_actions` array
   reuses the same action definition while identity, controls, and columns share one response.
4. Load every referenced schema and all valid and invalid fixtures indexed by those entries.
5. Use `docs/backend-contracts.md` only for lifecycle guidance; the manifest bundle remains the
   sole wire definition.

Do not copy fields, examples, schemas, or fixtures into this skill or another local contract
document.

## Implement The Lifecycle

1. Discover only actions currently authorized for the caller and scope. A canonical resource list
   returns them from `<collection>/discovery/`; do not add a new `/bulk-actions/` metadata endpoint.
2. Preserve the selected explicit or all-matching selection object through preflight and execution.
3. Treat preflight as optional unless the discovered action advertises it.
4. Reauthorize discovery, preflight when present, and execution independently.
5. Preserve action options and query scope without substituting frontend presentation state.
6. Return contract-valid blocked, allowed, success, and error responses at declared boundaries.
7. Keep domain mutation, transaction, idempotency, audit, and permission policy backend-owned.

## Preserve Selection Meaning

Selecting the loaded page remains explicit selection. All-matching selection is a separate user
choice and applies to the complete backend query scope. Never infer all-matching merely because the
page-level checkbox was selected.

## Verify

Compile every manifest-selected draft-2020-12 schema, accept every indexed valid fixture, reject
every indexed invalid fixture, and test caller-specific discovery, page-only selection,
all-matching selection with filters, optional and absent preflight, stale authorization, blocked
execution, idempotency, audit, and successful refresh behavior.
