# `command-center-consumer-fixture`

## Role

This standalone example is a release-validation consumer. It proves that the
unified SDK can be packed, installed, imported through its declared export map, and compiled without
monorepo aliases, source traversal, or any other Command Center package.

## Coverage

- defines a typed resource application;
- uses the conventional HTTP resource adapter;
- declares columns, actions, and detail tabs;
- renders an SDK-owned resource pagination view;
- resolves contracts, embed, navigation, layout, feedback, resource, views, theme, palette, preset,
  and stylesheet export maps; and
- compiles against the tarball produced by the release workflow.

## Constraints

The fixture must never import `@/`, a host application's source, another package's source, a
legacy Command Center package, or a private host. It should stay intentionally small: its purpose
is export-map and package installation validation, not end-to-end application coverage.

## Consumer fixtures for every public package

`scripts/verify-packed-consumer.mjs` verifies each public package in its own clean consumer:

- The SDK's fixture is this one, `examples/sdk-consumer-fixture/`. It gets only the SDK tarball.
- Every other public package brings its own fixture at
  `examples/<workspace directory>-consumer-fixture/`; the chat's is
  `examples/command-center-ai-consumer-fixture/`. It gets the package's tarball and the tarballs of the sibling
  packages the package declares as dependencies or peers, installed together as an application
  installs them: the chat's fixture gets the chat and the SDK.
- A fixture has this fixture's shape: a `package.json` with a `check` script and its registry
  dependencies, a `tsconfig.json`, and `src/`. The verification copies only those, points the
  sibling packages at their tarballs, and runs `npm install --ignore-scripts` and `npm run check`.
- A public package without a fixture fails the verification, which names the path it expected.

## Related

- [Fixture README](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/examples/sdk-consumer-fixture/README.md)
- [Publishing](./publishing.md)
- [Package architecture](./architecture.md)
