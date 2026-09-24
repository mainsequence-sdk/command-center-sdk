# Publishing and Releases

The repository publishes two public packages: `@dev-mainsequence/command-center-sdk` and
`@dev-mainsequence/command-center-ai` (SDK ADR 012). The release workflow publishes new
versions in dependency order, the SDK before the chat, skips versions already on npm, and stops at
the first failure.

## Release flow

1. Update the package version and changelog.
2. Run `npm run check`, `npm test`, and `npm run docs:build`.
3. Run the packed-consumer verification, which installs each public package in its own clean
   consumer (`node scripts/verify-packed-consumer.mjs`), and the SDK's package smoke test.
4. Inspect `npm pack --dry-run` output for unexpected files.
5. Publish from a trusted release workflow.

The release must contain declarations, JavaScript, exported CSS, schema bundles, documentation,
and packaged skills that match the declared public entrypoints. Source-only aliases and repository
paths are never part of the consumer contract.

## Compatibility

Package versions, backend contract versions, iframe protocol versions, and persisted theme IDs are
independent compatibility axes. A release note must identify every affected axis and any required
backend or consumer rollout order. A chat release also names the SDK range it accepts and the
platform routes and platform version it expects.
