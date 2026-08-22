---
sidebar_position: 2
title: Getting started
---

# Getting started

This guide matches the `use-command-center-sdk`, `maintain-command-center-project`, and
`build-command-center-application` skills.

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

## Sync a project for automatic deployment

`command-center-sdk project sync` is the npm-project equivalent of Python's
`mainsequence project sync`. Use it after a consuming project change is ready to become one commit
and one backend-recognized automatic deployment:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk project sync -m "Update the project" --path . --dry-run
npx command-center-sdk project sync -m "Update the project" --path .
```

The supplied path must be the Git repository root and contain `package.json`, `package-lock.json`,
and `.env` with `MAIN_SEQUENCE_PROJECT_UID`. Preflight rejects a nested application directory,
reads the current named Git branch, and resolves it to the matching backend `ProjectBranch`. If the
checkout is detached or the branch is not registered, the command stops before versioning,
dependency installation, SSH-key creation, Git staging, commit, tag, or push. Register the branch
through the platform workflow; never search a nested directory, fall back to `main`, or invent a
local deployment tag.

For a newly generated repository key, the command posts its public key to the owning Project's
`add-deploy-key` action. For an existing key, it first reuses the key when Git access already works
and registers it only when access fails. In both cases, `git push --dry-run --follow-tags` must pass
with the exact forced SSH identity before versioning begins. A registration or access failure may
leave the generated local key or registered backend deploy key in place, but it does not bump the
version, request a deployment tag, create a commit, or create a local Git tag.

After preflight, the command:

1. bumps the npm patch version without asking npm to create a tag;
2. requests the canonical default redeployment tag for the resolved ProjectBranch;
3. refreshes `package-lock.json` and runs `npm ci`;
4. stages the complete working tree with `git add -A` and commits it;
5. creates the backend-returned annotated tag unchanged; and
6. pushes the branch and tag with `git push --follow-tags`.

The backend can return `v1.2.4` for `main`, `v1.2.4-dev.1` for `dev`, or a branch-qualified feature
tag. That branch-specific tag is the automatic-deployment identity. The CLI does not duplicate the
backend naming algorithm.

Inspect `git status --short` before execution because all modifications, deletions, and untracked
files are included. The command stops on the first failure and does not automatically roll back a
version bump, npm lifecycle effect, commit, or local tag. Use `--json` for structured evidence and
the installed `general/maintain-command-center-project` skill for the complete recovery checklist.

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
