import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@wordle/api";
import type { AdminStats } from "@wordle/api";

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="admin-loading"><div className="spinner" /></div>;
  }

  const cards = [
    { icon: "fa-users", label: t("admin.totalUsers"), value: stats?.totalUsers ?? 0 },
    { icon: "fa-gamepad", label: t("admin.totalGames"), value: stats?.totalGames ?? 0 },
    { icon: "fa-calendar-day", label: t("admin.todayPlayers"), value: stats?.todayPlayers ?? 0 },
    { icon: "fa-bolt", label: t("admin.activeUsers"), value: stats?.activeUsers ?? 0 },
  ];

  return (
    <div>
      <h1 className="admin-page-title">{t("admin.dashboard")}</h1>
      <div className="admin-stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="admin-stat-card">
            <div className="admin-stat-icon">
              <i className={`fas ${c.icon}`} />
            </div>
            <div className="admin-stat-value">{c.value}</div>
            <div className="admin-stat-label">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
