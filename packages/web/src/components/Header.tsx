import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../hooks/useTheme";
import { isAuthenticated, clearToken, authApi } from "@wordle/api";
import type { UserProfile } from "@wordle/api";
import { LANGUAGES, LANGUAGE_CODES, getLanguage } from "@wordle/engine";
import { useState, useEffect, useRef } from "react";
import "./Header.css";

export default function Header() {
  const { t, i18n } = useTranslation();
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

  const currentLang = getLanguage(i18n.language);
  const isMultiLang = LANGUAGE_CODES.length > 2;

  /** Cycle to the next language (for 2-language toggle) */
  function cycleLang() {
    const idx = LANGUAGE_CODES.indexOf(i18n.language);
    const next = LANGUAGE_CODES[(idx + 1) % LANGUAGE_CODES.length];
    i18n.changeLanguage(next);
    localStorage.setItem("wordle_lang", next);
  }

  /** Switch to a specific language */
  function switchToLang(code: string) {
    i18n.changeLanguage(code);
    localStorage.setItem("wordle_lang", code);
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

  // Next language label for 2-lang toggle (desktop)
  const nextLang = LANGUAGE_CODES.find((c) => c !== i18n.language) ?? LANGUAGE_CODES[0];
  const nextLangConfig = getLanguage(nextLang);

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
            <Link to="/themes" className={`nav-link ${location.pathname.startsWith("/themes") ? "active" : ""}`}>
              {t("nav.themes")}
            </Link>
            {isAdmin && (
              <Link to="/admin" className={`nav-link ${location.pathname.startsWith("/admin") ? "active" : ""}`}>
                <i className="fas fa-shield-alt" style={{ marginRight: 4 }} />
                {t("admin.nav")}
              </Link>
            )}
          </nav>

          {/* Desktop actions */}
          <div className="header-actions desktop-actions">
            {/* Language: toggle for 2 langs, dropdown for 3+ */}
            {isMultiLang ? (
              <div className="lang-dropdown">
                <button className="icon-btn lang-trigger">
                  {currentLang.flag} <i className="fas fa-caret-down" style={{ fontSize: "0.7rem", marginLeft: 2 }} />
                </button>
                <div className="lang-dropdown-menu">
                  {LANGUAGE_CODES.map((code) => {
                    const cfg = LANGUAGES[code];
                    return (
                      <button
                        key={code}
                        className={`lang-option ${code === i18n.language ? "active" : ""}`}
                        onClick={() => switchToLang(code)}
                      >
                        {cfg.flag} {cfg.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <button className="icon-btn" onClick={cycleLang} title={nextLangConfig.name}>
                {nextLangConfig.flag} {nextLang.toUpperCase()}
              </button>
            )}

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
            <Link to="/themes" className={`mobile-link ${location.pathname.startsWith("/themes") ? "active" : ""}`}>
              <i className="fas fa-palette" />
              <span>{t("nav.themes")}</span>
            </Link>
          </nav>

          <div className="mobile-divider" />

          {/* Language selection in mobile menu */}
          <div className="mobile-settings">
            {LANGUAGE_CODES.length <= 3 ? (
              // Show each language as a row
              LANGUAGE_CODES.filter((c) => c !== i18n.language).map((code) => {
                const cfg = getLanguage(code);
                return (
                  <button key={code} className="mobile-link" onClick={() => { switchToLang(code); setMenuOpen(false); }}>
                    <span className="mobile-link-flag">{cfg.flag}</span>
                    <span>{cfg.name}</span>
                  </button>
                );
              })
            ) : (
              // Scrollable list for many languages
              LANGUAGE_CODES.filter((c) => c !== i18n.language).map((code) => {
                const cfg = getLanguage(code);
                return (
                  <button key={code} className="mobile-link" onClick={() => { switchToLang(code); setMenuOpen(false); }}>
                    <span className="mobile-link-flag">{cfg.flag}</span>
                    <span>{cfg.name}</span>
                  </button>
                );
              })
            )}
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
