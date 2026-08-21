---
sidebar_position: 4
title: Backend contracts
---

# Backend contract schemas

The SDK publishes language-neutral JSON Schemas so backend teams can design payloads without
reverse-engineering TypeScript or frontend normalizers.

Use `contracts/implement-command-center-contract` to implement any existing manifest entry in
another language. More focused workflows live under `contracts/` for resource collections, bulk
actions, and Adapter From API. These installed skills consume the published bundle and never
redefine or modify it.

## Package layout

```text
command-center-sdk/
  contracts/
    README.md
    manifest.json
    schemas/
      *.schema.json
    fixtures/
      valid/
      invalid/
```

The directory ships in the npm tarball. `manifest.json` is the canonical machine-readable contract
documentation: it records each stable contract ID, schema `$id`, public npm path, role, matching
TypeScript type, and fixture list. The referenced schemas define the bytes. This guide explains
usage and intentionally does not maintain another contract catalog.

The manifest also indexes `command-center.static_site_iframe@v1` with role `iframe-protocol`. That
schema lets non-TypeScript hosts and static sites validate the additive version-one iframe
messages, including delegated FastAPI request/response/error bytes. It does not define the
control-plane exchange endpoint. The host backend remains authoritative for credential minting,
source/target access, organization policy, origin policy, expiry, CORS, and FastAPI authorization;
the host adapter maps that response into the public SDK resolver shape. A backend-confirmed
retryable cold start maps to `runtime_starting`; permission and origin denials must not use that
code. HTTP `401`, `403`, `404`, `502`, `503`, and `504` from the target runtime remain HTTP
responses classified by the SDK child transport and are not credential-error messages.

The normalized collection is not automatically a requirement for every raw product endpoint. An
existing `{count, results}` API can keep that envelope when its frontend adapter maps it to
`ResourceListResult<T>`. An endpoint claiming a schema contract must validate directly against it.

## MCP platform skill catalog ownership

The authenticated MCP platform-skill catalog is intentionally not another entry in this package's
contract manifest. The backend already owns its version-2 resource manifest,
`mainsequence://platform/ontology`, and the ontology's `skill_resources` membership. The packaged
CLI consumes that existing protocol through `resources/list` and `resources/read`; it does not
publish a competing `command-center.*` catalog shape.

To extend the platform guidance, the backend adds or removes the skill under the same manifest
schema version, updates `ontology.skill_resources`, publishes matching list/read metadata, and
publishes a new manifest hash identifying that concrete revision. Compatible installed SDKs accept
additive skills dynamically without a new npm contract or hard-coded skill list. Breaking metadata
semantics require a new backend manifest version and an SDK compatibility update. Run
`command-center-sdk skills sync --path . --json` to validate the complete live revision before it
is written under `.agents/skills/mainsequence/`.

## Adapter From API ownership

An Adapter From API connection is a transport and security boundary, not a response transformer.
Each executable operation declares `responseContract`, and the provider body must implement that
contract exactly in backend and direct modes. In particular, raw JSON and columnar
`{fields: [{values: ...}]}` envelopes are not `core.tabular_frame@v1`. That ID is reserved for the
canonical row-oriented tabular schema in this bundle.

The Adapter From API v1 schemas define no compatibility aliases. Unsaved form drafts may be
partial, but persisted config and executable query payloads must validate exactly.

## Table authoring versus table data

These two contracts solve different problems:

- `command-center.table_widget_authoring@v1` describes which widget to create and the persisted
  props controlling its source mode, columns, visuals, formulas, and selection behavior.
- `core.tabular_frame@v1` describes the actual bound dataset passed through the `seedData` input
  and republished through the `dataset` output.

Use the manifest-indexed Table and Pro Table fixtures as the canonical examples; do not copy their
payloads into another guide or skill. Host-specific
connection props may be preserved, but portable consumers cannot require them to render bound or
manual data.

When a backend owns default presentation, put it on the frame under
`meta.tableVisuals.columns.<field>`. The tabular-frame schema defines labels, formats, date formats,
decimal precision, visibility, width, thresholds, color/range metadata, heatmaps, data bars,
gauges, inline-series hints, and formula display metadata. Start with
`fixtures/valid/tabular-frame-v1.table-visuals.json`; these values never mutate the canonical rows.

## AppComponent, Tabular Transform, and workspace documents

AppComponent and Tabular Transform use the same authoring-envelope convention as Table:

```json
{
  "contract": "command-center.app_component_authoring@v1",
  "widgetId": "core__app-component",
  "props": {
    "apiTargetMode": "mock-json",
    "mockJson": {
      "version": 1,
      "operation": { "method": "get", "path": "/preview" },
      "response": { "status": 200, "body": { "ok": true } }
    }
  }
}
```

The AppComponent contract includes `mock-json`; there is no separate Mock JSON widget or contract.
The schema intentionally allows unknown top-level props so trusted hosts can persist their own
target references, but the SDK-defined Mock JSON and binding objects remain strictly versioned.

Tabular Transform mode-specific rules are enforced by its schema: pivot needs both pivot fields,
unpivot needs value fields, and latest-row merge needs key fields or mappings. Its envelope authors
the transform widget; transformed data continues to use `core.tabular_frame@v1`.

