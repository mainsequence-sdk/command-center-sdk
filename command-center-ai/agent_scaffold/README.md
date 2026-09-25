# Command Center AI Agent Scaffold

This directory is the versioned agent skill bundle shipped with `@dev-mainsequence/command-center-ai`.
Its skills teach an agent to add AI capabilities to an application that uses the Command Center
SDK, the same way the SDK's own skills teach the rest of the application: a router skill, an
architecture skill that routes to focused skills, and focused skills in lanes. They use only the
package's published entrypoints and the platform's public routes, and they name the platform and the
Agent runtime, not their implementations.

| Lane | Skill | What it teaches | Human guide |
| --- | --- | --- | --- |
| `general` | `use-command-center-ai` | Install next to the SDK, refresh skills, upgrade, choose the focused skill | [Getting started](../docs/getting-started.md) |
| `general` | `build-command-center-ai-application` | Where AI lives in the application, and which pieces it needs | [Build an AI application](../docs/build-an-ai-application.md) |
| `engine` | `mount-agent-conversation` | The stylesheets, the engine's inputs, the default session, the stand-in | [Build an AI application](../docs/build-an-ai-application.md) |
| `ui` | `compose-command-center-ai-rail` | The right rail, the expanded rail, and their design | [The right rail and the expanded rail](../docs/rail-and-expanded-rail.md) |
| `sessions` | `manage-agent-sessions` | Requested sessions, the session explorer, archive, delete, new | [AgentSession resolution](../docs/agent-session-resolution.md) |
| `backend` | `connect-command-center-ai-to-the-platform` | The connection, the forwarder, tokens, errors, failure states | [Connect to the platform](../docs/connect-to-the-platform.md) |
| `model-providers` | `manage-model-providers` | Provider sign-in, custom providers, the test conversation | [Model providers](../docs/model-providers.md) |
| `contracts` | `design-agent-conversation-capabilities` | What the thread draws, keeps after a reload, and ignores | [The conversation contract](../docs/conversation-contract.md) |

## The Route In

An agent working in an application that has only the SDK finds this package through the SDK's own
skills: `use-command-center-sdk` and `build-command-center-application` say that a chat or AI
capabilities come from `@dev-mainsequence/command-center-ai`, to install it next to the SDK, to
refresh its skills, and to continue with `use-command-center-ai`. That skill's name is the one the
SDK depends on; keep it stable.

## Installation

The package's postinstall and `command-center-ai skills install --path .` install every skill into
`<repository-root>/.agents/skills/command-center-ai/`, keeping its lane, with the SDK installer's
algorithm, checks, dry run, provenance, and rollback. The namespace is authoritative: an install
prunes every entry the package does not ship and writes `PINNED_FROM.txt` with the package version,
the command, and the installed skill paths. No other namespace under `.agents/skills/` is touched,
the SDK's `command-center/` included. See the [CLI README](../cli/README.md).

## Rules

- Every skill is a leaf under a lane: `SKILL.md` with a `name` equal to its folder and a triggering
  `description`, and `agents/openai.yaml` whose `default_prompt` names the skill. Names are unique
  across lanes.
- A skill routes to another with `$skill-name`, as the SDK's skills do, and may route to the SDK's
  skills, which every application with this package has installed under `.agents/skills/command-center/`.
  `tests/cli/agent-skills.node.mjs` fails on a route to a skill that does not exist.
- A skill names only published entrypoints (`@dev-mainsequence/command-center-ai`,
  `@dev-mainsequence/command-center-ai/styles.css`, and the SDK's), never `src/`, `dist/`, or a
  repository path. Screen-building skills route the application's controls to the SDK's
  `/controls`, and no example renders a raw control or a literal colour.
- Every skill has a human guide in `docs/`, listed in the
  [documentation map](../docs/README.md#task-and-agent-skill-map). `tests/cli/docs-skills.node.mjs`
  fails when a skill has none; `tests/cli/agent-skills.node.mjs` validates every skill and the
  installer. Change a skill and its guide in the same change, and name renamed or removed skills in
  the changelog: the installed skills are a compatibility axis.
- Link nothing private. The platform's and the Agent runtime's own documentation are named, not
  linked into from here.
