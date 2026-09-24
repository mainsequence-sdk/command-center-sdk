# Repository Scripts

Repository-level validation, packing, and publication scripts for the public packages live here.

## Package Boundary Validation

- `check-package-boundaries.mjs` rejects imports that couple a public package to Command Center
  application internals or bypass declared package exports. It runs on every public workspace.
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
  `@dev-mainsequence/command-center-ai`, holds a path that resolves into `command-center-ai/`, links into `command-center-ai/` on the
  repository's GitHub, or is a symbolic link into `command-center-ai/`, and when the SDK's `package.json` lists
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

- `public-package-graph.mjs` discovers the public packages and resolves release order: a package
  after the public packages it depends on, peers included.
- `validate-public-packages.mjs` enforces publish metadata, exports, licenses, changelog, and
  registry-safe dependencies, and allows exactly the SDK and, once `command-center-ai/package.json` exists, the
  chat.
- `list-public-packages.mjs --matrix` supplies the release workflow matrix; `--with-script <name>`
  keeps the packages that define that script, such as `test:browser` for the browser job.
- `run-public-package-scripts.mjs <script>...` runs npm scripts in every public package in release
  order; `--package <name>` limits it to that package and the packages it depends on, and
  `--dependencies-of <name>` to the packages it depends on. The root `check` and `test` and the
  release workflow use it.
- `publish-public-packages.mjs` builds, skips existing versions, and publishes with provenance.
- `verify-packed-consumer.mjs` packs every public package and compiles each package's consumer
  fixture in its own clean consumer, installed with the tarballs of the sibling packages it
  declares as dependencies or peers ([fixture convention](../docs/packages/sdk-consumer-fixture.md)).
- `clean-sdk-dist.mjs` removes only the SDK build output before compilation so deleted source files cannot survive into a package.
- `check-package-size.mjs` enforces entry-bundle budgets after build.

The public packages are `@dev-mainsequence/command-center-sdk` and, once its workspace exists,
`@dev-mainsequence/command-center-ai` (SDK ADR 012).
