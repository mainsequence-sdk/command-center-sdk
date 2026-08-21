# Command Center SDK Instructions

## Required Maintenance Cycle

- After every change anywhere in this package, use `$maintenance` from
  `.agents/skills/maintenance/SKILL.md` before handoff or release.
- Complete an explicit impact decision for public extension APIs, human documentation and
  examples, the packaged `agent_scaffold` skills, and the language-neutral backend contract bundle
  under `contracts/`. Update every affected surface in the same change.
- For a public serialized, persisted, or protocol change, keep the TypeScript/runtime contract,
  JSON Schema, manifest entry, valid and invalid fixtures, compatibility guidance, and backend
  handoff aligned. Breaking semantics require a new versioned contract and transition plan.
- For an internal-only change, record why public extension behavior and backend contracts are
  unaffected; do not create meaningless documentation or schema churn.

## Documentation

- Keep every public workflow understandable without reading source or an agent skill: explain the
  task, public import, smallest working example, extension point, ownership boundary, important
  failure states, and backend contract when one exists.
- Keep task-oriented human guides and the matching `agent_scaffold/skills` workflow aligned. Agent
  instructions must name only public APIs and contracts available in the same package version.
- Keep every major module documented in its nearest `README.md` and remove superseded guidance
  rather than preserving contradictory legacy files.
