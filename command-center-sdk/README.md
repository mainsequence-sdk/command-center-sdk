# Command Center SDK

`@dev-mainsequence/command-center-sdk` is the public TypeScript/React package for building
Command Center-compatible navigation, resource applications, widgets, workspaces, themes, and
iframe integrations.

The SDK owns reusable contracts, UI, and lifecycle. Your application keeps authentication, API
clients, routing, persistence, permissions, notifications, and product-specific behavior.

## Install

Main Sequence Vite projects place the application at the Git repository root. Run package
installation there so `package.json`, `package-lock.json`, `.env`, `.agents/`, `src/`, and the Git
root share one project boundary. Nested application directories are not a supported Main Sequence
project layout.

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Load the browser styles once:

```ts
import "@dev-mainsequence/command-center-sdk/styles.css";
```

The package ships standard ESM and TypeScript declarations. It is bundler-independent and does not
require Vite.

## Start here

- [Getting started](./docs/getting-started.md): install, choose a surface, and build a first list.
- [Application navigation](./docs/navigation.md): build a controlled app rail with sub-applications.
- [Resources](./docs/resources.md): lists, details, pickers, actions, and backend adapters.
- [Widgets and workspaces](./docs/widgets-and-workspaces.md): author widgets, compose a host, and
  render workspace documents.
- [Themes and embeds](./docs/themes-and-embeds.md): apply themes and integrate both iframe
  protocols safely.
- [Extending and releasing](./docs/extending-and-releasing.md): add SDK capabilities, evolve
  contracts, and verify a release.
- [Backend contract schemas](./contracts/README.md): JSON Schemas, manifest, and valid/invalid
  fixtures for language-neutral backend design.
- [Backend contract guide](./docs/backend-contracts.md): payload roles, lifecycle examples, package
  resolution, and versioning rules.
- [Documentation home and skill map](./docs/README.md): every human workflow mapped to the matching
  packaged agent skill.

## A first resource list

```tsx
import { defineResourceApplication } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";

interface Project {
  uid: string;
  name: string;
}

const projects = defineResourceApplication<Project, string>({
  id: "projects",
  label: "Projects",
  getId: (project) => project.uid,
  adapter: {
    async list({ pageIndex, pageSize, signal }) {
      const response = await fetch(
        `/api/projects?offset=${pageIndex * pageSize}&limit=${pageSize}`,
        { signal },
      );
      if (!response.ok) throw new Error("Projects could not be loaded.");
      const body = (await response.json()) as { count: number; results: Project[] };
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
  columns: [{ id: "name", header: "Name", getValue: (project) => project.name }],
});

export function ProjectsPage() {
  return <ResourceListPage definition={projects} searchable refreshable />;
}
```

Use a host-supplied HTTP client in production so base URLs, authentication headers, retries, and
error normalization stay outside the resource definition.

## Choose a public entrypoint

- `/navigation`: controlled application rail, grouped sub-application panel, composed shell,
  runtime definitions, validation, and contribution composition.
- `/resource`: framework-neutral resource definitions, adapters, HTTP normalization, pagination,
  activation, and discovered bulk actions.
- `/resource/react`: loaded-page and explicit/all-matching selection state.
- `/views`: React resource lists, details, summaries, pickers, tables, cards, pagination, and
  action UI.
- `/contracts`: JSON-safe widget, runtime-data, value, migration, tabular-frame, Table/Pro Table,
  AppComponent/Mock JSON, Tabular Transform authoring, and Adapter From API contracts.
- `/contracts/manifest.json`, `/contracts/schemas/*`, and `/contracts/fixtures/*`: the versioned
  backend-facing JSON Schema bundle and conformance fixtures.
- `/widget`: widget modules, executable runtimes, extensions, IO, settings, and capabilities.
- `/widget/host`: collision-safe registry, availability, and canonical widget identity.
- `/widget/testing` and `/widget/ui`: validation and reusable authoring controls.
- `/widget/built-ins` and its narrow `/app-component`, `/tabular-transform`, `/table`, and
  `/pro-table` subpaths: Markdown, Statistic, AppComponent with Mock JSON, Tabular Transform,
  Community Table, and Pro Table modules.
