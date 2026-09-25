# Command Center SDK

This repository is the canonical source for the public
`@dev-mainsequence/command-center-sdk` TypeScript and React package. It contains reusable
application navigation, responsive layout, resource views, feedback, themes, static-site iframe
integration, backend schemas, consumer skills, and package verification tooling.

Product applications, authentication, persistence, and deployment configuration are outside this
repository. Product routes and backend transports are outside the SDK package; Command Center AI is
bound to the platform's routes by design.

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
- [Command Center AI](./command-center-ai/README.md) and [its guides](./command-center-ai/docs/README.md)

## Development

```bash
npm install
npm run check
npm test
npm run docs:build
```

The repository publishes two public packages: the SDK and `@dev-mainsequence/command-center-ai`, in `command-center-ai/`
([SDK ADR 012](./docs/packages/adr/adr-sdk-012-chat-as-a-second-public-package.md)). Command Center AI
depends on the SDK as a peer; the SDK depends on nothing of it and names it only where its general
skills and their guides send someone who needs AI capabilities to it. Root checks validate each
package's public boundary and that one-way dependency, compile the consumer fixtures, run package
tests, build declarations, and enforce size budgets.