`command-center.workspace_document@v1` validates the direct normalized `DashboardDefinition`, not
an extra wrapper and not the export snapshot envelope. Unknown widget IDs, props, runtime state,
and forward metadata remain allowed and are preserved by `normalizeWorkspaceDocument(...)`.

Before these entries, the SDK had TypeScript/runtime definitions but no language-neutral schemas
for these persisted bytes. The new schemas document the existing v1 shapes; they do not change the
stored payload, widget IDs, widget versions, or workspace schema version. Recommended backend
rollout is: pin the SDK release, compile all manifest schemas, validate existing records in shadow
mode, then enforce validation only for endpoints that claim these contracts. Mixed deployments are
safe because older clients read the same JSON and unknown fields remain preserved. Rollback is to
disable the new validation while retaining stored documents unchanged; no data rewrite is needed.

Backends must additionally enforce cross-field rules that portable JSON Schema cannot express:
variable keys and operation IDs are unique, public and secret keys do not overlap, health/query
operation IDs resolve to declared operations, the referenced health operation is a safe GET whose
method/path are declared once in `availableOperations`, executable operations declare an exact
response contract, and query parameters stay in their declared locations. Secret values never
enter public config, response bodies, logs, traces, or cache keys.

## Resource-list discovery and bulk-action lifecycle

`command-center.resource_discovery@v1` is the backend response that lets a backend engineer extend
a resource list without reading React. It owns ordered UI identity fields, visible search/filter/
ordering controls, ordered columns, and actions available to the current caller and semantic
scope. Collection endpoints remain authoritative for rows and pagination.

The backend returns trusted local renderer IDs without `value_path`; a new generic column provides
both a safe dot-delimited `value_path` and one of the schema's supported `data_type` values. The
backend never returns JSX, component names, CSS, callbacks, or executable expressions.

Example:

```json
{
  "contract": "command-center.resource_discovery@v1",
  "resource": {
    "id": "records",
    "label": "Records",
    "item_label": "record",
    "identity": { "fields": ["uid"] }
  },
  "list": {
    "controls": {
      "search": { "placeholder": "Search records", "fields": ["name", "uid"] },
      "filters": [],
      "ordering": ["name"]
    },
    "columns": [
      {
        "id": "name",
        "header": "Record",
        "default_visible": true,
        "hideable": false,
        "sortable_key": "name"
      }
    ]
  },
  "bulk_actions": [
    {
      "id": "archive",
      "label": "Archive records",
      "endpoint": "/records/actions/archive/",
      "preflight_endpoint": "/records/actions/archive/preflight/",
      "method": "POST",
      "tone": "danger",
      "selection_modes": ["explicit", "all_matching"],
      "confirmation": {
        "title": "Archive records",
        "word": "ARCHIVE",
        "button_label": "Archive",
        "warning": "Archived records are unavailable."
      },
      "options": []
    }
  ]
}
```

Discovery query parameters contain semantic search, visible filters, and explicitly declared
hidden host scope only. Pagination and current sort presentation are rejected. User-specific
responses use private revalidation with `ETag`; browser transports can honor the backend's
`Cache-Control: private, max-age=0, must-revalidate` and `Vary` headers normally.

The SDK sends the same request body to the advertised preflight and execution endpoints:

```json
{
  "selection": {
    "mode": "all_matching",
    "query": {
      "search": "risk",
      "filters": {
        "status": "active"
      }
    }
  },
  "options": {}
}
```

Preflight returns the execution decision:

```json
{
  "allowed": false,
  "detail": "One record is protected.",
  "matched_count": 2,
  "blockers": ["Protected records cannot be archived."],
  "warnings": []
}
```

Domain-specific preflight properties are allowed and preserved in the raw result. The base fields
above retain their documented meaning.

## Resolve the bundle

After installing a pinned SDK version, resolve the manifest through the package export:

```js
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const manifestPath = require.resolve(
  "@dev-mainsequence/command-center-sdk/contracts/manifest.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
```

Register all manifest schemas with a draft-2020-12 validator before validating fixtures or
payloads. The resource-collection schema references the bulk-action action definition by its stable
URN, so registering only one file is insufficient.

Non-Node backends can unpack the pinned npm tarball or vendor `contracts/` from an exact repository
release tag. Production validation must not depend on a moving `main` branch.

The package-level [schema README](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/command-center-sdk/contracts/README.md)
includes a Python validator example.

## Compatibility rules

- Released contract IDs, filenames, and `$id` URNs are immutable.
- Additive compatible changes require updated positive and negative fixtures.
- Breaking semantics require a new `vN` schema and contract ID.
- TypeScript types, runtime parsers, schemas, manifest entries, and fixtures change together.
- Backend handoffs must state rollout order, defaults, mixed-version behavior, and rollback.

Portable JSON Schema cannot enforce uniqueness by one object property. Runtime parsers additionally
require unique action IDs, option keys, filter keys, and ordering values, while tabular
normalization canonicalizes duplicate field keys. Schemas mark those rules with `$comment` where
applicable.

Adding the schema bundle documents existing contracts and does not itself migrate backend or stored
workspace/widget data. A backend changes only when an endpoint opts into or evolves one of these
contracts. The widget authoring envelopes and workspace-document schema describe existing IDs,
props, layouts, bindings, and version fields, so they do not require a storage migration.
