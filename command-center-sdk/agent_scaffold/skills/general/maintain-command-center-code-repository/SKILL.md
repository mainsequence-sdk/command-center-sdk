---
name: maintain-command-center-code-repository
description: Finish, commit, and deploy a Main Sequence Command Center application code repository. Use when an application change is ready to commit, when dependencies changed and package-lock.json must be refreshed with command-center-sdk code-repository sync, or when deciding how a push, a release tag, and the workflow file's tag_regex deploy the application.
---

# Maintain And Deploy A Command Center CodeRepository

Use this workflow only in a consuming npm application that is registered as a Main Sequence
CodeRepository. It is not the source-maintenance workflow for changing the SDK package itself.

## How A Push Deploys

The platform deploys from Git pushes. The repository's `.mainsequence/workflows/*.yaml` file decides
which pushes deploy:

- `tag_regex` omitted or `null`: every push to the branch deploys.
- `tag_regex` set to a regular expression: a push deploys only when a tag that matches it points at
  the branch's latest commit.

`automatic_deployment` and `tag_regex` are set only in that workflow file. Change them there and
commit the change like any other file; no command or platform request sets them.

Versions and release tags are repository code. The Main Sequence platform no longer provides tag
names, and `command-center-sdk code-repository sync` no longer versions, commits, tags, or pushes.
When the workflow file sets a `tag_regex`, the repository's own CI creates the matching release
tags (see the example below). Never invent a tag by hand to force a deployment.

## Preflight The CodeRepository

1. Confirm the Vite application is at the Git repository root. Nested `frontend/` applications are
   not supported.
2. Confirm that root contains `package.json` and `package-lock.json`.
3. Read the repository's `.mainsequence/workflows/*.yaml` and note whether it sets `tag_regex`. That
   decides whether your push deploys by itself or waits for a matching release tag.
4. Inspect the installed SDK and resolve any authorized compatible update separately:

```bash
npx command-center-sdk application sdk-status --path . --json
npx command-center-sdk application update-sdk --path . --dry-run
```

`update-sdk` is dependency maintenance only. Run it only when the user authorizes the update, then
refresh guidance and rerun the application checks. It does not change the application version, contact
the deployment backend, commit, tag, or push.

5. If the application has `docs:check` or `build:docs`, verify the documentation source and combined
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

## Refresh Dependencies After Changing Them

After adding, removing, or upgrading a dependency in `package.json`, run from the repository root:

```bash
npx command-center-sdk code-repository sync --path .
```

It runs exactly two commands in that root:

1. `npm install --package-lock-only`, which refreshes `package-lock.json`;
2. `npm ci`, which installs exactly what the lockfile records.

It calls no backend, needs no sign-in, creates no SSH key, changes no version, and runs no Git
command. `--json` returns the commands and the completed stages. A path below the Git root, a
missing `package-lock.json`, or a failing npm command stops it and names the stage; nothing is
rolled back, so read the npm output and `git diff` before you fix and rerun. It takes no commit
message, `--dry-run`, or timeout any more and refuses them.

## Commit And Push

Commit and push the way you would in any Git repository. Review every path first and commit only
what belongs to the change:

```bash
git status --short
git diff --check
git add <paths that belong to the change>
git commit -m "Describe the change"
git push origin HEAD
```

Include `package-lock.json` whenever the sync changed it. With `tag_regex` omitted, this push
deploys. With a `tag_regex`, the push deploys once a matching tag points at the branch's latest
commit, which the repository's CI normally creates after the push.

## Release Tags Come From The Repository's Own CI

When the workflow file sets a `tag_regex`, add a release job to the repository. This GitHub Actions
workflow is an example of user code, not something the SDK installs; adapt the branch, Node version,
checks, and tag format to the repository:

```yaml
# .github/workflows/release.yml (example)
name: release
on:
  push:
    branches: [main]
concurrency:
  group: release-main
  cancel-in-progress: false
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - name: Tag the version declared in package.json
        run: |
          TAG="v$(node -p "require('./package.json').version")"
          if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
            echo "$TAG already exists; nothing to release"
            exit 0
          fi
          git tag "$TAG" "$GITHUB_SHA"
          git push origin "refs/tags/$TAG"
```

It tags each pushed commit on `main` whose `package.json` declares a version that has no tag yet,
after the repository's checks pass. To release, raise the version in the commit you push, for
example with `npm version patch --no-git-tag-version`, which updates `package.json` and
`package-lock.json` without creating a tag locally. A `tag_regex` such as `^v\d+\.\d+\.\d+$` then
deploys exactly those tagged commits. `fetch-depth: 0` brings the existing tags so the check sees
them, `contents: write` lets the job push the tag, and the `concurrency` group keeps two releases
from racing.

## Handle Failures Without Hiding State

`code-repository sync` stops at the first failure and rolls nothing back. Read the reported stage,
then inspect:

```bash
git status --short
git diff -- package.json package-lock.json
```

A failure before `update-lockfile` changed nothing. A failure in `update-lockfile` or
`install-lockfile` can leave `package-lock.json` or `node_modules` partly updated; fix the
dependency declaration and rerun the sync. Never reset, discard, or rewrite user changes to recover.

## Verify The Outcome

After the push, confirm the commit is on the remote branch. When the workflow file sets a
`tag_regex`, also confirm that the release job created the matching tag on the branch's latest
commit:

```bash
git fetch --tags origin
git log -1 --decorate --oneline origin/<branch>
git tag --points-at origin/<branch>
```

Report the branch, the pushed commit, the version, and the release tag when there is one, without
reporting credentials.
