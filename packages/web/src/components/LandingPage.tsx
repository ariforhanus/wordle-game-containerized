import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./LandingPage.css";

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="landing">
      <div className="landing-hero">
        <h1 className="landing-title">
          <i className="fas fa-gamepad" /> Wordle
        </h1>
        <p className="landing-subtitle">
          {t("game.enterGuess")}
        </p>

        <div className="landing-buttons">
          <Link to="/game" className="btn-primary btn-lg">
            <i className="fas fa-play" /> {t("nav.practice")}
          </Link>
          <Link to="/daily" className="btn-secondary btn-lg">
            <i className="fas fa-calendar-day" /> {t("nav.daily")}
          </Link>
          <Link to="/themes" className="btn-secondary btn-lg">
            <i className="fas fa-palette" /> {t("nav.themes")}
          </Link>
        </div>
      </div>
    </div>
  );
}
