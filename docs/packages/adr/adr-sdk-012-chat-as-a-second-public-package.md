# SDK ADR 012: The Chat as a Second Public Package

- Status: Accepted
- Date: 2026-09-23
- Implementation: `@dev-mainsequence/chat` unreleased (planned 0.1.0)
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/chat`
- Related:
  - [Command Center ADR 097: Upstreaming the Chat Package to the Command Center SDK Repository](https://github.com/Main-Sequence-Server-Side/CommandCenter/blob/main/docs/adr/packages/adr-097-upstream-chat-package-to-command-center-sdk.md)
  - [Command Center ADR 096: The Chat as One Independent Package](https://github.com/Main-Sequence-Server-Side/CommandCenter/blob/main/packages/chat/docs/adr/adr-096-independent-chat-package.md),
    which moves into the chat's `docs/` with the package
  - [SDK ADR 011: Public Control and Form Primitives](../../../command-center-sdk/docs/adr/adr-sdk-011-public-control-and-form-primitives.md)
  - Repository policy: [architecture](../architecture.md), [compatibility](../compatibility.md),
    [publishing](../publishing.md), [packed consumer fixtures](../sdk-consumer-fixture.md)

## Publication status

The repository policy and tooling of section 1 are implemented in the repository. The chat's code
is not here yet: it is copied in as one commit when Command Center ADR 096 is done (section 6). No
version of `@dev-mainsequence/chat` is on npm. A consumer may install the chat only when the
registry has a version of it; this record or a newer checkout does not make the package available.

## Decision summary

The repository publishes a second public package, `@dev-mainsequence/chat`, from a workspace at
`chat/` next to `command-center-sdk/`. It is the chat that talks to the Main Sequence platform: a
backend connection, a session engine, the chat UI and the model-provider screens, with a
standalone example. It depends on the SDK as a peer dependency. The SDK knows nothing about it:
nothing under `command-center-sdk/` names it, imports, tests, verifies or installs it, and
`npm run check` fails when something does. The chat ships and installs its own skills. The rule
that keeps backend transports and product routes out of the repository becomes a rule of the SDK
package; the chat is bound to the platform's routes by design.

## Context

The chat has become one package independent of the Command Center application (Command Center
ADR 096) so that anyone can build a chat application that talks to the platform Command Center
talks to. A private workspace cannot be installed by anyone else. This repository already has a
release lane, a docs site, an ADR catalog and packaged skills. Command Center ADR 097 decides that
the chat comes here as its own package, depending on the SDK as a peer in one direction only, and
names what this record decides.

Measured on `main` at 0.5.2, before this decision:

- `public-package-graph.mjs` reads every workspace, validates public-package metadata, and orders
  a package after the public packages it depends on, peers included. `publish-public-packages.mjs`
  publishes in that order and stops the dependants of a failure. The tooling handles several
  packages.
- The policy said one. `validate-public-packages.mjs` failed unless the SDK was the only public
  package, and `docs/packages/`, `scripts/README.md`, the root README, CONTRIBUTING and AGENTS
  said so and kept product routes and backend transports out of the repository.
- The release workflow built the SDK in every package job (`npm run sdk:build`), ran the SDK
  workspace's browser tests only, and installed every packed public package into the SDK's
  consumer fixture. The root `check` and `test` ran the SDK's scripts only.
- `check-package-boundaries.mjs` runs on every public workspace. It rejects application aliases
  and path prefixes, absolute paths, relative imports that leave the package, and the bare imports
  `@tanstack/react-query`, `react-router-dom` and `zustand`. A bare import of the SDK is allowed.
- The docs site publishes `command-center-sdk/docs/`, which also ships inside the SDK package.
- Nothing checked which way two packages of the repository may depend on each other.

## Decision

### 1. Repository policy: two public packages, one direction

**Two public packages.** The repository publishes `@dev-mainsequence/command-center-sdk` from
`command-center-sdk/` and `@dev-mainsequence/chat` from `chat/`. `validate-public-packages.mjs`
allows exactly these two, the chat once `chat/package.json` exists, and fails on any other public
package and on a chat workspace that is not a public root workspace.

**One direction.** The chat depends on the SDK. The SDK does not depend on, import, test, verify or
install anything of the chat.

- The chat declares the SDK as a peer dependency, never a regular one, so an application has
  exactly one SDK: one stylesheet and one set of `cc-*` classes. React and React DOM are peers for
  the same reason.
- `scripts/check-package-direction.mjs`, part of `npm run check`, fails when a file under
  `command-center-sdk/` (any type; build output and installed dependencies excepted) contains
  `@dev-mainsequence/chat`, holds a path that resolves into `chat/`, links into `chat/` on this
  repository's GitHub, or is a symbolic link into `chat/`, and when the SDK's `package.json` lists
  the chat in a dependency field. It reads text: a path that code assembles at run time from
  separate segments is left to review.
- The SDK's changelog, guides, ADR catalog, skills and tests do not mention the chat, and the
  SDK's skill installer is unchanged: it keeps owning only its own namespace. This record lives in
  `docs/packages/adr/` because `command-center-sdk/docs/` ships inside the SDK package.

**The boundary, per package.** The exclusion of product routes and backend transports stays for
the SDK package. The chat is bound to the platform's routes by design (Command Center ADR 096,
section 3) and says so in its documentation: it calls them through a connection the application
gives it (base URL, token and its refresh, an optional request-URL rewrite), reads no environment
variable, and stores no credential. Both packages keep the rest of the repository boundary: no
Command Center application code, application alias, router or host store, and no deployment
configuration or environment file. The repository boundary check applies to both.

**The release lane runs per package.**

- The `package` job builds its matrix package after the public packages it depends on, then runs
  that package's `check` and `test` and packs it.
- The `browser` job runs for each public package that has a `test:browser` script, after building
  the public packages it depends on.
- `verify-packed-consumer.mjs` verifies each public package in its own clean consumer. The SDK's
  fixture, `examples/sdk-consumer-fixture/`, gets only the SDK tarball. The chat's fixture,
  `examples/chat-consumer-fixture/`, gets the chat and SDK tarballs installed together, as an
  application installs them. The convention is `examples/<workspace directory>-consumer-fixture/`,
  the SDK's fixture keeping the name it had; a public package without a fixture fails the
  verification.
- The root `check` and `test` run the scripts of every public package, a package after the
  packages it depends on.
- `ci.yml` and `command-center-packages.yml` watch `chat/**`; `deploy-docs.yml` watches
  `chat/docs/**`.

### 2. The chat package

**Layout.**

| Path | Holds |
| --- | --- |
| `src/backend/` | The backend connection: the connection input, a client for each platform route and Agent-runtime route the chat calls, and the error helpers. Framework-neutral. |
| `src/engine/` | The session engine: choosing, or getting or creating, the session behind a stable handle, hydration, runtime access and readiness, the model selection, sending, cancelling, and the queue. |
| `src/ui/` | The chat UI: the assistant-ui runtime adapter, the thread, the composer with its provider, model and thinking picker, the connecting, readiness and model-required states, actors and provenance, agent icons, and the chat's own select, dialog, password input, confirmation dialog, markdown renderer and notification surface. |
| `src/model-providers/` | The model-provider screens: the catalog with built-in provider sign-in and sign-off, Organization custom providers and their models, and the direct test conversation. |
| `src/index.ts` | The root export. |
| `styles.css` | The chat stylesheet: prefixed class names and only the theme variables the SDK publishes, audited by `command-center-sdk theme audit`. |
| `standalone/` | The standalone example: a chat application built only on the chat and the SDK; the development bed and the target of the browser tests. |
| `docs/` | Guides and records (section 3). |
| `agent_scaffold/skills/`, `cli/` | The consumer skills and their installer (section 4). |
| `scripts/` | The chat's own boundary check, run by its `check`, with the SDK on its allowlist as a peer only. |

`src/backend/` and `src/engine/` exist in the chat's source today. The other names under `src/` are
the target; if the imported code settles on other names, the import updates this table.

**Build and exports.** `tsc` with NodeNext to `dist/`, with declarations and source maps and `.js`
on every relative import, as the SDK builds.

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./styles.css": "./styles.css",
    "./package.json": "./package.json"
  },
  "sideEffects": ["*.css"]
}
```

The root export is the chat's whole public API; a narrower subpath, such as the backend connection
alone, is an additive decision for later. `files` lists what a consumer and its agent need:
`dist`, `styles.css`, `docs`, `agent_scaffold`, `cli`, the standalone example the skills point at,
`README.md`, `CHANGELOG.md` and `LICENSE`. `npm pack --dry-run` lists nothing else.

**Dependencies.** `@assistant-ui/react`, `@assistant-ui/core`, `assistant-stream`, `lucide-react`,
`react-markdown`, `remark-gfm`, `rehype-raw` and `rehype-sanitize`, with registry ranges only.

- `@assistant-ui/react`, `@assistant-ui/core` and `assistant-stream` are one family, used partly
  through unstable entry points. They move together, in a chat release, with the chat's tests.
- `lucide-react` uses the SDK's range, so an application gets one copy.
- The markdown renderer keeps the order it has in Command Center: `remark-gfm`, then `rehype-raw`
  followed by `rehype-sanitize`, so raw HTML in an Agent's answer is sanitized before it renders.

**Peer dependencies.** `@dev-mainsequence/command-center-sdk` `^0.5.0`, the first SDK with
`/controls`; `react` and `react-dom` `>=18 <20`, the SDK's range. While the SDK is 0.x its caret
range stops at the next minor, so the change that releases a new SDK minor also widens the chat's
range and releases the chat. The lower bound rises when the chat starts to need a newer SDK.

**First version.** `0.1.0`.

**Changelog.** Every release opens with a "Compatibility axes" paragraph, as the SDK's releases do.
It names the npm public API and, when they change, the stylesheet's class names, the installed
skills and the browser storage keys. It always names two axes the SDK does not have:

- the SDK range the release accepts; and
- the platform routes it calls, with their payloads, and the platform version it expects. A route
  the release adds, drops or calls differently is named with the rollout order it needs.

### 3. Documentation

- The chat's `docs/` holds its guides: mounting the chat, connecting to the platform, model
  providers, the conversation contract, and operations.
- The records that move with the package (Command Center ADR 060, 087, 090, 093 and 096, and the
  contract half of ADR 092) keep their numbers and titles as historical records, because the code
  cites them ("ADR 093", "ADR 060").
- New chat decisions are `SDK ADR NNN` records with `Package: @dev-mainsequence/chat` in the
  chat's `docs/adr/`. The repository keeps one `SDK ADR` sequence and files each record with what
  it governs, which is why this one is in `docs/packages/adr/` and the SDK's catalog has no 012.
- The docs site publishes the chat's `docs/` as its own section, wired when the code arrives.
- The chat's documentation map names every skill with its human guide, and a test fails when a
  skill has none, as the SDK's `docs-skills` test does.

### 4. Skills

The chat ships its consumer skills and installs them itself: its own postinstall and CLI command,
dependency-free, writing into `.agents/skills/chat/` with its own provenance file. Like the SDK's
installer it owns only its namespace, leaves every other one untouched, the SDK's
`command-center/` included, and skips installation inside this source repository. The chat's
skills may refer to the SDK's skills, which every chat application has installed; the SDK's skills
never refer to the chat's.

| Skill | What it teaches |
| --- | --- |
| `build-chat-application` | Mount the chat in a Vite application that uses the SDK: install the chat next to the SDK, load the SDK stylesheets and the chat stylesheet once, the inputs (connection, token and refresh, active Environment and user, notification and navigation callbacks), choosing the Agent and getting or creating the session behind a stable handle, the standalone example as the golden asset, and verification against the scripted stand-in and in a browser. |
| `connect-chat-to-the-platform` | The base URL, the bearer token, the request-URL rewrite and where the request is going (`platform` or `agent-runtime`), the same-origin forwarder (the dev server's proxy, the site's own FastAPI with a server-side identity), which origins the platform and the Agent's runtime allow, never a token in a build variable, and the failure states: 401 and 403 with token refresh, an unreachable platform, and a CORS rejection that the browser cannot tell from an unreachable host. |
| `manage-model-providers` | The three screens: the catalog with built-in provider sign-in and sign-off, Organization custom providers and their models, and the direct test conversation with its HTTPS and CORS constraints; secrets re-entered and never persisted. |
| `design-agent-conversation-capabilities` | The conversation contract as the chat renders it, so an Agent's answers are designed for what the chat can show: the `ui-message-stream` parts (text, reasoning shown as chain of thought, tool calls with name, status, input and result, the MCP badge for tools named `mainsequence__*`, step boundaries), what the platform's history keeps after a reload, who is speaking (provenance, actors and avatars, real Agent names, agent icons), the session's model settings and the model-required state, readiness and wake, held and queued messages, insights, cancel, and what is not rendered (files, sources, audio, attachments). For building the Agent itself it points to the platform's own skills; the Agent runtime's protocol is not this repository's to document. |

Every skill has a human guide, pinned by the test of section 3.

### 5. Release

The first version, 0.1.0, is published by the existing workflow on a push to `main`, after the SDK
version it requires. `publish-public-packages.mjs` publishes the SDK before the chat, skips versions
already on npm, and stops the chat when the SDK fails; `packed-consumer` has installed the chat's
tarball next to the SDK's before `publish` runs. SDK 0.5.x is already on npm, so the first chat
release needs no SDK release.

### 6. Order of work in this repository

1. **This record and the amendments of section 1**, before any chat code. Gate: `check`, `test`,
   `build`, `docs:build`, the SDK package smoke test and the packed-consumer verification pass
   with a second public package allowed.
2. **Import the chat** as one commit, without its history: the workspace, declared in the root
   `workspaces`; the chat's consumer fixture, also compiled by `examples:check`; the docs-site
   section; its browser tests; its skills with their installer and guides; its changelog entry.
   Gate: the full repository lane on a pull request.
3. **Release 0.1.0** through the workflow. Gate: the version is on npm and its packed consumer
   installed it next to the SDK. This record then names its implementation version.

## Compatibility and release impact

- The SDK package does not change: no source, export, declaration, stylesheet, skill, contract,
  schema, fixture, iframe protocol, theme ID or storage change, and no SDK release or changelog
  entry.
- The repository tooling changes: the direction check, validation that allows the chat,
  per-package builds, browser tests and packed consumers, and root `check` and `test` over every
  public package. With the SDK as the only workspace, each runs what it ran before.

## Backend and storage impact

None. The chat calls the platform's existing routes with their existing payloads and keeps its
browser storage keys (Command Center ADR 096, sections 3 and 4). No route, setting or permission is
added. The routes and payloads it calls become public documentation; the platform stays the owner
of authorization, session ownership, and which Agents an Environment exposes.

## Alternatives considered

- **The chat as a `/chat` entrypoint of the SDK package.** Rejected. Every SDK consumer would
  install `@assistant-ui/react` and its churn, and a chat fix would need an SDK release.
- **A separate repository.** Rejected. The release lane, the docs site and the ADR catalog would
  be built a second time.
- **A regular dependency on the SDK.** Rejected. An application could end up with two SDKs: two
  stylesheets and two sets of `cc-*` classes.
- **The chat's skills installed by the SDK's installer.** Rejected. The SDK would have to know the
  chat.
- **One packed consumer for both packages.** Rejected. The SDK's fixture would install the chat,
  and the SDK would be verified with the chat beside it.
- **This record in the SDK's ADR catalog.** Rejected. `command-center-sdk/docs/` ships in the SDK
  package and is the SDK's documentation site; the record would put the chat inside the SDK.
- **The one-direction rule by review only.** Rejected. A link, an import or a test that reaches the
  chat is easy to add by mistake, and a check costs little.

## Consequences

- Someone building a chat application installs the chat next to the SDK they already use and gets
  the chat's skills from the chat package.
- The repository goes from one public package to two, and every lane of its tooling runs per
  package.
- The SDK's documentation, skills and changelog stay free of the chat. A reader finds the chat
  through the repository's README and `docs/packages/`, not through the SDK.
- The rule about backend transports and product routes becomes a per-package rule.
- While the SDK is 0.x, a new SDK minor ships with a chat release that widens the peer range.
- Every chat release states the SDK range it accepts and the platform routes and version it
  expects.
- The direction check reads text. A path that code assembles at run time is caught by review, not
  by the check.
