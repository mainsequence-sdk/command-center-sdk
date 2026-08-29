---
sidebar_position: 2
title: Getting started
---

# Getting started

This guide matches the `use-command-center-sdk`, `maintain-command-center-code-repository`,
`build-command-center-application`, and `document-command-center-application` skills.

## Install the package

For a Main Sequence Vite project, the application lives at the Git repository root. Keep
`package.json`, `package-lock.json`, `.env`, `.agents/`, `src/`, and `vite.config.*` at that root;
the production build normally writes `dist/`. Do not create a nested `frontend/` application.

```bash
npm install @dev-mainsequence/command-center-sdk react react-dom
```

Load the shared styles once:

```ts
// src/main.tsx
import "@dev-mainsequence/command-center-sdk/styles.css";
```

React and React DOM are peer dependencies. Keep one compatible React runtime in the host and in
any separately distributed widget packages.

## Install current agent guidance

Package installation always copies version-matched SDK guidance to
`.agents/skills/command-center/`. It also attempts a nonblocking backend MCP refresh when
`MAINSEQUENCE_ACCESS_TOKEN` and either `MAINSEQUENCE_ENDPOINT` or
`COMMAND_CENTER_SDK_MCP_URL` are exported to the npm process. A missing login, unavailable server,
or incompatible platform manifest does not fail `npm install` and does not damage an earlier MCP
installation.

Use the explicit command when both the SDK and backend-owned platform guidance must be verified:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk skills sync --path .
```

Use `--dry-run` before changing files and `--json` when another tool will inspect the result. The
MCP URL can be passed through `--mcp-url`, but the bearer token must remain in the environment. SDK
skills live under `command-center`; backend-owned skills retain their manifest-declared hierarchy
under `mainsequence`. The installer overwrites or removes only MCP folders recorded in
`MCP_PINNED_FROM.txt` or proven MCP-owned by the Python SDK sentinel.

## Initialize application documentation

Add the official same-artifact Docusaurus system from the frontend's Git and npm root:

```bash
npx command-center-sdk application docs init --path . --dry-run
npx command-center-sdk application docs init --path .
```

The initializer keeps one root npm lockfile and Node runtime, creates human and technical
documentation sections, generates Docusaurus and `SUMMARY.md` navigation from one manifest, and
changes the root build so documentation is emitted at `dist/docs` after the application build.
It refuses to overwrite different existing files. See
[Application documentation](./application-documentation.md) for authoring, toolchain, build, and
browser-verification requirements.

## Inspect or update the installed SDK

Run the status command at the Git repository root before changing a consuming project's SDK:

```bash
npx command-center-sdk application sdk-status --path .
npx command-center-sdk application sdk-status --path . --json
```

The result keeps five different facts separate: the dependency spec declared in `package.json`,
the version locked in `package-lock.json`, the package installed in `node_modules`, npm's `wanted`
version allowed by the current declaration, and the registry's `latest` version. This makes a
missing install or lockfile drift distinguishable from an available compatible update.

Preview and apply the compatible package-scoped update with:

```bash
npx command-center-sdk application update-sdk --path . --dry-run
npx command-center-sdk application update-sdk --path .
```

The update respects the existing npm declaration and refuses linked, workspace, file, Git, URL,
alias, and peer dependency sources. A newer `latest` release outside the declared range is
`constraint_blocked`; the command leaves `package.json` unchanged so crossing that compatibility
boundary remains an explicit project decision. It never calls the backend or performs a Git
commit, tag, or push. After an applied update, run `command-center-sdk skills sync --path .` when
the backend-owned guidance must also be refreshed strictly.

## Sync a code repository for automatic deployment

`command-center-sdk code-repository sync` is the npm-project equivalent of Python's
`mainsequence code-repository sync`. Use it after a consuming project change is ready to become one commit
and one backend-recognized automatic deployment:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk code-repository sync -m "Update the project" --path . --dry-run
npx command-center-sdk code-repository sync -m "Update the project" --path .
```

The supplied path must be the Git repository root and contain `package.json` and
`package-lock.json`. Preflight rejects a nested application directory, then sends the canonical
`origin`, attached branch, and exact `HEAD` commit to the backend Git-context resolver. That
authoritative response supplies the matching `CodeRepositoryBranch` and parent CodeRepository UID. Do not add or restore superseded local repository-identity markers in `.env`; CodeRepository identity is derived from Git, and an optional
positional CodeRepository UID is only a consistency assertion. If the checkout is detached, its Git
context is unregistered or ambiguous, or the backend echoes another repository, branch, ref, or
commit, the command stops before versioning, dependency installation, SSH-key creation, Git staging,
commit, tag, or push. Register the branch through the platform workflow; never search a nested
directory, fall back to `main`, or invent a local deployment tag. The dry run previews the npm patch
version, requests the backend-owned tag, and rejects an invalid or existing local tag without
creating SSH credentials or changing files.

For a newly generated repository key, the command posts its public key to the owning CodeRepository's
`add-deploy-key` action. For an existing key, it first reuses the key when Git access already works
and registers it only when access fails. In both cases, `git push --dry-run --follow-tags` must pass
against `origin` and `HEAD:refs/heads/<branch>` with the exact forced SSH identity before versioning
begins. The command then queries the exact `refs/tags/<backend tag>` on `origin`; a collision or an
indeterminate remote check stops before the npm version change. A registration or access failure
may leave the generated local key or registered backend deploy key in place, but it does not bump
the version, create a commit, or create a local Git tag.

