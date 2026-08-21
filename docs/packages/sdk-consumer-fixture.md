# `command-center-consumer-fixture`

## Role

This standalone example is a release-validation consumer, not a package workspace. It proves that the
unified SDK can be packed, installed, imported through its declared export map, and compiled without
monorepo aliases, source traversal, or any other Command Center package.

## Coverage

- defines a typed resource application;
- uses the conventional HTTP resource adapter;
- declares columns, actions, and detail tabs;
- renders an SDK-owned resource pagination view;
- resolves contracts, embed, widget, widget host, built-ins, widget testing/UI, workspace,
  workspace React, theme, palette, preset, and stylesheet export maps; and
- compiles against the tarball produced by the release workflow.

## Constraints

The fixture must never import `@/`, repository `apps/command-center/src/`, `apps/command-center/extensions/`, another package's source, a
legacy Command Center package, or a private host. It should stay intentionally small: its purpose
is export-map and package installation validation, not end-to-end application coverage.

## Related

- [Fixture README](https://github.com/mainsequence-sdk/command-center-sdk/blob/main/examples/sdk-consumer-fixture/README.md)
- [Publishing](./publishing.md)
- [Package architecture](./architecture.md)
