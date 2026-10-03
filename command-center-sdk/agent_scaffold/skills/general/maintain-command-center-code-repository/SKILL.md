---
name: maintain-command-center-code-repository
description: Finish, commit, and deploy a Main Sequence Command Center application code repository. Use when an application change is ready to commit, when dependencies changed and package-lock.json must be refreshed with command-center-sdk code-repository sync, when deciding how a push, a release tag, and the workflow file's tag_regex deploy the application, or when a static site must call a different API release in each Environment (development, production).
---

# Maintain And Deploy A Command Center CodeRepository

Use this workflow only in a consuming npm application that is registered as a Main Sequence
CodeRepository. It is not the source-maintenance workflow for changing the SDK package itself.

## How A Push Deploys

The platform deploys from Git pushes. The repository's `.mainsequence/workflows/*.yaml` file decides
which pushes deploy:

- `tag_regex` omitted or `null`: every push to the branch deploys.
- `tag_regex` set to a regular expression: a tag that matches it deploys the commit it points at,
  whether that is the branch's latest commit or an older commit on the branch. A push without a
  matching tag deploys nothing.

`automatic_deployment` and `tag_regex` are set only in that workflow file. Change them there and
commit the change like any other file; no command or platform request sets them.

Versions and release tags are repository code. The Main Sequence platform no longer provides tag
names, and `command-center-sdk code-repository sync` no longer versions, commits, tags, or pushes.
When the workflow file sets a `tag_regex`, the repository's own CI creates the matching release
tags (see the example below). Do not create a tag by hand unless the user asks for it; "Creating A
Release Tag" below shows how.

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
deploys. With a `tag_regex`, a commit deploys once a matching tag points at it, which the
repository's CI normally creates after the push; a tag on an older commit of the branch deploys that
commit.

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

### Development Deploys Every Push, Production Deploys Tags

A common setup uses two workflow files scoped to Environments. On the production branch only the
first applies; on the development branch only the second:

```yaml
# .mainsequence/workflows/app-production.yaml
api_version: "2.3.0"
name: app-production
scope:
  environments: [production]
resources:
  - key: app
    kind: static_site
    spec:
      name: My App
      framework: vite
      output_directory: dist
      routing_mode: spa
      automatic_deployment: true
      automatic_redeployment:
        enabled: true
        tag_regex: "^v[0-9]+\\.[0-9]+\\.[0-9]+$"
```

```yaml
# .mainsequence/workflows/app-development.yaml
api_version: "2.3.0"
name: app-development
scope:
  environments: [development]  # the development Environment's exact name
resources:
  - key: app
    kind: static_site
    spec:
      name: My App
      framework: vite
      output_directory: dist
      routing_mode: spa
      automatic_deployment: true
      automatic_redeployment:
        enabled: true
```

A push to the development branch deploys at once. A merge to `main` deploys nothing until a matching
tag points at a commit on `main`; with the release job above, CI creates that tag after the checks
pass. Take the exact fields from the branch's workflow template and validate each file with the
platform before committing it. When the site calls an API, each of these files also names its own
Environment's API releases; see "Point Each Environment At Its Own APIs" below.

### Creating A Release Tag

The platform reacts to the tag push, however the tag was made. The short tag name must fully match
`tag_regex`, and the tagged commit must be on the branch (its latest commit or an older one).

- CI, as in the release job above. This is the recommended path.
- By hand, only when the user asks for it:

  ```bash
  git tag v1.3.0 <commit>
  git push origin v1.3.0
  ```

  Lightweight and annotated tags both work. Push one tag at a time: GitHub sends no event when more
  than three tags are pushed at once, so `git push --tags` can deploy nothing.
- A GitHub Release: publishing a release with a new tag, in the web UI or with
  `gh release create v1.3.0 --target main`, creates the tag, and that tag deploys like a pushed one.

A tag created with the Actions `GITHUB_TOKEN` starts no other GitHub Actions workflow, but it still
reaches Main Sequence. Deleting a tag deploys nothing and removes nothing. A tag that does not match,
or whose commit is only on another branch, deploys nothing for that application.

### Going Back To An Older Version

Two ways work. Use either only when the user asks for it.

- Revert and release a new version: `git revert <commit>`, raise the patch version with
  `npm version patch --no-git-tag-version`, commit, push, and let CI tag the result. This works for
  every application, including one that deploys every push, and keeps the version moving forward.
