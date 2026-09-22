# Command Center SDK

`@dev-mainsequence/command-center-sdk` is the public TypeScript/React package for building
Command Center-compatible navigation, responsive application layouts, application feedback,
resource applications, themes, backend contracts, and static-site iframe integrations.

The SDK owns reusable contracts, UI, and lifecycle. Your application keeps authentication, API
clients, routing, persistence, permissions, notifications, and product-specific behavior.

## Install

Main Sequence Vite applications live at the Git repository root. Run package installation there so
`package.json`, `package-lock.json`, `.env`, `.agents/`, `src/`, and the Git root share one
application and repository boundary. Nested application directories are not supported.

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Load the browser styles once:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

The package ships standard ESM and TypeScript declarations. It is bundler-independent and does not
require Vite.

For a directly opened Vite site backed by local FastAPI, follow the
[local Vite/FastAPI example](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/static-site-vite-fastapi).
Its `/api` proxy uses a server-side CLI developer identity and no release UID; hosted iframe
requests use the separate delegated `fetchFastApi` path.
The installed `integrate-static-site-iframe` skill requires the local API runner, identity check,
readiness check, and proxy setup before a top-level Vite application makes API requests.

## Start here

- [Documentation home](./docs/README.md): concept-based learning paths, ownership boundaries, and
  the complete human-guide/agent-skill map.
- [Getting started](./docs/getting-started.md): install the package and render a complete resource
  screen through public entrypoints.
- [SDK architecture](./docs/concepts/sdk-architecture.md): definitions, adapters, reusable
  lifecycle, controlled views, and host effects.
- [Resource applications](./docs/concepts/resource-applications.md): collection/discovery,
  identity, selection, activation, and bulk-action concepts.
- [State and ownership](./docs/concepts/state-and-ownership.md): controlled state, cancellation,
  errors, routing, sessions, and persistence boundaries.
- [Public API map](./docs/public-api.md): every supported entrypoint, CSS export, runtime boundary,
  and compatibility rule.
- [Build guides](./docs/navigation.md): navigation, [layout](./docs/application-layout.md),
  [feedback](./docs/application-feedback.md), and [resources](./docs/resources.md).
- [Integration guides](./docs/themes.md): themes, [static-site embeds](./docs/static-site-embeds.md),
  [backend contracts](./docs/backend-contracts.md), and
  [application documentation](./docs/application-documentation.md).
- [Application operations](./docs/application-operations.md): inspect and update the SDK, refresh
  guidance, synchronize a release, and recover safely.
- [Extending and releasing](./docs/extending-and-releasing.md): add SDK capabilities, evolve
  contracts, and verify a package release.
- [Backend contract schemas](./contracts/README.md): JSON Schemas, manifest, and valid/invalid
  fixtures for language-neutral implementations.

## A first resource list

```tsx
import { defineResourceApplication } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";

interface Service {
  uid: string;
  name: string;
}

const services = defineResourceApplication<Service, string>({
  id: "services",
  label: "Services",
  getId: (service) => service.uid,
  adapter: {
    async list({ pageIndex, pageSize, signal }) {
      const response = await fetch(
        `/api/services?offset=${pageIndex * pageSize}&limit=${pageSize}`,
        { signal },
      );
      if (!response.ok) throw new Error("Services could not be loaded.");
      const body = (await response.json()) as { count: number; results: Service[] };
      return {
        items: body.results,
        pageInfo: {
          pageIndex,
          pageSize,
          totalItems: body.count,
          hasNextPage: (pageIndex + 1) * pageSize < body.count,
          hasPreviousPage: pageIndex > 0,
        },
      };
    },
  },
  columns: [{ id: "name", header: "Name", getValue: (service) => service.name }],
});

export function ServicesPage() {
  return <ResourceListPage definition={services} searchable refreshable />;
}
```

Use a host-supplied HTTP client in production so base URLs, authentication headers, retries, and
error normalization stay outside the resource definition.

## Choose a public entrypoint

- `/navigation` and `/navigation/testing`: canonical depth-one panel and depth-two rail + panel
  shells with responsive drawers and floating triggers, plus startup/depth/no-topbar verification;
  runtime definitions, validation, contribution composition, and native anchor behavior for
  routed applications and destinations with `href`. For a real host that frames embedded sites:
  the phone `ApplicationImmersiveBar` and the controlled `ApplicationNavigationDrawer` that holds
  the host's own sidebar from `md` up.