The filename is `~/.ssh/mainsequence-<repository-slug>-<first-16-sha256>`, where the SHA-256 input
is the normalized `host[:non-default-port]/repository/path`. The same repository expressed as an
SCP or `ssh://` origin gets the same key; repositories that merely share a basename do not. The CLI
does not read, rename, or delete old basename-only key files.

After preflight, the command:

1. bumps the npm patch version without asking npm to create a tag and verifies it matches preview;
2. refreshes `package-lock.json` and runs `npm ci`;
3. stages the complete working tree with `git add -A` and commits it;
4. creates the backend-returned annotated tag unchanged; and
5. atomically pushes with `--follow-tags` while explicitly targeting `origin`, the resolved branch,
   and the backend-generated tag.

Keep `--atomic --follow-tags`: the explicit remote and refspecs prevent local upstream or
push-default configuration from redirecting the operation, and atomic push prevents a partial
remote branch/tag update if either ref is rejected.

The backend can return `v1.2.4` for `main`, `v1.2.4-dev.1` for `dev`, or a branch-qualified feature
tag. That branch-specific tag is the automatic-deployment identity. The CLI does not duplicate the
backend naming algorithm.

Inspect `git status --short` before execution because all modifications, deletions, and untracked
files are included. The command stops on the first failure and does not automatically roll back a
version bump, npm lifecycle effect, commit, or local tag. Use `--json` for structured evidence and
the installed `general/maintain-command-center-code-repository` skill for the complete recovery checklist.

## Pick the highest-level surface that fits

Start with the composition that already owns the interaction lifecycle:

| Requirement | Use |
| --- | --- |
| Paginated/searchable collection | `ResourceListPage` from `/views` |
| One object with summary, actions, and tabs | `ResourceDetailShell` from `/views` |
| Single, multiple, or action selection | `ResourcePicker` from `/views` |
| Reusable dashboard panel | `defineWidgetModule` from `/widget` |
| Persisted multi-widget document | `/workspace` and `/workspace/react` |
| Theme preset or CSS variables | `/theme` and the theme CSS exports |
| External widget with props, inputs, and outputs | Generic `/embed` protocol |
| Project-owned static site with theme/user context | Static-site `/embed` protocol |

Treat complete-application embedding and SDK theming as cross-cutting requirements. Inside that
boundary, select the composition whose contract owns the required lifecycle: resource views for
domain objects, widgets for portable panels and data, and workspaces for persisted multi-widget
compositions.

## Render a first resource list

The SDK definition is backend-neutral. The adapter below is deliberately small so the boundary is
easy to see:

```tsx
import { defineResourceApplication } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";

interface Project {
  uid: string;
  name: string;
  status: "active" | "paused";
}

const projects = defineResourceApplication<Project, string>({
  id: "projects",
  label: "Projects",
  getId: (project) => project.uid,
  activation: {
    resolve: (project) => ({ resource: "projects", uid: project.uid }),
  },
  columns: [
    { id: "name", header: "Name", getValue: (project) => project.name },
    { id: "status", header: "Status", getValue: (project) => project.status },
  ],
  adapter: {
    async list({ pageIndex, pageSize, search, signal }) {
      const query = new URLSearchParams({
        offset: String(pageIndex * pageSize),
        limit: String(pageSize),
        ...(search ? { search } : {}),
      });
      const response = await fetch(`/api/projects?${query}`, { signal });
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
});

export function ProjectsPage() {
  return (
    <ResourceListPage
      definition={projects}
      searchable
      refreshable
      navigation={{
        open: ({ uid }) => window.location.assign(`/projects/${encodeURIComponent(uid)}`),
      }}
    />
  );
}
```

In production, put base URLs, authorization headers, retries, and error normalization in a shared
HTTP client. Keep route changes in the host navigation adapter. The resource definition should not
read auth stores or know the application's URL structure.

## Use public imports only

Good:

```ts
import { createHttpResourceAdapter } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";
```

Avoid:

```ts
// Not a public contract; it can move without notice.
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/dist/views/ResourceListPage.js";
```

When troubleshooting an installed version, inspect its `package.json`, `exports`, peer
dependencies, README, and `.d.ts` files. Treat that installed version as authoritative.

## Extend a consumer or extend the SDK?

Most applications extend behavior through definitions, adapters, controlled props, and narrow
renderers. That is normal SDK use and belongs in the consumer.

Change the SDK source only when the missing behavior is reusable, backend-neutral, and useful to
more than one consumer. Product endpoints, authentication decisions, routes, persistence policy,
and one-off workflows stay outside the SDK. See [Extending and releasing](./extending-and-releasing.md)
for the source-package workflow.

## Verify the setup

Run the consumer's typecheck and tests against public imports. If the change affects publishing,
also install an `npm pack` tarball into a clean fixture; workspace symlinks do not prove that files
and exports will be present for real consumers.

The repository's
[packed consumer fixture](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/sdk-consumer-fixture)
shows every public entrypoint being imported from a package tarball.
