---
title: Application operations
description: Inspect, update, synchronize, and recover an SDK-consuming application.
---

# Application operations

This runbook covers the lifecycle of an application that consumes the SDK. It separates three
operations that are easy to confuse:

1. inspecting or updating the npm dependency;
2. refreshing version-matched agent guidance; and
3. versioning, committing, tagging, and pushing an application for automatic deployment.

Run commands from the consuming application's Git and npm root. Main Sequence Vite applications
keep `package.json`, `package-lock.json`, `.env`, `.agents/`, `src/`, and `vite.config.*` at that
root; a nested `frontend/` package is rejected by the application CLI.

## Inspect installed SDK state

```bash
npx command-center-sdk application sdk-status --path .
npx command-center-sdk application sdk-status --path . --json
```

The command reports five independent facts:

| Field | Question it answers |
| --- | --- |
| Declared | What dependency spec is written in `package.json`? |
| Locked | Which version and integrity are fixed by `package-lock.json`? |
| Installed | What is actually present in `node_modules`? |
| Wanted | What newest version satisfies the current declaration? |
| Latest | What version is currently tagged latest in the registry? |

Do not collapse these into one “current version.” A missing install, lockfile drift, compatible
update, and constraint-blocked major/minor release require different actions.

Use JSON output in CI or automation. Human output is for diagnosis and may change presentation
without changing the structured result.

## Preview and apply a compatible update

```bash
npx command-center-sdk application update-sdk --path . --dry-run
npx command-center-sdk application update-sdk --path .
```

The command performs a package-scoped npm update only when the current declaration supports it. It
does not widen an exact or constrained range. Linked, workspace, file, Git, URL, alias, and peer
dependency sources are reported but not rewritten.

| Result | Meaning | Next action |
| --- | --- | --- |
| Compatible update | `wanted` is newer and allowed | Review dry run, apply, then test |
| Constraint blocked | `latest` exists outside the declaration | Make an explicit compatibility decision |
| Drifted | declared, locked, and installed disagree | Repair the lock/install state before feature work |
| Missing | no usable installed package | Run the application's normal npm install workflow |
| Current | relevant versions agree | No package update required |

`update-sdk` does not call the backend, bump the application version, commit, tag, push, or deploy.
After an applied update, refresh skills and run the application's typecheck, tests, build, and
browser checks against the new package.

## Refresh SDK and platform guidance

Package installation copies SDK-version-matched skills under `.agents/skills/command-center/`.
Refresh that namespace explicitly when lifecycle scripts were disabled:

```bash
npx command-center-sdk skills install --path . --dry-run
npx command-center-sdk skills install --path .
```

When the backend-owned MCP catalog must also be current, authenticate through environment values
and use strict synchronization:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk skills sync --path . --dry-run --json
npx command-center-sdk skills sync --path .
```

Keep the bearer token out of command arguments and committed files. `skills sync` refreshes both
the packaged `command-center` namespace and backend-owned `mainsequence` namespace. It exits
nonzero on authentication, transport, manifest, or ownership failure. A normal npm postinstall
attempt is intentionally nonblocking and preserves the previous backend-owned installation when
refresh fails.

The installed package catalog is authoritative for the complete `command-center` namespace. Each
install, package postinstall, SDK update, or sync removes entries that are absent from the current
catalog, even when an older sentinel did not record them. Dry-run JSON exposes those paths in
`sdk.removed` (or `removed` for `skills install`). Keep application-authored skills in another
namespace; every other namespace under `.agents/skills` is preserved. The separately managed
`mainsequence` namespace continues to remove only backend-proven MCP paths.

## Preview automatic deployment synchronization

Use `code-repository sync` only after the complete application working tree is ready to become one
commit and one backend-recognized deployment:

```bash
export MAINSEQUENCE_ENDPOINT="https://your-platform.example"
export MAINSEQUENCE_ACCESS_TOKEN="<runtime access token>"
npx command-center-sdk code-repository sync -m "Update service dashboard" --path . --dry-run
```

Inspect `git status --short` first. The non-dry run stages the complete working tree, including
untracked files and deletions; it is not a partial-file commit helper.

Preflight validates the application root, then sends the canonical `origin`, attached branch, and
exact `HEAD` commit to the backend Git-context resolver. The backend authoritatively identifies the
matching branch and owning code repository. An optional positional code-repository UID is only an
assertion against that result; it is not local identity configuration.

The dry run also:

- previews the next npm patch version;
- requests the exact backend-owned deployment tag for that version and branch;
- rejects invalid or already-existing local tags;
- checks the exact remote tag ref on `origin`; and
- reports failure before version, dependency, commit, or local-tag mutation.

It does not create SSH credentials or make the application commit.

## What the non-dry run changes

After preflight succeeds, the command performs an ordered transaction-like workflow:

```text
resolve registered Git context and backend tag
  → prepare/reuse repository-specific SSH identity
  → verify dry-run push and exact remote tag absence
  → bump and verify npm patch version
  → refresh package-lock.json and run npm ci
  → git add -A and commit
  → create the backend-returned annotated tag
  → atomic explicit branch-and-tag push with --follow-tags
