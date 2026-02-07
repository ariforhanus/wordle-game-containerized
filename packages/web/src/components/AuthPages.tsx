import { useState, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { authApi } from "@wordle/api";
import { COUNTRIES } from "../data/countries";
import "./AuthPages.css";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, loading } = useAuth();
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
      navigate("/game");
    } else {
      setError(t("auth.loginFail"));
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h1>{t("auth.loginTitle")}</h1>
        {error && <div className="auth-error">{error}</div>}

        <label>{t("auth.username")}</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />

        <label>{t("auth.password")}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "..." : t("auth.loginBtn")}
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
  const navigate = useNavigate();
  const { register, loading } = useAuth();
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
  const MAX_AVATAR_BYTES = 512 * 1024; // 512 KB

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
      navigate("/game");
    } else {
      setError(t("auth.registerFail"));
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h1>{t("auth.registerTitle")}</h1>
        {error && <div className="auth-error">{error}</div>}

        <label>{t("auth.username")} *</label>
        <input
          type="text"
          value={form.username}
          onChange={(e) => update("username", e.target.value)}
          required
          autoFocus
        />

        <label>{t("auth.email")} *</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
        />

        <label>{t("auth.password")} *</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          required
          minLength={6}
        />

        <label>{t("auth.confirmPassword")} *</label>
        <input
          type="password"
          value={form.confirmPassword}
          onChange={(e) => update("confirmPassword", e.target.value)}
          required
        />

        <label>{t("auth.firstName")}</label>
        <input
          type="text"
          value={form.firstName}
          onChange={(e) => update("firstName", e.target.value)}
        />

        <label>{t("auth.lastName")}</label>
        <input
          type="text"
          value={form.lastName}
          onChange={(e) => update("lastName", e.target.value)}
        />

        <label>{t("auth.country")} *</label>
        <select
          value={form.nationality}
          onChange={(e) => update("nationality", e.target.value)}
          required
        >
          <option value="">{t("auth.selectCountry")}</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label>{t("auth.profilePhoto")}</label>
        <input
          type="file"
          accept="image/*"
          ref={avatarRef}
        />

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "..." : t("auth.registerBtn")}
        </button>

        <p className="auth-switch">
          <Link to="/login">{t("auth.hasAccount")}</Link>
        </p>
      </form>
    </div>
  );
}
