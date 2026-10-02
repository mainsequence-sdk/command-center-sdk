---
title: Application operations
description: Inspect, update, refresh, deploy, and recover an SDK-consuming application.
---

# Application operations

This runbook covers the lifecycle of an application that consumes the SDK. It separates three
operations that are easy to confuse:

1. inspecting or updating the npm dependency;
2. refreshing version-matched agent guidance; and
3. refreshing dependencies, then committing and pushing so the platform deploys the application.

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

## Sign in once per machine

The commands below that call the platform, and the local dev server's platform proxy, act as you.
Sign in once:

```bash
npx command-center-sdk login
```

The browser opens the platform's sign-in page, and the session is saved in the operating system's
credential store: the login Keychain on macOS, and Secret Service on Linux, which the CLI reaches
through `secret-tool` from your distribution's libsecret tools. It is one session per backend for
every project on the machine. The Main Sequence Python CLI (`mainsequence`) reads and writes the
same session, so a login with either CLI serves both. The tools renew it by themselves.

The project names its backend and holds no token. The backend is the first of these that is set:
`--backend <url>`, `MAINSEQUENCE_ENDPOINT` in the environment, `MAINSEQUENCE_ENDPOINT` in the
project's `.env`, the backend a Main Sequence CLI saved on this machine, and the standard platform.

| Command | What it does |
| --- | --- |
| `login [--backend <url>] [--no-open]` | Signs in through the browser. `--no-open` prints the address instead of opening it. |
| `login --mcp` | For a coding agent with an authenticated Main Sequence MCP connection: prints the `auth.cli_authorize` tool call that approves the login. |
| `auth status [--check] [--json]` | Reports the session this project would use, without a token value. `--check` also asks the platform. |
| `auth token [--json]` | Prints a short-lived access token for another local tool, and never the refresh token. |
| `refresh-token` | Renews the session, and removes credential entries that an earlier setup left in `./.env`. |
| `logout` | Ends the session on the platform and removes it from the machine. |

Exit code `1` means there is no usable session: run `login`. Exit code `3` means the CLI reaches no
credential store on this machine.

A launcher or a CI job sets `MAINSEQUENCE_ENDPOINT` and `MAINSEQUENCE_ACCESS_TOKEN` in its
environment instead. That token wins over the saved session and is sent only to that endpoint. Keep
tokens out of command arguments and committed files. SDK ADR 017 records the decision.

## Refresh SDK and platform guidance

Package installation copies SDK-version-matched skills under `.agents/skills/command-center/`.
Refresh that namespace explicitly when lifecycle scripts were disabled:

```bash
npx command-center-sdk skills install --path . --dry-run
npx command-center-sdk skills install --path .
```

When the backend-owned MCP catalog must also be current, use strict synchronization. It
authenticates with your saved session ([Sign in once per machine](#sign-in-once-per-machine)), or
with the token in the environment when one is set:

```bash
npx command-center-sdk skills sync --path . --dry-run --json
npx command-center-sdk skills sync --path .
```

`skills sync` refreshes both
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

## Refresh dependencies with code-repository sync

After you add, remove, or upgrade a dependency in `package.json`, refresh the lockfile and the
installed packages from the repository root:

```bash
npx command-center-sdk code-repository sync --path .
npx command-center-sdk code-repository sync --path . --json
```

The command checks that the path is the Git repository root and holds `package.json` and
`package-lock.json`, then runs exactly:

```text
npm install --package-lock-only   refreshes package-lock.json
npm ci                            installs exactly what the lockfile records
```

It calls no backend, needs no sign-in, creates no SSH key, changes no version, and runs no Git
command. `--json` returns the commands and the completed stages. It takes no commit message,
CodeRepository UID, `--dry-run`, or timeout any more, and refuses them with an error that says so.

## Commit and push

Commit and push the way you would in any Git repository. Review every path first, including
untracked files, and commit only what belongs to the change, with `package-lock.json` whenever the
sync changed it:

```bash
git status --short
git diff --check
git add <paths that belong to the change>
git commit -m "Update service dashboard"
git push origin HEAD
```

## How a push deploys

The platform deploys from Git pushes. The repository's `.mainsequence/workflows/*.yaml` file
decides which pushes deploy:

| `tag_regex` in the workflow file | What deploys |
| --- | --- |
| omitted or `null` | Every push to the branch. |
| a regular expression | The commit a matching tag points at, whether it is the branch's latest commit or an older one. |

`automatic_deployment` and `tag_regex` are set only in that workflow file: change them there and
commit the change. The Main Sequence platform no longer provides tag names, and
`code-repository sync` no longer creates or pushes tags.

## Release tags from the repository's own CI

When the workflow file sets a `tag_regex`, the repository's own CI creates the release tags. This
GitHub Actions workflow is an example of user code, not something the SDK installs; adapt the
branch, Node version, checks, and tag format to the repository:

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

The job tags each pushed commit on `main` whose `package.json` declares a version that has no tag
yet, after the checks pass. To release, raise the version in the commit you push, for example with
`npm version patch --no-git-tag-version`, which updates `package.json` and `package-lock.json`
without creating a tag. A `tag_regex` such as `^v\d+\.\d+\.\d+$` then deploys exactly those tagged
commits. `fetch-depth: 0` brings the existing tags so the check sees them, `contents: write` lets
the job push the tag, and the `concurrency` group keeps two releases from racing.

## Recovery

`code-repository sync` stops at the first failure, names the stage, and rolls nothing back.

| Failure stage | Local state | Safe response |
| --- | --- | --- |
| `resolve-code-repository-directory`, `inspect-code-repository` | Unchanged | Run it from the Git repository root, which holds `package.json` and `package-lock.json` |
| `update-lockfile` | `package-lock.json` may be partly refreshed | Read the npm output, fix the dependency declaration, and rerun |
| `install-lockfile` | `node_modules` may be partly installed | Read the npm output and rerun; the lockfile is already current |

When a commit did not deploy and the workflow file sets a `tag_regex`, check whether a matching tag
points at that commit: look at the release job's run, and at `git tag --points-at <commit>` after
`git fetch --tags origin`. Do not use destructive reset commands as generic
recovery; preserve user work.

## Release readiness checklist

Before you push a change meant for deployment:

1. inspect the entire working tree, including untracked files;
2. run `code-repository sync` when dependencies changed, and commit the refreshed lockfile;
3. run the consumer's typecheck, unit tests, production build, and relevant browser tests;
4. verify only declared package exports are imported;
5. refresh version-matched skills if the SDK changed;
6. keep credentials out of committed files; and
7. when the workflow file sets a `tag_regex`, raise the version for a release and confirm the
   repository's CI tags the pushed commit.

Application documentation has its own build and deep-link requirements; see
[Application documentation](./application-documentation.md). SDK-source publishing is a different
workflow documented in [Extending and releasing](./extending-and-releasing.md).
