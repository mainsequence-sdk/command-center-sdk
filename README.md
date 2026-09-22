# Command Center SDK

This repository is the canonical source for the public
`@dev-mainsequence/command-center-sdk` TypeScript and React package. It contains reusable
application navigation, responsive layout, resource views, feedback, themes, static-site iframe
integration, backend schemas, consumer skills, and package verification tooling.

Product applications, product routes, authentication, backend transports, persistence, and
deployment configuration are outside this repository.

## Install

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Import only entrypoints declared by the package. Do not import repository source paths or `dist`
files.

## Documentation

- [SDK overview](./command-center-sdk/README.md)
- [Getting started](./command-center-sdk/docs/getting-started.md)
- [Application navigation](./command-center-sdk/docs/navigation.md)
- [Application layout](./command-center-sdk/docs/application-layout.md)
- [Resources](./command-center-sdk/docs/resources.md)
- [Themes and static-site embeds](./command-center-sdk/docs/themes-and-embeds.md)
- [Local Vite/FastAPI example](./examples/static-site-vite-fastapi/README.md)
- [Backend contracts](./command-center-sdk/docs/backend-contracts.md)
- [Extending and releasing](./command-center-sdk/docs/extending-and-releasing.md)

## Development

```bash
npm install
npm run check
npm test
npm run docs:build
```

The repository publishes one SDK package. Root checks validate its public boundary, compile the
consumer fixture, run package tests, build declarations, and enforce size budgets.
