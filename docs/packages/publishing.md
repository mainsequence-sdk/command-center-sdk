# Publishing and Releases

The repository publishes only `@dev-mainsequence/command-center-sdk`.

## Release flow

1. Update the package version and changelog.
2. Run `npm run check`, `npm test`, and `npm run docs:build`.
3. Run the packed-consumer smoke test.
4. Inspect `npm pack --dry-run` output for unexpected files.
5. Publish from a trusted release workflow.

The release must contain declarations, JavaScript, exported CSS, schema bundles, documentation,
and packaged skills that match the declared public entrypoints. Source-only aliases and repository
paths are never part of the consumer contract.

## Compatibility

Package versions, backend contract versions, iframe protocol versions, and persisted theme IDs are
independent compatibility axes. A release note must identify every affected axis and any required
backend or consumer rollout order.
