# Command Center AI CLI

This directory is the Node-only command line of `@dev-mainsequence/command-center-ai`: it installs the
package's agent skills (`../agent_scaffold/skills/`) into a repository, the way the Command Center
SDK's CLI installs its own. It is not part of the browser export map and depends on Node's standard
library only.

## Entry Points

- `command-center-ai.mjs`, the package's `command-center-ai` binary:
  `command-center-ai skills install [--path <repository-root>] [--dry-run] [--json]`, with `-p` and
  `--path=` as in the SDK's CLI.
- `postinstall.mjs`, npm's postinstall. It installs into the repository in npm's `INIT_CWD`; it
  installs nothing for a global install, or anywhere inside this package's own source repository,
  where the package is a workspace. A failure fails the install with the reason and the explicit
  command.
- `install-agent-skills.mjs`, the installer both use: the SDK's installer, for this package's
  namespace.

## Behavior

- The destination is `<repository-root>/.agents/skills/command-center-ai/`, with every skill in its
  lane. The namespace is authoritative: every file or folder the installed package does not ship is
  pruned. No other entry under `.agents/skills/` is read or written, beside the namespace's own
  lock and its staging and backup folders.
- Installs into one repository take turns. npm runs one postinstall per workspace that nests its own
  copy of the package, all at once and into the same `INIT_CWD`. An install that writes first
  creates `.agents/skills/.command-center-ai.lock` exclusively and holds it while it reads and
  replaces the namespace; the others wait for it, then install against what it left. A lock whose
  process on this machine has exited, or that is older than ten minutes, is cleared; after a minute
  of waiting on a live one, the install fails and names the file. `--dry-run` takes no lock.
- Each skill is staged, the replaced entries are backed up, and `PINNED_FROM.txt` is written last
  and atomically; on a failure the previous skills and provenance are put back.
- `PINNED_FROM.txt` (schema 2) records the package name and version, the namespace, the ownership
  mode, the source `skills_path`, the time, the command, and each installed skill path. Schema 1,
  written by 0.0.1 and 0.0.2, is read the same way.
- An install refuses: a namespace whose `PINNED_FROM.txt` names another package or namespace; a
  symbolic link in the packaged skills or on the destination path, `.agents` and `.agents/skills`
  included; overlapping source and destination; a skill folder whose name differs from its skill's
  `name`; a name used twice; and a skill inside another skill. `--dry-run` runs every check and
  reports what would be installed and pruned, without writing.

## Tests

`../tests/cli/agent-skills.node.mjs` installs into temporary repositories: pruning and provenance,
the dry run, every refusal above, other namespaces left untouched, the command's options and JSON,
the postinstall's skips, two postinstalls upgrading one repository at once, and the lock's wait and
recovery. It also validates every packaged skill, its `$` routes, and the
conventions it shares with the SDK's skills. Run them with
`npm --workspace @dev-mainsequence/command-center-ai run test`. The repository's packed-consumer
verification installs the skills from the published tarball.
