import { useState, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { authApi } from "@wordle/api";
import { useToast } from "./Toast";
import { usePageTitleKey } from "../hooks/usePageTitle";
import { COUNTRIES } from "../data/countries";
import { MAX_AVATAR_BYTES } from "../constants";
import "./AuthPages.css";

export function LoginPage() {
  const { t } = useTranslation();
  usePageTitleKey("seo.login");
  const navigate = useNavigate();
  const { login, loading } = useAuth();
  const toastCtx = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError(t("auth.usernameRequired"));
      return;
    }
    if (!password) {
      setError(t("auth.passwordRequired"));
      return;
    }

    const res = await login(username.trim(), password);
    if (res.success) {
      toastCtx.success(t("auth.loginSuccess"));
      navigate("/");
    } else {
      const key = res.errorCode ? `api.${res.errorCode}` : "";
      const translated = key ? t(key, { defaultValue: "" }) : "";
      setError(translated || t("auth.loginFail"));
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate aria-label={t("auth.loginTitle") as string}>
        <h1>{t("auth.loginTitle")}</h1>
        {error && <div className="auth-error" role="alert">{error}</div>}

        <label htmlFor="login-username">{t("auth.username")}</label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <label htmlFor="login-password">{t("auth.password")}</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <span className="btn-spinner" /> : t("auth.loginBtn")}
        </button>

        <p className="auth-switch">
          <Link to="/register">{t("auth.noAccount")}</Link>
        </p>
      </form>
    </div>
  );
}

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  usePageTitleKey("seo.register");
  const navigate = useNavigate();
  const { register, loading } = useAuth();
  const toastCtx = useToast();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    nationality: "",
  });
  const [error, setError] = useState("");
  const avatarRef = useRef<HTMLInputElement>(null);

  const countries = COUNTRIES[i18n.language as "en" | "tr"] ?? COUNTRIES.en;

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.username.trim()) {
      setError(t("auth.usernameRequired"));
      return;
    }
    if (!form.email.trim()) {
      setError(t("auth.emailRequired"));
      return;
    }
    if (form.password.length < 6) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (!form.nationality) {
      setError(t("auth.countryRequired"));
      return;
    }

    // Validate avatar size before submitting
    const avatarFile = avatarRef.current?.files?.[0];
    if (avatarFile && avatarFile.size > MAX_AVATAR_BYTES) {
      setError(t("auth.avatarTooLarge"));
      return;
    }

    const res = await register({
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      firstName: form.firstName.trim() || undefined,
      lastName: form.lastName.trim() || undefined,
      nationality: form.nationality || undefined,
    });

    if (res.success) {
      // Upload avatar after successful registration (separate endpoint)
      if (avatarFile) {
        try {
          await authApi.uploadAvatar(avatarFile);
        } catch (err) {
          console.warn("Avatar upload failed:", err);
        }
      }
      toastCtx.success(t("auth.registerSuccess"));
      navigate("/");
    } else {
      const key = res.errorCode ? `api.${res.errorCode}` : "";
      const translated = key ? t(key, { defaultValue: "" }) : "";
      setError(translated || t("auth.registerFail"));
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate aria-label={t("auth.registerTitle") as string}>
        <h1>{t("auth.registerTitle")}</h1>
        {error && <div className="auth-error" role="alert">{error}</div>}

        <label htmlFor="reg-username">{t("auth.username")} *</label>
        <input
          id="reg-username"
          type="text"
          value={form.username}
          onChange={(e) => update("username", e.target.value)}
          required
          autoComplete="username"
          autoFocus
        />

        <label htmlFor="reg-email">{t("auth.email")} *</label>
        <input
          id="reg-email"
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
          autoComplete="email"
        />

        <label htmlFor="reg-password">{t("auth.password")} *</label>
        <input
          id="reg-password"
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />

        <label htmlFor="reg-confirm">{t("auth.confirmPassword")} *</label>
        <input
          id="reg-confirm"
          type="password"
          value={form.confirmPassword}
          onChange={(e) => update("confirmPassword", e.target.value)}
          required
          autoComplete="new-password"
        />

        <label htmlFor="reg-firstname">{t("auth.firstName")}</label>
        <input
          id="reg-firstname"
          type="text"
          value={form.firstName}
          onChange={(e) => update("firstName", e.target.value)}
          autoComplete="given-name"
        />

        <label htmlFor="reg-lastname">{t("auth.lastName")}</label>
        <input
          id="reg-lastname"
          type="text"
          value={form.lastName}
          onChange={(e) => update("lastName", e.target.value)}
          autoComplete="family-name"
        />

        <label htmlFor="reg-country">{t("auth.country")} *</label>
        <select
          id="reg-country"
          value={form.nationality}
          onChange={(e) => update("nationality", e.target.value)}
          required
          autoComplete="country-name"
        >
          <option value="">{t("auth.selectCountry")}</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label htmlFor="reg-avatar">{t("auth.profilePhoto")}</label>
        <input
          id="reg-avatar"
          type="file"
          accept="image/*"
          ref={avatarRef}
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <span className="btn-spinner" /> : t("auth.registerBtn")}
        </button>

        <p className="auth-switch">
          <Link to="/login">{t("auth.hasAccount")}</Link>
        </p>
      </form>
    </div>
  );
}
