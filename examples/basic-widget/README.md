# Basic Widget Package Example

Minimal external package scaffold for a trusted native Command Center widget. It depends only on
the published contracts and SDK, keeps metadata in a JSON-safe manifest, supplies a preview fixture
and usage guidance, and exports an explicit extension.

Copy this directory into an independent repository, choose a globally unique `{owner}__{widget}`
id, replace package metadata, install dependencies, and run `npm run check`. Deployment still
requires an operator to import the extension in `command-center.config.ts`; backend metadata
publication remains a separate admin action.

Do not import Command Center `src/`, auth, router, persistence, environment, or product API modules.
Keep `USAGE_GUIDANCE.md`, the manifest guidance, preview fixture, and behavior test aligned when
turning the scaffold into a real widget.
