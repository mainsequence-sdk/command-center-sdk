---
sidebar_position: 7
title: Extending and releasing
---

# Extending and releasing the SDK

This guide is for a source checkout of the SDK package, not an installed `node_modules` copy. Its
matching `extend-command-center-sdk`, `evolve-command-center-contract`, and
`verify-command-center-sdk-change` workflows are package-local maintainer skills; they are not
included in the consumer `agent_scaffold` installed by npm.

## Extend the SDK

First decide whether the behavior belongs in the SDK. It should be reusable across consumers or a
canonical framework behavior, and it must work without a particular backend, route, auth store,
product policy, or domain response.

Keep these in the consuming application:

- endpoint paths and product response interpretation;
- authentication, routing, persistence, and organization policy;
- one-off domain workflows; and
- code that imports another application's implementation.

When reusable presentation is coupled to a domain payload, split it into a backend-neutral view
model and controlled SDK component plus a consumer-owned adapter.

### Choose the layer

| Capability | Location and export |
| --- | --- |
| JSON-safe contracts, normalizers, migrations | `src/contracts` → `/contracts` |
| Framework-neutral resources and adapters | `src/resource` → `/resource` |
| Controlled React lists/details/pickers | `src/views` → `/views` |
| Widget authoring, host, testing, built-ins | `src/widget` → `/widget/*` |
| Workspace model and read-only renderer | `src/workspace` → `/workspace/*` |
| Tokens, presets, palettes, CSS | `src/theme` and package CSS exports |
| Versioned iframe behavior | `src/embed` → `/embed/*` |

For example, a reusable framework-neutral normalizer belongs in a module and its narrow public
index:

```ts
// src/resource/normalize-project-label.ts
export function normalizeResourceLabel(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Untitled";
}

// src/resource/index.ts
export { normalizeResourceLabel } from "./normalize-project-label.js";
```

Then add focused tests, document the behavior in the nearest module README and public guide, and
verify the built declaration and packed import. Do not add an empty facade for planned work.

React/browser behavior belongs behind a UI subpath. Framework-neutral roots must not load React,
browser globals, or Node-only CLI code. Required CSS must be included in `files` and `exports`.

## Evolve a contract

An npm version is only one compatibility axis. Identify every affected version before changing
serialized behavior:

- npm public API;
- widget manifest API and widget semantic version;
- workspace schema, widget props, and widget user-state versions;
- value-contract and runtime-update identifiers;
- stable widget, resource, theme, and contribution IDs; and
- iframe wire-protocol identifier.

Prefer additive optional fields with deterministic defaults. Preserve unknown JSON fields and
unknown canonical IDs. Migrations must be ordered, deterministic, pure, and independently tested.
A breaking wire change needs a new protocol identifier and a transition path.

When a public JSON payload changes, update the language-neutral bundle under `contracts/` in the
same change: add or revise the schema, valid/invalid fixtures, manifest entry, matching TypeScript
type, and backend-facing documentation. Released schema filenames, contract IDs, and `$id` URNs are
immutable; breaking semantics require a new versioned schema.

If a backend stores, validates, filters, publishes, or returns the changed shape, hand off:

```text
Old shape and meaning:
New shape and meaning:
Default for old records:
Version gate:
Frontend/backend rollout order:
Rollback behavior:
Serializer/validator changes:
Mixed-version behavior:
```

If serialized bytes and semantics do not change, state explicitly that no backend/storage contract
change is required.

## Verify a change

Review the diff for ownership first. SDK source must not import application aliases, product
endpoints, auth stores, routers, or persistence policy.

Run the repository's declared checks rather than relying on an editor typecheck:

```bash
npm run boundaries:check
npm run public-packages:validate
npm run sdk:check
npm run sdk:test
npm run sdk:build
npm --workspace @dev-mainsequence/command-center-sdk run test:package-smoke
```

When docs change, build the documentation site. When the agent scaffold changes, validate every
skill plus explicit/postinstall copying. When exports change, inspect the `npm pack` contents and
import the packed artifact from a clean consumer fixture.

When contract schemas change, compile every draft-2020-12 schema, validate every indexed positive
fixture, reject every indexed negative fixture, check runtime-parser parity, and prove the entire
manifest bundle exists in the packed tarball.

Use the repository's
[SDK consumer fixture](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/sdk-consumer-fixture)
for export coverage and the
[basic widget example](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/basic-widget)
for separately distributed widget-package coverage.

Before handoff, report:

- the changed public contract and intended consumers;
- checks run and their exact results;
- declarations, JavaScript, CSS, exports, and docs added or removed;
- compatibility decision and migration path;
- backend/storage impact; and
- anything intentionally not verified.

Never hide a failing check. Distinguish an implementation failure from a missing tool,
environment problem, or unrelated pre-existing failure.
