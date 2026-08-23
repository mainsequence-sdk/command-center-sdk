# Changelog

## Unreleased

## 0.1.14

- Add public `/layout` and `/layout/testing` entrypoints with responsive application page, header,
  stack, card, and card-grid primitives; theme-tightness layout metrics; stable browser-verifier
  hooks; and real Chromium geometry checks across phone, tablet, desktop, dark, and light states.
- Ship aligned page-composition documentation and the `compose-command-center-page` agent skill,
  keeping semantic theme auditing separate from computed layout conformance.
- Preflight the exact backend-owned deployment tag before project mutation: preview the npm patch
  version, reject local and remote tag collisions, verify the applied bump matches the preview, and
  atomically push the explicit branch and tag refs.
- Make project-sync SSH key filenames repository-specific by hashing the canonical origin identity,
  so repositories with the same basename cannot share or overwrite a key. Legacy basename keys are
  left untouched and are not reused as a compatibility fallback.
- Preserve the platform-standard `--follow-tags` project sync while explicitly pushing the
  resolved branch and backend-generated tag to `origin`, independent of local push configuration.
- Add npm-native `project sdk-status` and `project update-sdk` commands with Git-root preflight,
  separate declared/locked/installed/wanted/latest state, compatible package-scoped updates,
  dry-run output, and post-update verification. Dependency maintenance remains separate from
  application versioning, Git release actions, and backend deployment.
- Keep consumer documentation and packaged agent guidance aligned with the new SDK lifecycle
  commands while leaving authenticated MCP guidance refresh explicit.

## 0.1.13

- Register newly generated or inaccessible project-sync SSH keys through the owning Project and
  verify the forced identity with a dry-run push before versioning, backend tagging, or Git mutation.

## 0.1.12

- Require registered Main Sequence Vite applications to use the Git repository root for npm,
  project identity, agent guidance, and `project sync`; nested project directories now fail
  preflight instead of being treated as deployable project roots.

## 0.1.11

- Publish the SDK from its dedicated SDK-only repository boundary, with one public workspace and no private Command Center application code or release assumptions.
- Skip consumer agent-skill installation when npm lifecycle hooks run inside the SDK source repository.
- Clean SDK build output before compilation and packing so files generated from removed source cannot enter release tarballs, and build SDK declarations before checking public consumer fixtures in clean environments.
- Align contributor guidance, public export topology, and documentation-site metadata with the SDK-only repository.

## 0.1.10

- Add a public `/navigation` entrypoint with a validated application-to-sub-application-to-
  destination model, collision-safe contribution composition, and controlled React application
  rail, grouped panel, and shell primitives.
- Migrate Command Center applications and grouped destination panel to the public SDK primitives
  while leaving routing, access filtering, favorites, branding, and user actions in the host.

## 0.1.9

- Complete the project-owned static-site FastAPI transport with public lifecycle state,
  cancellation, one bounded credential refresh after `401`, replay-safe cold-start and transport
  retry, and exact `403`/`404`/`502`/`503`/`504` classification.
- Add real cross-origin Chromium coverage for iframe origin binding, CORS preflight, canonical
  `X-Resource-Release-UID`, credential refresh, bounded retries, cancellation, and the absence of
  credential persistence or browser-visible leakage.
- Remove obsolete hostname-derived FastAPI routing authority from the Command Center
  AppComponent integration while preserving the versioned resource-release exchange endpoint.
- Keep discovery filters as backend query-capability metadata and render only the standard search
  input unless a host explicitly supplies a product-designed scope selector.

## 0.1.8

- Implement the static-site delegated FastAPI credential bridge through the public `/embed` and
  `/embed/react` entrypoints. Add strict version-one wire messages, schema fixtures, a manifest
  entry, an injected host resolver, sanitized errors, in-memory single-flight credential refresh,
  and the high-level child `fetchFastApi` API without exposing the host session or persisting
  delegated credentials.
- Integrate the Foundry static-site viewer through the public resolver boundary and validate the
  backend-issued source UID, target UID, iframe origin, RPC URL, and expiry before the SDK can send
  a delegated credential to the managed iframe.

## 0.1.7

- Move the static-site delegated FastAPI credential bridge decision into the SDK package's own
  architecture-decision catalog and keep application-specific Foundry integration outside the
  reusable package boundary.

## 0.1.6

- Add the dependency-free `command-center-sdk project sync` workflow for registered npm projects.
  It aligns with Python project sync by resolving the current Git branch to its backend
  `ProjectBranch` before mutation, using the backend-returned branch-specific deployment tag
  unchanged, refreshing the npm lockfile, committing the complete working tree, and pushing the
  annotated tag that triggers automatic deployment. Ship matching project-maintenance guidance.
- Add `command-center-sdk theme audit` and strengthen the packaged theme and static-iframe skills
  so themed consumers fail on unknown tokens, literal fallbacks, hardcoded semantic visual values,
  or aliases that do not resolve to published SDK variables. Require computed-style verification
  across representative dark and light presets instead of treating theme delivery as completion.
- Publish font-weight, letter-spacing, and text-transform tokens, migrate SDK-owned theme skins to
  consume them, and make the audit reject hardcoded values for those typography properties.
- Bring the SDK shared component stylesheet under the same mandatory closed-token audit, remove
  literal fallbacks and legacy destructive-token names, and publish the remaining typography,
  radius, transparency, spinner, and overlay-shadow tokens used by SDK components.

## 0.1.5

