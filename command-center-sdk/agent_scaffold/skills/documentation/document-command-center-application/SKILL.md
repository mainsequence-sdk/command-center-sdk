---
name: document-command-center-application
description: Create, migrate, validate, build, and review documentation shipped with a Command Center frontend. Use when a Vite application needs human application and technical documentation, an official Docusaurus site at /docs/, one npm toolchain and lockfile, generated SUMMARY and sidebar navigation, browser verification, or the command-center-sdk application docs init scaffold.
---

# Document A Command Center Application

## Establish The Documentation Boundary

Treat documentation as part of the frontend product. Keep its source, dependencies, validation,
build, and browser checks in the same repository and root npm dependency graph as the application.
Build the application first and emit Docusaurus into `dist/docs` so one static artifact contains
both the application and `/docs/`.

Do not copy a product-specific deployment workflow into another frontend. The SDK owns the
portable source and artifact recipe; the platform deployment workflow owns how `dist/` is uploaded
and served. Do not add private routes, authentication, environment files, or backend configuration
while documenting an application.

## Initialize The Official Scaffold

Run this command at the consuming frontend's Git and npm root:

```bash
npx command-center-sdk application docs init --path . --dry-run
npx command-center-sdk application docs init --path .
```

The initializer requires `package.json` and `package-lock.json`, rejects competing package-manager
lockfiles, aligns `.node-version` or `.nvmrc` with `engines.node` and the active Node runtime,
preserves existing files, and installs exact Docusaurus development dependencies with npm. Use
`--skip-install` only when dependency installation must be performed separately. Never introduce a
second documentation lockfile or a Yarn, pnpm, or Bun command into the generated workflow.

Keep `documentation/package.json` without a `type` field. The application may remain
`"type": "module"`, while the documentation boundary stays in Docusaurus's required ambiguous
module mode; `.mjs` keeps the generated configuration and sidebar explicitly ESM. Setting the
nested site to pure ESM can leave `require.resolveWeak` calls uncompiled in the server bundle and
fail static generation.

If documentation files or scripts already exist with different content, stop and integrate them
deliberately. Do not overwrite authored documentation or silently replace another Docusaurus
configuration.

## Use One Canonical Navigation Manifest

Maintain `documentation/navigation.json` as the ordered navigation source. Generate both
`docs/SUMMARY.md` and `documentation/sidebars.mjs` with:

```bash
npm run docs:sync
```

Commit all three files. `npm run docs:check` runs the generator in check mode and fails when a
generated file is stale, a navigation ID is unsafe or duplicated, or an authored page is omitted.
Do not edit generated navigation files by hand.

Keep two required top-level audiences:

- `docs/surfaces/` explains application behavior, workflows, visible states, and user-facing
  limitations without exposing secrets or unstable implementation trivia.
- `docs/technical/` explains architecture, public SDK entrypoints, API boundaries, runtime and
  build assumptions, testing, maintenance constraints, and operational ownership.

Use repository-relative links for source files and stable public links for external contracts.
Never place credentials, access tokens, private endpoint values, customer data, or copied private
API responses in the documentation.

## Preserve The Same-Artifact Contract

Keep these build invariants:

```text
npm run build
  -> npm run build:app
  -> npm run build:docs
  -> dist/index.html
  -> dist/docs/index.html
```

The Docusaurus `baseUrl` is `/docs/`. The generated configuration disables pages and blog routes,
uses the repository's `docs/` directory, and fails on broken links. If the application dev server
needs a `/docs/` proxy, configure it to the generated Docusaurus dev server without changing the
production output contract.

Keep the root `build` command as the release artifact gate. A standalone documentation build is
useful for diagnosis but does not prove that the deployable artifact contains both surfaces.

## Enforce The Toolchain

Run all documentation commands with one even-numbered Node.js LTS major at or above 20, declared by
`engines.node` and one root pin in `.node-version` or `.nvmrc`. Keep `package-lock.json`
authoritative and run npm from the repository root.

The toolchain check rejects mismatched Node declarations, a mismatched active runtime, competing
lockfiles, and a non-npm `packageManager`. It also detects the known combination of a lockfile
containing `postman-code-generators` and a root `packageManager`, because that dependency can invoke
a globally available Yarn during postinstall and conflict with Corepack. If OpenAPI generation is
added later, pin and review that plugin separately and verify its install lifecycle in a clean
environment; it is intentionally absent from the base scaffold.

## Validate Content And Behavior

Run:

```bash
npm run docs:check
npm run build
```

The documentation validator requires both audience roots, checks local Markdown links, verifies
navigation coverage, and forbids unclassified root pages. The Docusaurus build supplies the final
MDX, route, and broken-link validation.

Add or extend the consuming application's browser suite to verify all of these against the built
artifact or a production-equivalent static server:

1. the application's normal route still loads;
2. `/docs/` loads without a redirect loop;
3. one nested documentation deep link loads directly;
4. the application-to-documentation link opens `/docs/`;
5. the documentation back link returns to `/`; and
6. no same-origin asset request under `/docs/` returns an error.

Exercise at least the application's supported desktop browser and one narrow viewport. When the
application has light and dark modes, verify documentation in both. Do not treat a source-level
test or Docusaurus build alone as browser proof of the integrated artifact.

## Report The Result

Report the Node and npm versions used, changed navigation entries, validation command results,
application build result, documentation output location, and browser routes exercised. Call out
any platform-owned deployment change separately instead of implying that the SDK scaffold changed
deployment infrastructure.
