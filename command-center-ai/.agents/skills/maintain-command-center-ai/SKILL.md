---
name: maintain-command-center-ai
description: Maintain integrity and release readiness of the @dev-mainsequence/command-center-ai source package. Use after any change under command-center-ai - source, stylesheet, CLI and skill installer, packaged agent skills, guides, standalone application, stand-in, or package metadata - and before handoff or release, to decide and update every compatibility axis the change touches.
---

# Maintain Command Center AI

Finish every change as one synchronized update of the package, its skills, its guides, and its
changelog. This is the package's counterpart of the SDK's `$maintenance`.

## 1. Establish The Change Surface

Locate the package by its name, `@dev-mainsequence/command-center-ai`. Inspect the complete diff,
including untracked files, and read the nearest module README, the guide under `docs/`, and the
skill that teaches the changed behavior.

## 2. Decide Each Axis

| Axis | When it changes | Required work |
| --- | --- | --- |
| npm public API | `src/index.ts` exports or their types | Declarations, the packed consumer fixture, guides, and skills that name the API. |
| Stylesheet | `ms-chat-` classes or their layer | `command-center-sdk theme audit`, the rail skill's styling rules. |
| Browser storage | A key or its value | Migration of stored values, the guides that list the keys. |
| Installed skills | A skill added, renamed, moved, or removed | Its guide and map row, `tests/cli/agent-skills.node.mjs`, the changelog. Keep `use-command-center-ai`: the SDK names it. |
| Skill installer | `cli/` | Parity with the SDK's installer and CLI options, the CLI tests, the packed-consumer skills check. |
| SDK peer range | A new SDK minor or a newly needed SDK feature | The peer and development ranges, a release that accepts the SDK. |
| Platform routes and payloads | A route added, dropped, or called differently | The conversation contract, the stand-in, the rollout order in the changelog. |

Write a no-impact decision for each axis the change does not touch.

## 3. Verify

```bash
npm run ai:check
npm run ai:test
npm run ai:build
npm --workspace @dev-mainsequence/command-center-ai run test:browser
npm run direction:check
node scripts/verify-packed-consumer.mjs
```

Run `npm run docs:build` when guides or their navigation change. Separate product failures from
missing tools and unrelated pre-existing failures.

## 4. Report

State the axes changed and the no-impact decisions, the skills and guides updated, the changelog
entry, and the verification commands with their results.