- `/layout` and `/layout/testing`: responsive page, header, stack, card, and card-grid primitives,
  the viewport seam,
  plus real-browser geometry verification.
- `/feedback`: controlled activity indicator, ordered progress stages, and application-level
  loading, retrying, and error surfaces.
- `/resource`: framework-neutral resource definitions, adapters, HTTP normalization, pagination,
  activation, and discovered bulk actions.
- `/resource/react`: loaded-page and explicit/all-matching selection state.
- `/views`: React resource lists, details, summaries, pickers, tables, cards, pagination, and
  action UI.
- `/contracts`: ordered migration helpers.
- `/contracts/manifest.json`, `/contracts/schemas/*`, and `/contracts/fixtures/*`: the versioned
  backend-facing JSON Schema bundle and conformance fixtures.
- `/theme`, `/theme/presets`, and `/theme/data-viz`: presets, CSS variables, density, surfaces, and
  chart palettes.
- `/embed` and `/embed/react`: application-owned static-site iframe APIs for public context,
  delegated FastAPI HTTP access, and native one-time-ticket WebSocket connections.
- `/styles.css` and `/theme/*.css`: browser-ready styles.

Import only declared package exports. Do not import `dist` files or repository source paths.

## What the SDK does not own

The SDK supplies reusable controlled navigation chrome but does not own authentication, routes,
permission evaluation, query caching, backend authorization, deployment configuration, branding,
favorites, user menus, persistence policy, or product-domain models and applications.

## Agent skills

The npm package installs version-matched skills into:

```text
.agents/skills/command-center/
  general/
  documentation/
  feedback/
  layout/
  navigation/
  resource/
  views/
  contracts/
  theme/
  embed/
```

Refresh them after an upgrade or when lifecycle scripts were disabled:

```bash
npx command-center-sdk skills install --path .
npx command-center-sdk skills install --path . --dry-run
```

