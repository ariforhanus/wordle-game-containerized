import { useEffect } from "react";
import { useTranslation } from "react-i18next";

const APP_NAME = "Wordle";

/**
 * Sets the document title. Pass a translated subtitle or nothing for just "Wordle".
 * Usage: usePageTitle(t("nav.daily")) → "Daily Challenge — Wordle"
 */
export function usePageTitle(subtitle?: string) {
  useEffect(() => {
    document.title = subtitle ? `${subtitle} — ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [subtitle]);
}

/**
 * Sets the document title using a translation key automatically.
 * Usage: usePageTitleKey("nav.daily") → "Daily Challenge — Wordle"
 */
export function usePageTitleKey(key: string) {
  const { t } = useTranslation();
  const subtitle = t(key) as string;
  usePageTitle(subtitle);
}
