import { useState, useEffect, useRef, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  scoreApi,
  isAuthenticated,
  authApi,
  getAvatarDataUrl,
  type UserStats,
  type UserProfile,
} from "@wordle/api";
import { useToast } from "./Toast";
import GuessDistribution from "./GuessDistribution";
import { COUNTRIES } from "../data/countries";
import "./UserPage.css";

// ── Achievement definitions ──

interface AchievementDef {
  id: string;
  icon: string;
  isUnlocked: (stats: UserStats, lang: string) => boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_game", icon: "fa-flag-checkered", isUnlocked: (s) => s.totalGames >= 1 },
  { id: "ten_games", icon: "fa-dice", isUnlocked: (s) => s.totalGames >= 10 },
  { id: "thirty_games", icon: "fa-gamepad", isUnlocked: (s) => s.totalGames >= 30 },
  { id: "hundred_games", icon: "fa-infinity", isUnlocked: (s) => s.totalGames >= 100 },
  { id: "streak_2", icon: "fa-fire", isUnlocked: (s) => s.currentStreak >= 2 || s.bestStreak >= 2 },
  { id: "streak_5", icon: "fa-fire-flame-curved", isUnlocked: (s) => s.currentStreak >= 5 || s.bestStreak >= 5 },
  { id: "best_score_high", icon: "fa-trophy", isUnlocked: (s) => s.bestScore >= 5000 },
  { id: "fast_player", icon: "fa-bolt", isUnlocked: (s) => s.totalGames >= 5 && s.averageDurationSeconds <= 90 },
  { id: "multi_language", icon: "fa-language", isUnlocked: (s) => Object.keys(s.gamesPerLanguage || {}).length >= 2 },
  { id: "lang_games_10", icon: "fa-globe", isUnlocked: (s, lang) => (s.gamesPerLanguage?.[lang] ?? 0) >= 10 },
];

const STAT_GRADIENTS = [
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
];

// ── Main component ──

