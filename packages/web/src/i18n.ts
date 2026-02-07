import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en, tr } from "@wordle/i18n";

const savedLang = localStorage.getItem("wordle_lang") || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    tr: { translation: tr },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
