import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../hooks/useTheme";
import { isAuthenticated, clearToken, authApi } from "@wordle/api";
import type { UserProfile } from "@wordle/api";
import LanguageSelect from "./LanguageSelect";
import { useState, useEffect, useRef } from "react";
import "./Header.css";

export default function Header() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const loggedIn = isAuthenticated();
  const menuRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Fetch user profile once to check role
  useEffect(() => {
    if (loggedIn) {
      authApi.getMe().then(setProfile).catch(() => setProfile(null));
    } else {
      setProfile(null);
    }
  }, [loggedIn]);

  const isAdmin = profile?.role === "ADMIN";

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
            <i className="fas fa-gamepad" /> {t("app.title")}
          </Link>

          {/* Desktop nav */}
          <nav className="nav-desktop" aria-label="Main navigation">
            <Link to="/game" className={`nav-link ${isActive("/game") ? "active" : ""}`} aria-current={isActive("/game") ? "page" : undefined}>
              {t("nav.practice")}
            </Link>
            <Link to="/daily" className={`nav-link ${isActive("/daily") ? "active" : ""}`} aria-current={isActive("/daily") ? "page" : undefined}>
              {t("nav.daily")}
            </Link>
            <Link to="/leaderboard" className={`nav-link ${isActive("/leaderboard") ? "active" : ""}`} aria-current={isActive("/leaderboard") ? "page" : undefined}>
              {t("nav.leaderboard")}
            </Link>
            <Link to="/themes" className={`nav-link ${location.pathname.startsWith("/themes") ? "active" : ""}`} aria-current={location.pathname.startsWith("/themes") ? "page" : undefined}>
              {t("nav.themes")}
            </Link>
            {isAdmin && (
              <Link to="/admin" className={`nav-link ${location.pathname.startsWith("/admin") ? "active" : ""}`} aria-current={location.pathname.startsWith("/admin") ? "page" : undefined}>
                <i className="fas fa-shield-alt" style={{ marginRight: 4 }} aria-hidden="true" />
                {t("admin.nav")}
              </Link>
            )}
          </nav>

          {/* Desktop actions */}
          <div className="header-actions desktop-actions">
            <LanguageSelect />

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
            aria-label={t("nav.menu", "Menu")}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={menuOpen ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Mobile slide-down menu */}
        <div id="mobile-nav-menu" inert={!menuOpen} className={`mobile-menu ${menuOpen ? "open" : ""}`} role="navigation" aria-label="Mobile navigation">
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
            <Link to="/themes" className={`mobile-link ${location.pathname.startsWith("/themes") ? "active" : ""}`}>
              <i className="fas fa-palette" />
              <span>{t("nav.themes")}</span>
            </Link>
          </nav>

          <div className="mobile-divider" />

          {/* Language selection in mobile menu */}
          <div className="mobile-settings">
            <LanguageSelect onSelect={() => setMenuOpen(false)} />
            <button className="mobile-link" onClick={toggleTheme}>
              <i className={`fas ${theme === "dark" ? "fa-sun" : "fa-moon"}`} />
              <span>{theme === "dark" ? t("theme.light") : t("theme.dark")}</span>
            </button>
          </div>

          {isAdmin && (
            <>
              <div className="mobile-divider" />
              <div className="mobile-settings">
                <Link to="/admin" className={`mobile-link ${location.pathname.startsWith("/admin") ? "active" : ""}`}>
                  <i className="fas fa-shield-alt" />
                  <span>{t("admin.nav")}</span>
                </Link>
              </div>
            </>
          )}

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
