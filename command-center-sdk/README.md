# Command Center SDK

`@dev-mainsequence/command-center-sdk` is the public TypeScript/React package for building
Command Center-compatible navigation, responsive application layouts, application feedback,
application controls, resource applications, themes, backend contracts, and static-site iframe integrations.

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
requests use the separate delegated `fetchFastApi` path only after a trusted host handshake.
A non-local direct link has no SDK credential bridge and needs an unavailable state or its own
authenticated backend transport; it cannot reuse the local CLI identity.
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
- `/controls`: the public button, badge, label, labelled field, input, and textarea, plus the hook
  that wires a custom control into a field.
- `/resource`: framework-neutral resource definitions, adapters, HTTP normalization, pagination,
  activation, detail-tab resolution, and discovered bulk actions.
- `/resource/react`: loaded-page and explicit/all-matching selection state.
- `/views`: React resource lists, details (with keyboard-accessible tabs that move what does not
  fit into a More menu), summaries, pickers, side-by-side transfer lists, tables, cards, pagination,
  and action UI.
- `/contracts`: ordered migration helpers.
- `/contracts/manifest.json`, `/contracts/schemas/*`, and `/contracts/fixtures/*`: the versioned
  backend-facing JSON Schema bundle and conformance fixtures.
- `/theme`, `/theme/presets`, and `/theme/data-viz`: presets, CSS variables, density, surfaces, and
  chart palettes.
- `/embed` and `/embed/react`: application-owned static-site iframe APIs for public context,
  delegated FastAPI HTTP access, native one-time-ticket WebSocket connections, and platform
  requests the host sends as the signed-in person.
- `/vite`: `platformRequestProxy()`, a Vite dev-server plugin that sends a top-level local page's
  platform requests as the developer, with the session `command-center-sdk login` saved on the
  machine, during local development only;
  and `localAgentProxy()`, which forwards a chat's routes to an Agent the developer runs with
  `ms-tau` in local mode on this machine.
- `/styles.css` and `/theme/*.css`: browser-ready styles.

Import only declared package exports. Do not import `dist` files or repository source paths.

## What the SDK does not own

The SDK supplies reusable controlled navigation chrome but does not own authentication, routes,
permission evaluation, query caching, backend authorization, deployment configuration, branding,
favorites, user menus, persistence policy, or product-domain models and applications. Its CLI signs
a developer's machine in to the platform for local development; an application's own sign-in stays
the application's.

## Sign in for local development

```bash
npx command-center-sdk login
```

One login per machine serves every project: the session is saved in the operating system's
credential store (the login Keychain on macOS, Secret Service on Linux), one per backend, and the
Main Sequence Python CLI shares it. `skills sync` and the dev server's `platformRequestProxy()` use
it and renew it. A project names its backend with `MAINSEQUENCE_ENDPOINT`, in the environment or in
its `.env`, and holds no token.
`auth status` reports the session, `auth token` hands a short-lived access token to another local
tool, `refresh-token` renews the session and removes credentials left in `./.env`, and `logout`
ends it. `MAINSEQUENCE_ACCESS_TOKEN` in the environment still wins, for a launcher or a CI job.
See [Sign in once per machine](./docs/application-operations.md#sign-in-once-per-machine) and SDK
ADR 017.

## Agent skills

The npm package installs version-matched skills into:

```text
.agents/skills/command-center/
  general/
  documentation/
  feedback/
  controls/
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

When `MAINSEQUENCE_ACCESS_TOKEN` and an MCP URL are set in the environment, package postinstall
also makes a nonblocking attempt to refresh backend-owned platform skills under
`.agents/skills/ms-command-center/`. Postinstall reads no saved session. Run the strict command, which
uses the saved session, when the refresh must succeed or when you want dry-run/JSON evidence:

```bash
npx command-center-sdk skills sync --path .
npx command-center-sdk skills sync --path . --dry-run --json
```

The MCP URL is the project's backend plus `/mcp`, or `--mcp-url` or `COMMAND_CENTER_SDK_MCP_URL`;
the saved session is sent only to its own backend. Do not place a token in command arguments. The MCP installer writes
`.agents/skills/ms-command-center/MCP_PINNED_FROM.txt`, overwrites only its recorded folders, and
preserves every unrelated skill. It never writes `.agents/skills/mainsequence/`, which the Python
Main Sequence SDK owns and mirrors; it removes from there only the folders and the
`MCP_PINNED_FROM.txt` that versions before 0.5.12 recorded, and leaves any folder the Python SDK's
`PINNED_FROM.txt` also records. Set
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

After changing dependencies in a registered Command Center code repository, refresh the lockfile
and the installed packages from the Git repository root:

```bash
npx command-center-sdk code-repository sync --path .
```

The root must contain `package.json` and `package-lock.json`; a nested application directory is
rejected. The command runs `npm install --package-lock-only` and then `npm ci`, and nothing else: it
makes no backend request, needs no sign-in, creates no SSH key, and does not version, commit, tag,
or push. Commit and push the changed files yourself. `--json` returns the commands and the completed
stages. The arguments earlier versions took to commit, tag, and push (a commit message, a
CodeRepository UID, a dry run, a timeout) are refused with an error that says so.

The platform deploys from Git pushes as the repository's `.mainsequence/workflows/*.yaml` file says:
with `tag_regex` omitted or `null`, every push deploys; with a regular expression, a matching tag
deploys the commit it points at, whether that is the branch's latest commit or an older commit on
the branch. `automatic_deployment` and
`tag_regex` are set only in that file. The Main Sequence platform no longer provides tag names;
versions and release tags are repository code, created by the repository's own CI. See
[Refresh dependencies and deploy from Git](./docs/getting-started.md#refresh-dependencies-and-deploy-from-git),
the [Application operations](./docs/application-operations.md#release-tags-from-the-repositorys-own-ci)
example release workflow, and the installed `general/maintain-command-center-code-repository` skill.

## Maintenance constraints

- Source maintainers must run the package-local
  [`$maintenance` skill](./.agents/skills/maintenance/SKILL.md) after every SDK change. It requires
  an explicit synchronization decision for public extension APIs, human docs and examples,
  backend schemas and fixtures, package exports, and release verification.
- SDK source must not import application aliases, product endpoints, auth stores, routers, or
  persistence policy. The Node-only `/vite` entry reads the developer's machine session from
  `cli/machine-session.mjs` (SDK ADR 017); no browser entry point may.
- Framework-neutral entrypoints must not load React or browser-only code.
- React views live behind deliberate UI subpaths.
- Public JavaScript, declarations, CSS, package exports, examples, and agent skills must agree.
- Major modules require a nearest README.
- Persisted contract, theme-ID, or protocol changes require an explicit compatibility and
  backend/storage assessment.
