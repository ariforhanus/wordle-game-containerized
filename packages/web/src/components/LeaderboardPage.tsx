import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { scoreApi, isAuthenticated, authApi, type ScoreResponse } from "@wordle/api";
import { usePageTitleKey } from "../hooks/usePageTitle";
import { formatScore } from "../utils/formatScore";
import "./LeaderboardPage.css";
import "./DailyPage.css";

function escapeHtml(str: string): string {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

type Period = "daily" | "weekly" | "monthly";

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  usePageTitleKey("seo.leaderboard");
  const lang = i18n.language;

  const [period, setPeriod] = useState<Period>("daily");
  const [scores, setScores] = useState<ScoreResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // Initial auth check — does user qualify to see the leaderboard?
  useEffect(() => {
    async function checkAccess() {
      if (isAuthenticated()) {
        try {
          const [status, me] = await Promise.all([
            scoreApi.getDailyStatus(lang),
            authApi.getMe(),
          ]);
          setCurrentUser(me.username);
          setHasPlayed(status.played);
        } catch {
          setHasPlayed(true);
        }
      } else {
        setHasPlayed(false);
      }
      setInitialCheckDone(true);
    }
    checkAccess();
  }, [lang]);

  // Load scores for the selected period
  const loadScores = useCallback(async () => {
    if (!hasPlayed) return;
    setLoading(true);
    setError(false);
    try {
      let data: ScoreResponse[];
      if (period === "daily") {
        data = await scoreApi.getDailyLeaderboard(lang);
      } else if (period === "weekly") {
        data = await scoreApi.getWeeklyLeaderboard(lang);
      } else {
        data = await scoreApi.getMonthlyLeaderboard(lang);
      }
      setScores(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period, lang, hasPlayed]);

  useEffect(() => {
    if (initialCheckDone) {
      loadScores();
    }
  }, [initialCheckDone, loadScores]);

  if (!initialCheckDone) {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!hasPlayed) {
    return (
      <div className="page-center">
        <div className="lb-locked">
          <div className="lb-locked-icon">
            <i className="fas fa-lock" />
          </div>
          <h2>{t("leaderboard.title")}</h2>
          <p className="lb-locked-text">{t("daily.playTodayFirst")}</p>
          <Link to="/daily" className="btn-primary">
            <i className="fas fa-calendar-day" /> {t("nav.daily")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-page">
      <h1 className="lb-title">{t("leaderboard.title")}</h1>

      {/* Period tabs */}
      <div className="lb-tabs">
        {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
          <button
            key={p}
            className={`lb-tab ${period === p ? "lb-tab-active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {t(`game.lb${p.charAt(0).toUpperCase() + p.slice(1)}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="page-center" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : error ? (
        <p className="lb-empty">{t("leaderboard.error")}</p>
      ) : scores.length === 0 ? (
        <p className="lb-empty">{t("leaderboard.empty")}</p>
      ) : (
        <div className="lb-table-wrap">
          <table className="lb-table" aria-label={t("leaderboard.title") as string}>
            <thead>
              <tr>
                <th>{t("leaderboard.rank")}</th>
                <th>{t("leaderboard.player")}</th>
                <th>{t("leaderboard.score")}</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s, i) => {
                const isMe = s.username === currentUser;
                return (
                  <tr key={s.id ?? i} className={isMe ? "lb-row-me" : ""}>
                    <td className="lb-rank">
                      {i < 3 ? (
                        <span className={`medal medal-${i + 1}`}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                        </span>
                      ) : (
                        i + 1
                      )}
                    </td>
                    <td className="lb-player">
                      {escapeHtml(s.username)}
                      {isMe && (
                        <span className="lb-you"> ({t("leaderboard.you")})</span>
                      )}
                      {(s.currentStreak ?? 0) >= 2 && (
                        <span className="streak-badge">
                          <i className="fas fa-fire" /> {s.currentStreak}
                        </span>
                      )}
                    </td>
                    <td className="lb-score">{formatScore(s.score)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
