import { useEffect, useState } from "react";
import { adminApi } from "@wordle/api";
import type { AuditEntry } from "@wordle/api";
import { useTranslation } from "react-i18next";
export default function AdminAudit() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    adminApi
      .getAudit(page)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [page]);
  return (
    <section>
      <h1>{t("account.auditTitle")}</h1>
      {error && <p role="alert">{t("account.failed")}</p>}
      <table className="lb-table">
        <caption>{t("account.auditTitle")}</caption>
        <thead>
          <tr>
            <th>{t("account.auditWhen")}</th>
            <th>{t("account.auditAction")}</th>
            <th>{t("account.auditActor")}</th>
            <th>{t("account.auditTarget")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.occurred_at).toLocaleString()}</td>
              <td>{row.action}</td>
              <td>{row.actor_id ?? "—"}</td>
              <td>{row.target_id ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        disabled={page === 0}
        onClick={() => setPage((p) => p - 1)}
        aria-label={t("account.previous")}
      >
        ←
      </button>
      <span>{page + 1}</span>
      <button
        disabled={rows.length < 50}
        onClick={() => setPage((p) => p + 1)}
        aria-label={t("account.next")}
      >
        →
      </button>
    </section>
  );
}
