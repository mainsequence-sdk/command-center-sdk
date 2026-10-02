# Command Center SDK CLI

This directory contains the Node-only command line surface shipped by
`@dev-mainsequence/command-center-sdk`. `command-center-sdk.mjs` is the npm binary,
`postinstall.mjs` performs automatic installation for local application dependencies, and the
focused installer modules own package copying, MCP discovery, provenance, validation, staging,
and rollback.

The installer recursively discovers skill leaves under `../agent_scaffold/skills` and preserves
their relative hierarchy below `<repository-root>/.agents/skills/command-center`. Parent category
folders do not need a `SKILL.md`. The installed package catalog is authoritative for the complete
`command-center` namespace: install, postinstall, update, and sync replace current skill leaves and
prune every file or folder outside their authorized paths, including unrecorded legacy `widget`,
`workspace`, flat-layout, and obsolete embed guidance. Other `.agents/skills` namespaces remain
untouched. Every successful write records package provenance, authoritative ownership mode, and
authorized relative paths in `PINNED_FROM.txt`.

Automatic installation resolves the consumer from npm's `INIT_CWD`. It deliberately refuses to
fall back to the lifecycle package directory because that could mutate `node_modules`. Global npm
installs skip automatic copying and retain the explicit command. When dependencies are installed
inside the SDK source repository, postinstall detects the private repository manifest and skips
consumer skill installation so it cannot create managed consumer files in the SDK checkout. Source
and destination overlap, symbolic links, invalid skill roots, and unresolved package versions block
writes.

Installs of the packaged skills into one repository take turns. npm runs one postinstall per
workspace that nests its own copy of the SDK, all at once and into the same `INIT_CWD`. An install
that writes first creates `.agents/skills/.command-center.lock` exclusively and holds it while it
validates and replaces the namespace; the others wait for it, then install against what it left. A
lock whose process on this machine has exited, or that is older than ten minutes, is cleared; after
a minute of waiting on a live one, the install fails and names the file. `--dry-run` takes no lock.
The Command Center AI package's installer uses the same lock for its own namespace.

## Platform MCP Skills

`command-center-sdk skills sync --path .` is the explicit, strict dual-source command. It refreshes
the packaged SDK skills above and retrieves the backend-owned catalog from authenticated MCP
resources. The client initializes the MCP protocol, follows `resources/list` pagination, reads
`mainsequence://platform/ontology`, and treats `ontology.skill_resources` as the authoritative
dynamic index. It reads only those skills and validates one manifest revision, list/read metadata,
hashes, byte sizes, MIME types, safe paths, and skill frontmatter before writing.

Backend-owned skills keep their declared hierarchy below
`<repository-root>/.agents/skills/ms-command-center/`, this package's own namespace.
`MCP_PINNED_FROM.txt` records the exact manifest and paths managed by this installer. Refreshes
overwrite or remove only those recorded folders. An unknown pre-existing destination blocks the
strict command.

