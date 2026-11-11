import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi, isAuthenticated } from "@wordle/api";
import { usePageTitleKey } from "../../hooks/usePageTitle";
import type { UserProfile } from "@wordle/api";
import "./Admin.css";

export default function AdminLayout() {
  const { t } = useTranslation();
  usePageTitleKey("seo.admin");
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login", { replace: true });
      return;
    }
    authApi.getMe().then((p) => {
      if (p.role !== "ADMIN") {
        navigate("/", { replace: true });
      } else {
        setProfile(p);
      }
      setLoading(false);
    }).catch(() => {
      navigate("/login", { replace: true });
    });
  }, [navigate]);

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner" role="status" aria-label={t("a11y.loading")} />
      </div>
    );
  }

  if (!profile || profile.role !== "ADMIN") {
    return null;
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <i aria-hidden="true" className="fas fa-shield-alt" />
          <span>{t("admin.title")}</span>
        </div>

        <nav className="admin-nav" aria-label={t("admin.title")}>
          <Link
            to="/admin"
            aria-label={t("admin.dashboard")}
            className={`admin-nav-link ${isActive("/admin") ? "active" : ""}`}
          >
            <i aria-hidden="true" className="fas fa-chart-pie" />
            <span>{t("admin.dashboard")}</span>
          </Link>
          <Link
            to="/admin/users"
            aria-label={t("admin.users")}
            className={`admin-nav-link ${isActive("/admin/users") ? "active" : ""}`}
          >
            <i aria-hidden="true" className="fas fa-users" />
            <span>{t("admin.users")}</span>
          </Link>
          <Link
            to="/admin/words"
            aria-label={t("admin.words")}
            className={`admin-nav-link ${isActive("/admin/words") ? "active" : ""}`}
          >
            <i aria-hidden="true" className="fas fa-book" />
            <span>{t("admin.words")}</span>
          </Link>
          <Link className="admin-nav-link" to="/admin/audit" aria-label={t("account.auditTitle")}>
            <i aria-hidden="true" className="fas fa-clipboard-list" />
            <span>{t("account.auditTitle")}</span>
          </Link>
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/" aria-label={t("admin.back")} className="admin-nav-link admin-back-link">
            <i aria-hidden="true" className="fas fa-arrow-left" />
            <span>{t("admin.back")}</span>
          </Link>
        </div>
      </aside>

      <section className="admin-content" tabIndex={0} aria-label={t("admin.title")}>
        <Outlet />
      </section>
    </div>
  );
}
