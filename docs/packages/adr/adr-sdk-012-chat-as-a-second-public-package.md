# SDK ADR 012: The Chat as a Second Public Package

- Status: Accepted
- Date: 2026-09-23
- Implementation: `@dev-mainsequence/command-center-ai` 0.0.1, with `@dev-mainsequence/command-center-sdk`
  0.5.3
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-ai` (named `@dev-mainsequence/chat` until 2026-09-24, before any
  release)
- Related:
  - Command Center ADR 097: Upstreaming the Chat Package to the Command Center SDK Repository
  - [ADR 096: The Chat as One Independent Package](../../../command-center-ai/docs/adr/adr-096-independent-chat-package.md),
    which moved into the chat's `docs/` with the package
  - [SDK ADR 011: Public Control and Form Primitives](../../../command-center-sdk/docs/adr/adr-sdk-011-public-control-and-form-primitives.md)
  - Repository policy: [architecture](../architecture.md), [compatibility](../compatibility.md),
    [publishing](../publishing.md), [packed consumer fixtures](../sdk-consumer-fixture.md)

## Publication status

The repository policy and tooling of section 1 are implemented, and the chat is in
`command-center-ai/`: copied from Command Center when ADR 096 was done, and adapted to this
repository (section 6). Its first version, 0.0.1, is released with SDK 0.5.3, the SDK release that
publishes `--warning-tint` (section 5).

## Decision summary

The repository publishes a second public package, `@dev-mainsequence/command-center-ai`, from a workspace at
`command-center-ai/` next to `command-center-sdk/`. It is the chat that talks to the Main Sequence platform: a
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
`command-center-sdk/` and `@dev-mainsequence/command-center-ai` from `command-center-ai/`. `validate-public-packages.mjs`
allows exactly these two, the chat once `command-center-ai/package.json` exists, and fails on any other public
package and on a chat workspace that is not a public root workspace.

**One direction.** The chat depends on the SDK. The SDK does not depend on, import, test, verify or
install anything of the chat.

- The chat declares the SDK as a peer dependency, never a regular one, so an application has
  exactly one SDK: one stylesheet and one set of `cc-*` classes. React and React DOM are peers for
  the same reason.
- `scripts/check-package-direction.mjs`, part of `npm run check`, fails when a file under
  `command-center-sdk/` (any type; build output and installed dependencies excepted) contains
  `@dev-mainsequence/command-center-ai`, holds a path that resolves into `command-center-ai/`, links into `command-center-ai/` on this
  repository's GitHub, or is a symbolic link into `command-center-ai/`, and when the SDK's `package.json` lists
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
  `examples/command-center-ai-consumer-fixture/`, gets the chat and SDK tarballs installed together, as an
  application installs them. The convention is `examples/<workspace directory>-consumer-fixture/`,
  the SDK's fixture keeping the name it had; a public package without a fixture fails the
  verification.
- The root `check` and `test` run the scripts of every public package, a package after the
  packages it depends on.
- `ci.yml` and `command-center-packages.yml` watch `command-center-ai/**`; `deploy-docs.yml` watches
  `command-center-ai/docs/**`.

### 2. The chat package

**Layout.**

| Path | Holds |
| --- | --- |
| `src/backend/` | The backend connection: the connection input, a client for each platform route and Agent-runtime route the chat calls, and the error helpers. Framework-neutral. |
| `src/engine/` | The session engine: choosing, or getting or creating, the session behind a stable handle, hydration, runtime access and readiness, the model selection, sending, cancelling, the queue, and the assistant-ui runtime adapter (`useLatestMessageDataStreamRuntime`). |
| `src/session-detail/` | The session detail model and the hook that loads one session's detail and insights. |
| `src/ui/` | The chat UI: the thread, the composer with its provider, model and thinking picker, the connecting stage, the model-required state, message actions, agent icons, and the chat's own select, markdown renderer, dialog, confirmation dialog, and password input. |
| `src/model-providers/` | The model-provider screens: the catalog with built-in provider sign-in and sign-off, Organization custom providers and their models, and the direct test conversation. |
| `src/index.ts` | The root export. |
| `styles.css` | The chat stylesheet, in the `ms-chat` cascade layer: prefixed class names and only the theme variables the SDK publishes, audited by `command-center-sdk theme audit` in the chat's `check`. |
| `standalone/` | The standalone example: a chat application built only on the chat and the SDK; the development bed and the target of the browser tests. `standalone/stand-in/` is its scripted stand-in for the platform and the Agent runtime. |
| `docs/` | Guides and records (section 3). |
| `agent_scaffold/skills/`, `cli/` | The consumer skills and their installer, the `command-center-ai` binary (section 4). |
| `tests/` | The browser tests of the standalone application on the stand-in, and the Node tests of the installer and the skills. The unit tests sit beside the code. |
| `scripts/` | The chat's own boundary check, run by its `check`, with the SDK on its allowlist as a peer only. |

The chat renders no notification surface: the application passes a `notify` callback and shows
notifications its own way. The select, markdown renderer, dialog, confirmation dialog, and password
input are the chat's own, because the SDK publishes no equivalent.

**Stylesheet.** Every chat rule sits in one cascade layer, `ms-chat`, and every class is prefixed
`ms-chat-`. The SDK's component rules are not layered, so they win where both style one element,
and an application overrides the chat with ordinary rules. The exception is the compact provider,
model and thinking picker: the chat draws it with the SDK's `ResourcePicker` and restyles the
picker's trigger with `!important` declarations, because only `!important` lets a layered rule
override an unlayered one. An application overrides those declarations only with an `!important`
rule in a layer ordered before `ms-chat`. The theme audit accepts `!important` on an allowed value
because it reads a value without the flag (an SDK CLI fix, under Unreleased in the SDK changelog).
The application loads the SDK's stylesheets and then the chat's.

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
`dist`, `styles.css`, `docs`, `agent_scaffold`, `cli`, the standalone example the skills point at
without its tests or its build, `README.md`, `CHANGELOG.md` and `LICENSE`. `npm pack --dry-run`
lists nothing else. The binary is `command-center-ai`.

**Dependencies.** `@assistant-ui/react`, `@assistant-ui/core`, `@assistant-ui/store`,
`assistant-stream`, `lucide-react`, `react-markdown`, `remark-gfm`, `rehype-raw` and
`rehype-sanitize`, with registry versions only.

- `@assistant-ui/react`, `@assistant-ui/core`, `@assistant-ui/store` and `assistant-stream` are one
  family, used partly through unstable entry points, and move together, in a chat release, with
  the chat's tests. They are ranges, not exact versions, so an application shares one copy with
  anything else that uses them and receives their fixes: `^0.12.19`, `^0.1.13`, `^0.3.10`, and
  `>=0.2.6 <0.2.14` for `@assistant-ui/store`. That upper bound is needed: from 0.2.14,
  `@assistant-ui/store` moved its `@assistant-ui/tap` peer through 0.6 to 0.9 inside 0.2.x, while
  every `@assistant-ui/react` 0.12.x and `@assistant-ui/core` 0.1.x needs `tap` 0.5, so a plain
  caret stops installing. Moving to the family's current line (`@assistant-ui/react` 0.15) is a
  change of its own. The thread imports `useAuiState` from `@assistant-ui/store` directly, so the
  chat declares it instead of reaching it through `@assistant-ui/react`.
- `lucide-react` uses the SDK's range, so an application gets one copy.
- The markdown renderer keeps its order: `remark-gfm`, then `rehype-raw`
  followed by `rehype-sanitize`, so raw HTML in an Agent's answer is sanitized before it renders.

**Peer dependencies.** `@dev-mainsequence/command-center-sdk` with a caret range on the first SDK
release that publishes `--warning-tint`, which the chat's warning panels use. No release publishes
it yet, so `^0.5.0` is not enough. The manifest says `^0.5.3`, the next patch; if that release is
a minor instead, the change that prepares it sets the range to its caret. The workspace's current
SDK version is the chat's development dependency. `react` and `react-dom` `>=18 <20`, the SDK's
range. While the SDK is 0.x its caret range stops at the next minor, so the change that releases a
new SDK minor also widens the chat's range and releases the chat. The lower bound rises again when
the chat starts to need a newer SDK.

**First version.** `0.0.1`. npm reads a caret on a 0.0.x version as that version alone, so an
application moves to each later 0.0.x release on purpose.

**Changelog.** Every release opens with a "Compatibility axes" paragraph, as the SDK's releases do.
It names the npm public API and, when they change, the stylesheet's class names, the installed
skills and the browser storage keys. It always names two axes the SDK does not have:

- the SDK range the release accepts; and
- the platform routes it calls, with their payloads, and the platform version it expects. A route
  the release adds, drops or calls differently is named with the rollout order it needs.

### 3. Documentation

- The chat's `docs/` holds its guides, one per skill: building a chat application, connecting to
  the platform, model providers, and the conversation contract. Verification and browser storage
  are in the first.
- The records that moved with the package (Command Center ADR 060, 087, 090, 093 and 096, and the
  contract half of ADR 092, now ADR 098) keep their numbers and titles as historical records,
  because the code cites them ("ADR 093", "ADR 060"). Their references to Command Center's own
  records and files are plain text: this repository is public and Command Center's is not.
- New chat decisions are `SDK ADR NNN` records with `Package: @dev-mainsequence/command-center-ai` in the
  chat's `docs/adr/`. The repository keeps one `SDK ADR` sequence and files each record with what
  it governs, which is why this one is in `docs/packages/adr/` and the SDK's catalog has no 012.
- The docs site publishes the chat as its own section under `/chat/`: its README, `docs/`, and the
  module READMEs the guides link to, so the package's relative links resolve there as on GitHub.
- The chat's documentation map names every skill with its human guide, and a test fails when a
  skill has none, as the SDK's `docs-skills` test does.

### 4. Skills

The chat ships its consumer skills and installs them itself: its own postinstall and CLI command,
`command-center-ai skills install`, dependency-free, writing into `.agents/skills/command-center-ai/` with its
own provenance file, `PINNED_FROM.txt`. Like the SDK's
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

The workflow publishes through npm trusted publishing, and npm lets a trusted publisher be
configured only on a package that already exists. So the first version, 0.0.1, is published once
by hand, from the release commit, by the npm account that owns the `@dev-mainsequence` scope; the
package's trusted publisher is then this repository's `command-center-packages.yml`, and every
later version is published by the workflow on a push to `main`. The chat follows the SDK release
that publishes `--warning-tint` (0.5.3), in the same push or an earlier one: the workflow publishes
the SDK before the chat. `publish-public-packages.mjs` skips versions already on
npm and stops the chat when the SDK fails, and `packed-consumer` has installed the chat's tarball
next to the SDK's before `publish` runs.

### 6. Order of work in this repository

1. **This record and the amendments of section 1**, before any chat code. Gate: `check`, `test`,
   `build`, `docs:build`, the SDK package smoke test and the packed-consumer verification pass
   with a second public package allowed.
2. **Import the chat.** First merge `warning-tint` into `chat-package`, because the chat's
   stylesheet must pass the theme audit against the theme in this repository, and only that branch
   publishes `--warning-tint`. Then copy the chat in as one commit, without its history: the
   workspace, declared in the root `workspaces`; the chat's consumer fixture, also compiled by
   `examples:check`; the docs-site section; its browser tests; its skills with their installer and
   guides; its changelog entry. Gate: the full repository lane on a pull request. Done: the chat is
   Command Center's `packages/chat` at 8849f0de, adapted in the commits after the copy. Until SDK 0.5.3
   was prepared, the chat's packed consumer failed as designed: npm refused the chat next to SDK
   0.5.2.
3. **Release 0.0.1**, published once by hand (section 5), with SDK 0.5.3 through the workflow.
   Gate: both versions are on npm and the chat's packed consumer installed it next to the SDK. The
   Implementation line names the versions.

## Compatibility and release impact

- This decision changes nothing in the SDK package: no source, export, declaration, stylesheet,
  skill, contract, schema, fixture, iframe protocol, theme ID or storage change. The chat relies on
  two SDK changes that stand on their own: `--warning-tint`, which no release publishes yet, and the
  theme audit reading a value without its `!important` flag. The first chat release waits for an
  SDK release that publishes `--warning-tint` (section 5).
- The repository tooling changes: the direction check, validation that allows the chat,
  per-package builds, browser tests and packed consumers, and root `check` and `test` over every
  public package, which now run the SDK and then the chat.

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