- Render the unified deployment-run pipeline contract across Foundry history and release details, including ordered substages, per-step state, timestamps, errors, artifacts, optional markers, and step-scoped logs.
- Request deployment history with backend-owned newest-first ordering and target UID filtering instead of filtering release runs in the client.
- Align discovery column renderers with the backend `state`, `pipeline`, and `source` column identifiers.

## 0.1.4

- Add strict `command-center-sdk skills sync` support for the authenticated, ontology-declared MCP
  platform catalog. Install backend-owned skills under `.agents/skills/mainsequence`, track and
  overwrite only MCP-managed folders, preserve Python and project-owned content, and make the
  postinstall MCP lane best-effort without weakening the existing packaged-skill installation.
- Publish strict `command-center.resource_discovery@v1` TypeScript/runtime and draft-2020-12 schema
  contracts with fixtures; add `ResourceAdapter.discover`, safe compound identity and generic
  column helpers, and make `ResourceListPage` use discovery as the authority for identity,
  controls, ordered columns, and actions without refetching on pagination alone.
- Replace the narrow surface chooser with `build-command-center-application`, a single application
  ontology and routing skill covering the host embed boundary, themes, resource
  lists and details, action placement, portable widgets, workspaces, and backend-contract routing.
  It routes implementation to focused skills without duplicating canonical contracts.
- Install consumer skills in a nested SDK-surface hierarchy, add contract-first workflows for
  resource collections, bulk actions, Adapter From API, Table/Pro Table, AppComponent/Mock JSON,
  Tabular Transform, and language-neutral contracts, and keep SDK-maintainer workflows local to the
  source package. Contract skills now resolve the canonical `contracts/manifest.json` bundle rather
  than repeating schemas or fixtures. No public JavaScript or serialized contract changed.
- Publish language-neutral v1 authoring schemas and conformance fixtures for AppComponent with
  Mock JSON, Tabular Transform, and canonical workspace documents; wire both widget manifests to
  the matching persisted-props schema definitions without changing widget IDs or stored bytes.
- Move the existing `core__app-component` and `core__tabular-transform` identities into portable
  SDK built-ins. AppComponent includes Mock JSON and injectable/manual transport primitives;
  Tabular Transform includes generic transform execution. Trusted hosts keep authenticated,
  product-target, and richer incremental behavior as trusted host runtime overrides.
- Move the existing `core__table` and `core__pro-table` identities into portable SDK built-ins
  with shared frame, selection, output, formula, preview, and settings behavior; add narrow Table
  and Pro Table package subpaths while keeping Enterprise licensing and product services in the
  host runtime override.
- Publish `command-center.table_widget_authoring@v1` as TypeScript plus draft-2020-12 JSON Schema
  with valid/invalid fixtures so backend and agent authors can design persisted Table instances
  without reverse-engineering the application. Define source-owned `meta.tableVisuals` inside the
  canonical tabular-frame schema with its own positive and negative fixtures.
- Export the existing `mainsequence.*`, version-one static-site iframe context protocol through
  `/embed`, including typed host/client controllers and the `/embed/react` `StaticSiteIframe` host.
- Export the existing static-site theme and public-user-UID handshake through the SDK without
  changing the wire contract or exchange-launch backend flow.
- Ship the `integrate-static-site-iframe` agent skill and clarify its boundary from the generic
  `command-center-iframe@v1` external-widget skill.
- Replace the legacy consumer-specific normalization handoff with task-oriented public guides for setup,
  resources, widgets/workspaces, themes/embeds, and SDK extension/release workflows. Map every
  packaged skill to the matching human guide, ship those guides in the npm tarball, and enforce
  that parity in tests.
- Publish a language-neutral contract manifest, draft-2020-12 schemas, and indexed positive and
  negative fixtures for tabular frames, normalized resource collections, and bulk-action
  discovery, execution, and preflight payloads.
- Publish strict Adapter From API discovery, query, public-config, and secure-config v1 contracts.
  Each operation declares the exact provider response contract; Adapter From API performs no
  response extraction or coercion and exposes no compatibility mapping fields. Health checks use
  the SDK `AdapterFromApiHealthDefinition`, referencing one declared safe GET operation instead of
  duplicating an endpoint URL.
- Refine `TabularTimeSeriesMeta` into long/wide discriminated variants so TypeScript requires the
  same `valueField` or `valueFields` semantics already enforced by normalization and the schema.

## 0.1.2

- Ship consumer-facing SDK skills with the npm package.
- Install the version-matched skill bundle automatically for local dependencies during
  `postinstall` while retaining an explicit, dry-runnable, JSON-capable CLI command.
- Record managed skill provenance in `.agents/skills/command-center/PINNED_FROM.txt`.

## 0.1.1

- Add shared resource-cell rendering and align consumer list/detail navigation behavior.
- Publish the Project infrastructure widget's explicit logical Project and ProjectBranch
  configuration contract.
- Update package layout, documentation, and validation for the consolidated SDK workspace.

## 0.1.0

- Establish the unified SDK package.
- Add generic resource definitions and adapter contracts.
- Add the conventional HTTP resource adapter.
- Add reusable pagination models, pagination view, and React selection state.
- Add cancellable resource-activation adapters, a blocking resource-transition shell, and
  host-owned semantic navigation handoff.
- Absorb the former contracts, widget SDK, widget host, generic built-ins, workspace model,
  workspace React renderer, theme, and iframe bridge implementations into SDK subpath exports.
- Preserve widget IDs, workspace schema values, theme IDs, and the `command-center-iframe@v1`
  protocol while removing the independent package workspaces.
