---
name: adapt-resource-backend
description: Adapt an existing backend API to the normalized resource contracts in @dev-mainsequence/command-center-sdk/resource, or prepare the exact frontend contract for a separate backend task. Use for list and detail normalization, authoritative pagination, search, filters, sorting, CRUD adapter methods, bulk-action discovery, preflight, execution, cancellation, and transport ownership.
---

# Adapt A Resource Backend

## Keep This A Frontend Adapter Skill

Do not implement backend services, persistence, authorization, ORM logic, or deployment here. Map
an existing API into the SDK contract, or produce a precise handoff for the backend skill.

## Choose The Adapter Level

- Inspect the installed `contracts/manifest.json` before inventing a backend shape. When an
  endpoint declares a published contract, load only the schema and fixtures indexed by that
  manifest entry. Use `$implement-resource-collection-contract` or
  `$implement-bulk-actions-contract` for backend-side conformance work.
- Use `createHttpResourceAdapter(...)` for conventional HTTP endpoints with explicit response
  normalizers and a host-supplied HTTP client.
- Implement `ResourceAdapter<T, Id, CreateInput, UpdateInput>` for a nonstandard transport or
  lifecycle.

Read the installed `/resource` declarations before deciding. Authentication, base URL, headers,
retry, caching, and session policy belong to the supplied transport, not the SDK adapter.

## Normalize The Contract

1. Map list input to `pageIndex`, `pageSize`, optional search, filters, sort, and abort signal.
2. Return `items` plus authoritative `pageInfo`: page index, page size, total items, next-page, and
   previous-page state.
3. Implement a separate `discover` operation for `command-center.resource_discovery@v1`. Send
   semantic search, visible filters, and declared hidden scope, but exclude pagination and current
   sort presentation.
4. Treat discovery as authoritative for ordered UI identity fields, visible controls, ordered
   columns, and `bulk_actions`. Do not fall back to `/bulk-actions/` or inline collection metadata
   in a migrated list.
5. Keep discovery UI identity separate from the public UUID type used by detail, activation, and
   explicit bulk selection. Serialize compound UI identity as an ordered JSON tuple.
6. Implement optional get, create, update, delete, preflight, and execution methods only when
   supported.
7. Forward abort signals and ignore stale list and discovery results in the owning view lifecycle.
8. Normalize advertised conflict or preflight responses into SDK blocked/allowed models without
   discarding the raw payload.

Do not leak response wrappers, endpoint URLs, authentication objects, or transport errors into
framework-neutral resource definitions.

## Produce A Backend Handoff

When backend work is required, specify:

- canonical resource identity and UID type;
- collection and `/discovery/` URLs, semantic scope, and rejected presentation query keys;
- list request parameters and discovered search/filter/ordering vocabulary;
- ordered columns, trusted local renderer IDs, and safe generic `value_path`/`data_type` bindings;
- list, page-info, and detail response shapes;
- null, not-found, forbidden, validation, conflict, and server-error semantics;
- action discovery, selection, options, preflight, and execution payloads;
- permission and authorization expectations; and
- cancellation, idempotency, and refresh expectations.

Hand that requirement to the appropriate backend contract skill without prescribing its internal
implementation. Reference the exact manifest contract ID and schema `$id`. Use the manifest-indexed
fixtures rather than copying or rewriting them in the handoff. The resource-collection schema is
the normalized adapter boundary; do not force an established raw API envelope to match it when an
explicit frontend normalizer is the intended integration.

## Verify

Contract-test raw backend fixtures against every normalizer. Test pagination edges, empty results,
unknown totals only if supported by the installed contract, abort behavior, identity consistency,
errors, resource discovery, preflight, and execution. Verify pagination alone does not refetch
stable discovery and semantic scope changes do. Validate schema-bound payloads with a draft-2020-12
validator and require indexed invalid fixtures to fail.
