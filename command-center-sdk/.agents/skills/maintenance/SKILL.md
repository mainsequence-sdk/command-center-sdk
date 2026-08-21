---
name: maintenance
description: Maintain integrity and release readiness across the @dev-mainsequence/command-center-sdk source package. Use after any change under command-center-sdk—including public source, contracts, views, widgets, workspaces, themes, embeds, CSS, CLI, package metadata, documentation, or tests—and before handoff or release. Audit and update public extension APIs, human documentation and examples, language-neutral JSON Schemas and fixtures, TypeScript and runtime contracts, package exports, compatibility notes, and backend handoff information affected by the change.
---

# Maintain The Command Center SDK

Finish every SDK change as one synchronized product update. Keep the executable package, public
extension model, human explanation, and backend-readable contract bundle describing the same
released capability.

## 1. Establish The Change Surface

1. Locate the package by the `@dev-mainsequence/command-center-sdk` package name; do not assume the
   monorepo layout will remain permanent.
2. Inspect the complete diff, including untracked files, without overwriting unrelated user work.
3. Read the nearest module README, public entrypoint, tests, related guide under `docs/`, and
   `contracts/manifest.json` when serialized data may be involved.
4. State which rows of the synchronization matrix apply before finishing the implementation.

## 2. Apply The Synchronization Matrix

| Changed surface | Required synchronized work |
| --- | --- |
| Internal implementation only | Update focused tests and the nearest README when behavior or maintenance constraints changed. Record why public docs, extension contracts, and backend contracts are unaffected. |
| Public TypeScript, React, CSS, or entrypoint | Align source exports, declarations, `package.json` exports/files, tests, and copyable human examples. |
| Serialized, persisted, or protocol payload | Align the public TypeScript type, runtime parser/normalizer, versioning or migration, JSON Schema, manifest, positive and negative fixtures, backend guide, and compatibility notes. |
| New or changed extension workflow | Update the public extension point, task guide, example, ownership boundary, and external-consumer test. |
| New or changed agent workflow | Update the matching `agent_scaffold/skills` instructions and metadata, the human guide/skill map, skill validation, install/copy tests, and packed-package assertions. |
| Package or CLI behavior | Update package metadata, CLI tests, installation documentation, and packed-package assertions. |
| Major module or ownership change | Add or update the nearest README with purpose, entrypoints, dependencies, behavior, and maintenance constraints. |

Do not make empty edits merely to touch every column. Make a written no-impact decision for each
non-applicable gate and name the unchanged boundary that justifies it.

## 3. Keep The SDK Extensible

For every changed public capability:

- Keep the contract backend-neutral and reusable across consumers. Do not import application
  aliases, product endpoints, authentication stores, routers, or persistence policy.
- Expose the smallest stable entrypoint needed for extension. Do not require consumers to import
  `src`, `dist`, internal registries, or another application's implementation.
- Prefer explicit composition, injected adapters, controlled state, stable IDs, and JSON-safe data
  over application-global dependencies or implicit registration.
- Document the public import, required types, defaults, lifecycle, ownership boundary, supported
  extension regions, and compatibility behavior.
- Add a minimal copyable example that uses only published package paths.
- Test the capability through its public entrypoint and, for packaging changes, from a clean packed
  consumer rather than repository aliases.

Write guidance around developer tasks, not file inventories. Explain what to build, where extension
code belongs, who owns transport and persistence, and which failure or unavailable states the
consumer must handle.

## 4. Keep Backend Contracts Implementable

Treat `contracts/manifest.json` as the backend entrypoint and `contracts/schemas/` plus
`contracts/fixtures/{valid,invalid}/` as the language-neutral conformance bundle.

When JSON crosses a frontend/backend, storage, worker, iframe, or plugin boundary:

- Decide whether an existing versioned contract covers it. Add a contract only when another
  implementation must understand the bytes independently of TypeScript.
- Keep schema `$id`, manifest ID, role, npm path, TypeScript mapping, and fixture indexes aligned.
- Add representative valid fixtures and targeted invalid fixtures for every new rule.
- Test schema compilation, fixture acceptance/rejection, runtime-parser parity, and packed-tarball
  presence.
- Preserve released schema filenames, IDs, and `$id` URNs. Use a new `vN` contract and a rollout
  plan for breaking semantics.
- Exclude runtime-only values such as `AbortSignal`, callbacks, clients, and React nodes from wire
  schemas.
- Update `contracts/README.md`, `docs/backend-contracts.md`, and compatibility guidance.

If the backend stores, validates, filters, publishes, or returns the changed payload, produce a
handoff containing the old and new shapes, defaults, version gate, rollout order, rollback,
serializer or validator changes, and mixed-version behavior. Do not label a change frontend-only
without checking its serialized bytes and semantics.

## 5. Keep Human Documentation Usable

For each public workflow, ensure the nearest README and task guide answer:

- What problem does this solve, and when should it be used?
- What is the public import and the smallest working example?
- Which behavior belongs to the SDK, consumer, host, or backend?
- How is it extended without importing repository internals?
- What loading, error, permission, cancellation, migration, or unavailable state matters?
- Which contract ID and fixture should a non-TypeScript backend implement?
- Which stable public extension point implements the task?

Remove superseded documents and links instead of leaving contradictory legacy guidance. Rebuild
generated documentation only after source Markdown is correct.

Keep packaged skills under `agent_scaffold/skills` task-oriented and version-matched. When a
public workflow changes, update the human example and matching skill in the same change. Skills
must use published package entrypoints and must not depend on repository-only source paths. If no
skill changes, record which existing workflow remains accurate and why.

## 6. Verify The Release Boundary

Run checks in proportion to the change. For a public or contract change, run the complete SDK lane
from the owning repository:

```bash
git diff --check
npm run check
npm run sdk:test
npm run sdk:build
npm --workspace @dev-mainsequence/command-center-sdk run test:package-smoke
```

Run `npm run docs:build` when documentation or its navigation changes. Inspect `npm pack` contents
and import from the packed artifact when exports, `files`, schemas, fixtures, docs, or CLI behavior
changes. Exercise any specialized behavior that the generic suite cannot prove.

Do not hide failures. Distinguish product failures from missing tools, environment restrictions,
and unrelated pre-existing failures.

## 7. Report The Maintenance Decision

Before handoff, report all of the following even when the answer is “no change required”:

- Public capability and entrypoints changed.
- Extension points, docs, and examples updated, or the concrete reason public extension behavior
  was unaffected.
- Packaged `agent_scaffold` skills updated, or the concrete reason existing agent workflows remain
  accurate.
- Contract IDs, schemas, and fixtures updated, or the concrete reason serialized behavior did not
  change.
- Human docs, examples, README, compatibility, and changelog updates.
- Backend/storage impact and any backend action required.
- Verification commands, exact results, and intentionally unverified risk.

## Examples

- Adding a cursor field to a normalized collection response affects the resource type, runtime
  normalization, versioned collection schema, manifest and fixtures, resource/backend guides,
  compatibility notes, and packed smoke tests.
- Adding a controlled React-only display prop can require view types, tests, README, human example,
  and public extension documentation while correctly recording no schema change because no
  serialized boundary changed.
- Adding a public export requires the narrow source index, declarations, `package.json` export,
  usage docs, package-boundary checks, and a clean packed import.
