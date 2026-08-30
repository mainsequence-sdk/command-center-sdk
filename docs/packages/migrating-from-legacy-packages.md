---
id: migrating-from-legacy-command-center-packages
title: Migrating from Legacy Packages
slug: /packages/migrating-from-legacy-packages
---

# Migrating from Legacy Command Center Packages

The former foundational packages were absorbed into
`@dev-mainsequence/command-center-sdk` and removed from this monorepo. Existing immutable npm
versions may still be downloadable, but this repository does not build, version, or publish them.

Install only the unified package:

```bash
npm install @dev-mainsequence/command-center-sdk
```

## Import replacements

| Legacy package | Unified SDK import |
| --- | --- |
| `@dev-mainsequence/command-center-contracts` | `@dev-mainsequence/command-center-sdk/contracts` |
| `@dev-mainsequence/command-center-widget-sdk` | `@dev-mainsequence/command-center-sdk/widget` |
| `@dev-mainsequence/command-center-widget-sdk/testing` | `@dev-mainsequence/command-center-sdk/widget/testing` |
| `@dev-mainsequence/command-center-widget-sdk/ui` | `@dev-mainsequence/command-center-sdk/widget/ui` |
| `@dev-mainsequence/command-center-widget-host` | `@dev-mainsequence/command-center-sdk/widget/host` |
| `@dev-mainsequence/command-center-widgets-core` | `@dev-mainsequence/command-center-sdk/widget/built-ins` |
| `@dev-mainsequence/command-center-workspace-model` | `@dev-mainsequence/command-center-sdk/workspace` |
| `@dev-mainsequence/command-center-workspace-react` | `@dev-mainsequence/command-center-sdk/workspace/react` |
| `@dev-mainsequence/command-center-themes` | `@dev-mainsequence/command-center-sdk/theme` |
| `@dev-mainsequence/command-center-themes/data-viz` | `@dev-mainsequence/command-center-sdk/theme/data-viz` |
| `@dev-mainsequence/command-center-themes/presets` | `@dev-mainsequence/command-center-sdk/theme/presets` |
| `@dev-mainsequence/command-center-iframe-bridge` | `@dev-mainsequence/command-center-sdk/embed` |
| `@dev-mainsequence/command-center-iframe-bridge/react` | `@dev-mainsequence/command-center-sdk/embed/react` |

Theme CSS now uses the matching SDK subpath, for example:

```css
@import "@dev-mainsequence/command-center-sdk/theme/styles.css";
@import "@dev-mainsequence/command-center-sdk/theme/utilities.css";
```

Generic built-in widget styles use:

```css
@import "@dev-mainsequence/command-center-sdk/widget/built-ins.css";
```

Package consolidation does not change widget IDs, workspace schema values, connection references,
theme IDs, or the `command-center-iframe@v1` protocol. Applications must still run their normal
workspace and registry compatibility tests when changing imports.

The later CodeRepository ontology cutover is separate from package consolidation and intentionally
changes the Foundry infrastructure widget ID. See the
[compatibility policy](./compatibility.md#coderepository-infrastructure-widget-cutover) before
upgrading a host or migrating persisted workspace documents.
