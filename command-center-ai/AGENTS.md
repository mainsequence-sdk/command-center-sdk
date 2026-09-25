# Command Center AI Instructions

## Required Maintenance Cycle

- After every change in this package, use `$maintain-command-center-ai` from
  `.agents/skills/maintain-command-center-ai/SKILL.md` before handoff or release.
- Decide the impact on each axis the package's changelog names: the npm public API, the stylesheet's
  classes, the browser storage keys, the installed skills, the SDK peer range, and the platform
  routes and payloads it calls. Update every affected surface in the same change.

## Skills

- The consumer skills in `agent_scaffold/skills/` follow the SDK's skill system: lanes, a router
  (`general/use-command-center-ai`), an architecture skill, focused skills, `$skill-name` routes, and
  a human guide per skill. The SDK's general skills name `use-command-center-ai`; keep that name.
- A renamed, moved, or removed skill is a changelog entry.
