# Localize SDK controls

Available from SDK 0.5.19. Import the framework-neutral message types and defaults
from `@dev-mainsequence/command-center-sdk/localization`; React composition lives
at `@dev-mainsequence/command-center-sdk/localization/react`.

```tsx
import { CommandCenterLocalizationProvider } from '@dev-mainsequence/command-center-sdk/localization/react';
import type { TranslateSdkMessage } from '@dev-mainsequence/command-center-sdk/localization';
import { useTranslation } from 'react-i18next';
import { useCallback, type ReactNode } from 'react';

function LocalizedApplication({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation('sdk');
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const translate = useCallback<TranslateSdkMessage>((key, values) =>
    i18n.exists(key, { ...values, ns: 'sdk', lng: locale })
      ? String(i18n.t(key, { ...values, ns: 'sdk', lng: locale }))
      : undefined,
  [i18n, locale]);
  return <CommandCenterLocalizationProvider locale={locale} translate={translate}>
    {children}
  </CommandCenterLocalizationProvider>;
}
```

The provider updates pagination, search, selection, table accessibility, pickers,
transfer lists, and action/confirmation/preflight messages without replacing their
state. The application owns its i18next instance/catalog and supported locales.
The SDK has no i18next dependency or language persistence. Any translation library
can implement `TranslateSdkMessage`.

Translate complete messages; `SdkMessageKey` and `sdkEnglishMessages` enumerate the
keys/templates, with `SdkMessageValues` carrying interpolation values. Forward
`count` to your translator for plural rules. For example, an i18next namespace
may define `selectionCount_one` as `{{count}} item selected` and
`selectionCount_other` as `{{count}} items selected`. Do not concatenate words
in your translator. Format application values through Intl for the effective locale.

An absent provider/translation returns the complete English message. Return
undefined for an unknown key. Explicit component label/render props override the
provider. Application/backend/domain text (including item names, action labels,
descriptions, warnings, error messages, and confirmation words) remains owned by
its source. Confirmation words are never translated automatically.

Locale itself uses the existing v1 iframe schema's optional `locale` property;
the callbacks/provider are runtime-only, so no separate wire/storage contract is
introduced. Older hosts default to English; invalid incoming locale is rejected.
See [static-site embeds](./static-site-embeds.md#follow-the-host-language).

## Connect a React child to live host context

Initialize the application's i18next instance with its catalogs, `lng: 'en'`, and
`fallbackLng: 'en'`. The following composition uses `LocalizedApplication` above;
keep the same React root and provider instances when the language changes.

```tsx
import { useEffect, type ReactNode } from 'react';
import type { i18n as I18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { createStaticSiteIframeClient } from '@dev-mainsequence/command-center-sdk/embed';
import { resolveCommandCenterLocale } from '@dev-mainsequence/command-center-sdk/localization';

export function EmbeddedApplication({ hostOrigin, i18n, children }: {
  hostOrigin: string;
  i18n: I18n;
  children: ReactNode;
}) {
  useEffect(() => {
    if (window.parent === window) return; // Standalone uses the application's English default.
    let disposed = false;
    let languageChanges = Promise.resolve();
    const client = createStaticSiteIframeClient({
      channel: 'mainsequence.example',
      hostOrigin,
      parentWindow: window.parent,
      onContext(context) {
        const locale = resolveCommandCenterLocale(context.locale, ['en', 'de']);
        // Serialize asynchronous catalog loads so an earlier completion cannot overwrite a later choice.
        languageChanges = languageChanges.then(async () => {
          if (disposed) return;
          await i18n.changeLanguage(locale);
          if (disposed) return;
          document.documentElement.lang = locale;
          document.documentElement.dir = i18n.dir(locale);
        }).catch(error => console.error('Unable to load language catalog', error));
      },
    });
    const receive = (event: MessageEvent<unknown>) => client.handleMessage(event);
    window.addEventListener('message', receive);
    client.announceReady();
    return () => {
      disposed = true;
      window.removeEventListener('message', receive);
      client.dispose();
    };
  }, [hostOrigin, i18n]);
  return <I18nextProvider i18n={i18n}>
    <LocalizedApplication>{children}</LocalizedApplication>
  </I18nextProvider>;
}
```

Keep `hostOrigin` and the i18next instance stable. Reuse this client for delegated
requests in a data-using application; do not create a second bridge just for
language. Use `Intl.DateTimeFormat(locale, { timeZone })` and
`Intl.NumberFormat(locale)` for application values after supported-language
resolution. A child that supports only English resolves every host locale to
`en`, without changing the user's saved preference. Report catalog failures in
the application's own feedback flow if catalogs are loaded over the network.

Locale negotiation preserves strict legacy validators: new clients advertise
`ready.payload.capabilities: ["locale-context-v1"]`. The host includes locale only
for that capability. Missing/unknown capabilities retain the frozen legacy payload;
malformed declarations are rejected. The normalized new-client context still
defaults to English when an old host omits locale. See SDK ADR 019.

SDK 0.5.19 accepts a BCP 47 core profile: two- or three-letter language, optional
four-letter script, optional two-letter or three-digit region (for example `de-AT`
or `zh-Hant-TW`). Variants, extensions, private-use tags, underscores, whitespace,
and repeated subtags are rejected. The runtime and JSON Schema enforce the same
profile; accepted tags are canonicalized. This transport profile does not expand
the backend's stored language choices.
