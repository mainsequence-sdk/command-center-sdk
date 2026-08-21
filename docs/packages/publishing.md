# Publishing and Releases

Command Center publishes one platform artifact:

```text
@dev-mainsequence/command-center-sdk
```

## Release flow

1. Update the SDK version and changelog in a reviewed change.
2. CI validates the one-public-package invariant and package boundaries.
3. CI checks, tests, builds, and packs the SDK.
4. The isolated consumer installs only the generated SDK tarball plus normal third-party peers and
   compiles through the declared export map.
5. A merge to `main` publishes an unpublished SDK version with npm provenance.

Published artifacts are immutable. Rollback uses a corrected SDK version. Preview or breaking
releases use explicit prerelease versions and non-`latest` distribution tags.

## Workflow ownership

`.github/workflows/command-center-packages.yml` is the only Command Center platform package
workflow. It uses npm trusted publishing and provenance rather than a long-lived npm token. The
former dedicated themes workflow has been removed.

The trusted publisher must reference repository `mainsequence-sdk/command-center-sdk`, workflow
`command-center-packages.yml`, and package `@dev-mainsequence/command-center-sdk`.

## Legacy packages

Former public package workspaces have been removed from the repository. They must not be restored,
included in the public package matrix, or become dependencies of the SDK.

Already-published versions remain immutable and should be deprecated in npm with migration
guidance after equivalent SDK entrypoints are available.

See [Migrating from Legacy Packages](./migrating-from-legacy-packages.md) for exact replacement
imports.

## Independent compatibility axes

One npm version does not replace internal contract versions. Widget manifest APIs, widget
versions, workspace schemas, props/user-state versions, connection contracts, and iframe protocol
versions remain explicit and independently validated.