- For an application with a `tag_regex`, push the older version's tag again. GitHub sends an event
  only when a tag is created, so delete the tag on GitHub and push it again; it still points at the
  same commit:

  ```bash
  git fetch --tags origin
  git push origin :refs/tags/v1.2.0
  git push origin v1.2.0
  ```

  The application redeploys that commit exactly as it was released: its code, its build and its
  workflow file, whose settings replace the current ones. The commit must still be on the branch and
  the tag must match the current `tag_regex`. An application that deploys every push ignores the tag.
  Re-pushing a tag also re-runs any GitHub Actions workflow that the tag triggers, and a tag ruleset
  may forbid deleting it; use the revert route then. The next release tag deploys a newer version
  again.

## Point Each Environment At Its Own APIs

An Environment is one branch, and the platform makes a separate release for every branch it
deploys. The FastAPI release on `development` and the one on `main` are two releases with two UIDs.
A static site reaches an API only by its release UID, and the platform tells the site nothing about
its Environment or its APIs. The only per-Environment values a site receives are the ones its own
workflow file writes in `spec.build_environment`, which the platform passes to the build. So each
Environment's workflow file must name that Environment's API releases.

The platform does not catch a mismatch. Delegated access checks the Organization, that the person
can view both releases, and the API's CORS policy; it does not compare Environments. A development
build holding the production API's UID works, and reads and writes production data, without an
error.

1. Deploy the API on the branch first. Its release in an Environment exists only after a push of
   its workflow file reaches that Environment's branch.
2. Find the API's release in each Environment. Release names repeat across branches, so never take
   a UID without its Environment. List the Organization Environments
   (`organization_environment.list`, or `GET /api/v1/organization-environments/`) for each
   Environment's UID and branch, then list the API's releases by exact name and kind in that
   Environment:
   `GET /api/v1/resource-releases/?name=<API name>&release_kind=fastapi&organization_environment_uid=<Environment UID>`.
   When you cannot query the platform, ask the user for each Environment's UID.
3. Write each Environment's UIDs into that Environment's workflow file, under the static site's
   `spec.build_environment`, a map of string values. The variable name and its format belong to the
   application; this one is the JSON map that the SDK's static-site example reads:

```yaml
# .mainsequence/workflows/app-development.yaml
api_version: "2.3.0"
name: app-development
scope:
  environments: [development]
resources:
  - key: app
    kind: static_site
    spec:
      name: My App
      framework: vite
      output_directory: dist
      routing_mode: spa
      build_environment:
        VITE_API_TRANSPORT: hosted
        VITE_FASTAPI_RELEASES: '{"reports":"<reports API release UID in development>"}'
      automatic_deployment: true
      automatic_redeployment:
        enabled: true
```

`app-production.yaml` carries the same keys with the production UIDs, next to its `tag_regex`.
Read the values in the application with `import.meta.env`, never with a UID written in source code.

Keep to these rules:

- Use one workflow file per Environment, each scoped with `scope.environments`. Both files travel
  with every merge, and each applies only on its own branch. A single unscoped file carries the
  development UIDs into `main` on the next merge.
- Write only public routing values: release UIDs, API names, public URLs. Vite writes every
  `VITE_*` value into the bundle, and the file is in Git; never put a credential, token, or secret
  there.
- Keys starting with `MAINSEQUENCE_`, and `VITE_COMMAND_CENTER_ORIGIN`, are reserved and refused.
  The platform sets `VITE_COMMAND_CENTER_ORIGIN` itself in every Vite build, to the Command Center
  origin that embeds the site; read it as the host origin instead of defining your own. The map
  holds at most 100 variables, and a value at most 8192 characters.
- Values are literals: the file has no interpolation, and the platform fills in no UID.
- Keep the values in the workflow file. The platform returns only their names, never their values,
  so the file on the branch is the record.
- A changed value reaches the site only with a deploy: the push on a branch that deploys every push,
  or a matching tag on a commit that carries the change. Pushing an older tag again deploys that
  commit's workflow file, with the UIDs it held.

The same applies to anything else the site names per Environment. An Agent is deployed once per
branch too, so a site that opens an Agent conversation writes that Environment's Agent UID and the
Environment's own UID in the same file; the platform lists no sessions for an Agent outside the
Environment the site passes.

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
`tag_regex`, also confirm that the release job created the matching tag on the commit you pushed:

```bash
git fetch --tags origin
git log -1 --decorate --oneline origin/<branch>
git tag --points-at <pushed commit>
```

When the site names API releases, check each Environment's workflow file on its branch against the
Environment lookup from "Point Each Environment At Its Own APIs" before you push. After the deploy,
open each Environment's site in Command Center and confirm in the browser's network panel
that its API requests carry that Environment's release UID in `X-Resource-Release-UID`.

Report the branch, the pushed commit, the version, and the release tag when there is one, without
reporting credentials.