```

Run it with:

```bash
npx command-center-sdk code-repository sync -m "Update service dashboard" --path .
```

The explicit remote, branch refspec, backend tag ref, and `--atomic --follow-tags` prevent local
upstream or push-default configuration from redirecting deployment. Main, development, and feature
branches may receive different backend-owned tag formats; the CLI never duplicates or guesses the
backend algorithm.

Repository SSH keys use a hash of normalized `host[:non-default-port]/repository/path`, so
different repositories with the same basename cannot collide. Equivalent SCP and `ssh://` origins
resolve to the same identity. Existing repository-specific keys are reused only after Git access
passes; old basename-only keys are neither deleted nor used as a fallback.

## Timeouts and mutation boundaries

Backend calls default to 60 seconds. Override with `--timeout-ms` or
`COMMAND_CENTER_SDK_CODE_REPOSITORY_TIMEOUT_MS`, bounded from 1,000 to 300,000 milliseconds. The
CLI option wins. A Git-context timeout occurs before local mutation.

The command stops on the first failure, but steps after versioning are not automatically rolled
back. Depending on the failure point, the working tree may contain a version bump, refreshed
lockfile, installed dependencies, commit, local tag, generated SSH key, or registered backend
deploy key. This is why the dry run and clean review are mandatory.

## Recovery by failure point

| Failure point | Expected local state | Safe response |
| --- | --- | --- |
| Root or Git-context preflight | Unchanged | Fix path, branch registration, or detached checkout |
| Backend tag resolution | Unchanged | Fix backend registration or returned tag contract |
| SSH registration/access check | Version and Git refs unchanged; a new local/backend key may remain | Repair access, then rerun preflight |
| Remote tag collision/check | Version and Git refs unchanged | Resolve collision; never invent a replacement tag |
| npm version or install | Working tree may contain version/lock changes | Inspect the exact diff and npm output before continuing |
| Commit creation | Changes may be staged or committed | Inspect status and log; preserve unrelated work |
| Local tag creation | Commit may exist | Verify tag target and backend identity before retrying |
| Atomic push | Local commit and tag may exist; remote atomicity prevents branch/tag split | Diagnose transport or policy, then retry the exact push contract |

Do not use destructive reset commands as generic recovery. Inspect `git status`, the current commit,
the exact tag, and remote refs first; choose a recovery that preserves user work.

## Release readiness checklist

Before synchronization:

1. inspect the entire working tree, including untracked files;
2. run the consumer's typecheck, unit tests, production build, and relevant browser tests;
3. verify only declared package exports are imported;
4. refresh version-matched skills if the SDK changed;
5. confirm credentials are supplied only through the process environment;
6. run `code-repository sync --dry-run` and review the next npm patch version and backend tag; and
7. run the non-dry command only when all current changes belong in one release.

Application documentation has its own build and deep-link requirements; see
[Application documentation](./application-documentation.md). SDK-source publishing is a different
workflow documented in [Extending and releasing](./extending-and-releasing.md).
