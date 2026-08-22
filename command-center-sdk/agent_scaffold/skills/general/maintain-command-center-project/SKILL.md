---
name: maintain-command-center-project
description: Safely finish, version, and deploy a Main Sequence Command Center project with command-center-sdk project sync. Use when a project change is ready to commit and must produce the backend-recognized branch tag that triggers automatic deployment.
---

# Maintain And Deploy A Command Center Project

Use this workflow only in a consuming npm project that is registered as a Main Sequence Project.
It is not the source-maintenance workflow for changing the SDK package itself.

## Why Project Sync Is Required

Automatic deployment is keyed by a backend-owned tag for one registered `ProjectBranch`. A plain
commit, a locally invented `v<version>` tag, or a tag copied from another branch does not establish
that deployment identity. `command-center-sdk project sync` keeps the npm version, lockfile, Git
commit, backend ProjectBranch, annotated tag, and pushed remote state in one ordered workflow.

The backend decides the tag. Typical results include:

- `main` at version `1.2.4`: `v1.2.4`
- `dev` at version `1.2.4`: `v1.2.4-dev.1`
- `feature/foo` at version `1.2.4`: a backend-generated feature tag such as
  `v1.2.4-feature-foo-12345678.1`

Never reproduce these rules in project code. Always use the exact `tag_name` returned for the
current backend `ProjectBranch`.

## Preflight The Project

1. Confirm the Vite application is at the Git repository root. Nested `frontend/` applications are
   not supported.
2. Confirm that root contains `package.json`, `package-lock.json`, and `.env`.
3. Confirm `.env` contains the public `MAIN_SEQUENCE_PROJECT_UID`.
4. Confirm the current Git checkout has a named branch and an `origin` remote.
5. Ensure `MAINSEQUENCE_ENDPOINT` and a current `MAINSEQUENCE_ACCESS_TOKEN` are available only in
   the process environment. Never place the token in an argument, file, log, or report.
6. Run the read-only preview from that root:

```bash
npx command-center-sdk project sync -m "Describe the change" --path . --dry-run
```

The preview must reject any supplied path below the Git root and resolve the current Git branch to
exactly one backend `ProjectBranch`. If the branch is detached, absent from the Project, or
ambiguous, stop. Do not search another application directory, fall back to `main`, create a
ProjectBranch implicitly, or invent a tag. Register the branch through the platform workflow and
rerun preflight.

## Understand The Complete-Tree Commit

The command intentionally runs `git add -A`, matching the Python `mainsequence project sync`
workflow. Before executing it, inspect all tracked, untracked, modified, and deleted paths:

```bash
git status --short
git diff --check
```

Do not use project sync when the working tree contains unrelated or sensitive material that should
not be committed. Preserve user-owned changes and resolve the intended commit boundary first.

## Execute The Deployment Sync

Run:

```bash
npx command-center-sdk project sync -m "Describe the change" --path .
```

The command performs this ordered sequence:

1. Resolve the current Git branch to its registered backend `ProjectBranch` before local mutation.
2. Bump the npm patch version without letting npm create a Git tag.
3. Request that ProjectBranch's canonical default redeployment tag from the backend.
4. Refresh `package-lock.json` and synchronize installed dependencies from it.
5. Stage the complete working tree and create the requested commit.
6. Create an annotated Git tag using the backend response unchanged.
7. Push the branch and annotated tag with `git push --follow-tags`.

Use `--json` when another tool needs structured evidence. Structured output must never contain the
access token.

## Handle Failures Without Hiding State

Every failure stops the remaining steps. The command does not automatically roll back user files,
npm lifecycle effects, a completed commit, or a local tag. Read the reported failing stage, then
inspect:

```bash
git status --short
git log -1 --decorate --oneline
git tag --points-at HEAD
```

If failure happened before branch resolution, no version, key, dependency, commit, tag, or push
operation should have occurred. If it happened later, report the produced version and tag and
repair the existing state deliberately; do not rerun blindly and create another patch version.

## Verify The Outcome

Confirm the final commit and backend-owned branch tag are present remotely. Treat that pushed tag,
not merely the commit, as the automatic-deployment trigger. Report the project UID, Git branch,
ProjectBranch UID, version, exact backend tag, and push result without reporting credentials.
