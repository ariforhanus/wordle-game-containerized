import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";
import HowToPlayModal from "./HowToPlayModal";
import "./LandingPage.css";

export default function LandingPage() {
  const { t } = useTranslation();
  usePageTitle(t("app.tagline") as string);

  return (
    <section className="landing" aria-label={t("app.fullTitle") as string}>
      {/* Auto-shows on first ever visit */}
      <HowToPlayModal />

      <div className="landing-hero">
        <h1 className="landing-title">
          <i className="fas fa-gamepad" aria-hidden="true" /> {t("app.title")}
        </h1>
        <p className="landing-subtitle">
          {t("app.description")}
        </p>

        <nav className="landing-buttons" aria-label="Game modes">
          <Link to="/game" className="btn-primary btn-lg">
            <i className="fas fa-play" aria-hidden="true" /> {t("nav.practice")}
          </Link>
          <Link to="/daily" className="btn-secondary btn-lg">
            <i className="fas fa-calendar-day" aria-hidden="true" /> {t("nav.daily")}
          </Link>
          <Link to="/themes" className="btn-secondary btn-lg">
            <i className="fas fa-palette" aria-hidden="true" /> {t("nav.themes")}
          </Link>
        </nav>
      </div>
    </section>
  );
}