The Python Main Sequence SDK owns `<repository-root>/.agents/skills/mainsequence/` and mirrors it,
deleting what it did not install, so this installer never writes there (issue #9). Versions before
0.5.12 installed the MCP skills there; after a successful install, the installer removes from that
folder only the folders its old `MCP_PINNED_FROM.txt` records (schema 1, this installer,
`source=mcp`) that the Python SDK's `PINNED_FROM.txt` does not also record, then that sentinel, then
the folder if nothing is left. A sentinel of another installer, a symbolic link, or an unsafe path
means nothing there is removed. `--dry-run --json` lists them under `platform.legacy`.

The MCP URL resolves from `--mcp-url`, `COMMAND_CENTER_SDK_MCP_URL`, `MAINSEQUENCE_MCP_URL`, or
the backend plus `/mcp`. Authentication uses `MAINSEQUENCE_ACCESS_TOKEN` when the process
environment sets it, and otherwise the machine session ([Machine Session](#machine-session)),
which is sent only to an MCP URL on its own backend. Tokens are never accepted in a command
argument or written to provenance. The CLI does not import browser auth or another application's
token store.

Postinstall always performs the packaged copy, then attempts the same MCP update when its URL and
access token are available in the environment; it reads no saved session. Authentication, transport, catalog, or MCP filesystem failures are
reported without failing npm installation and preserve the previous MCP tree. Set
`COMMAND_CENTER_SDK_MCP_POSTINSTALL=0` to disable that best-effort network lane. The explicit
`skills sync` command remains nonzero on every such failure.

Keep these modules dependency-free and bin-only. Do not export them through the browser SDK
entrypoint map. The one module another part of the package imports is `machine-session.mjs`, which
the Node-only `/vite` entry reads. Exercise changes through the Node tests and a packed-package smoke test. The
existing backend MCP manifest version 2 is authoritative; do not create a second Command Center
contract for the same catalog.

## Machine Session

SDK ADR 017. A developer signs in once per machine, and the CLI's commands that call the platform,
and the `/vite` plugin `platformRequestProxy()`, use that session. `machine-session.mjs` owns the
record and the stores, `login.mjs` the two logins and the logout request, and
`session-commands.mjs` the commands and their output. `machine-session.d.mts` declares the first
for the `/vite` entry's TypeScript, without Node's types.

| Command | Behavior |
| --- | --- |
| `login [<backend-url>] [--backend <url>] [--no-open] [--mcp] [--json]` | Browser login with PKCE, answered on a loopback port the CLI listens on. `--no-open` prints the address. `--mcp` prints the `auth.cli_authorize` tool call an agent's MCP connection makes, and waits for it. |
| `logout [--backend <url>] [--json]` | Ends the tracked session on the platform and removes the entry, also one it cannot read. |
| `refresh-token [--backend <url>] [--json]` | Renews the saved session and reports it. Removes credential entries from `./.env` and names them. `refresh_token` is accepted too. |
| `auth status [--backend <url>] [--check] [--json]` | The session report, without a token value. `--check` asks the platform. |
| `auth token [--backend <url>] [--json]` | A short-lived access token, renewed when it would expire within a minute. |

Names, JSON keys, and exit codes are those of the Main Sequence Python CLI, so a tool can ask
whichever CLI a project has: `0` success, `1` no usable session, `3` no credential store. With
`--json`, a failure is `{ "error": ... }` on standard error. No command prints a refresh token, and
no message carries a request or a token.

The record is one per backend: service `MainSequenceCLI.auth`, account `default.` plus the first 16
hexadecimal digits of SHA-256 of the backend URL, secret `{"v": 1, "backend", "username",
"access", "refresh"}` as ASCII JSON. The Python CLI reads and writes the same record. The backend
URL is kept as written, minus surrounding space and trailing slashes, because the account is
derived from it; never re-serialize it.

The backend resolves from `--backend`, `MAINSEQUENCE_ENDPOINT` in the environment, the same entry
in the project's `.env` (the only entry ever read from it), `backend_url` in `config.json` of the
settings directory the CLIs share, and last the standard platform.

Stores, each reached through a program of the system so every runtime uses one entry:

- **macOS**: the login Keychain through `/usr/bin/security`. macOS asks for consent when a program
  requests the secret of an entry another program created. Entries the CLIs write carry the comment
  `MainSequenceCLI.session.v1`; a read inspects the attributes first and requests the secret only
  when the comment is there. An entry without it is not read and is replaced by the next login. An
  entry this process has read is updated in place; any other is deleted and added. The secret goes
  to `security -i` on standard input, which reads 4,096-character lines, so a longer record is
  refused.
- **Linux**: Secret Service through `secret-tool`, with the attributes `service`, `username`, and
  `application = Python keyring library` and the label the Python library writes, so both CLIs
  replace one item. `secret-tool` exits `1` for a missing item and for an unreachable service; only
  the second writes to standard error.
- **Other systems**: no store. Commands exit `3`, and `MAINSEQUENCE_ACCESS_TOKEN` is the only
  credential.

`skills sync` takes `sessionAccess` from the binary. Called as a library without it, it uses only the
values and the environment it is given. `postinstall.mjs` never reads the session, and
`code-repository sync` calls no platform.

No test may read or write the machine's credential store. The functions take `store`, `fetchImpl`,
`env`, `cwd`, and `io`; `tests/cli/session-test-support.mjs` has the stand-ins. A test that starts
the binary must fail at argument parsing, or set `MAINSEQUENCE_ACCESS_TOKEN`.

## Application Documentation Initialization

`command-center-sdk application docs init --path .` safely installs the official application
documentation system into a consuming npm frontend. The application root must contain `package.json`
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

The scaffold keeps `documentation/navigation.json` as the canonical ordered projection of the
visible application menu. Schema version 2 derives each navigation folder and `index.md` path from
stable menu IDs, then generates `docs/SUMMARY.md` and `documentation/sidebars.mjs`. Its checks
enforce the one-root npm/Node toolchain, end-user-only page metadata and structure,
navigation-to-folder parity, local links, and generated-file freshness. The consuming frontend
remains responsible for verified task content, its optional Vite development proxy, and browser
tests against the combined production artifact. Deployment configuration remains platform-owned.

## Application SDK Status And Update

`command-center-sdk application sdk-status --path .` inspects a consuming application at the Git
repository root. It reads the SDK declaration from `package.json`, the resolved version from
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
| `not_declared` | The application does not declare the SDK. |
| `unsupported_dependency_type` | The SDK is declared only as a peer dependency. |
| `unsupported_source` | The declaration uses a linked, workspace, file, Git, URL, or alias source. |

`command-center-sdk application update-sdk --path .` runs
`npm update @dev-mainsequence/command-center-sdk --save` only for a supported declaration that
needs repair or has a compatible update. `--dry-run` reports that exact command without mutation.
The command disables only the authenticated MCP postinstall attempt so npm output cannot trigger a
network-dependent guidance refresh, then re-inspects the application and fails if the package remains
inconsistent. It never updates unrelated packages, widens a blocked dependency range, calls the
backend, changes the application version, commits, tags, or pushes. Run `skills sync` explicitly
afterward when strict backend-owned guidance refresh is required.

## CodeRepository Sync

`command-center-sdk code-repository sync [--path <repository-root>] [--json]` keeps a consuming npm
application's dependency files current. The supplied path must be the Git repository root and
contain `package.json` and `package-lock.json`; nested application directories fail preflight rather
than being discovered or translated. The root is found on the file system (the nearest `.git` folder
or file), so the command needs no Git program. It then runs, in that root:

1. `npm install --package-lock-only`, stage `update-lockfile`;
2. `npm ci`, stage `install-lockfile`.

That is all it does. It makes no backend request, reads no session or token, creates no SSH key,
runs no `npm version`, and runs no Git command. Commit and push the changed files yourself.
`--json` keeps npm's output off standard output and prints the commands and the completed stages; a
failure prints `{ error, stage, codeRepositoryDir, completed }` and exits `1`. Nothing is rolled
back. The arguments earlier versions took to commit, tag, and push (positional commit message or
CodeRepository UID, `-m`/`--message`, a dry run, a backend timeout) fail argument parsing with an
error that says the command no longer commits, tags, or pushes.

Deployment is not this command's business. The platform deploys from Git pushes as the repository's
`.mainsequence/workflows/*.yaml` says: `tag_regex` omitted or `null` deploys every push, a regular
expression deploys only when a matching tag points at the branch's latest commit. Release tags are
created by the repository's own CI. Do not add tag naming, version bumps, or platform calls back to
this command. `code-repository-sync.mjs` holds the steps and `code-repository-sync-local-ops.mjs`
the root check and the npm runner; both stay dependency-free and bin-only.

## Theme Audit

`command-center-sdk theme audit --path <css-file-or-directory>` validates consumer-authored CSS
against the variables declared by this installed SDK version. It rejects unknown variables,
fallbacks that mask missing tokens, literal semantic colors and typography, and consumer aliases
that do not resolve transitively to SDK variables. Structural layout properties remain
application-owned. The command is dependency-free, supports `--json`, and exits nonzero for every
violation so consumers can include it in local checks and CI.