export default function UserPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;

  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [profile, userStats] = await Promise.all([
        authApi.getMe(),
        scoreApi.getMyStats(),
      ]);
      setUser(profile);
      setStats(userStats);
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }
    loadData();
  }, [navigate]);

  if (loading) {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!user || !stats) {
    return (
      <div className="page-center">
        <p>{t("profile.noStats")}</p>
      </div>
    );
  }

  // Build achievement data
  const achievementItems = ACHIEVEMENTS.map((a) => {
    const unlocked = a.isUnlocked(stats, lang);
    return { ...a, unlocked, title: t(`achievements.${a.id}.title`), desc: t(`achievements.${a.id}.desc`) };
  });
  // Sort: unlocked first
  achievementItems.sort((a, b) => (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1));
  const unlockedCount = achievementItems.filter((a) => a.unlocked).length;

  const langGames = stats.gamesPerLanguage?.[lang] ?? 0;

  const avatarUrl = getAvatarDataUrl(user);

  // 6 stat cards (achievements is first, clickable)
  const statCards = [
    { icon: "fa-medal", label: t("profile.achievements"), value: `${unlockedCount}/${achievementItems.length}`, clickable: true },
    { icon: "fa-trophy", label: t("profile.bestScore"), value: String(stats.bestScore) },
    { icon: "fa-chart-line", label: t("profile.avgScore"), value: String(Math.round(stats.averageScore)) },
    { icon: "fa-clock", label: t("profile.avgTime"), value: `${Math.round(stats.averageDurationSeconds)}${t("profile.seconds")}` },
    { icon: "fa-fire", label: t("profile.currentStreak"), value: String(stats.currentStreak ?? 0) },
    { icon: "fa-globe", label: t("profile.gamesInLang", { lang: lang.toUpperCase() }), value: String(langGames) },
  ];

  return (
    <div className="user-page">
      {/* Profile header */}
      <div className="profile-header">
        {avatarUrl ? (
          <img className="avatar" src={avatarUrl} alt={user.username} />
        ) : (
          <div className="avatar avatar-placeholder">
            <i className="fas fa-user" />
          </div>
        )}
        <h1>{user.username}</h1>
        {user.nationality && <span className="nationality">{user.nationality}</span>}
        <button className="edit-profile-btn" onClick={() => setShowEditProfile(true)}>
          <i className="fas fa-pencil" /> {t("profile.editProfile")}
        </button>
      </div>

      {/* Stats grid -- 6 gradient cards */}
      <div className="stats-grid">
        {statCards.map((card, i) => (
          <div
            key={i}
            className={`stat-card-gradient ${card.clickable ? "stat-card-clickable" : ""}`}
            style={{ background: STAT_GRADIENTS[i] }}
            onClick={card.clickable ? () => setShowAchievements(true) : undefined}
          >
            <div className="stat-icon">
              <i className={`fas ${card.icon}`} />
            </div>
            <div className="stat-content">
              <div className="stat-label-g">{card.label}</div>
              <div className="stat-value-g">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Guess distribution chart */}
      {stats && (
        <GuessDistribution distribution={stats.guessDistribution ?? {}} />
      )}

      {/* Achievements popup */}
      {showAchievements && (
        <div className="modal-overlay" onClick={() => setShowAchievements(false)}>
          <div className="modal-card achievements-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-medal" /> {t("profile.achievements")}</h2>
              <button className="modal-close" onClick={() => setShowAchievements(false)}>
                <i className="fas fa-xmark" />
              </button>
            </div>
            <p className="achievements-progress">
              {unlockedCount}/{achievementItems.length}
            </p>
            <ul className="achievements-list">
              {achievementItems.map((a) => (
                <li key={a.id} className={`achievement-item ${a.unlocked ? "achievement-unlocked" : "achievement-locked"}`}>
                  <div className="achievement-icon-wrap">
                    <i className={`fas ${a.icon}`} />
                  </div>
                  <div className="achievement-text">
                    <div className="achievement-title">{a.title}</div>
                    <div className="achievement-desc">{a.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Edit profile popup */}
      {showEditProfile && (
        <EditProfileModal
          user={user}
          onClose={() => setShowEditProfile(false)}
          onSaved={() => {
            setShowEditProfile(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ── Edit profile modal ──

function EditProfileModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toastCtx = useToast();
  const countries = COUNTRIES[i18n.language as "en" | "tr"] ?? COUNTRIES.en;

  const [form, setForm] = useState({
    username: user.username,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    nationality: user.nationality ?? "",
  });
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "success">("error");
  const [saving, setSaving] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    getAvatarDataUrl(user)
  );

  const MAX_AVATAR_BYTES = 512 * 1024;

  function update(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function handleFileChange() {
    const file = avatarRef.current?.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setMsg(t("auth.avatarTooLarge"));
      setMsgType("error");
      if (avatarRef.current) avatarRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setSaving(true);

    if (!form.username.trim() || form.username.trim().length < 3) {
      setMsg(t("auth.usernameRequired"));
      setMsgType("error");
      setSaving(false);
      return;
    }

    try {
      await authApi.updateProfile({
        username: form.username.trim(),
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        nationality: form.nationality || undefined,
      });

      // Upload avatar if selected
      const file = avatarRef.current?.files?.[0];
      if (file && file.size <= MAX_AVATAR_BYTES) {
        try {
          await authApi.uploadAvatar(file);
        } catch (err) {
          console.warn("Avatar upload failed:", err);
        }
      }

      toastCtx.success(t("profile.saveSuccess"));
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("USERNAME_TAKEN") || message.includes("409")) {
        setMsg(t("profile.usernameTaken"));
      } else {
        setMsg(t("profile.saveError"));
      }
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><i className="fas fa-pencil" /> {t("profile.editProfile")}</h2>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="edit-form">
          {/* Avatar */}
          <div className="edit-avatar-section">
            {avatarPreview ? (
              <img className="edit-avatar-img" src={avatarPreview} alt="Avatar" />
            ) : (
              <div className="edit-avatar-placeholder">
                <i className="fas fa-user" />
              </div>
            )}
            <label className="edit-avatar-btn">
              <i className="fas fa-camera" /> {t("profile.choosePhoto")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={avatarRef}
                onChange={handleFileChange}
                hidden
              />
            </label>
            <small className="edit-avatar-hint">
              {t("profile.avatarHint")}
            </small>
          </div>

          {/* Fields */}
          <label>{t("auth.username")} *</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
            required
            minLength={3}
          />

          <div className="edit-row">
            <div className="edit-col">
              <label>{t("auth.firstName")}</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
              />
            </div>
            <div className="edit-col">
              <label>{t("auth.lastName")}</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
              />
            </div>
          </div>

          <label>{t("auth.email")}</label>
          <input type="email" value={user.email ?? ""} readOnly className="input-readonly" />

          <label>{t("auth.country")}</label>
          <select value={form.nationality} onChange={(e) => update("nationality", e.target.value)}>
            <option value="">{t("auth.selectCountry")}</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {msg && <div className={`edit-msg ${msgType}`}>{msg}</div>}

          <div className="edit-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              {t("profile.cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <span className="btn-spinner" /> : t("profile.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
