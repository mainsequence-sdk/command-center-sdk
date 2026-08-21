# Contributing to the Command Center SDK

Thanks for contributing.

This repository owns one public package: `@dev-mainsequence/command-center-sdk`. Changes should
preserve its public entrypoints, consumer compatibility, documentation, and package boundary.

## Before You Start

- Read the top-level [README.md](./README.md) and [SDK README](./command-center-sdk/README.md).
- Read the nearest module `README.md` and the matching guide under `command-center-sdk/docs/`.
- Use only public package exports; do not add application aliases, host routes, authentication,
  deployment configuration, or product-specific persistence.
- Review `command-center-sdk/contracts/manifest.json` before changing serialized data.

## Local Setup

Install repository dependencies:

```bash
npm install
```

Install documentation dependencies when changing the docs site:

```bash
npm --prefix docs-site ci
```

Run the SDK checks and build:

```bash
npm run check
npm run test
npm run build
```

Start the SDK documentation site when needed:

```bash
npm run docs:dev
```

## Development Expectations

### Keep public modules synchronized

- Keep source exports, declarations, package metadata, tests, docs, and examples aligned.
- Every major SDK module must keep its nearest `README.md` current.
- Public workflows must use published package paths, never repository source or `dist` imports.

### Preserve the SDK boundary

- Keep reusable contracts, views, widgets, workspaces, themes, embeds, and navigation in the SDK.
- Keep product routes, authentication, backend transports, permissions, and deployment outside.
- Treat schema IDs, protocol IDs, widget IDs, and persisted fields as compatibility boundaries.

### Document compatibility impact

- Serialized changes require matching TypeScript, runtime validation, schemas, fixtures, and
  migration guidance.
- Internal-only changes must record why public APIs and backend contracts are unaffected.
- Package or CLI changes require packed-consumer coverage and a changelog entry.

## Validation

Run the complete SDK lane before opening a pull request:

```bash
git diff --check
npm run check
npm run test
npm run build
npm --workspace @dev-mainsequence/command-center-sdk run test:package-smoke
```

If your change affects docs, also run:

```bash
npm run docs:build
```

## Pull Requests

PRs should be small enough to review and explicit about behavior changes.

Include:

- what changed
- why it changed
- any configuration or migration impact
- screenshots or short clips for public React or CSS changes when useful

If your PR changes APIs or data contracts, note the affected endpoints or payload shape directly in the PR description.

## Commit Style

There is no strict commit-message convention enforced here, but keep messages concrete and scoped.

Good:

- `feat(sdk): add controlled navigation composition`
- `fix(cli): isolate source-repository postinstall`
- `docs: clarify backend contract ownership`

Bad:

- `fix stuff`
- `updates`

## Reporting Issues

When filing a bug, include:

- expected behavior
- actual behavior
- steps to reproduce
- screenshots if visual
- compiler, test, package, or runtime errors if relevant

For environment-sensitive issues, include:

- operating system and Node version
- browser when React or iframe behavior is involved
- the package version and public import path

## Questions

If a change is architectural or broad enough that the right home is unclear, open an issue or draft PR first instead of pushing a large unreviewable refactor.
