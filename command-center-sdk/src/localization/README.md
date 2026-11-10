# Localization

`@dev-mainsequence/command-center-sdk/localization` exports the framework-neutral
`SdkMessageKey`, `SdkMessageValues`, `TranslateSdkMessage`, English messages, and locale
normalization/fallback helpers. It imports neither React nor an application translation library.
`/localization/react` exports `CommandCenterLocalizationProvider` and `useSdkTranslation`.
Provide a locale and translator; return undefined for absent keys to use complete English defaults.
Explicit component labels/renderers take precedence. Catalogs, plurals, formatting, persistence,
and the i18next instance belong to the consumer. See `docs/localization.md` for integration.
