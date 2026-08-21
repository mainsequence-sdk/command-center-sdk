# Repository Scripts

Repository-level SDK validation, packing, and publication scripts live here.

## Package Boundary Validation

- `check-package-boundaries.mjs` rejects imports that couple the SDK to Command Center application
  internals or bypass declared package exports.
- `check-package-boundaries.node.mjs` tests the validator against fixtures under
  `fixtures/package-boundaries/`.

Run both checks with:

```bash
npm run boundaries:check
npm run boundaries:test
```

## Public Package Releases

- `public-package-graph.mjs` discovers the public package and resolves release order.
- `validate-public-packages.mjs` enforces publish metadata, exports, licenses, changelog, and
  registry-safe dependencies.
- `list-public-packages.mjs --matrix` supplies the release workflow matrix.
- `publish-public-packages.mjs` builds, skips existing versions, and publishes with provenance.
- `verify-packed-consumer.mjs` compiles an isolated consumer against the packed tarball.
- `check-package-size.mjs` enforces entry-bundle budgets after build.

`@dev-mainsequence/command-center-sdk` is the only public package in this repository.
