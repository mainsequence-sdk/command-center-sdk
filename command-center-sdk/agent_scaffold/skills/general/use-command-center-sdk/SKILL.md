---
name: use-command-center-sdk
description: Set up, inspect, upgrade, or troubleshoot a TypeScript or React application that consumes @dev-mainsequence/command-center-sdk. Use when locating the installed SDK, choosing a published entrypoint, loading packaged styles, checking peer dependencies, or establishing the boundary between SDK contracts and consumer-owned behavior. Also use when the person wants to add a chat or AI capabilities (a conversation with a Main Sequence Agent, agent sessions, model providers) to an SDK application; those come from @dev-mainsequence/command-center-ai, not from this SDK.
---

# Use Command Center SDK

## Use The Repository-Root Application Layout

For a registered Main Sequence Vite application, treat the Git repository root as the application
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

## Inspect And Update The Application SDK

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
the npm process. Postinstall reads no saved session. Do not assume that the best-effort platform
lane succeeded merely because package installation completed.

When current backend-owned platform guidance is required, run the strict workflow from the Git
repository root:

```bash
npx command-center-sdk skills sync --path .
```

Use `--dry-run` before writing and `--json` for machine-readable evidence. The command
authenticates with the session saved on the machine: check it with
`npx command-center-sdk auth status`, and when there is none, run `npx command-center-sdk login`,
or `npx command-center-sdk login --mcp` when you hold an authenticated Main Sequence MCP
connection and can call the `auth.cli_authorize` tool it prints. The MCP URL is the project's
backend (`MAINSEQUENCE_ENDPOINT`, in the environment or in `.env`) plus `/mcp`, or `--mcp-url` or
`COMMAND_CENTER_SDK_MCP_URL`. `MAINSEQUENCE_ACCESS_TOKEN` in the process environment wins over the
saved session. Never put a token in a command argument or in a file.
Inspect `.agents/skills/command-center/PINNED_FROM.txt` for the package version and
`.agents/skills/ms-command-center/MCP_PINNED_FROM.txt` for the backend manifest. Treat the installed SDK
catalog as authoritative for the complete `command-center` namespace: install, postinstall, update,
and sync prune every entry not authorized by the current package, including unrecorded legacy
skills. Put application-owned guidance in another namespace. The MCP installer owns only the
folders it records in `ms-command-center`; `.agents/skills/mainsequence/` belongs to the Python Main
Sequence SDK, and every other namespace remains untouched.

## Choose Public Entrypoints

- Use `/navigation` for canonical zero/one/two-level embedded application shells and controlled
  navigation definitions. Use `/navigation/testing` to assert startup gating, declared depth, and
  absence of child top navigation.
- Use `/layout` for complete page, header, stack, card, and card-grid composition. Use
  `/layout/testing` for real-browser geometry verification, and route the workflow to
  `$compose-command-center-page`.
- Use `/feedback` for controlled application status, ordered progress stages, and activity
  indicators. Route startup and reconnection feedback to `$build-application-loading-flow`.
- Use `/controls` for every button, badge, label, labelled field, text input, and textarea. Never
  write a raw `<button>`, `<input>`, `<textarea>`, or `<label>`, a Tailwind or CSS button, or a copy
  of another application's kit: these primitives are what make an independent site look and
  behave exactly like the host. Route action and form composition to
  `$compose-command-center-controls`.
- Use `/resource` for framework-neutral resource definitions and adapters.
- Use `/resource/react` for resource selection state.
- Use `/views` for React resource lists, details, pickers, side-by-side transfer lists
  (`ResourceTransferList`), and supporting compositions. A detail's
  tabs belong to `ResourceDetailShell`; `/controls` has no tab control, so route tabbed pages to
  `$build-resource-detail`.
- Use `/contracts` for JSON-safe shared contracts and migrations.
- Use `/contracts/manifest.json`, `/contracts/schemas/*`, and `/contracts/fixtures/*` for
  language-neutral backend payload design and validation.
