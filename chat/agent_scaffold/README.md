# Chat Agent Scaffold

This directory is the versioned agent skill bundle shipped with `@dev-mainsequence/chat`. Its
`skills/` children teach an agent to build a chat application on the package, connect it to the
platform, manage model providers, and design an Agent's answers for what the chat shows. They use
only the package's published entrypoints and the platform's public routes, and they name the
platform and the Agent runtime, not their implementations.

| Skill | Human guide |
| --- | --- |
| `build-chat-application` | [Build a chat application](../docs/build-a-chat-application.md) |
| `connect-chat-to-the-platform` | [Connect to the platform](../docs/connect-to-the-platform.md) |
| `manage-model-providers` | [Model providers](../docs/model-providers.md) |
| `design-agent-conversation-capabilities` | [The conversation contract](../docs/conversation-contract.md) |

## Installation

The package's postinstall and `mainsequence-chat skills install --path .` copy every skill into
`<repository-root>/.agents/skills/chat/`, a namespace the package owns alone: every install
replaces it with the installed package's skills and writes `PINNED_FROM.txt` with the package
version, the command, and the installed skill paths. No other namespace under `.agents/skills/` is
touched, the Command Center SDK's `command-center/` included. See the [CLI README](../cli/README.md).

## Rules

- Every immediate child of `skills/` is a standalone skill: `SKILL.md` with `name` and a triggering
  `description` in its front matter, and `agents/openai.yaml`.
- A skill names only published entrypoints (`@dev-mainsequence/chat`,
  `@dev-mainsequence/chat/styles.css`, and the SDK's), never `src/`, `dist/`, or a repository path.
- A skill may refer to the Command Center SDK's skills, which every chat application has installed
  under `.agents/skills/command-center/`. The SDK's skills never refer to these.
- Every skill has a human guide in `docs/`, listed in the
  [documentation map](../docs/README.md#task-and-agent-skill-map). `tests/cli/docs-skills.node.mjs`
  fails when a skill has none; `tests/cli/install-skills.node.mjs` validates every skill and the
  installer. Change a skill and its guide in the same change.
- Link nothing private. The platform's and the Agent runtime's own documentation are named, not
  linked into from here.
