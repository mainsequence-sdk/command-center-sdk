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

## Package Direction Validation

The chat depends on the SDK, and the SDK knows nothing about the chat
([SDK ADR 012](../docs/packages/adr/adr-sdk-012-chat-as-a-second-public-package.md)).

- `check-package-direction.mjs` reads every file under `command-center-sdk/`, whatever its type,
  except build output and installed dependencies. It fails when one contains
  `@dev-mainsequence/chat`, holds a path that resolves into `chat/`, links into `chat/` on the
  repository's GitHub, or is a symbolic link into `chat/`, and when the SDK's `package.json` lists
  the chat in a dependency field. It reads text: a path that code assembles at run time from
  separate segments is left to review. The rule holds before the chat's workspace exists.
- `check-package-direction.node.mjs` tests the check against fixtures under
  `fixtures/package-direction/`.

Run both checks with:

```bash
npm run direction:check
npm run direction:test
```

## Public Package Releases

- `public-package-graph.mjs` discovers the public package and resolves release order.
- `validate-public-packages.mjs` enforces publish metadata, exports, licenses, changelog, and
  registry-safe dependencies.
- `list-public-packages.mjs --matrix` supplies the release workflow matrix.
- `publish-public-packages.mjs` builds, skips existing versions, and publishes with provenance.
- `verify-packed-consumer.mjs` compiles an isolated consumer against the packed tarball.
- `clean-sdk-dist.mjs` removes only the SDK build output before compilation so deleted source files cannot survive into a package.
- `check-package-size.mjs` enforces entry-bundle budgets after build.

`@dev-mainsequence/command-center-sdk` is the only public package in this repository.
