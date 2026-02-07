import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { scoreApi, isAuthenticated, authApi, type ScoreResponse } from "@wordle/api";
import "./LeaderboardPage.css";
import "./DailyPage.css";

function escapeHtml(str: string): string {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

export default function LeaderboardPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [scores, setScores] = useState<ScoreResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(false);
      try {
        // Check if user has played today
        if (isAuthenticated()) {
          try {
            const [status, me] = await Promise.all([
              scoreApi.getDailyStatus(lang),
              authApi.getMe(),
            ]);
            setCurrentUser(me.username);
            setHasPlayed(status.played);

            if (!status.played) {
              setLoading(false);
              return; // Don't load leaderboard
            }
          } catch {
            // If status check fails, show leaderboard anyway
            setHasPlayed(true);
          }
        } else {
          // Not logged in -- can't check status, show locked
          setHasPlayed(false);
          setLoading(false);
          return;
        }

        const data = await scoreApi.getDailyLeaderboard(lang);
        setScores(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [lang]);

  if (loading) {
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

  if (error) {
    return (
      <div className="page-center">
        <p>{t("leaderboard.error")}</p>
      </div>
    );
  }

  return (
    <div className="leaderboard-page">
      <h1 className="lb-title">{t("leaderboard.title")}</h1>

      {scores.length === 0 ? (
        <p className="lb-empty">{t("leaderboard.empty")}</p>
      ) : (
        <div className="lb-table-wrap">
          <table className="lb-table">
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
                    <td className="lb-score">{s.score}</td>
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
