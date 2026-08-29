---
name: use-command-center-sdk
description: Set up, inspect, upgrade, or troubleshoot a TypeScript or React project that consumes @dev-mainsequence/command-center-sdk. Use when locating the installed SDK, choosing a published entrypoint, loading packaged styles, checking peer dependencies, or establishing the boundary between SDK contracts and consumer-owned behavior.
---

# Use Command Center SDK

## Use The Repository-Root Project Layout

For a registered Main Sequence Vite project, treat the Git repository root as the application
root. Keep `package.json`, `package-lock.json`, `.env`, `.agents/`, `src/`, and `vite.config.*`
there, and expect the production build under `dist/`. Do not create or discover a nested
`frontend/` application.

## Resolve The Installed SDK

1. Locate the package whose name is `@dev-mainsequence/command-center-sdk`.
2. Read its installed `package.json`, version, export map, and peer dependencies.
3. Read the installed package `README.md` and the declaration files for the selected export.
4. Use only declared package exports. Never import arbitrary `dist` paths, repository-internal
   modules, or source files from another package.

Treat the installed version as authoritative. Do not assume that a capability described by a plan,
ADR, older checkout, or another application exists in the installed SDK.

## Inspect And Update The Project SDK

From the Git repository root, inspect the dependency without changing it:

```bash
npx command-center-sdk application sdk-status --path . --json
```

Keep `declared`, `locked`, `installed`, `wanted`, and `latest` separate when reporting the result.
`wanted` is npm's compatible version under the current declaration; `latest` may be outside that
policy. Do not infer that every difference should mutate `package.json`.

When the user authorizes an SDK update, preview and then run the package-scoped workflow:

```bash
npx command-center-sdk application update-sdk --path . --dry-run
npx command-center-sdk application update-sdk --path .
```

The workflow refuses peer-only, linked, workspace, file, Git, URL, and alias declarations. It does
not widen a blocked dependency constraint, update unrelated packages, change the application
version, call the backend, commit, tag, or push. After an applied update, run the consumer checks
against public imports and use `command-center-sdk skills sync --path .` when strict backend-owned
guidance refresh is required.

## Refresh Installed Guidance

Package installation copies version-matched SDK skills into `.agents/skills/command-center` and
makes a nonblocking MCP refresh when `MAINSEQUENCE_ACCESS_TOKEN` plus an MCP URL are available in
the npm process. Do not assume that the best-effort platform lane succeeded merely because package
installation completed.

When current backend-owned platform guidance is required, run the strict workflow from the Git
repository root:

```bash
npx command-center-sdk skills sync --path .
```

Use `--dry-run` before writing and `--json` for machine-readable evidence. Resolve the MCP URL with
`--mcp-url`, `COMMAND_CENTER_SDK_MCP_URL`, or `MAINSEQUENCE_ENDPOINT`; keep
`MAINSEQUENCE_ACCESS_TOKEN` in the process environment and never put it in a command argument.
Inspect `.agents/skills/command-center/PINNED_FROM.txt` for the package version and
`.agents/skills/mainsequence/MCP_PINNED_FROM.txt` for the backend manifest. The installer owns only
the recorded paths in each namespace and preserves unrelated project guidance.

## Choose Public Entrypoints

- Use `/navigation` for controlled application navigation definitions and chrome.
- Use `/layout` for complete page, header, stack, card, and card-grid composition. Use
  `/layout/testing` for real-browser geometry verification, and route the workflow to
  `$compose-command-center-page`.
- Use `/resource` for framework-neutral resource definitions and adapters.
- Use `/resource/react` for resource selection state.
- Use `/views` for React resource lists, details, pickers, and supporting compositions.
- Use `/contracts` for JSON-safe shared contracts and migrations.
- Use `/contracts/manifest.json`, `/contracts/schemas/*`, and `/contracts/fixtures/*` for
  language-neutral backend payload design and validation.
- Use `/widget`, `/widget/host`, `/widget/testing`, `/widget/ui`, and `/widget/built-ins` for widgets.
  Use the narrow `/widget/built-ins/app-component`, `/widget/built-ins/tabular-transform`,
  `/widget/built-ins/table`, and `/widget/built-ins/pro-table` exports when implementing one of
  those existing contracts.
- Use `/workspace` for workspace documents and `/workspace/react` for read-only rendering.
- Use `/theme`, `/theme/presets`, and `/theme/data-viz` for theme behavior.
- Use `/embed` and `/embed/react` for both deliberately separate iframe protocols: generic external
  widgets use `command-center-iframe@v1`; project-owned static sites use the numeric v1
  `mainsequence.*` handshake. Static sites call an authorized FastAPI ResourceRelease through the
  client's high-level `fetchFastApi` method while the host injects `resolveFastApiCredential`.
  The child consumes `StaticSiteFastApiTransportState` through `onFastApiStateChange` or
  `getFastApiState`; the SDK owns bounded retry, credential refresh, and cancellation. Route that
  work to `$integrate-static-site-iframe`; never translate between the two protocols.

Keep framework-neutral modules free of React imports. Import browser CSS through documented package
CSS exports and load each required bundle once. Complete application layout requires both
`/theme/styles.css` and `/styles.css`. When importing the base theme stylesheet, route all semantic
visual styling through `$theme-command-center-app` and make `command-center-sdk theme audit` part
of the consumer's check/CI command.

Use `$build-command-center-application` to make the application-level architecture decision and
route each internal surface to its focused implementation skill.

## Preserve The Package Boundary

Use the SDK for reusable contracts, normalized lifecycle, controlled views, widgets, workspaces,
themes, and embeds. Keep a consumer's transport configuration, routing policy, authentication,
persistence choice, and domain behavior behind injected callbacks or adapters.

If the installed SDK does not expose a required capability, do not edit `node_modules` or import an
internal implementation. Record the installed version, exact missing capability, expected public
inputs and outputs, and whether serialized compatibility is affected. Stop and hand that gap to a
separate SDK-source maintenance task when it is genuinely reusable.

Use the dedicated implementation skills selected by `$build-command-center-application` for
resource views, widgets, workspaces, embeds, Adapter From API, and language-neutral contract
workflows. Those skills configure published contracts; they do not extend the SDK.

## Verify

Run the consumer typecheck and tests through published imports. Reproduce packaging failures from a
packed or installed SDK rather than repository aliases. For guidance synchronization failures,
rerun `command-center-sdk skills sync --path . --json` so authentication, catalog validation, and
filesystem ownership errors remain explicit. For themed consumers, run `command-center-sdk theme
audit` and treat unknown tokens, literal fallbacks, and hardcoded semantic visual values as failed
verification.
