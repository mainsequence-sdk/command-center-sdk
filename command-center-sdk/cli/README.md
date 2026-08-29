# Command Center SDK CLI

This directory contains the Node-only command line surface shipped by
`@dev-mainsequence/command-center-sdk`. `command-center-sdk.mjs` is the npm binary,
`postinstall.mjs` performs automatic installation for local project dependencies, and the focused
installer modules own package copying, MCP discovery, provenance, validation, staging, and
rollback.

The installer recursively discovers skill leaves under `../agent_scaffold/skills` and preserves
their relative hierarchy below `<project>/.agents/skills/command-center`. Parent category folders
do not need a `SKILL.md`. It preserves other skill namespaces and unrelated folders in the managed
namespace. Every successful write records package provenance and managed relative paths in
`PINNED_FROM.txt`; upgrades remove only paths recorded as SDK-managed, including the legacy flat
layout.

Automatic installation resolves the consumer from npm's `INIT_CWD`. It deliberately refuses to
fall back to the lifecycle package directory because that could mutate `node_modules`. Global npm
installs skip automatic copying and retain the explicit command. When dependencies are installed
inside the SDK source repository, postinstall detects the private repository manifest and skips
consumer skill installation so it cannot create managed consumer files in the SDK checkout. Source
and destination overlap, symbolic links, invalid skill roots, and unresolved package versions block
writes.

## Platform MCP Skills

`command-center-sdk skills sync --path .` is the explicit, strict dual-source command. It refreshes
the packaged SDK skills above and retrieves the backend-owned catalog from authenticated MCP
resources. The client initializes the MCP protocol, follows `resources/list` pagination, reads
`mainsequence://platform/ontology`, and treats `ontology.skill_resources` as the authoritative
dynamic index. It reads only those skills and validates one manifest revision, list/read metadata,
hashes, byte sizes, MIME types, safe paths, and skill frontmatter before writing.

Backend-owned skills keep their declared hierarchy below
`<project>/.agents/skills/mainsequence/`. `MCP_PINNED_FROM.txt` records the exact manifest and paths
managed by this installer. Refreshes overwrite or remove only those recorded folders. An existing
Python `PINNED_FROM.txt` may prove that a matching folder is already MCP-owned; it is never
rewritten by this package. An unknown pre-existing destination blocks the strict command.

The MCP URL resolves from `--mcp-url`, `COMMAND_CENTER_SDK_MCP_URL`, `MAINSEQUENCE_MCP_URL`, or
`MAINSEQUENCE_ENDPOINT` plus `/mcp`. Authentication uses the process-only
`MAINSEQUENCE_ACCESS_TOKEN`; tokens are never accepted in a command argument or written to
provenance. The CLI does not import browser auth or another application's token store.

Postinstall always performs the packaged copy, then attempts the same MCP update when its URL and
access token are available. Authentication, transport, catalog, or MCP filesystem failures are
reported without failing npm installation and preserve the previous MCP tree. Set
`COMMAND_CENTER_SDK_MCP_POSTINSTALL=0` to disable that best-effort network lane. The explicit
`skills sync` command remains nonzero on every such failure.

Keep these modules dependency-free and bin-only. Do not export them through the browser SDK
entrypoint map. Exercise changes through the Node tests and a packed-package smoke test. The
existing backend MCP manifest version 2 is authoritative; do not create a second Command Center
contract for the same catalog.

## Project Documentation Initialization

`command-center-sdk application docs init --path .` safely installs the official application
documentation system into a consuming npm frontend. The project root must contain `package.json`
and `package-lock.json`, use the active Node major declared by `engines.node` and `.node-version`
or `.nvmrc`, and contain no competing package-manager lockfile. `--dry-run` reports changes,
`--json` returns structured evidence, and `--skip-install` writes the scaffold without running
`npm install`.

The command preserves the original application build as `build:app`, makes root `build` run the
application and Docusaurus builds in sequence, and emits documentation under `dist/docs` for the
public `/docs/` route. It copies the versioned template from the packaged
`document-command-center-application` skill, installs exact Docusaurus development dependencies,
and never overwrites different existing files or manifest values. Re-running an unchanged
initialization is idempotent.

The scaffold keeps `documentation/navigation.json` as the canonical ordered source for generated
`docs/SUMMARY.md` and `documentation/sidebars.mjs`. Its checks enforce the one-root npm/Node
toolchain, audience-classified documentation, navigation coverage, local links, and generated-file
freshness. The consuming frontend remains responsible for its authored content, Vite development
proxy when desired, and browser tests against the combined production artifact. Deployment
configuration remains platform-owned.

## Project SDK Status And Update

