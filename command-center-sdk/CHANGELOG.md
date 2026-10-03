# Changelog

## Unreleased

Documentation only: the `maintain-command-center-code-repository` skill says that an Agent is
deployed once per branch, so a site that opens an Agent conversation writes each Environment's Agent
UID and the Environment's own UID in that Environment's workflow file, next to its API releases. No
export, contract, or CLI change.

- **`ResourceListPage` stops polling in a hidden tab** (#11). `pollIntervalMs` kept polling while the
  document was hidden, so every background tab kept requesting its list. No poll starts now while
  `document.visibilityState` is `hidden`. When the document is shown again, a poll that came due in
  the meantime runs at once, and one that is not yet due keeps its time. The prop and its type are
  unchanged.

## 0.5.14

Compatibility axes: `ResourceListPage` poll timing (a poll waits for the previous list load and no
longer fetches discovery); the packaged skills `general/maintain-command-center-code-repository`
and `embed/integrate-static-site-iframe`, and the static-site example's host-origin variable
(`VITE_COMMAND_CENTER_ORIGIN` instead of `VITE_HOST_ORIGIN`). No npm export, contract ID, JSON
Schema, fixture, iframe protocol, theme, or storage change.

The Main Sequence platform deploys the commit a matching release tag points at,
whether it is the branch's latest commit or an older commit on that branch; targets that deploy
every push ignore tags. The README, CLI reference, operations and getting-started guides, and the
`maintain-command-center-code-repository` skill no longer say the tag must point at the latest
commit. No export, contract, or CLI change.

A static site points each Environment at its own API releases. Every branch deploys its own
release of an API, with its own UID, and delegation does not compare Environments, so a
development build that names a production release reaches production without an error. The
`maintain-command-center-code-repository` skill gains "Point Each Environment At Its Own APIs"
(Environment-scoped workflow files carrying `spec.build_environment`, finding each Environment's
release, reserved keys, and checks), and the application-operations guide a matching section. The
`integrate-static-site-iframe` skill, the static-site guide, and the static-site example read the
host origin from `VITE_COMMAND_CENTER_ORIGIN`, which the platform sets in every Vite build, instead
of "trusted deployment configuration" or the example's `VITE_HOST_ORIGIN`. Documentation only: no
export, contract, or CLI change.

- **`ResourceListPage` polling no longer overlaps slow loads** (#10). `pollIntervalMs` used a fixed
  interval: a tick started a new list request while the previous one was still pending, and every
  tick also fetched discovery again. A slow list was then requested again every interval, and the
  aborted requests kept running on the server. A poll now starts `pollIntervalMs` after the previous
  list load settles and reloads the list only. The prop, its type, and the refresh control, Retry,
  and `refreshKey` behavior are unchanged.

## 0.5.13

Compatibility axes: the CLI command `code-repository sync` (breaking: its arguments, its behavior,
and its `--json` output); the packaged skill `general/maintain-command-center-code-repository`. No
npm export, contract ID, JSON Schema, fixture, iframe protocol, theme, or storage change.

- **Versions and release tags are repository code.** The Main Sequence platform no longer provides
  tag names. It deploys from Git pushes as the repository's `.mainsequence/workflows/*.yaml` says:
  with `tag_regex` omitted or `null` every push deploys, and with a regular expression a push
  deploys only when a matching tag points at the branch's latest commit. `automatic_deployment` and
  `tag_regex` are set only in that file. Release tags come from the repository's own CI; the
  application-operations guide and the skill carry an example GitHub Actions release workflow.
- **`code-repository sync` only refreshes dependencies.** In the repository root it runs
  `npm install --package-lock-only` and then `npm ci`, and nothing else. It makes no backend request,
  reads no session, creates or registers no SSH key, runs no `npm version`, and runs no Git command.
  Commit and push the changed files yourself.
  - It no longer takes a commit message or a CodeRepository UID (positional or `-m`/`--message`),
    `--dry-run`, or `--timeout-ms`, and refuses them with an error that says why.
    `COMMAND_CENTER_SDK_CODE_REPOSITORY_TIMEOUT_MS` is no longer read.
  - `--json` prints `{ command, codeRepositoryDir, commands, completed }`, and a failure
    `{ error, stage, codeRepositoryDir, completed }`.
  - The root check finds the nearest `.git` folder or file on the file system, so the command no
    longer needs Git installed.

## 0.5.12

Compatibility axes: the installed MCP skill namespace and its provenance file move from
`.agents/skills/mainsequence/` to `.agents/skills/ms-command-center/`; the `--json` result of
`skills sync` gains `platform.legacy`. No npm export, contract ID, JSON Schema, fixture, iframe
protocol, theme, or backend change.

- **The MCP platform skills have their own namespace** ([#9](https://github.com/mainsequence-sdk/command-center-sdk/issues/9)).
  Postinstall and `skills sync` installed them in `.agents/skills/mainsequence/`, which the Python
  Main Sequence SDK owns since 9.0.2 and mirrors, deleting what it did not install. A Command Center
  application with a Python environment had two writers undoing each other. They now go to
  `.agents/skills/ms-command-center/`, with its own `MCP_PINNED_FROM.txt`, and the installer no
  longer adopts folders on the Python SDK's word.
  - After a successful install it removes, from `.agents/skills/mainsequence/`, only the folders an
    earlier version's `MCP_PINNED_FROM.txt` records and the Python SDK's `PINNED_FROM.txt` does not,
    then that sentinel, then the folder if it is empty. Another installer's sentinel, a symbolic
    link, or an unsafe path leaves everything there untouched. `skills sync --dry-run --json` lists
    the removals under `platform.legacy`.
  - Point anything that read `.agents/skills/mainsequence/MCP_PINNED_FROM.txt` at
    `.agents/skills/ms-command-center/MCP_PINNED_FROM.txt`.

## 0.5.11

Compatibility axes: the CLI, additively (`login`, `logout`, `refresh-token`, `auth status`,
`auth token`); `/vite` behavior (`platformRequestProxy()` token source, no declaration change); and
the packaged skills `general/use-command-center-sdk`,
`general/maintain-command-center-code-repository`, and `embed/integrate-static-site-iframe`. No
change to an existing export, contract ID, JSON Schema, fixture, iframe protocol, theme, or storage,
and no backend change.

- **Sign in once per machine** (SDK ADR 017). `command-center-sdk login` saves one session per
  backend in the operating system's credential store: the login Keychain on macOS, Secret Service
  on Linux through `secret-tool`. The Main Sequence Python CLI reads and writes the same session,
  so a login with either serves both. `--mcp` signs in through a coding agent's authenticated MCP
  connection. `auth status` reports the session, `auth token` hands a short-lived access token to
  another local tool, `refresh-token` renews the session and removes credentials an earlier setup
  left in `./.env`, and `logout` ends it. Exit `1` is no usable session and `3` is no credential
  store. On a system where the CLI reaches no store, a token in the environment stays the only
  credential.
- **The tools use the session.** `code-repository sync`, `skills sync`, and the dev server's
  `platformRequestProxy()` use the saved session of the backend the project names with
  `MAINSEQUENCE_ENDPOINT`, in the environment or in its `.env`, and renew it. They stopped with a
  missing-variable message before. `MAINSEQUENCE_ACCESS_TOKEN` in the environment still wins and
  is sent only to the endpoint set next to it. A saved session is sent only to its own backend.
- **A dev server that outlives a token.** `platformRequestProxy()` keeps the access token in
  memory until it is about to expire, renews it by itself, and after a `401` renews the session
  and sends the request once more. The `platform_not_configured` detail now names the login
  command when the machine is not signed in; its status and code are unchanged.
- On macOS, a session saved by a version of the Python CLI that does not mark its Keychain entry is
  not read, because asking for it would show a consent dialog in every process. One login replaces
  it.

## 0.5.10

Compatibility axes: `/views`, additively (`ResourceTransferList` prop `pending`); `styles.css`; and
the packaged skill `views/build-resource-picker`. No change to an existing export, contract ID,
JSON Schema, fixture, iframe protocol, theme, or storage, and no backend change.

- **A transfer list that is saving** (SDK ADR 016). `pending` marks both lists busy (`aria-busy`)
  and makes the move buttons unavailable until it clears, while people can still browse, search,
  and mark. An application that saves each change as it happens passes it during the save, so no
  move made meanwhile is lost.
- **Tab after a keyboard move.** The option that takes focus after a move is now the list's Tab
  stop within the same commit. Before, a Tab that arrived before the next render could land on
  another option in the same list instead of leaving it.

## 0.5.9

Compatibility axes: `/views`, additively (`ResourceTransferList` and the types
`ResourceTransferListProps`, `ResourceTransferChange`, `ResourceTransferListPresentation`,
`ResourceTransferListSide`, and `ResourceTransferListRenderOptionState`); `styles.css`; and the
packaged skills `views/build-resource-picker`, `general/build-command-center-application`, and
`general/use-command-center-sdk`. No change to an existing export, contract ID, JSON Schema,
fixture, iframe protocol, theme, or storage, and no backend change.

- **Choose many items side by side** (SDK ADR 016). `ResourceTransferList` shows the items not
  chosen and the items chosen as two searchable lists, with buttons that move the marked items or
  every shown item across. It is controlled over the picker's option model: `onValueChange` gets the
  next value and what moved (`{ added, removed }`), chosen values without an option are kept, and a
  `disabled` option is a locked choice. Each list is a named multi-select listbox with one Tab stop,
  arrow, Space, Shift, Ctrl/Cmd+A, and Enter handling, and a status message after each move; "all
  shown" follows the search. It stacks below `sm`, keeps each list at a fixed height, and gives rows
  44px on a coarse pointer. It knows nothing about users, teams, or access: applications compose it
  into those controls.
- `ResourcePicker` shares its search rule with the transfer list through one internal helper; its
  behavior is unchanged.
- The `build-resource-picker` skill teaches the transfer list, and the general skills route "many
  items chosen from a long list" to it.

## 0.5.8

Compatibility axes: `/resource`, additively (`resolveResourceDetailTabs`,
`ResolvedResourceDetailTabs`, `ResourceDetailTabSelection`, and `disabled` on detail tab and sub-tab
definitions; `ResourceDetailSubTabDefinition` takes an optional resource type); `/views`,
additively (`ResourceDetailShell` props `renderTabLead`, `renderBreadcrumbLead`, `tabsLabel`, and
`tabsOverflow`, and the types `ResourceDetailTabLeadContext`, `ResourceDetailBreadcrumbLeadContext`,
and `ResourceDetailTabsOverflow`) with the tab and picker behavior changes listed below;
`styles.css`; the packaged skills `views/build-resource-detail`,
`controls/compose-command-center-controls`, `layout/compose-command-center-page`,
`general/build-command-center-application`, and `general/use-command-center-sdk`; and the skill
installer's behavior. No contract ID, JSON Schema, fixture, provenance field, iframe protocol,
theme, or storage change, and no backend change.

- **Detail tabs a keyboard can use** (SDK ADR 015). Each `ResourceDetailShell` tab strip is one Tab
  stop: ArrowLeft and ArrowRight move focus (reversed right to left), Home and End jump to the
  ends, and Enter, Space, or a click selects. The content is the strip's `tabpanel`, labelled by
  the selected tab and sub-tab, and the focus ring is inset so the strip never clips it.
  `tabsLabel` names the primary strip.
- **Disabled tabs and tab icons.** A tab or sub-tab with `disabled` stays visible and focusable but
  never selects. `renderTabLead` draws an `aria-hidden` leading visual, usually an icon, for each
  tab, and `renderBreadcrumbLead` does the same for a breadcrumb, so a detail can keep its object's
  icon beside its name.
- **A More menu for tabs that do not fit.** With a fine pointer, tabs that do not fit move into a
  trailing More menu (the SDK's action picker, a bottom sheet on small screens); with a coarse
  pointer the strip still scrolls sideways. The selected tab always stays in the strip, and a tab
  chosen from More receives focus once the host selects it. `tabsOverflow` (`auto`, `menu`,
  `scroll`) forces either form; server HTML uses the scrolling strip until measured.
- **One tab resolution for the host and the shell.** `resolveResourceDetailTabs` applies
  `isVisible`, which nothing evaluated before, and function-valued `disabled` once the resource has
  loaded, and returns the visible tabs, the active tab and sub-tab, and a `fallback` flag. A host
  that switches its body on the same result can no longer render a different tab than the shell
  highlights.
- **Behavior changes for existing details.** A strip is one Tab stop and the panel is a Tab stop;
  with a fine pointer overflowing tabs move into More instead of scrolling (`tabsOverflow="scroll"`
  keeps the previous behavior); with no requested sub-tab the first enabled sub-tab is selected;
  selecting a tab in a scrolling strip scrolls only the strip, never the page; the tabs row gains a
  frame element around each strip and its More trigger.
- **Pickers keep keyboard focus.** `ResourcePicker` moves focus into its popup only once the popup
  is visible (a browser does not focus a hidden element, so keyboard users stayed on the trigger);
  ArrowDown or ArrowUp on the trigger of an open popup moves focus into it instead of hiding it; Tab
  closes a popover; and choosing an action, a value, or the header action returns focus to the
  trigger instead of dropping it on the page, unless the choice moved focus on, for example into a
  dialog. Row-action menus, bulk actions, and filters all use it.
- The packaged skills teach the detail tabs: `build-resource-detail` composes them, and the
  controls, page, and general skills route tabs to it; the `docs-skills` test forbids tab roles in
  skill examples.
- **Concurrent installs no longer fail.** npm runs one postinstall per workspace that nests its own
  copy of the SDK, all at once and into the same repository; one install renamed entries another
  was moving and failed the whole `npm install` with `ENOENT` or `ENOTEMPTY`. Installs of the
  packaged skills now take turns through `.agents/skills/.command-center.lock`: the first installs,
  the others wait, then install against what it left. A lock left by an install that exited is
  cleared. Command Center AI's installer has the same fix.

## 0.5.7

Compatibility axes: the `/vite` entry point, additively (`localAgentProxy()`, `LocalAgentProxyOptions`,
`LocalAgentProxyPlugin`). No change to an existing export, contract ID, JSON Schema, fixture,
iframe protocol, theme, or storage, and no backend change.

- **An Agent on this machine.** `localAgentProxy()` from `@dev-mainsequence/command-center-sdk/vite`
  forwards `/__agent__` on the dev server to an Agent the developer runs with `ms-tau` in local mode
  (`http://127.0.0.1:8787` by default), for a chat that talks to it directly (Command Center AI ADR
  099). It forwards only the chat's routes, streams the answer, passes the runtime's session id,
  strips credentials and caller headers, and serves only this machine and the page's own origin. A
  local runtime answers every caller as the developer, so an application uses this instead of
  proxying the runtime by hand.
- `platformRequestProxy()` and `localAgentProxy()` share their caller checks (`proxy-guards.ts`);
  `platformRequestProxy()` behaves as before.

## 0.5.6

Compatibility axes: a new `/vite` entry point (Node, for the Vite dev server), the packaged
`embed/integrate-static-site-iframe` skill and its local reference, and guides. No change to an
existing export, contract ID, JSON Schema, fixture, iframe protocol, theme, or storage, and no
backend change.

- **Platform requests in local development** (SDK ADR 014). A deployed site keeps sending its
  platform requests through the host. A top-level page under `vite serve` has none, so
  `platformRequestProxy()` from `@dev-mainsequence/command-center-sdk/vite` stands in for it during
  local development only: the page sends a platform request to `/__mainsequence__/api/...`, and the
  dev server sends it to `MAINSEQUENCE_ENDPOINT` with the developer's `MAINSEQUENCE_ACCESS_TOKEN`,
  read from its environment, so the page never holds the token. It forwards the bridge's request
  shape and serves only same-origin requests from this machine through a localhost name
  (`403 cross_site_request` or `not_local` otherwise). A missing variable is
  `503 platform_not_configured`, an unreachable platform `502 platform_unreachable`, and a `401`
  passes through with one warning to refresh the token.

## 0.5.5

Compatibility axes: the `command-center.static_site_iframe@v1` protocol, with four additive
messages; the `/embed` and `/embed/react` TypeScript API, additively; the protocol's JSON Schema and
its valid and invalid fixtures, additively; the packaged agent skills
`general/use-command-center-sdk`, `general/build-command-center-application`, and
`embed/integrate-static-site-iframe`; and guides. No contract ID, protocol version, existing message,
theme, or storage change, and no backend change.

- **Platform requests through the host** (SDK ADR 013). An embedded application never holds a
  platform credential: it hands `client.sendPlatformRequest()` a Fetch `Request`, and the host
  sends it as the signed-in person, with its own credential, and returns the platform's `Response`.
  The iframe protocol gains `platform-request`, `platform-response`, `platform-error`, and
  `platform-cancel`. Hosts pass `sendPlatformRequest(request, { signal, userUid })` to
  `createStaticSiteIframeHost` or `StaticSiteIframe`, serving only the paths they choose, and
  replace it with `updatePlatformRequestSender()`. Failures are `StaticSitePlatformRequestError`
  codes: `invalid_request`, `access_denied`, `not_allowed`, `temporarily_unavailable`, and
  `unsupported`. Each request names the person in the child's current context (`userUid`), and the
  host sends it only for its own current person, so a request sent just before a person change is
  refused with `access_denied` rather than sent for the new person. Only that uid, the method, the
  path and query, `accept`, `content-type`, and a text body go out, and only the status,
  `content-type`, and the body (text for JSON and UTF-8 `text/*`, base64 otherwise) come back.
  The caps are paths of 4,096 characters, request bodies of 1 MiB, responses of 8 MiB, and 16
  requests in flight per child, past which the child queues. The host times out at 60 seconds
  and the child at 65, reporting an older host's silence as `unsupported`. Live streams are not
  bridged.

- An agent asked for a chat or AI capabilities in an SDK application is now sent to the Command
  Center AI package: the two general skills and their guides (`getting-started.md`,
  `concepts/sdk-architecture.md`) say to install it next to the SDK, refresh its skills, and
  continue with its `use-command-center-ai` skill. Before, the SDK's gap rule told the agent to
  record a missing SDK capability and stop.

## 0.5.4

Compatibility axes: documentation shipped in the package (guides, ADRs, skills, and module
READMEs), one invalid fixture, and the platform MCP skills installer's checks. No TypeScript API,
contract ID, JSON Schema, valid fixture, theme, iframe protocol, or storage change.

- The documentation describes the public contract and the behaviour an integrator observes, and
  nothing about how the platform is built or run.
- The platform MCP skills installer verifies every resource against the platform's catalog (URI,
  manifest version, and content hash) and no longer checks the resources' owner application name.
- `static-site-iframe-v1.unknown-credential-error.json` stays invalid with another unknown error
  code.

## 0.5.3

Compatibility axes: public CSS (additive: `--warning-tint` variable and the Tailwind
`warning-tint` color), Main Sequence Light rendering, and the CLI theme audit, which still passes
every stylesheet it passed before. No TypeScript API, theme token key, theme ID, packaged agent
skill, backend contract, JSON Schema, fixture, iframe protocol, or storage change. No backend
rollout is required.

- Main Sequence Light (`quartz-light`) no longer paints eggshell and khaki surfaces. Its darkened
  warning olive, tinted onto white, produced `#F4F1E6` and `#EDE8D6`; Linear keeps light surfaces
  neutral and shows status only on icon, border, and text. Warning backgrounds now tint from the new
  `--warning-tint` variable, which equals `--warning` in every other preset and is neutral grey in
  Main Sequence Light, so `bg-warning-tint/10` lands on `--muted`. SDK warning badges and entity
  summary warnings use it. Applications should write `bg-warning-tint/<n>` instead of
  `bg-warning/<n>` for warning panels and keep `border-warning/<n>` and `text-warning`.
- Data-viz ramps treat a pure grey endpoint's hue as powerless (CSS Color 4) and take the other
  endpoint's hue. Only Main Sequence Light output changes: its diverging centers and warning
  sequential start are now dead-neutral `#F0F0F0`/`#F4F4F4`, and the red/green scale runs rose to
  grey to mint instead of through tan and eggshell. Every other preset resolves to identical colors.
- `command-center-sdk theme audit` reads a declaration's value without its `!important` flag. An
  allowed value such as `transparent !important` or `none !important` on a theme-owned property no
  longer fails as `hardcoded-theme-value`; a color literal, fallback, unknown variable, or hardcoded
  value still fails with the flag.

## 0.5.2

Compatibility axes: repository consumer example and its guide only. No SDK runtime or public API,
packaged agent skill, backend contract, JSON Schema, fixture, iframe protocol, theme ID, or storage
change. No backend rollout is required.

- The hosted Vite/FastAPI example now selects a release UID by API name for each request from a
  JSON map, so one site can call multiple FastAPI releases. Unknown names and invalid release UIDs
  fail before a request is sent. The local one-API runner remains a focused development example.

## 0.5.1

Compatibility axes: packaged agent skills and human guides only. No runtime, npm public API,
backend contract, JSON Schema, fixture, iframe protocol, theme ID, or storage change.

- Every screen-building skill (`use-command-center-sdk`, `build-command-center-application`,
  `compose-command-center-page`, the four `views` skills, `build-application-loading-flow`,
  `compose-command-center-application-shell`, `integrate-static-site-iframe`, and
  `theme-command-center-app`) now requires `/controls` for every button, badge, label, and text
  field and forbids raw elements, Tailwind or CSS buttons, and application-owned kits, so an
  independent site renders its controls exactly like the host. The human guides carry the same
  rule, and the `docs-skills` test pins it.

## 0.5.0

Compatibility axes: npm public API 0.5.0 (additive: new `/controls` entrypoint). No backend contract,
JSON Schema, fixture, iframe protocol, theme ID, theme variable, or storage change. The class names
`cc-control`, `cc-button`, `cc-badge`, `cc-label`, `cc-field`, `cc-input`, and `cc-textarea`, their
modifier and element classes, and the `data-cc-button`, `data-cc-badge`, `data-cc-label`,
`data-cc-field`, `data-cc-input`, and `data-cc-textarea` attributes become stable with this release.
Existing components, class names, and rendered output are unchanged.

- Add `/controls` (SDK ADR 011): `Button` (`outline`, `primary`, `secondary`, `ghost`, `danger`;
  `small`, `medium`, `large`; `iconOnly`; `pending`), `Badge`, `Label`, `Field`, `Input`,
  `Textarea`, and `useFieldControlProps`. `Field` owns the control id, label target,
  `aria-describedby`, `aria-invalid`, `aria-required`, and disabled propagation; values,
  validation, and submission stay consumer-owned. The SDK owns these primitives.
- `cc-control` carries `--application-control-min-size` at every pointer type, so a consumer's
  controls meet the SDK ADR 006 touch floor without appearing in the device-axis selector list.
  `Input` and `Textarea` join the 16px coarse-pointer text-input rule.
- Copyable examples, the layout skill, and the packed consumer fixture render header actions with
  `Button` instead of an unstyled `<button>`.
- Add the `controls/compose-command-center-controls` packaged skill and the Application controls
  guide. The layout and general application skills route action and form composition to it.

## 0.4.4

Compatibility axes: npm runtime public API unchanged. The packaged static-site skill and human
guides now distinguish top-level local Vite/FastAPI, non-local trusted iframe delegation, and a
non-local direct link without a credential bridge. Transport selection requires a validated host
handshake for delegation; deployed direct links cannot fall back to local CLI identity. No backend
contract, JSON Schema, fixture, iframe protocol, theme ID, or storage change.

## 0.4.3

Compatibility axes: npm runtime public API unchanged. The packaged static-site skill and its
discovery metadata now require the complete top-level local Vite/FastAPI setup before API calls:
server-side developer identity, a loopback runner, readiness, a same-origin proxy, explicit local
transport, and an unavailable state. Hosted delegation remains scoped to an initialized trusted
iframe. No backend contract, JSON Schema, fixture, iframe protocol, theme ID, or storage change.

## 0.4.2

Compatibility axes: npm public API unchanged. The packaged iframe skill and human documentation
now separate top-level local Vite `/api` transport from hosted delegated `fetchFastApi` transport.
No backend contract, JSON Schema, fixture, iframe protocol, theme ID, or remote storage change.

- Add a runnable Vite/FastAPI consumer example with a loopback-only API, readiness endpoint,
  same-origin proxy, explicit transport selection, and server-side single-developer identity from
  the Main Sequence CLI login. Missing identity returns `503 identity_unavailable`.
- Replace the skill's unnamed local harness instruction with exact commands, identity behavior,
  and a link to the consumer example. Clarify that hosted delegation requires a trusted parent
  bridge and a FastAPI release UID.

## 0.4.1

Compatibility axes: npm public API 0.4.1 (additive). No backend contract, JSON Schema, fixture,
iframe protocol, theme ID, agent-skill, or remote storage change. The class names
`cc-application-navigation-drawer` and `cc-application-navigation-drawer__scrim` and the CSS
variable `--application-navigation-drawer-width` become stable with this release. The navigation
shells' drawers, class names, and output are unchanged.

- Add `ApplicationNavigationDrawer` to `/navigation` (SDK ADR 010): the controlled off-canvas
  drawer for a real host that renders its own sidebar. The SDK owns the scrim, the named modal
  dialog, the focus trap and restoration, the scroll lock, and Escape, scrim, and outside-pointer
  dismissal, and renders nothing inside. Its width is `--application-navigation-drawer-width`
  (default `20rem`), capped at `calc(100vw - 3rem)`. Hosts no longer need the shells' unpublished
  drawer class names, and `useOverlayBehavior` stays internal.
- Record the wide-screen host frame (SDK ADR 010, amending SDK ADR 008 section 2): from `md` up a
  host keeps only its top bar around an embedded site, renders no sidebar column beside it, and
  opens its navigation in the drawer, so the child's left navigation is the only one on screen and
  host and child resolve the same breakpoint. The navigation, static-site embed, and mobile guides
  show the composition; the iframe protocol is untouched.
- Fix a standalone `ApplicationNavigationPanel` below 768px: 0.3.0 offset it by
  `--application-navigation-rail-width` (248px by default) even outside the SDK shell, so a host
  that positions the panel itself saw it pushed off a phone screen. The panel now sits at the edge
  of its container and only the SDK shell applies the rail-width offset.

## 0.4.0

Compatibility axes: npm public API 0.4.0 (additive); local agent-skill provenance sentinel schema
3 (migrated automatically with rollback coverage). No backend contract, JSON Schema, fixture,
iframe protocol, theme ID, or remote storage change. Existing depth-two navigation remains docked
with an external trigger unless new props are selected, and direct panel section labels remain
visible by default.

- Standardize complete production applications as embedded children with no child top navigation,
  one explicit zero/one/two-level left-navigation decision, and a mandatory viewport startup gate
  covering host context/theme, delegated API transport/authentication, and critical API readiness.
- Add the public depth-one `ApplicationNavigationPanelShell`, including automatic responsive
  docked/overlay presentation, an SDK-owned floating phone trigger, accessible drawer behavior,
  and suppression of redundant single-section labels. Add depth markers to both navigation shells
  and the opt-in `overlayTrigger="floating"` mode to the existing depth-two shell.
- Add `/navigation/testing` with Playwright-compatible verification for startup gating, declared
  navigation depth, and absence of child topbar chrome. Cover the API with declaration, unit,
  real-browser, package-boundary, package-size, and packed-consumer checks.
- Ship `navigation/compose-command-center-application-shell`, a focused agent skill with a golden
  embedded-root TSX asset and migration checklist. Strengthen the general application and loading
  skills so navigation/routes stay unmounted until true application readiness and reconnect uses
  the same gate.
- Make the packaged agent-skill catalog authoritative for the complete
  `.agents/skills/command-center` namespace. Install, postinstall, SDK update, and skill sync now
  prune unrecorded or obsolete entries such as retired `widget`, `workspace`, and embed skills,
  while preserving all other skill namespaces; dry-run and JSON results report the pruned paths.

## 0.3.0

Compatibility axes: npm public API 0.3.0 (additive). No backend contract, schema, fixture, iframe
protocol, or theme ID changes. The CSS variables `--application-control-min-size`,
`--application-safe-area-*`, and `--application-navigation-rail-width`, the `presentation` prop
vocabulary, and the new `data-cc-*` attributes become stable with this release. Visible changes for
existing consumers: the progress stage list stacks at 639px instead of 559px, table cell padding
follows the density variables, and verifier reports carry `severity` and `warnings` with a
six-entry default matrix.

- Add the device axis from SDK ADR 006. `/theme` publishes the breakpoint scale (`sm` 640,
  `md` 768, `lg` 1024) and `/layout` publishes the viewport seam `useCommandCenterViewport`,
  `resolveCommandCenterViewport`, and `subscribeCommandCenterViewport`.
- Publish `--application-control-min-size`, `--application-safe-area-*`, and
  `--application-navigation-rail-width`. Guard every SDK hover rule with `@media (hover: hover)`,
  add `100dvh` fallbacks, safe-area padding, and a coarse-pointer block that sizes controls to
  44px, keeps text inputs at 16px, floors table density, and drops `background-attachment: fixed`.
  The progress stage list now stacks at 639px instead of 559px; fine-pointer output is otherwise
  unchanged.
- `ApplicationNavigationShell` gains `presentation` (`docked`, `overlay`, `auto`), `menuOpen`,
  `onMenuOpenChange`, `menuId`, and `menuLabel`, and exposes `data-cc-presentation`. Add the
  exported `ApplicationNavigationTrigger`. The panel's narrow-viewport offset reads the published
  rail width variable instead of a literal 52px.
- The layout verifier's default matrix becomes six entries with a declared pointer and adds the
  `touch-target`, `input-zoom`, and `sticky-hover` rules. Findings carry a `severity`, and reports
  gain `warnings`. Consumers that construct report objects by hand must add the new fields.
- Add the "Mobile and touch" concept guide, update the navigation, layout, themes, and public API
  guides, and add a phone-presentation step to the list, detail, picker, and page skills.
- Implement SDK ADR 007. `ResourceColumnDefinition` gains `importance` (the discovery contract's
  existing vocabulary) and the host-only `hideBelow`; `resolveResourceDiscoveryColumns` now carries
  the backend's `importance` instead of dropping it. `/resource` exports
  `resolveResourceColumnImportance`, `isResourceColumnVisibleAt`, and `selectResourceColumnsAt`.
  No contract, schema, fixture, or backend change.
- `DataTable` gains `presentation` (`table`, `stacked`, `auto`), hides columns by importance band
  in the table form, keeps the header and primary column sticky inside the scroller with a scroll
  edge shadow, reads cell padding from the density variables (a visible density change at relaxed
  and tight presets), and collapses row actions into a menu when there are more than two or the
  pointer is coarse. `ResourcePagination` gains `presentation` with a compact form.
  `ResourceListPage` gains `tablePresentation`, a sort picker while rows are stacked, a filters
  disclosure and compact pagination below 640px.
- `ResourcePicker` gains `presentation` (`popover`, `sheet`, `auto`). The sheet is bottom-anchored
  to the visual viewport with a scrim, focus trap, and scroll lock; the popover flips above the
  trigger when there is no room below. `ResourceActionConfirmationDialog` gains the same prop with
  a bottom-anchored `sheet` form, traps focus, uses the iOS-safe scroll lock, and drops its
  backdrop blur under a coarse pointer. `ResourceBulkActionPicker` passes `presentation` through.
  Every picker and dialog the SDK renders itself uses `auto`.
- Add `ApplicationImmersiveBar` to `/navigation` (SDK ADR 008): the one-row chrome a host shows
  above an embedded static site on a phone, with a back control that keeps native link behavior,
  a truncated title, and a trailing slot for the menu trigger. Immersive routes stay host-owned;
  the iframe protocol is unchanged.
- `EntitySummary` opens a field's `info` on tap through a disclosure button instead of a hover
  `title`, and on narrow screens shows facts in two columns with wrapping values.
  `ResourceDetailShell` scrolls the active tab into view and shades the scrolling tab strip's edges.

## 0.2.1

- Reorganize the SDK documentation around architecture, ownership, resource, interface,
  integration, and operational concepts; add deeper public API, theme, embed, and operations
  guides; and verify the complete guide set in the published package artifact.
- Add the accepted static-site FastAPI WebSocket bridge with one-time ticket resolution, strict
  additive v1 messages, native protocol ordering, cancellation and lifecycle invalidation,
  language-neutral fixtures, and real-browser handshake coverage.
- Refactor the application-documentation skill and scaffold into an end-user-only help system.
  Schema-version-2 navigation now derives the docs folder tree from stable application-menu IDs,
  while validation enforces user-facing page types, task completeness, navigation parity, and the
  exclusion of architecture and implementation material from the served `/docs/` site.
- Retheme the `quartz-light` preset ("Main Sequence Light") to the light half of the Linear-derived
  dark theme: white canvas, dead-neutral grey surfaces (`#F8F8F8`, `#F4F4F4`, `#F0F0F0`), soft
  charcoal text at `#282A30`, the same `#5E6AD2` indigo brand, and `radius` from `16px` to `8px`.
  Status tokens are Linear's light hues darkened along their own hue until they clear WCAG AA as
  text on white (`danger #E42020`, `success #1F8536`, `warning #8D7000`), because the SDK paints
  cells and pills with these tokens as text; the previous `success` and `warning` failed. Give the
  theme its own chrome block: no background gradient, no panel shadow, lighter dialog and picker
  shadows, and a solid `::selection` pair. Add a data-visualization palette whose series clear 3:1
  on white and whose scales are hue-matched for the palette resolver. The theme ID and every token
  key are unchanged.

## 0.2.0

- Narrow the SDK to reusable application navigation, layout, feedback, resource, theme, contract,
  documentation, and static-site embed primitives.
- Remove product-domain exports, schemas, examples, styles, skills, and compatibility aliases.
- Keep one public package and validate it through source, schema, packed-consumer, and documentation
  checks.
