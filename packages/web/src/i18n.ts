import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { translationResources } from "@wordle/i18n";
import { DEFAULT_LANG } from "@wordle/engine";

const savedLang = localStorage.getItem("wordle_lang") || DEFAULT_LANG;

// Build i18next resources dynamically from the translation map
const resources: Record<string, { translation: Record<string, unknown> }> = {};
for (const [code, translations] of Object.entries(translationResources)) {
  resources[code] = { translation: translations };
}

i18n.use(initReactI18next).init({
  resources,
  lng: savedLang,
  fallbackLng: DEFAULT_LANG,
  interpolation: {
    escapeValue: false,
  },
});

// Keep <html lang=""> in sync with current language (SEO + accessibility)
function updateHtmlLang(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = "ltr"; // RTL can be added here for Arabic etc.
}
updateHtmlLang(savedLang);
i18n.on("languageChanged", updateHtmlLang);

export default i18n;
