# Command Center SDK

This repository is the canonical source for the public
`@dev-mainsequence/command-center-sdk` TypeScript and React package. It contains reusable
navigation, resource views, widget and workspace contracts, themes, iframe integrations, backend
schemas, consumer skills, and package verification tooling.

The private Main Sequence Command Center application is not maintained in this repository. Product
routes, authentication, backend transports, persistence, deployment configuration, and application
code belong to the private Command Center repository.

## Install

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Load the browser styles once in a consumer entrypoint:

```ts
import "@dev-mainsequence/command-center-sdk/styles.css";
```

Use only exports declared by the package. Do not import repository source paths or `dist` files.

## Documentation

- [SDK overview](./command-center-sdk/README.md)
- [Getting started](./command-center-sdk/docs/getting-started.md)
- [Application documentation](./command-center-sdk/docs/application-documentation.md)
- [Application navigation](./command-center-sdk/docs/navigation.md)
- [Resources](./command-center-sdk/docs/resources.md)
- [Widgets and workspaces](./command-center-sdk/docs/widgets-and-workspaces.md)
- [Themes and embeds](./command-center-sdk/docs/themes-and-embeds.md)
- [Backend contracts](./command-center-sdk/docs/backend-contracts.md)
- [Extending and releasing](./command-center-sdk/docs/extending-and-releasing.md)

## Development

```bash
npm install
npm run check
npm run test
npm run build
```

The root scripts validate the public package boundary, compile SDK consumer fixtures, run SDK and
browser-independent tests, and enforce package size budgets. Browser tests remain available through
the package-local `test:browser` script.

## Repository Layout

```text
command-center-sdk/  package source, contracts, tests, docs, CLI, and packaged skills
examples/            external consumer and widget fixtures
scripts/             package validation, packing, and publication tooling
docs/packages/       repository-level package architecture and release policy
docs-site/           SDK documentation site
```

## Releases

Pull requests run checks and tests without producing a release artifact. Pushes to `main` run the
SDK build, packed-consumer verification, browser tests, and trusted npm publication for versions
that are not already published.
