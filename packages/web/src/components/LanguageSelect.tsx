import { useTranslation } from "react-i18next";
import { LANGUAGE_CODES, getLanguage } from "@wordle/engine";

export default function LanguageSelect({ onSelect }: { onSelect?: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <select
      className="language-select"
      aria-label={t("nav.language")}
      value={getLanguage(i18n.language).code}
      onChange={(event) => {
        const code = event.target.value;
        void i18n.changeLanguage(code);
        localStorage.setItem("wordle_lang", code);
        onSelect?.();
      }}
    >
      {LANGUAGE_CODES.map((code) => (
        <option key={code} value={code} lang={code}>
          {getLanguage(code).name}
        </option>
      ))}
    </select>
  );
}
