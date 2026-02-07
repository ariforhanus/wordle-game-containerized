import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../hooks/useTheme";
import { isAuthenticated, clearToken } from "@wordle/api";
import { useState, useEffect, useRef } from "react";
import "./Header.css";

export default function Header() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const loggedIn = isAuthenticated();
  const menuRef = useRef<HTMLDivElement>(null);

  function switchLang() {
    const next = i18n.language === "en" ? "tr" : "en";
    i18n.changeLanguage(next);
    localStorage.setItem("wordle_lang", next);
  }

  function handleLogout() {
    setMenuOpen(false);
    clearToken();
    window.location.reload();
  }

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="app-header" ref={menuRef}>
        <div className="header-inner">
          <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
            <i className="fas fa-gamepad" /> Wordle
          </Link>

          {/* Desktop nav */}
          <nav className="nav-desktop">
            <Link to="/game" className={`nav-link ${isActive("/game") ? "active" : ""}`}>
              {t("nav.practice")}
            </Link>
            <Link to="/daily" className={`nav-link ${isActive("/daily") ? "active" : ""}`}>
              {t("nav.daily")}
            </Link>
            <Link to="/leaderboard" className={`nav-link ${isActive("/leaderboard") ? "active" : ""}`}>
              {t("nav.leaderboard")}
            </Link>
          </nav>

          {/* Desktop actions */}
          <div className="header-actions desktop-actions">
            <button className="icon-btn" onClick={switchLang} title={t("nav.switchLang")}>
              {i18n.language === "en" ? "TR" : "EN"}
            </button>
            <button className="icon-btn" onClick={toggleTheme} title={theme === "dark" ? t("theme.light") : t("theme.dark")}>
              <i className={`fas ${theme === "dark" ? "fa-sun" : "fa-moon"}`} />
            </button>
            {loggedIn ? (
              <>
                <Link to="/profile" className="icon-btn" title={t("nav.profile")}>
                  <i className="fas fa-user" />
                </Link>
                <button className="icon-btn" onClick={handleLogout} title={t("nav.logout")}>
                  <i className="fas fa-sign-out-alt" />
                </button>
              </>
            ) : (
              <Link to="/login" className="icon-btn" title={t("nav.login")}>
                <i className="fas fa-sign-in-alt" />
              </Link>
            )}
          </div>

          {/* Burger button (mobile only) */}
          <button
            className="burger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            <i className={`fas ${menuOpen ? "fa-times" : "fa-bars"}`} />
          </button>
        </div>

        {/* Mobile slide-down menu */}
        <div className={`mobile-menu ${menuOpen ? "open" : ""}`}>
          <nav className="mobile-nav-links">
            <Link to="/game" className={`mobile-link ${isActive("/game") ? "active" : ""}`}>
              <i className="fas fa-keyboard" />
              <span>{t("nav.practice")}</span>
            </Link>
            <Link to="/daily" className={`mobile-link ${isActive("/daily") ? "active" : ""}`}>
              <i className="fas fa-calendar-day" />
              <span>{t("nav.daily")}</span>
            </Link>
            <Link to="/leaderboard" className={`mobile-link ${isActive("/leaderboard") ? "active" : ""}`}>
              <i className="fas fa-trophy" />
              <span>{t("nav.leaderboard")}</span>
            </Link>
          </nav>

          <div className="mobile-divider" />

          <div className="mobile-settings">
            <button className="mobile-link" onClick={switchLang}>
              <i className="fas fa-globe" />
              <span>{i18n.language === "en" ? "Türkçe" : "English"}</span>
            </button>
            <button className="mobile-link" onClick={toggleTheme}>
              <i className={`fas ${theme === "dark" ? "fa-sun" : "fa-moon"}`} />
              <span>{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>
            </button>
          </div>

          <div className="mobile-divider" />

          <div className="mobile-auth">
            {loggedIn ? (
              <>
                <Link to="/profile" className={`mobile-link ${isActive("/profile") ? "active" : ""}`}>
                  <i className="fas fa-user-circle" />
                  <span>{t("nav.profile")}</span>
                </Link>
                <button className="mobile-link mobile-logout" onClick={handleLogout}>
                  <i className="fas fa-sign-out-alt" />
                  <span>{t("nav.logout")}</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="mobile-link">
                  <i className="fas fa-sign-in-alt" />
                  <span>{t("nav.login")}</span>
                </Link>
                <Link to="/register" className="mobile-link">
                  <i className="fas fa-user-plus" />
                  <span>{t("nav.register")}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Backdrop overlay */}
      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}
    </>
  );
}
