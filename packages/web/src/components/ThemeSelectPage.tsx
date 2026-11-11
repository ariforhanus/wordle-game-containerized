import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { THEMES } from "@wordle/engine";
import { usePageTitleKey } from "../hooks/usePageTitle";
import "./ThemeSelectPage.css";

export default function ThemeSelectPage() {
  const { t } = useTranslation();
  usePageTitleKey("seo.themes");

  return (
    <div className="themes-page">
      <h1 className="themes-title">
        <i aria-hidden="true" className="fas fa-palette" /> {t("themes.title")}
      </h1>
      <p className="themes-subtitle">{t("themes.pickTheme")}</p>

      <div className="themes-grid">
        {THEMES.map((theme) => (
          <Link
            key={theme.id}
            to={`/themes/${theme.id}`}
            className="theme-card"
            style={{
              borderColor: theme.color,
            }}
          >
            <div className="theme-icon">
              <i aria-hidden="true" className={`fas ${theme.icon}`} />
            </div>
            <div className="theme-name">{theme.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