The SDK recursively discovers skill leaves and preserves this nested hierarchy. Contract skills
resolve `contracts/manifest.json` and its indexed schemas and fixtures instead of bundling a second
contract definition. The installed package catalog authoritatively owns the complete
`.agents/skills/command-center` namespace. Every install or update prunes entries absent from that
catalog—including obsolete `widget`, `workspace`, and embed skills—while preserving every other
namespace under `.agents/skills`. Use `--dry-run --json` to inspect the `removed` paths before
writing. See the [human-doc/skill map](./docs/README.md#task-and-agent-skill-map) for the exact
workflow parity.

When `MAINSEQUENCE_ACCESS_TOKEN` and an MCP URL are available, package postinstall also makes a
nonblocking attempt to refresh backend-owned platform skills under `.agents/skills/mainsequence/`.
Run the strict command when the refresh must succeed or when you want dry-run/JSON evidence:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk skills sync --path .
npx command-center-sdk skills sync --path . --dry-run --json
```

The URL may instead be supplied with `--mcp-url` or `COMMAND_CENTER_SDK_MCP_URL`. Do not place the
token in command arguments. The MCP installer writes
`.agents/skills/mainsequence/MCP_PINNED_FROM.txt`, overwrites only its recorded folders, may adopt
folders proven MCP-owned by the Python SDK sentinel, and preserves every unrelated skill. Set
`COMMAND_CENTER_SDK_MCP_POSTINSTALL=0` to disable only the best-effort postinstall network attempt;
the packaged `command-center` skill installation still runs.

## Initialize application documentation

From a consuming frontend's Git and npm root, preview and add the official documentation system:

```bash
npx command-center-sdk application docs init --path . --dry-run
npx command-center-sdk application docs init --path .
```

The initializer preserves the application build as `build:app`, adds the `/docs/` end-user guide
to the same `dist/` artifact, installs exact dependencies through the root npm lockfile, and uses a
schema-version-2 application-menu projection to derive the user-guide folder tree, `SUMMARY.md`,
and Docusaurus sidebar. Served pages explain user tasks and visible behavior; architecture, code,
APIs, and maintainer material stay outside the application `docs/` tree. The command is idempotent
and refuses to overwrite conflicting files or manifest entries. Use `--skip-install` only when npm
installation will be performed separately. See the
[application-documentation guide](./docs/application-documentation.md) for the complete authoring
and browser-verification contract.

## Inspect and update the application SDK

Use the application CLI from a consuming application's Git repository root to compare its declared,
locked, and installed SDK versions with npm's compatible `wanted` version and the registry's
`latest` version:

```bash
npx command-center-sdk application sdk-status --path .
npx command-center-sdk application sdk-status --path . --json
npx command-center-sdk application update-sdk --path . --dry-run
npx command-center-sdk application update-sdk --path .
```

`update-sdk` runs a package-scoped npm update only when the existing dependency declaration allows
it. It does not widen an exact or otherwise blocked dependency range, update unrelated packages,
call the backend, change the application version, commit, tag, or push. Linked, workspace, file,
Git, URL, alias, and peer dependency declarations are reported but not rewritten. After an actual
upgrade, run `command-center-sdk skills sync --path .` when both packaged and backend-owned agent
guidance must be refreshed and verified.

## CodeRepository sync and automatic deployment

Use the SDK CLI when a registered Command Center code repository is ready to be versioned, committed,
tagged, and pushed for automatic deployment:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk code-repository sync -m "Describe the change" --path . --dry-run
npx command-center-sdk code-repository sync -m "Describe the change" --path .
```

The Git repository root must contain `package.json` plus `package-lock.json`. Before changing local
state, the command verifies that the supplied path is that root and resolves its canonical `origin`,
attached branch, and exact `HEAD` commit through the backend Git-context endpoint. The response
authoritatively supplies both the registered `CodeRepositoryBranch` and its parent CodeRepository. The command
does not read or restore superseded local repository-identity markers in `.env`; an optional positional CodeRepository UID
is only a consistency assertion against the Git-resolved result. It previews the npm patch version,
requests that version's backend-owned tag, and rejects an invalid or existing local tag before
creating an SSH key. It then registers a newly created repository SSH public key through the owning
CodeRepository, verifies the forced identity with a dry-run push, and checks the exact remote tag ref.
Existing keys that already pass this preflight are not registered again. A nested application
directory, detached checkout, unresolved Git context, tag collision, deploy-key registration
failure, or inaccessible Git remote is a hard failure before the version, dependency, commit, or
local Git tag changes.

Repository keys use the cross-CLI filename
`~/.ssh/mainsequence-<repository-slug>-<first-16-sha256>` derived from the normalized
`host[:non-default-port]/repository/path`, so `org-a/app` and `org-b/app` never collide. Equivalent
SCP and `ssh://` origins select the same key. Old basename-only files are left untouched and are
not used as a fallback; the repository-specific key is registered and verified instead.

The command verifies that the applied npm bump matches its preview, refreshes and installs the
lockfile, runs `git add -A`, commits, creates the returned annotated tag unchanged, and atomically
pushes the explicit branch and tag refs with `--follow-tags`. Consequently, `main`, `dev`, and
feature branches may receive different backend-owned tag formats. Review the complete working tree
before running the command because every modification, deletion, and untracked file is staged. See
the installed `general/maintain-command-center-code-repository` skill and the
[code-repository-sync guide](./docs/getting-started.md#sync-a-code-repository-for-automatic-deployment) for failure
and recovery semantics.

Backend requests use a 60-second default timeout. Slow environments can override it with
`--timeout-ms` or `COMMAND_CENTER_SDK_CODE_REPOSITORY_TIMEOUT_MS`, bounded from 1 through 300
seconds. The CLI option takes precedence, and Git-context timeouts stop before mutation.

## Maintenance constraints

- Source maintainers must run the package-local
  [`$maintenance` skill](./.agents/skills/maintenance/SKILL.md) after every SDK change. It requires
  an explicit synchronization decision for public extension APIs, human docs and examples,
  backend schemas and fixtures, package exports, and release verification.
- SDK source must not import application aliases, product endpoints, auth stores, routers, or
  persistence policy.
- Framework-neutral entrypoints must not load React or browser-only code.
- React views live behind deliberate UI subpaths.
- Public JavaScript, declarations, CSS, package exports, examples, and agent skills must agree.
- Major modules require a nearest README.
- Persisted contract, theme-ID, or protocol changes require an explicit compatibility and
  backend/storage assessment.
