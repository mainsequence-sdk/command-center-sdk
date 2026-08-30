# Command Center SDK Agent Scaffold

This directory is the versioned agent skill bundle shipped with
`@dev-mainsequence/command-center-sdk`. Its `skills/` children teach agents to select, use, extend,
evolve, and verify only the SDK package and its published layout, resource, widget, workspace,
theme, and embed contracts, including the language-neutral schema manifest and fixtures. They do
not describe or own surrounding product applications, routes, backend implementations, or
repository-specific application modules.

The npm postinstall hook and the explicit `command-center-sdk skills install` command copy each
immediate skill directory into `<repository-root>/.agents/skills/command-center`. Matching folders are
SDK-managed and refreshed from the installed package version; unrelated folders and other
namespaces are preserved. `PINNED_FROM.txt` records the supplying package version and source.

Postinstall also makes a nonblocking authenticated attempt to synchronize the backend-owned MCP
catalog into `<repository-root>/.agents/skills/mainsequence` when its URL and access token are available.
The strict `command-center-sdk skills sync` command refreshes both sources and fails on an invalid
or unavailable MCP lane. `MCP_PINNED_FROM.txt` tracks the exact platform folders owned by the npm
installer without overwriting the Python SDK's provenance or unrelated application skills.

Every immediate child of `skills/` must be a valid standalone skill with `SKILL.md` and
`agents/openai.yaml`. Use lowercase hyphenated names, keep triggering descriptions specific, rely
on published npm entrypoints for consumer tasks, and resolve the SDK source package by package name
for SDK maintenance tasks. Validate every skill with the skill validator before packaging and run
the packed-consumer smoke test after changing the bundle or installer.

The bundle is organized into SDK-only lanes:

- surface selection and installed-package usage;
- application documentation authoring, validation, same-artifact builds, and browser verification;
- application page/card composition and real-browser layout verification;
- resource lists, details, pickers, actions, and backend adapter normalization;
- widget, widget-host, workspace, theme, and embed authoring; and
- SDK extension, serialized-contract evolution, and package verification.

## Human documentation parity

Every shipped skill has a matching task in the public
[documentation map](../docs/README.md#choose-what-you-are-building). The linked guides use the same
published entrypoints, ownership boundaries, compatibility rules, and verification requirements,
with copyable examples for people who are not running an agent.

`tests/cli/docs-skills.node.mjs` fails when a packaged skill is missing from that map. When a skill
adds or changes a supported workflow, update the matching human guide in the same change.
