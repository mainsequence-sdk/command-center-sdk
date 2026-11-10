import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatSdkEnglishMessage, normalizeCommandCenterLocale, type SdkMessageKey, type SdkMessageValues, type TranslateSdkMessage } from "./index.js";

export interface CommandCenterLocalizationProviderProps {
  children: ReactNode;
  locale?: string;
  translate?: TranslateSdkMessage;
}

const LocalizationContext = createContext<{ locale: string; translate?: TranslateSdkMessage }>({ locale: "en" });

/** Supply the app's translator, e.g. i18next. No global instance, catalogs, or persistence are created. */
export function CommandCenterLocalizationProvider({ children, locale = "en", translate }: CommandCenterLocalizationProviderProps) {
  const value = useMemo(() => ({ locale: normalizeCommandCenterLocale(locale) ?? "en", translate }), [locale, translate]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useSdkTranslation() {
  const { locale, translate } = useContext(LocalizationContext);
  return useMemo(() => ({ locale, t: (key: SdkMessageKey, values: SdkMessageValues = {}): string => {
    const translated = translate?.(key, values);
    return typeof translated === "string" && translated.trim() && translated !== key
      ? translated
      : formatSdkEnglishMessage(key, values);
  } }), [locale, translate]);
}
