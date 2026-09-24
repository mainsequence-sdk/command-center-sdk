# Chat CLI

This directory is the Node-only command line of `@dev-mainsequence/command-center-ai`: it installs the
package's agent skills (`../agent_scaffold/skills/`) into a repository. It is not part of the
browser export map and depends on Node's standard library only.

## Entry Points

- `command-center-ai.mjs`, the package's `command-center-ai` binary:
  `command-center-ai skills install [--path <repository-root>]`.
- `postinstall.mjs`, npm's postinstall. It installs into the repository in npm's `INIT_CWD`; it
  installs nothing for a global install, or inside this package's own source repository, where the
  chat is a workspace. A failure fails the install with the reason and the explicit command.
- `install-skills.mjs`, the installer both use.

## Behavior

- The destination is `<repository-root>/.agents/skills/command-center-ai/`. The package owns that namespace
  alone: every install replaces it with the installed package's skills, so a skill the package no
  longer ships is removed. No other entry under `.agents/skills/` is read or written.
- The new namespace is staged in a temporary directory next to it and swapped in by rename; if the
  swap fails, the previous namespace is put back.
- `PINNED_FROM.txt` in the namespace records the schema, the package name and version, the
  ownership mode, the time, the command, and each installed skill path.
- A symbolic link in the packaged skills, a destination (`.agents`, `.agents/skills`, or the
  namespace) that is a symbolic link or not a directory, and a destination that overlaps the
  package's own skills all block the install.

## Tests

`../tests/cli/install-skills.node.mjs` installs into temporary repositories: other namespaces are
untouched, the namespace is replaced, a symbolic-link destination is refused, the postinstall skips
this source repository and global installs, and the binary installs into `--path`. It also
validates every packaged skill. Run them with `npm --workspace @dev-mainsequence/command-center-ai run test`.
