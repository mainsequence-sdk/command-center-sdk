# Contributing to Main Sequence Command Center

Thanks for contributing.

This repository is a frontend platform, not a single app. Changes should preserve extension boundaries, documentation quality, and the ability to run the shell in both local mock mode and live integration mode.

## Before You Start

- Read the top-level [README.md](./README.md) for setup and project structure.
- Check the local docs in [`docs/`](./docs/) if you are changing architecture, widgets, dashboards, auth, or configuration behavior.
- Look for the nearest local `README.md` when working inside
  `apps/command-center/extensions/`, `apps/command-center/src/widgets/`, or another feature
  directory. Those files are part of the maintenance contract for the repo.

## Local Setup

Install the main app dependencies:

```bash
npm install
```

Install the docs-site dependencies if your change touches `docs/` or `docs-site/`:

```bash
npm --prefix docs-site ci
```

Start the app locally:

```bash
npm run dev
```

Start the docs locally:

```bash
npm run docs:dev
```

## Development Expectations

### Keep modules documented

- Every extension, widget, and major feature module should have a local `README.md`.
- If you add a new feature directory under `apps/command-center/extensions/`,
  `apps/command-center/src/widgets/`, or a similar area, add its `README.md` in the same change.
- If you change ownership, behavior, or architecture, update the nearest local README.

### Preserve extension boundaries

- Keep reusable platform code in shared areas.
- Keep product-specific behavior inside the owning extension.
- Do not move code into `apps/command-center/src/` if it belongs to an extension-owned domain
  module under `apps/command-center/extensions/`.

### Avoid hidden behavior changes

- If a change affects configuration, routes, storage shape, permissions, or backend contracts, document it in the relevant doc page or README.
- Keep persistence formats backward-compatible where practical, or document migrations clearly.

## Validation

Run the core checks before opening a pull request:

```bash
npm run check
npm run build
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
- screenshots or short clips for user-facing UI changes when useful

If your PR changes APIs or data contracts, note the affected endpoints or payload shape directly in the PR description.

## Commit Style

There is no strict commit-message convention enforced here, but keep messages concrete and scoped.

Good:

- `Add simple-table UML graph tab`
- `Refactor data node table settings layout`
- `Deploy docs to GitHub Pages`

Bad:

- `fix stuff`
- `updates`

## Reporting Issues

When filing a bug, include:

- expected behavior
- actual behavior
- steps to reproduce
- screenshots if visual
- console/API errors if relevant

For environment-sensitive issues, include:

- browser
- whether mock mode or live mode was used
- any relevant config or env overrides

## Questions

If a change is architectural or broad enough that the right home is unclear, open an issue or draft PR first instead of pushing a large unreviewable refactor.