- `/workspace` and `/workspace/react`: workspace documents, normalization, migrations, snapshots,
  and read-only rendering.
- `/theme`, `/theme/presets`, and `/theme/data-viz`: presets, CSS variables, density, surfaces, and
  chart palettes.
- `/embed` and `/embed/react`: generic external-widget and project-owned static-site iframe APIs.
- `/styles.css` and `/theme/*.css`: browser-ready styles.

Import only declared package exports. Do not import `dist` files or repository source paths.

## What the SDK does not own

The SDK supplies reusable controlled navigation chrome but does not own authentication, routes,
permission evaluation, query caching, backend authorization, deployment configuration, branding,
favorites, user menus, or persistence policy. The current `/workspace/react`
surface is a read-only renderer; it is not a public workspace editor. Connection-neutral contracts
and views are not yet a published entrypoint.

## Agent skills

The npm package installs version-matched skills into:

```text
.agents/skills/command-center/
  general/
  resource/
  views/
  widget/
  workspace/
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
contract definition. The packaged-skill lane manages only that namespace and preserves unrelated
skills. See the [human-doc/skill map](./docs/README.md#choose-what-you-are-building) for the exact
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

## Inspect and update the project SDK

Use the project CLI from a consuming application's Git repository root to compare its declared,
locked, and installed SDK versions with npm's compatible `wanted` version and the registry's
`latest` version:

```bash
npx command-center-sdk project sdk-status --path .
npx command-center-sdk project sdk-status --path . --json
npx command-center-sdk project update-sdk --path . --dry-run
npx command-center-sdk project update-sdk --path .
```

`update-sdk` runs a package-scoped npm update only when the existing dependency declaration allows
it. It does not widen an exact or otherwise blocked dependency range, update unrelated packages,
call the backend, change the application version, commit, tag, or push. Linked, workspace, file,
Git, URL, alias, and peer dependency declarations are reported but not rewritten. After an actual
upgrade, run `command-center-sdk skills sync --path .` when both packaged and backend-owned agent
guidance must be refreshed and verified.

## Project sync and automatic deployment

Use the SDK CLI when a registered Command Center npm project is ready to be versioned, committed,
tagged, and pushed for automatic deployment:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk project sync -m "Describe the change" --path . --dry-run
npx command-center-sdk project sync -m "Describe the change" --path .
```

The Git repository root must provide `MAIN_SEQUENCE_PROJECT_UID` in `.env` and contain
`package.json` plus `package-lock.json`. Before changing local state, the command verifies that the
supplied path is that root and resolves the named Git branch to its registered backend
`ProjectBranch`. It then registers a newly created repository SSH public key through the owning
Project and verifies the forced identity with a dry-run push. Existing keys that already pass this
preflight are not registered again. A nested application directory, detached checkout,
unregistered branch, deploy-key registration failure, or inaccessible Git remote is a hard
failure before the version, backend tag, commit, or local Git tag changes.

Repository keys use the cross-CLI filename
`~/.ssh/mainsequence-<repository-slug>-<first-16-sha256>` derived from the normalized
`host[:non-default-port]/repository/path`, so `org-a/app` and `org-b/app` never collide. Equivalent
SCP and `ssh://` origins select the same key. Old basename-only files are left untouched and are
not used as a fallback; the repository-specific key is registered and verified instead.

The command bumps the npm patch version, asks that exact ProjectBranch for its default redeployment
tag, refreshes and installs the lockfile, runs `git add -A`, commits, creates the returned annotated
tag unchanged, and pushes with `--follow-tags`. Consequently, `main`, `dev`, and feature branches
may receive different backend-owned tag formats. Review the complete working tree before running
the command because every modification, deletion, and untracked file is staged. See the installed
`general/maintain-command-center-project` skill and the
[project-sync guide](./docs/getting-started.md#sync-a-project-for-automatic-deployment) for failure
and recovery semantics.

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
- Persisted workspace, widget, binding, runtime-state, theme-ID, or protocol changes require an
  explicit compatibility and backend/storage assessment.