- Use `/theme`, `/theme/presets`, and `/theme/data-viz` for theme behavior.
- Use `/embed` and `/embed/react` for application-owned static sites using the numeric v1
  `mainsequence.*` handshake. Hosted static sites call an authorized FastAPI ResourceRelease through
  the client's high-level `fetchFastApi` method while the trusted host injects
  `resolveFastApiCredential`. Before implementing API calls for a top-level local Vite page,
  follow `$integrate-static-site-iframe` to start a loopback FastAPI runner with server-side CLI
  developer identity, wait for readiness, configure the same-origin `/api` proxy, and call it through
  an application-owned client. This local path needs no release UID.
  A non-local direct link still has no trusted iframe bridge: SDK delegation is `unsupported` unless
  the page completes the validated host handshake. It must show an unavailable state or use a
  separately authenticated application-owned backend, never the local CLI identity.
  The child consumes `StaticSiteFastApiTransportState` through `onFastApiStateChange` or
  `getFastApiState`; the SDK owns bounded retry, credential refresh, and cancellation. Route that
  work to `$integrate-static-site-iframe`.

Keep framework-neutral modules free of React imports. Import browser CSS through documented package
CSS exports and load each required bundle once. Complete application layout requires both
`/theme/styles.css` and `/styles.css`. When importing the base theme stylesheet, route all semantic
visual styling through `$theme-command-center-app` and make `command-center-sdk theme audit` part
of the consumer's check/CI command.

Use `$build-command-center-application` to make the application-level architecture decision and
route each internal surface to its focused implementation skill.

## Add AI Capabilities With Command Center AI

The SDK has no AI capabilities: no chat with a Main Sequence Agent, no agent sessions, and no model
provider settings. When the person wants any of them, use `@dev-mainsequence/command-center-ai`, a
separate package that takes this SDK as a peer. Do not compose a chat from SDK primitives, and do
not call the platform's agent session, Agent runtime, or model provider routes from application
code.

1. Confirm the registry has a version whose peer range includes the installed SDK:

   ```bash
   npm view @dev-mainsequence/command-center-ai peerDependencies --json
   ```

   If none does, stop and report it. Never install a second SDK and never pass
   `--legacy-peer-deps`.
2. Install it next to the SDK, then refresh its skills explicitly, because lifecycle scripts may be
   disabled:

   ```bash
   npm install @dev-mainsequence/command-center-ai
   npx command-center-ai skills install --path .
   ```

3. Confirm `.agents/skills/command-center-ai/PINNED_FROM.txt` names the installed version, then
   load `$use-command-center-ai` and follow it. This skill says nothing more about AI capabilities.

## Preserve The Package Boundary

Use the SDK for reusable contracts, normalized lifecycle, controlled views, themes, and embeds.
Keep a consumer's transport configuration, routing policy, authentication,
persistence choice, and domain behavior behind injected callbacks or adapters.

If the installed SDK does not expose a required capability, do not edit `node_modules` or import an
internal implementation. Record the installed version, exact missing capability, expected public
inputs and outputs, and whether serialized compatibility is affected. Stop and hand that gap to a
separate SDK-source maintenance task when it is genuinely reusable. AI capabilities are not an SDK
gap: follow Add AI Capabilities With Command Center AI.

Use the dedicated implementation skills selected by `$build-command-center-application` for
resource views, static-site embeds, and language-neutral contract
workflows. Those skills configure published contracts; they do not extend the SDK.

## Verify

Run the consumer typecheck and tests through published imports. Reproduce packaging failures from a
packed or installed SDK rather than repository aliases. For guidance synchronization failures,
rerun `command-center-sdk skills sync --path . --json` so authentication, catalog validation, and
filesystem ownership errors remain explicit. For themed consumers, run `command-center-sdk theme
audit` and treat unknown tokens, literal fallbacks, and hardcoded semantic visual values as failed
verification.
