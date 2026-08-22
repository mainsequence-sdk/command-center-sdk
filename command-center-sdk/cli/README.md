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

## Project Sync

`command-center-sdk project sync` mirrors Python's `mainsequence project sync` for consuming npm
projects whose Vite application is at the Git repository root. The supplied path must be that root
and contain `.env`, `package.json`, and `package-lock.json`; nested application directories fail
preflight rather than being discovered or translated. The orchestration, backend client, and local
npm/Git/SSH operations live in the focused `project-sync*.mjs` modules and remain dependency-free
and bin-only.

Before local mutation, the command requires a named Git branch and resolves it to the exact backend
`ProjectBranch` of `MAIN_SEQUENCE_PROJECT_UID`. Missing, duplicated, or detached branch identity is
a hard failure. It then ensures the repository-specific SSH key is registered through the owning
Project's `add-deploy-key` action and verifies the forced identity with
`git push --dry-run --follow-tags`. A reusable key that already passes the Git preflight is not
registered again. Deploy-key registration or Git access failures therefore stop before the version,
backend tag, commit, or local Git tag changes. Tag syntax remains backend-owned: after the npm patch
bump, the CLI posts the new version to that ProjectBranch's `default-redeployment-tag` action and
creates the returned annotated tag unchanged. Do not add local main/dev/feature naming rules.

Execution runs npm version, lockfile refresh and `npm ci`, `git add -A`, commit, annotated tag, and
`git push --follow-tags` in that order. Dry-run performs branch-resolution preflight but does not
bump versions, render a future tag, create SSH keys, install dependencies, or mutate Git. Failures
stop the workflow and report accumulated state; automatic rollback is deliberately excluded
because the working tree and npm lifecycle effects are consumer-owned.

## Theme Audit

`command-center-sdk theme audit --path <css-file-or-directory>` validates consumer-authored CSS
against the variables declared by this installed SDK version. It rejects unknown variables,
fallbacks that mask missing tokens, literal semantic colors and typography, and consumer aliases
that do not resolve transitively to SDK variables. Structural layout properties remain
application-owned. The command is dependency-free, supports `--json`, and exits nonzero for every
violation so consumers can include it in local checks and CI.
