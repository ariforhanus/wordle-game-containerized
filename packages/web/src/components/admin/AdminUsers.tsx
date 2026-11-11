import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@wordle/api";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import type { AdminUser } from "@wordle/api";

export default function AdminUsers() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const confirmRef = useDialogFocus(Boolean(confirmDelete), () => setConfirmDelete(null));

  const fetchUsers = useCallback((q?: string) => {
    setLoading(true);
    adminApi.getUsers(q || undefined, page)
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchUsers]);

  async function handleRoleChange(user: AdminUser) {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    try {
      await adminApi.changeRole(user.id, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      console.error("Role change failed:", err);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await adminApi.deleteUser(confirmDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmDelete.id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setConfirmDelete(null);
  }

  function formatDate(iso?: string | null): string {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return iso;
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">{t("admin.users")}</h1>

      <div className="admin-search-bar">
        <i aria-hidden="true" className="fas fa-search" style={{ color: "var(--text-muted, #888)" }} />
        <input
          type="text"
          className="admin-search-input"
          aria-label={t("admin.searchUsers")} placeholder={t("admin.searchUsers")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      </div>

      {loading ? (
        <div className="admin-loading"><div className="spinner" role="status" aria-label={t("a11y.loading")} /></div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.username")}</th>
                <th>{t("admin.email")}</th>
                <th>{t("admin.role")}</th>
                <th>{t("admin.joined")}</th>
                <th>{t("admin.games")}</th>
                <th>{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.username}</strong>
                    {u.firstName || u.lastName ? (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #888)" }}>
                        {[u.firstName, u.lastName].filter(Boolean).join(" ")}
                      </div>
                    ) : null}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-badge ${u.role.toLowerCase()}`}>{u.role}</span>
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{u.totalGames}</td>
                  <td>
                    <div className="admin-actions">
                      <button
                        className="admin-btn role-btn"
                        onClick={() => handleRoleChange(u)}
                      >
                        <i aria-hidden="true" className={`fas ${u.role === "ADMIN" ? "fa-user" : "fa-shield-alt"}`} />
                        {u.role === "ADMIN" ? t("admin.makeUser") : t("admin.makeAdmin")}
                      </button>
                      <button
                        className="admin-btn delete-btn"
                        onClick={() => setConfirmDelete(u)}
                      >
                        <i aria-hidden="true" className="fas fa-trash" />
                        {t("admin.deleteUser")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: 32 }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-actions">
        <button disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)} aria-label={t("account.previous")}>←</button>
        <span>{page + 1}</span>
        <button disabled={users.length < 50 || loading} onClick={() => setPage(p => p + 1)} aria-label={t("account.next")}>→</button>
      </div>
      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="admin-confirm-overlay" onClick={() => setConfirmDelete(null)}>
          <div ref={confirmRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="admin-delete-title" className="admin-confirm-box" onClick={(e) => e.stopPropagation()}>
            <p id="admin-delete-title">{t("admin.confirmDelete")}</p>
            <p style={{ fontWeight: 700, fontSize: "1.1rem" }}>
              {confirmDelete.username}
            </p>
            <div className="admin-confirm-actions">
              <button className="admin-btn cancel-btn" onClick={() => setConfirmDelete(null)}>
                {t("profile.cancel")}
              </button>
              <button className="admin-btn delete-btn" onClick={handleDelete}>
                <i aria-hidden="true" className="fas fa-trash" />
                {t("admin.deleteUser")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
