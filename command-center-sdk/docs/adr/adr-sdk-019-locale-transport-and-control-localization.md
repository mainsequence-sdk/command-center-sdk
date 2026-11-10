# SDK ADR 019: Locale Transport and Localization of SDK Controls

- Status: Accepted
- Date: 2026-11-09
- Accepted: 2026-11-10
- Implementation: SDK 0.5.19
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Issue: [SDK #25](https://github.com/mainsequence-sdk/command-center-sdk/issues/25)
- Contract: `command-center.static_site_iframe@v1`, with negotiated locale support
- Related: [Static-site embeds](../static-site-embeds.md),
  [Backend contracts](../backend-contracts.md),
  [Extending and releasing](../extending-and-releasing.md)

## Context

An embedded application needs both the host's selected language and a way to translate SDK-owned
controls. Transport alone leaves pagination, selection, actions, empty states, and accessibility
labels in English. Translating controls alone leaves each application guessing the user's choice.

The released baseline inspected for issue #25 carries theme and public user UID in the iframe
context. Its host already republishes context, and its child invokes `onContext` on later
initializations. Identity changes invalidate authenticated work; presentation changes must not.
The React host already separates context updates from the effect that creates its bridge.

There is an important compatibility distinction: the baseline JavaScript initialize parser ignores
unknown payload properties, but the published v1 initialize schema has `additionalProperties:
false`. An unconditional new property would fail an older schema validator even when an older
JavaScript client accepts it. Compatibility must cover both implementations.

The reference host owns an authenticated, persisted language preference and applies it to an
application-owned i18next runtime. Its current choices are `en`, `es`, `de`, `fr`, and `it`.
The SDK receives the host's resolved value; this host-specific set is not the SDK's locale enum.
Settings, preference hydration, profile projection, and database persistence belong to the host
and backend. This decision defines the SDK boundary they consume.

## Decision

### 1. Libraries and public ownership

Keep locale validation and the message contract framework-neutral under the
`@dev-mainsequence/command-center-sdk/localization` export. Put the React provider and hook under
`@dev-mainsequence/command-center-sdk/localization/react`.

Use **i18next and react-i18next in the reference React integration and consumer example**. The
SDK accepts a typed translation callback, so applications using Lingui or another library can
provide the same behavior. The SDK does not initialize i18next, add it as a runtime dependency,
register application resources, detect a browser language, or persist a preference.

| Owner | Responsibility |
| --- | --- |
| Host/backend | Save and hydrate the user's preference; supply its current resolved language |
| SDK embed | Validate and carry locale at initialization and on subsequent context updates |
| SDK controls | Stable message keys, parameters, English defaults, and localized accessibility text |
| Application | Translation library/catalogs, supported-language resolution, document metadata, and formatting |

The reference host should pass its reactive resolved language after backend hydration or a
confirmed preference update. A profile's read-only language projection is another view of that
same preference, not a new SDK persistence source. The SDK never fetches the profile or preferences
and never imports a private host store. Retain the host/backend's existing stored `language` field;
the SDK name `locale` is not a request to rename it.

### 2. Locale input and normalization

Add optional `locale` to `StaticSiteIframeContextInput` and React `StaticSiteIframe` props.
Expose a required normalized `locale` on `StaticSiteIframeContext`. Omission resolves to `en`.
Use BCP 47 language tags, including base and regional examples such as `de` and `de-AT`.

SDK 0.5.19 accepts the BCP 47 core profile: a two- or three-letter language, optionally a
four-letter script, optionally a two-letter or three-digit region (`de`, `de-AT`, `zh-Hant-TW`).
Variants, extensions, private-use tags, underscores, whitespace, and repeated subtags are rejected.
The runtime and JSON Schema use the same grammar and 128-character upper bound. Accepted values
are canonicalized with `Intl.getCanonicalLocales`. A valid locale absent from an application's
catalogs survives transport unchanged; available translations are a separate concern.

- A malformed explicitly supplied host locale fails before sending; it is not silently persisted
  or converted to English.
- A missing wire locale means an older host or an omitted value and normalizes to `en`.
- A malformed wire locale rejects the message through the existing protocol-error path, preserving
  the last valid context and transport state.
- Wire/schema/runtime fixtures must agree on the accepted profile, including casing, malformed
  separators, repeated subtags, non-string values, and length limits. A permissive regular
  expression alone must not be described as full BCP 47 validation.

Keep locale validation distinct from application fallback. Resolve application catalogs by exact
canonical tag, then its base language, then English. Resolve missing messages to English as well.
The application retains the requested host locale separately from its effective rendered locale.
Its fallback never changes the host's saved preference.

### 3. Negotiate the optional v1 wire field

Retain numeric protocol version `1` and existing contract/schema identifiers only with this
compatibility gate. A new child advertises `locale-context-v1` in an optional `capabilities` string
array in its `ready.payload`. The existing ready schema permits additional payload content, so an
older host can receive this message without learning a new envelope or message type.

Messages available from SDK 0.5.19:

```json
{
  "channel": "mainsequence.example",
  "version": 1,
  "type": "ready",
  "payload": { "capabilities": ["locale-context-v1"] }
}
```

```json
{
  "channel": "mainsequence.example",
  "version": 1,
  "type": "initialize",
  "payload": {
    "theme": "light",
    "themeId": "quartz-light",
    "user": null,
    "locale": "de-AT"
  }
}
```

The host sends `payload.locale` only after that child advertises support. A legacy child's
initialize payload retains exactly the legacy fields, including on subsequent updates. Defaulting
the host's internal context to `en` must not accidentally serialize locale for a legacy child.
Recognize the exact capability identifier, ignore unknown capabilities, and reject a malformed
capabilities declaration. Replacing the child/handshake resets the negotiated state.

| Host | Child | Result |
| --- | --- | --- |
| Old | Old | Existing v1 behavior |
| Old | New | Host ignores capability; child receives legacy context and uses `en` |
| New | Old, including strict schema consumer | No advertised capability; host sends legacy shape |
| New | New | Host sends current locale initially and on later updates |

Capability support is not authority: retain origin, source-window, channel, version, payload-size,
and message validation. It must not authorize a platform request or alter any credential binding.
Builders and React bindings must use the same negotiated behavior as the framework-neutral host.
Add fixtures for ready capability, legacy initialize, and locale-bearing initialize, and exercise
the frozen legacy schema/parser against messages actually sent to legacy peers.

If this gate cannot preserve the released contract, introduce a new versioned contract and explicit
transition instead of silently weakening old validation. Do not overwrite a released schema ID
with incompatible semantics.

### 4. Live updates are presentation updates

Reuse the established ready/initialize context lifecycle and the existing `onContext` callback.
The React host's `locale` prop updates context without recreating its bridge, iframe, or listener.
Keep locale out of iframe keys, launch URLs, and authorization/launch effect dependencies.

In a React child, application state holding the latest SDK context feeds the localization provider
and its translation instance. The SDK currently supplies a framework-neutral child callback and a
React host; this plan does not assume an existing React child-context hook. Show the complete
callback-to-state/provider composition in the consumer example.

A locale-only update must preserve the current record, unsaved forms, focus, selection, scroll,
credential cache, pending HTTP/platform requests, WebSocket connections/tickets, and application
startup state. Preserve existing invalidation for actual user/target changes. Locale must not
become part of transport identity or request cache keys.

Apply the latest locale when ready arrives, even if the host changed it before the handshake.
Subsequent context updates remain synchronous notifications; the application owns asynchronous
catalog loading. Document how it prevents an earlier language-load completion from overwriting a
later selection. Mount translation providers without a locale-based React key.

### 5. Localize complete SDK messages

The public exports are `SdkMessageKey`, `SdkMessageValues`, `TranslateSdkMessage`,
`sdkEnglishMessages`, `normalizeCommandCenterLocale`, `resolveCommandCenterLocale`, and
`formatSdkEnglishMessage` from `/localization`, plus `CommandCenterLocalizationProvider` and
`useSdkTranslation` from `/localization/react`. The provider and hook share the same message
contract used by SDK-owned controls.

The provider accepts the effective rendered `locale` and a translation callback. It updates
messages in place when either changes. Use this order for every existing customizable message:

1. An explicitly supplied component message/label/render override.
2. The provider's translated complete message.
3. The SDK's complete English default.

The translation callback receives a stable typed key and interpolation values and returns a
rendered string, or `undefined` for a missing translation. Preserve literal overrides, including
an intentional empty string where the component permits one. Do not replace mandatory accessible
names with empty fallback output, expose raw keys, or use HTML injection for interpolation.

Provide numbers as numbers, with a named `count` for plural messages, plus the values each key
requires. Translate whole sentences, not fragments assembled from English word order. Resource
names, domain labels, and action titles are application inputs; applications can translate the
whole containing message and must not be forced to infer grammar from an English plural noun.
English defaults must handle singular/plural cases where their wording differs.

The i18next adapter uses one application-owned SDK namespace, complete-message interpolation,
`count`-based plurals, and English fallback. It returns `undefined` when no translation/default is
available rather than returning a raw key. Changing the language must update subscribers even
when the application's `t` function has stable identity. Other libraries implement the same
typed callback without an SDK dependency on them.

Audit every SDK-owned visible or accessibility message. Required coverage includes:

- Resource list/table search, sort, pagination, page/result summaries, selection, and action menus.
- Pickers and transfer lists, their search/loading/empty states, keyboard and live announcements.
- Action confirmation/preflight dialogs, validation/help messages, and retry/cancel/working states.
- SDK defaults in resource details, navigation, feedback, and general controls, including icon-only
  labels, overflow controls, status announcements, and fallback errors.

Caller-authored button children, column titles, domain errors, and backend-provided business text
remain caller-owned. Keep protocol error codes and machine identifiers stable. Translating a
diagnostic must not change its code or automatically translate user/business content.

### 6. Document metadata and formatting

The SDK does not change the host or child's document as a side effect of receiving a message.
The application applies its effective rendered locale to `document.documentElement.lang`, sets
direction according to its supported catalogs, and uses that locale for `Intl` date/number
formatting. A standalone child without a trusted host uses its documented standalone fallback.

Language selection does not select timezone, currency, units, or date-storage semantics. Do not
claim RTL layout/catalog support from accepting a language tag; verify it separately when such
catalogs are adopted. Preserve React escaping for caller-provided interpolation values.

## Implementation and acceptance evidence

| Step | Work and completion evidence |
| --- | --- |
| 1. Freeze compatibility baseline | Preserve released parser/schema examples and catalogue every SDK default/override; agree the accepted locale profile and capability identifier. |
| 2. Locale transport | Align framework-neutral host/client, ready negotiation, React props, normalized context, schema/manifest, valid/invalid fixtures, and old/new peer tests. |
| 3. Localization APIs | Add framework-neutral messages/locale helpers and React provider/hook with public exports, types, complete English fallback, interpolation/plural tests, and no React import in the neutral module. |
| 4. Controls | Migrate the audited SDK-owned strings and accessibility text while preserving override precedence, keyboard behavior, resource state, and existing English behavior. |
| 5. Consumer adoption guide | Show i18next/react-i18next setup, live callback/provider updates, a consumer with fewer catalogs, document metadata, number/date formatting, and standalone behavior using published imports. |
| 6. Release and host handoff | Pass the release checks below, publish the exact minimum SDK version and negotiated compatibility policy, then let host/application owners adopt the released package. |

Browser acceptance must start with German, edit a form/select a record, switch to English through
a context update, and retain the same iframe node, form value, focus, selection, and transport.
Count iframe loads/mounts, handshakes, credential resolver calls, and socket closes. Assert no
additional authorization/launch work caused by locale alone, including with a platform request
already pending. Repeat with provisional context corrected after hydration and with multiple
mounted children.

Cover exact/base/English resolution, absent/invalid locale, all four old/new combinations,
unknown/malformed capability, missing keys, zero/one/many plurals, explicit overrides, translated
accessibility announcements, longer labels, and malformed/wrong-origin/wrong-source/wrong-channel
messages. Keep legacy identity/theme and credential-invalidation coverage.

Update the SDK README, embed/localization/view module READMEs, static-site/control/resource guides,
backend-contract and compatibility guidance, consumer examples, and the matching packaged embed,
theme, control, and resource skills. Add localization guidance to the public API/skill maps.
These surfaces ship together in SDK 0.5.19.

Run the repository's package-boundary/type checks, SDK tests, build/size lane, packed-consumer
smoke tests, documentation build, and relevant real-browser tests before release. Inspect the
packed exports, declarations, schemas, fixtures, docs, and skills. Record the first actual package
version with both locale transport and control localization; the inspected baseline is insufficient.

## Backend/storage, rollout, and rollback

This SDK change stores no user preference, adds no product endpoint, and requires no database
migration. Host/backend owners must independently prove that a confirmed language choice survives
a fresh database read, profile/bootstrap/preferences response, and new session. An existing saved
base-language field must not silently gain arbitrary regional tags because the SDK can carry them.

The iframe bytes do change. Update the language-neutral conformance bundle and backend/integrator
handoff with old/new messages, defaults, negotiation, rollout order, and mixed-version evidence.
Backend services that validate these messages need the matching schema; ordinary language
preference storage does not become an iframe contract store.

Release the SDK first, then adopt it in hosts and children independently. A new child on an old
host uses English; an old child on a new host receives legacy context. Rollback of either side
uses the same compatibility matrix and leaves stored preferences and user content untouched.
Do not declare end-to-end completion solely from a local `changeLanguage` call or source changes
in a checkout; require released-package and host/backend acceptance evidence.

## Alternatives considered

- **Always add locale to initialize:** accepted by the baseline JavaScript reader but rejected by
  the baseline strict schema. Negotiate support to preserve both.
- **Query parameters, storage, or a second postMessage bridge:** duplicate the context lifecycle
  and can couple language changes to navigation or leak another user's cached preference.
- **Bundle or initialize i18next inside the SDK:** couples consumers to one library/global state
  and duplicates the application's catalog ownership. Use the injected boundary instead.
- **Only add label props:** leaves nested controls and accessibility announcements inconsistent
  and encourages partial word substitution. Retain overrides above a shared whole-message layer.

## References

- [BCP 47 language-tag syntax](https://www.rfc-editor.org/rfc/rfc5646)
- [i18next language and message fallback](https://www.i18next.com/principles/fallback)
- [i18next plural messages and the count parameter](https://www.i18next.com/translation-function/plurals)
