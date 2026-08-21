---
name: verify-command-center-sdk-change
description: Verify a change to the @dev-mainsequence/command-center-sdk source package before release or handoff. Use after changing public exports, views, contracts, widgets, workspaces, themes, embeds, CSS, package metadata, CLI behavior, or the packaged agent scaffold, and when auditing extraction readiness or consumer compatibility.
---

# Verify A Command Center SDK Change

## Confirm Scope And Ownership

Locate the SDK package by package name. Review the diff for SDK-owned source, tests, docs, CSS,
package metadata, examples or consumer fixtures, CLI, and scaffold files. Flag imports that cross
into repository-internal application implementations or introduce backend, router, auth, or
persistence policy.

## Verify Documentation And Exports

1. Confirm every new major module has a nearest README describing purpose, entrypoints,
   dependencies, behavior, and maintenance constraints.
2. Confirm public JavaScript, declarations, CSS, and package exports agree.
3. Confirm framework-neutral roots do not load React, browser-only code, or Node-only CLI modules.
4. Confirm compatibility and backend/storage impact are stated.
5. Confirm packaged skills describe only capabilities present in the package version.
6. Confirm the contract manifest, schemas, fixtures, TypeScript declarations, and runtime parsers
   agree for every public JSON payload changed by the task.
7. For Table/Pro Table changes, verify the broad built-ins export and both narrow package subpaths,
   stable widget IDs/versions, portable previews, host override compatibility, and absence of
   Enterprise side effects from the Community entrypoint.
8. For AppComponent changes, verify the narrow export, stable ID/version, inline Mock JSON,
   generated binding ports, portable execution, host transport override, authoring schema,
   fixtures, and runtime-normalizer parity.
9. For Tabular Transform changes, verify the narrow export, stable ID/version, mode-specific
   validation, source-role IO, canonical frame behavior, authoring schema, fixtures, and
   runtime-normalizer parity.
10. For workspace changes, verify `command-center.workspace_document@v1`, `DashboardDefinition`,
    normalization, unknown-field preservation, nested widget documents, valid/invalid fixtures,
    and the separate snapshot wrapper behavior.

## Run Proportional Checks

From the SDK package or owning repository, run the declared equivalents of:

- typecheck;
- unit and client-environment tests;
- package-boundary validation;
- build and bundle-size checks;
- examples or packed-consumer compilation;
- `npm pack` inspection or packed-package smoke testing; and
- skill validation plus postinstall/explicit-copy tests when `agent_scaffold` changes.
- draft-2020-12 schema compilation, positive/negative fixture validation, and packed-schema
  resolution when `contracts/` changes.

Do not silently omit a failed check. Separate a code failure from a missing tool, environment
problem, or unrelated pre-existing failure.

## Review Behavior

Exercise loading, empty, error, permission, cancellation, controlled-state, responsive, keyboard,
and migration behavior relevant to the change. Verify public imports from the packed artifact, not
source aliases.

## Report

Summarize the changed public contract, verification commands and results, package contents,
compatibility decision, backend/storage impact, and any intentionally unverified risk.
