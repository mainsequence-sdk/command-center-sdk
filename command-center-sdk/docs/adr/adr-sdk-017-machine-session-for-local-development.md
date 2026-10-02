# SDK ADR 017: One Machine Session for Local Development

- Status: Accepted
- Date: 2026-09-30
- Implementation: `@dev-mainsequence/command-center-sdk` unreleased
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Contract: none; new CLI commands, and the token source of `platformRequestProxy()`
- Amended 2026-10-02: `code-repository sync` no longer calls the platform. It only refreshes
  `package-lock.json` and runs `npm ci`, so it reads no session; decision 11 no longer applies, and
  the session serves `skills sync` and `platformRequestProxy()`.
- Related:
  - [SDK ADR 014: Local Platform Request Proxy](./adr-sdk-014-local-platform-request-proxy.md)
    (amended: its token source, its `401` handling, and its `platform_not_configured` answers)
  - [Application operations](../application-operations.md#sign-in-once-per-machine),
    [Static-site embeds](../static-site-embeds.md#send-platform-requests-in-local-development)

## Publication status

This decision is implemented in SDK source for the next package release. A project has it when its
installed CLI lists `login` in `command-center-sdk --help`.

## Decision summary

A developer signs in once per machine. The session is one record per backend in the operating
system's credential store, and the Main Sequence Python CLI reads and writes the same record, so a
login made with either CLI serves both. The SDK's Node tools that call the platform use it: the
`skills sync` command and the `platformRequestProxy()` Vite plugin (`code-repository sync` did too
until it stopped calling the platform; see the amendment above). No
project file holds a token: a project names its backend, and the machine holds the session.
`MAINSEQUENCE_ACCESS_TOKEN` in the environment still wins, so a launcher or a CI job works as
before.

## Context

### A token in every project

The SDK's Node tools read `MAINSEQUENCE_ACCESS_TOKEN` from the process environment (SDK ADR 014,
the CLI README). A developer got that token into the environment by exporting it in each shell or
by keeping it in the project's `.env`, in plain text, once per project. An access token is
short-lived, so a dev server started with one answered `401` once it expired, until it was
restarted with a new one.

### The session already exists on the machine

The Main Sequence Python CLI (`mainsequence`) keeps the developer's session in the operating
system's credential store and renews it. A Command Center application is a Node project and may
have no Python CLI, so its tools could not use that session.

## Decision drivers

- One login per machine, whichever CLI makes it, and no token in a project file.
- The tools renew the session themselves; nobody restarts a dev server for a token.
- The CLI modules stay dependency-free.
- A saved session is sent only to the backend that issued it.
- Reading the session never shows a system dialog.
- Whoever sets a token in the environment keeps exactly today's behavior.

## Decision

### 1. The session record

1. One record per backend, in the store of the operating system:

   | Part | Value |
   | --- | --- |
   | Service | `MainSequenceCLI.auth` |
   | Account | `default.` and the first 16 hexadecimal digits of SHA-256 of the backend URL |
   | Secret | ASCII JSON: `{"v": 1, "backend", "username", "access", "refresh"}` |

   The backend URL is the text as written, without surrounding space and trailing slashes. It is
   not re-serialized, because the account name is derived from it. This is the record the Python
   CLI writes. The account `default`, which old versions of that CLI wrote, is read after the
   scoped one and removed at logout. A record that names another backend is not this backend's
   session, and a record with only a refresh token is a session.
2. The store is reached through a program of the system, so every runtime on the machine uses the
   same entry: `/usr/bin/security` on macOS (the login Keychain) and `secret-tool` on Linux (Secret
   Service). On any other system this version reaches no store: commands that need a session exit
   with code `3`, and a token in the environment is the only credential.
3. macOS asks the person for consent when a program requests the secret of an entry another
   program created, in every process that starts. Every entry the CLIs write therefore carries the
   comment `MainSequenceCLI.session.v1`. A read first inspects the entry's attributes, which needs
   no consent, and requests the secret only when the comment is there. An entry without it is
   reported as written by another version and is not read; one login replaces it. An entry this
   process has read is updated in place, so another process never finds the session missing during
   a renewal; any other entry is deleted and added, because deleting needs no consent and updating
   another program's entry would wait for it. The secret travels on standard input, never on a
   command line, and a record too long for one input line of the program is refused, not cut.
4. On Linux the item has the attributes `service`, `username`, and
   `application = Python keyring library`, and the label `Password for '<account>' on '<service>'`:
   the item the Python CLI's library writes. Both CLIs therefore replace one item in place. A read
   falls back to an item stored without `application`. The secret travels on standard input without
   a trailing newline.

### 2. Commands

5. `command-center-sdk login [<backend-url>] [--backend <url>] [--no-open] [--mcp] [--json]` signs in
   and saves the session. By default it opens the browser on the platform's authorization page and
   receives the answer on a port of this machine that it listens on, with PKCE (S256); `--no-open`
   prints the address instead. `--mcp` asks the platform for a handoff and prints the one tool call
   (`auth.cli_authorize`) that an agent with an authenticated MCP connection makes to approve it;
   no token passes through MCP. It checks for a credential store before it sends anyone to a
   browser. The client identifier and the routes are the Python CLI's.
6. `logout` ends the tracked session on the platform and removes the entry, including one it cannot
   read. `refresh-token` (also `refresh_token`) renews the saved session, reports it, and removes
   credential entries that an earlier setup left in `./.env`, naming them; every other line stays.
   `auth status [--check]` reports the session without a token value; `--check` also asks the
   platform. `auth token` prints a short-lived access token for another local tool, renewed when it
   would expire within a minute, and never the refresh token.
7. Output and exit codes are the Python CLI's, so a tool can ask whichever CLI a project has.
   `auth token --json` prints `endpoint`, `access_token`, `token_type`, and `expires_at`.
   `auth status --json` prints `endpoint`, `authenticated`, `checked_with_backend`, `auth_mode`,
   `username`, `source`, `storage`, `store_error`, `session_expires_at`, and `access_expires_at`.
   Exit `0` is success, `1` is no usable session (nobody logged in, the store could not be read, or
   the platform refused the session), and `3` is no credential store. No command prints a refresh
   token, and no error carries a request or a token.

### 3. Which backend, and which credential

8. The backend is, in this order: `--backend`; `MAINSEQUENCE_ENDPOINT` in the environment; the same
   entry in the project's `.env`; the backend saved in the settings directory the CLIs share; the
   standard platform. Only that one entry is ever read from `.env`.
9. `MAINSEQUENCE_ACCESS_TOKEN` in the environment wins over the saved session for every command
   that calls the platform, and it is sent only to the `MAINSEQUENCE_ENDPOINT` set next to it, as
   before. Without it the saved session of the resolved backend is used.
10. A saved session is sent only to its backend. `skills sync` refuses an MCP URL on another origin
    than that backend when the token is the session's.
11. `code-repository sync` asks for the session after it has inspected the repository, for that
    repository's directory, and before its first platform request. `npm` postinstall reads no
    credential store: it keeps using the environment, and names the command that uses the session.
    (Amended 2026-10-02: `code-repository sync` makes no platform request any more and asks for no
    session. The postinstall rule stands.)

### 4. The dev server

12. `platformRequestProxy()` (SDK ADR 014) takes the token from the environment when it is set, and
    otherwise from the saved session of the backend the project names; the `.env` it reads is the
    one Vite reads (`envDir`, or the project root). It keeps the access token in memory until it is
    about to expire, so the store is read once per renewal and not per request. Requests that
    arrive together share one read and one renewal. A request it refuses (another site, another
    computer, a path outside `/api/`, a body over the limit) reads no credential.
13. When the platform answers `401` to a session token, the plugin reads the store again, uses a
    token another process saved meanwhile or renews the session, and sends the request once more. A
    `401` is answered before the request does anything, so nothing is repeated. A second `401`
    passes through with one warning that names the login command. A `401` to an environment token
    passes through as before.
14. `platform_not_configured` (503) now also means: no usable session for the named backend, no
    credential store, or a store that could not be read. Its detail names the login command with the
    backend. `platform_unreachable` (502) also covers a backend that did not answer a renewal.

## Ownership boundary

This is the developer's session for the SDK's own Node tools on a developer machine. The browser
entry points hold no credential and gain no authentication code: the page never receives the token,
and a build never contains it. An application's sign-in, its token storage, and its routes stay
outside the SDK, as do the platform's tokens and their lifetimes.

## Serialized contracts and backend impact

No JSON Schema, fixture, iframe protocol, or persisted application data changes. The session record
is shared with the Python CLI and is not a Command Center contract. The platform is unchanged: the
CLI calls the routes the Python CLI calls, with the same client identifier.

## Verification

- `tests/cli/machine-session.node.mjs`, `login.node.mjs`, and `session-commands.node.mjs` run the
  record, both store adapters against the programs' observed behavior, the two logins, the commands,
  and their exit codes. `src/vite/platform-request-proxy.test.ts` runs the plugin against a stand-in
  platform with a saved session. No test reads this machine's credential store: each passes its own.
  A test that starts the CLI program stops at argument parsing.
- Both CLIs were run on one entry of a real Secret Service and of a real macOS Keychain, with
  logins, renewals, and logouts made by each in turn: one item throughout, and no dialog.
- The whole path was run on Linux with the real programs against a stand-in platform: a login with
  each CLI, both CLIs returning the same token, `code-repository sync`, `skills sync`, and a Vite
  dev server.
- Not run: a login against the platform itself in a real browser.

## Compatibility and rollout

Additive for whoever sets `MAINSEQUENCE_ACCESS_TOKEN`: nothing they run changes. Without that
variable, `code-repository sync`, `skills sync`, and the dev server used to stop and name the
variable; they now use the saved session, and name the login when there is none. The text of the
`platform_not_configured` detail changed; its status and code did not. The `/vite` declarations are
unchanged and still need neither Vite's nor Node's types.

On macOS, a session saved by a version of the Python CLI that does not write the comment is not
read, and needs one login with either CLI. Linux needs `secret-tool` (`libsecret-tools` on Debian
and Ubuntu) and an unlocked Secret Service.

## Rejected alternatives

- **A native keyring library.** Rejected: the CLI has no dependencies, a native module needs a
  prebuilt binary per system, and on macOS it is another program than `security`, so reading the
  entry the Python CLI wrote would show the consent dialog in every process.
- **Asking the Python CLI for a token.** Rejected: a Node project may not have it.
- **A token file when there is no store.** Rejected: a plain-text copy of a refresh token is what
  this decision removes.
- **Reading the session during `npm install`.** Rejected: an install script should not read a
  credential store or wait for one to be unlocked.
- **An option to switch the session off in the plugin.** Not added: a token in the environment
  already takes its place.

## Consequences

- A developer signs in once per machine, and a dev server keeps working for as long as the session
  lasts.
- A project's `.env` names its backend and holds no credential; `refresh-token` cleans one that
  still does.
- Two CLIs write one record, so a change to the record or to how a store is reached is a change to
  both.
