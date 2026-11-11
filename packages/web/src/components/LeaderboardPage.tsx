import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { scoreApi, isAuthenticated, authApi } from "@wordle/api";
import { usePageTitleKey } from "../hooks/usePageTitle";
import { formatScore } from "../utils/formatScore";
import "./LeaderboardPage.css";
import "./DailyPage.css";

type Period = "daily" | "weekly" | "monthly";
type Entry = {
  id: number;
  username: string;
  score: number;
  currentStreak?: number;
  wins?: number;
};

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  usePageTitleKey("seo.leaderboard");
  const lang = i18n.language;

  const [period, setPeriod] = useState<Period>("daily");
  const [scores, setScores] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const [retryVersion, setRetryVersion] = useState(0);
  const checkedLanguage = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    setScores([]);
    if (checkedLanguage.current !== lang) {
      setHasPlayed(false);
      setInitialCheckDone(false);
    }
    setLoading(true);
    setError(false);
    async function load() {
      let eligibilityChecked = false;
      try {
        if (!isAuthenticated()) return;
        const [status, me] = await Promise.all([
          scoreApi.getDailyStatus(lang),
          authApi.getMe(),
        ]);
        if (!active) return;
        eligibilityChecked = true;
        checkedLanguage.current = lang;
        setInitialCheckDone(true);
        setCurrentUser(me.username);
        setHasPlayed(status.played);
        if (!status.played) return;
        let rows: Entry[];
        if (period === "daily") rows = await scoreApi.getDailyLeaderboard(lang);
        else {
          const totals = await (period === "weekly"
            ? scoreApi.getWeeklyLeaderboard(lang)
            : scoreApi.getMonthlyLeaderboard(lang));
          rows = totals.map((row) => ({
            id: row.userId,
            username: row.username,
            score: row.totalScore,
            wins: row.wins,
            currentStreak: row.currentStreak,
          }));
        }
        if (active) setScores(rows);
      } catch {
        if (active) {
          setError(true);
          if (!eligibilityChecked) setHasPlayed(false);
        }
      } finally {
        if (active) {
          setLoading(false);
          setInitialCheckDone(true);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [lang, period, retryVersion]);

  const retry = () => setRetryVersion((version) => version + 1);
  if (error && !hasPlayed)
    return (
      <div className="page-center">
        <div role="alert">
          <p>{t("leaderboard.error")}</p>
          <button onClick={retry}>{t("daily.retryStatus")}</button>
        </div>
      </div>
    );

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
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
          >
            {t(`game.lb${p.charAt(0).toUpperCase() + p.slice(1)}`)}
          </button>
        ))}
      </div>

      <p>
        {t(
          period === "daily"
            ? "leaderboard.dailyExplanation"
            : period === "weekly"
              ? "leaderboard.weeklyExplanation"
              : "leaderboard.monthlyExplanation",
        )}
      </p>
      {period !== "daily" && <p>{t("leaderboard.totalTieRule")}</p>}
      {loading ? (
        <div className="page-center" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : error ? (
        <div role="alert">
          <p className="lb-empty">{t("leaderboard.error")}</p>
          <button onClick={retry}>{t("daily.retryStatus")}</button>
        </div>
      ) : scores.length === 0 ? (
        <p className="lb-empty">{t("leaderboard.empty")}</p>
      ) : (
        <div className="lb-table-wrap">
          <table
            className="lb-table"
            aria-label={t("leaderboard.title") as string}
          >
            <thead>
              <tr>
                <th>{t("leaderboard.rank")}</th>
                <th>{t("leaderboard.player")}</th>
                <th>
                  {t(
                    period === "daily"
                      ? "leaderboard.dailyScore"
                      : "leaderboard.totalPoints",
                  )}
                </th>
                {period !== "daily" && <th>{t("leaderboard.wins")}</th>}
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
                      {s.username}
                      {isMe && (
                        <span className="lb-you">
                          {" "}
                          ({t("leaderboard.you")})
                        </span>
                      )}
                      {(s.currentStreak ?? 0) >= 2 && (
                        <span className="streak-badge">
                          <i className="fas fa-fire" /> {s.currentStreak}
                        </span>
                      )}
                    </td>
                    <td className="lb-score">{formatScore(s.score)}</td>
                    {period !== "daily" && <td>{s.wins}</td>}
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
