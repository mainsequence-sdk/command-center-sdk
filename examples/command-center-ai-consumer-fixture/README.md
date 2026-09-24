# Packed Chat Consumer Fixture

Standalone TypeScript consumer used to prove that `@dev-mainsequence/command-center-ai` installs next to the
Command Center SDK as an application installs them, and works through the published export maps of
both. Release CI installs the chat and SDK tarballs together in a temporary directory, as
`scripts/verify-packed-consumer.mjs` does, and compiles `src/consumer.tsx`.

`src/consumer.tsx` loads the SDK's theme, component, and markdown stylesheets and then the chat's,
builds a connection with a request-URL rewrite, mounts `ChatEngineProvider` with an Agent's default
session behind a stable handle, and renders `ChatThread`, `ModelProviderSettings`, and
`AgentConnectingState` with the SDK's `Button`.

This fixture must not import `@/`, `src/`, `dist`, or a path inside either package.

## Validation Contract

- Keep the package dependencies pointed at the public package names.
- The release workflow replaces them with freshly packed tarballs in an isolated temporary
  installation: the chat's and the SDK's.
- `examples:check` compiles it in the repository against the workspace packages.
- Add one minimal import or use case when the chat publishes a new public entrypoint.

See the [fixture conventions](../../docs/packages/sdk-consumer-fixture.md) and the
[publishing guide](../../docs/packages/publishing.md).