`command-center-sdk application sdk-status --path .` inspects a consuming project at the Git repository
root. It reads the SDK declaration from `package.json`, the resolved version from
`package-lock.json`, and the installed version from `node_modules`, then uses npm registry commands
to resolve the compatible `wanted` version and registry `latest` version. `--json` returns these
facts together with `dependencyType`, `status`, `updateAvailable`, `updateSupported`, and a
user-facing `hint`.

Status values are deliberately explicit:

| Status | Meaning |
| --- | --- |
| `current` | Declaration, lockfile, and installation are aligned and no compatible update exists. |
| `update_available` | npm reports a newer version allowed by the existing declaration. |
| `constraint_blocked` | Registry `latest` is newer but outside the declaration's policy. |
| `lock_missing` | The dependency is declared but absent from `package-lock.json`. |
| `install_required` | The locked package is absent from `node_modules`. |
| `installed_drift` | The installed and locked versions differ. |
| `not_declared` | The project does not declare the SDK. |
| `unsupported_dependency_type` | The SDK is declared only as a peer dependency. |
| `unsupported_source` | The declaration uses a linked, workspace, file, Git, URL, or alias source. |

`command-center-sdk application update-sdk --path .` runs
`npm update @dev-mainsequence/command-center-sdk --save` only for a supported declaration that
needs repair or has a compatible update. `--dry-run` reports that exact command without mutation.
The command disables only the authenticated MCP postinstall attempt so npm output cannot trigger a
network-dependent guidance refresh, then re-inspects the project and fails if the package remains
inconsistent. It never updates unrelated packages, widens a blocked dependency range, calls the
backend, changes the application version, commits, tags, or pushes. Run `skills sync` explicitly
afterward when strict backend-owned guidance refresh is required.

## CodeRepository Sync

`command-center-sdk code-repository sync` mirrors Python's `mainsequence code-repository sync` for consuming npm
projects whose Vite application is at the Git repository root. The supplied path must be that root
and contain `package.json` and `package-lock.json`; nested application directories fail preflight
rather than being discovered or translated. The orchestration, backend client, and local npm/Git/SSH
operations live in the focused `code-repository-sync*.mjs` modules and remain dependency-free and bin-only.

Before local mutation, the command resolves the canonical `origin`, attached branch, and exact
`HEAD` commit through `POST /api/v1/code-repository-branches/resolve-git-context/`, implementing the
Git-native source-identity contract from platform ADR-0037. The response supplies the exact
`CodeRepositoryBranch` and its parent CodeRepository UID. Superseded local repository-identity markers are neither read nor written;
if a caller supplies the legacy positional CodeRepository UID, it is only an assertion and cannot select
another CodeRepository. Missing, ambiguous, mismatched, or detached Git identity is a hard failure. The
command previews the npm patch version, requests the backend-owned tag, and rejects an invalid or
existing local tag. It then ensures the repository-specific SSH key is registered through the
resolved owning CodeRepository's `add-deploy-key` action and verifies the forced identity with
`git push --dry-run --follow-tags origin HEAD:refs/heads/<branch>`. A reusable key that already
passes the Git preflight is not registered again. Deploy-key registration or Git access failures
therefore stop before the version, commit, or local Git tag changes. The exact backend tag is then
queried on `origin`; a collision or indeterminate result also stops before mutation. Tag syntax
remains backend-owned. Do not add local main/dev/feature naming rules.

The governing decision is
[platform ADR-0037](https://github.com/Main-Sequence-Server-Side/tdag-django/blob/development/docs/platform/adr/adr-0037-git-native-project-source-context.md).

The repository key filename is `mainsequence-<repository-slug>-<first-16-sha256>` from the
normalized `host[:non-default-port]/repository/path`. Equivalent SCP and `ssh://` origins share an
identity while same-basename repositories do not. Basename-only key files remain untouched and
are never used as a compatibility fallback.

Execution runs npm version, verifies the result matches the preview, refreshes the lockfile and runs
`npm ci`, stages, commits, creates the annotated tag, and atomically pushes the explicit resolved
branch and backend tag refs with `--follow-tags`. Dry-run performs branch resolution, future-version
and tag rendering, and local tag validation, but does not create SSH keys, query private remote
refs, install dependencies, or mutate Git. Failures stop the workflow and report accumulated state;
automatic rollback is deliberately excluded because the working tree and npm lifecycle effects are
consumer-owned.

## Theme Audit

`command-center-sdk theme audit --path <css-file-or-directory>` validates consumer-authored CSS
against the variables declared by this installed SDK version. It rejects unknown variables,
fallbacks that mask missing tokens, literal semantic colors and typography, and consumer aliases
that do not resolve transitively to SDK variables. Structural layout properties remain
application-owned. The command is dependency-free, supports `--json`, and exits nonzero for every
violation so consumers can include it in local checks and CI.
