---
name: maintain-command-center-code-repository
description: Safely finish, version, and deploy a Main Sequence Command Center application code repository with command-center-sdk code-repository sync. Use when an application change is ready to commit and must produce the backend-recognized branch tag that triggers automatic deployment.
---

# Maintain And Deploy A Command Center CodeRepository

Use this workflow only in a consuming npm application that is registered as a Main Sequence
CodeRepository. It is not the source-maintenance workflow for changing the SDK package itself.

## Why CodeRepository Sync Is Required

Automatic deployment is keyed by a backend-owned tag for one registered `CodeRepositoryBranch`.
A plain commit, a locally invented `v<version>` tag, or a tag copied from another branch does not
establish that deployment identity. `command-center-sdk code-repository sync` keeps the npm
version, lockfile, Git commit, backend CodeRepositoryBranch, annotated tag, and pushed remote state
in one ordered workflow.

The backend decides the tag. Typical results include:

- `main` at version `1.2.4`: `v1.2.4`
- `dev` at version `1.2.4`: `v1.2.4-dev.1`
- `feature/foo` at version `1.2.4`: a backend-generated feature tag such as
  `v1.2.4-feature-foo-12345678.1`

Never reproduce these rules in application code. Always use the exact `tag_name` returned for the
current backend `CodeRepositoryBranch`.

## Preflight The CodeRepository

1. Confirm the Vite application is at the Git repository root. Nested `frontend/` applications are
   not supported.
2. Confirm that root contains `package.json` and `package-lock.json`.
3. Confirm the current Git checkout has an `origin` remote, an attached named branch, and a valid
   `HEAD` commit. The backend resolves this source context to the CodeRepository and
   CodeRepositoryBranch.
4. Do not add or restore superseded caller-supplied repository, branch, or Environment identity
   inputs in `.env`. They are not source-identity inputs; an optional positional CodeRepository UID
   is only a consistency assertion against the Git-resolved CodeRepository.
5. Ensure `MAINSEQUENCE_ENDPOINT` and a current `MAINSEQUENCE_ACCESS_TOKEN` are available only in
   the process environment. Never place the token in an argument, file, log, or report.
6. Inspect the installed SDK and resolve any authorized compatible update separately:

```bash
npx command-center-sdk application sdk-status --path . --json
npx command-center-sdk application update-sdk --path . --dry-run
```

`update-sdk` is dependency maintenance only. Run it only when the user authorizes the update, then
refresh guidance and rerun the application checks. It does not change the application version, contact
the deployment backend, commit, tag, or push, and it never replaces the release sync below.

7. If the application has `docs:check` or `build:docs`, verify the documentation source and combined
   artifact from the same root:

```bash
npm run docs:check
npm run build
npm run test:e2e
```

The root build must contain the application and `dist/docs`; a standalone documentation build is
not release proof. Follow `$document-command-center-application` for the canonical navigation,
toolchain, and browser checks. If the application uses another browser-script name, run its equivalent
production-artifact suite and record the exact command.

8. Run the read-only deployment preview from that root:

```bash
npx command-center-sdk code-repository sync -m "Describe the change" --path . --dry-run
```

The preview must reject any supplied path below the Git root and resolve the canonical `origin`,
attached branch, and exact `HEAD` commit to exactly one backend `CodeRepositoryBranch`. Validate the
backend-returned repository identity, branch, ref, and commit before using its CodeRepository and
CodeRepositoryBranch UIDs. If the branch is detached, its Git context is absent or ambiguous, or any
returned identity differs, stop. Do not search another application directory, fall back to `main`,
create a CodeRepositoryBranch implicitly, restore `.env` identity, or invent a tag. Register the branch
through the platform workflow and rerun preflight. It must also report the next npm patch version
and exact backend-owned branch tag, then reject an invalid or existing local tag without creating
SSH credentials or changing files.

## Understand The Complete-Tree Commit

The command intentionally runs `git add -A`, matching the Python `mainsequence code-repository sync`
workflow. Before executing it, inspect all tracked, untracked, modified, and deleted paths:

```bash
git status --short
git diff --check
```

Do not use code-repository sync when the working tree contains unrelated or sensitive material that should
not be committed. Preserve user-owned changes and resolve the intended commit boundary first.

## Execute The Deployment Sync

Run:

```bash
npx command-center-sdk code-repository sync -m "Describe the change" --path .
```

The command performs this ordered sequence:

1. Resolve the canonical Git origin, attached branch, and exact `HEAD` commit to the registered
   backend CodeRepository and `CodeRepositoryBranch` before local mutation.
2. Preview npm's patch result, request the backend-owned tag for that future version, and reject an
   invalid or existing local tag.
3. Ensure the repository-specific SSH key exists and read its public key.
   Its filename is `mainsequence-<repository-slug>-<first-16-sha256>` from the normalized
   `host[:non-default-port]/repository/path`; never select a key by repository basename alone and
   never fall back to a legacy basename-only key.
4. Register a newly created key through the owning CodeRepository's `add-deploy-key` action. For an
   existing key, first reuse it when Git access works; otherwise register it and retry.
5. Require `git push --dry-run --follow-tags origin HEAD:refs/heads/<branch>` to pass with that
   exact forced SSH identity.
6. Query the exact backend tag ref on `origin`; treat both a collision and an indeterminate remote
   check as a hard pre-mutation failure.
7. Bump the npm patch version without letting npm create a Git tag, then verify the result matches
   the preview.
8. Refresh `package-lock.json` and synchronize installed dependencies from it.
9. Stage the complete working tree and create the requested commit.
10. Create an annotated Git tag using the backend response unchanged.
11. Push atomically with `--follow-tags` while explicitly targeting `origin`,
    `HEAD:refs/heads/<branch>`, and the backend-generated `refs/tags/<tag>` ref.

Keep `--atomic --follow-tags` to match the canonical Python platform workflow. Never replace it
with a tag-only push. Keep the remote and refspecs explicit so local upstream, push-remote, or
push-default configuration cannot redirect the deployment sync or leave a partial remote update.

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

If failure happened before Git-context resolution, no version, key, dependency, commit, tag, or
push operation should have occurred. A deploy-key registration or Git preflight failure can leave
the generated local key or registered backend deploy key in place, but must leave the version,
dependency state, commit, and local tag unchanged. If failure happened after versioning, report the
produced version and tag and repair the existing state deliberately; do not rerun blindly and
create another patch version.

## Verify The Outcome

Confirm the final commit and backend-owned branch tag are present remotely. Treat that pushed tag,
not merely the commit, as the automatic-deployment trigger. Report the canonical repository
identity, attached ref, exact pre-sync `HEAD`, code repository UID, Git branch, CodeRepositoryBranch UID, version,
exact backend tag, and push result without reporting credentials.
