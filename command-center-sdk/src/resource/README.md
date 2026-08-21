# Resource Framework

This module defines backend-neutral resource applications. Its main entrypoint is `index.ts`, which
exports resource definitions, adapter contracts, canonical resource-discovery parsing, discovered
bulk-action validation and selection helpers, the conventional HTTP adapter, and pagination models.

Every normalized list returns authoritative `pageInfo`; the SDK never infers a server total from
the loaded rows. `ResourceAdapter.discover(...)` separately loads
`command-center.resource_discovery@v1`, the authoritative response for resource identity, visible
controls, ordered columns, and caller-authorized bulk actions. Pagination and sort state are not
sent to discovery. Search, explicitly supplied filter values, and declared host scope are sent
because the response may vary by semantic scope. Advertised discovery filters do not generate UI
controls.

`parseResourceDiscovery(...)` rejects unknown keys, duplicate identifiers, unsafe field paths,
broken sort/filter references, and incomplete generic column bindings. The SDK serializes ordered
identity values as a JSON tuple, so compound Kubernetes-style identity never relies on delimiter
concatenation. UI identity is separate from the UUIDs used by the existing bulk-action selection
contract.

Applications retain trusted local columns for rich cells. `resolveResourceDiscoveryColumns(...)`
uses backend order and headings, preserves matching local `getValue`/`renderCell` functions, and
allows an unmatched column only when discovery supplies both a safe `value_path` and `data_type`.
Endpoint construction and product-specific formatting remain in the consuming application.

The module has no React dependency and is safe to import from non-UI code. Authentication, routing,
query caches, notifications, and product-specific endpoint semantics must be supplied by the
consumer. A storage contract change is not part of this extraction. Bulk-action preflight and
execution use the backend-neutral `{ selection, options }` contract; endpoint-specific filters
remain in the consumer adapter. `listBulkActions`, collection-envelope controls/actions, and the
HTTP adapter's `bulkActions` endpoint remain compatibility surfaces for older consumers; canonical
list implementations configure `discover`/`endpoints.discovery` and do not fall back to them.

Advertised preflight endpoints receive that exact same canonical selection and resolved options.
Adapters normalize responses into `ResourceBulkActionPreflightResult`, preserving the raw payload
while exposing generic allowed, detail, matched-count, warning/blocker impact, and per-item impact
fields. A structured conflict response is an application transport concern: integrations should
normalize an advertised `409` preflight payload into `allowed: false` rather than discarding it as
an opaque request error. Preflight never invents an endpoint and is not required when discovery
does not advertise one.

A definition may provide a lightweight `activation` adapter when opening a list row requires more
than reusing its list UID. The adapter resolves the row to a backend-neutral `{ resource, uid }`
intent and receives an abort signal for stale requests. It may call an application API primitive,
but it must not contain a route or mutate shell URL state. The host supplies the separate navigation
adapter that interprets the intent.

Detail definitions may declare controlled primary tabs and optional nested secondary tabs. The
definitions contain semantic IDs, labels, and counts only. Route parameters, URL canonicalization,
queries, endpoint selection, and domain content remain in the consuming application. Normalized
entity-summary contracts likewise contain presentation data without application navigation or
mutation behavior.

React-specific state is isolated under `react/`; reusable page and view composition is exported
from the sibling `views/` module.
