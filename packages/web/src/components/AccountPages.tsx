import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  authApi,
  clearToken,
  isAuthenticated,
  ApiError,
  type UserProfile,
} from "@wordle/api";
import "./AuthPages.css";

function useAccountError() {
  const { t } = useTranslation();
  return (error: unknown) =>
    error instanceof ApiError && error.status === 503
      ? t("account.mailUnavailable")
      : error instanceof ApiError && error.status === 429
        ? t("account.rateLimited")
        : t("account.failed");
}
export function RecoveryPage({
  mode,
}: {
  mode: "forgot" | "reset" | "verify";
}) {
  const { t } = useTranslation();
  const errorText = useAccountError();
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  // Remove link secrets from browser history without consuming them on GET or page load.
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "reset" && (password.length < 12 || password !== confirm)) {
      setError(t("account.passwordMismatch"));
      document.getElementById(password.length < 12 ? "new-password" : "confirm-password")?.focus();
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") await authApi.forgotPassword(email);
      else if (mode === "reset") {
        await authApi.resetPassword(token, password);
        clearToken();
      } else await authApi.verifyEmail(token);
      setToken("");
      setDone(true);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>{t(`account.${mode}Title`)}</h1>
        {done ? (
          <p role="status">
            {t(mode === "forgot" ? "account.emailSent" : "account.completed")}
          </p>
        ) : (
          <>
            {mode === "forgot" && (
              <>
                <label htmlFor="recovery-email">{t("auth.email")}</label>
                <input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={120}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </>
            )}
            {mode === "reset" && (
              <>
                <label htmlFor="new-password">{t("account.newPassword")}</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <label htmlFor="confirm-password">
                  {t("auth.confirmPassword")}
                </label>
                <input
                  id="confirm-password"
                  aria-invalid={error === t("account.passwordMismatch") || undefined}
                  aria-describedby={error ? "recovery-error" : undefined}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                />
              </>
            )}
            {mode !== "forgot" && !token && (
              <p role="alert">{t("account.invalidLink")}</p>
            )}
            <button
              className="btn-primary"
              disabled={busy || (mode !== "forgot" && !token)}
            >
              {t("account.continue")}
            </button>
          </>
        )}
        {error && <p id="recovery-error" role="alert">{error}</p>}
        <Link to="/login">{t("auth.loginTitle")}</Link>
      </form>
    </div>
  );
}
export function AccountSecurityPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorText = useAccountError();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    authApi
      .getMe()
      .then(setProfile)
      .catch(() => navigate("/login"));
  }, [navigate]);
  async function action(operation: () => Promise<void>, logout = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      if (logout) {
        clearToken();
        window.location.assign("/login");
      } else setMessage(t("account.emailSent"));
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  function change(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("account.passwordMismatch"));
      document.getElementById("security-confirm")?.focus();
      return;
    }
    void action(() => authApi.changePassword(current, password), true);
  }
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{t("account.title")}</h1>
        {profile && (
          <>
            <p>
              {t(
                profile.emailVerified
                  ? "account.verified"
                  : "account.unverified",
              )}
            </p>
            {!profile.emailVerified && (
              <button
                disabled={busy}
                onClick={() => void action(authApi.requestVerification)}
              >
                {t("account.sendVerification")}
              </button>
            )}
          </>
        )}
        <form onSubmit={change} className="auth-card-section">
          <h2>{t("account.changePassword")}</h2>
          <label htmlFor="current-password">
            {t("account.currentPassword")}
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <label htmlFor="security-password">{t("account.newPassword")}</label>
          <input
            id="security-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label htmlFor="security-confirm">{t("auth.confirmPassword")}</label>
          <input
            id="security-confirm"
            aria-invalid={error === t("account.passwordMismatch") || undefined}
            aria-describedby={error ? "security-error" : undefined}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(""); }}
          />
          <button className="btn-primary" disabled={busy}>
            {t("account.changePassword")}
          </button>
        </form>
        <button
          disabled={busy}
          onClick={() => void action(authApi.logoutAll, true)}
        >
          {t("account.logoutAll")}
        </button>
        <details>
          <summary>{t("account.deleteTitle")}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (agree)
                void action(() => authApi.deleteAccount(deletePassword), true);
            }}
          >
            <p>{t("account.deleteWarning")}</p>
            <label htmlFor="delete-password">
              {t("account.currentPassword")}
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                required
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              {t("account.deleteConfirm")}
            </label>
            <button disabled={busy || !agree}>
              {t("account.deleteTitle")}
            </button>
          </form>
        </details>
        {message && <p role="status">{message}</p>}
        {error && <p id="security-error" role="alert">{error}</p>}
        <Link to="/profile">{t("nav.profile")}</Link>
      </div>
    </div>
  );
}
