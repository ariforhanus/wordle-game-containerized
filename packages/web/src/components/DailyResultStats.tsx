import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { scoreApi, type LanguageStats } from "@wordle/api";
import GuessDistribution from "./GuessDistribution";

export default function DailyResultStats({
  language,
  gameId,
}: {
  language: string;
  gameId: string;
}) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<LanguageStats | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setStats(null);
    setError(false);
    scoreApi
      .getMyStats(language)
      .then((result) => {
        const selected = result.byLanguage?.[language];
        if (!selected) throw new Error("Language statistics unavailable");
        if (active) setStats(selected);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [language, gameId, retry]);
  return (
    <section
      aria-label={t("daily.languageStats", { lang: language.toUpperCase() })}
    >
      <h3>{t("daily.languageStats", { lang: language.toUpperCase() })}</h3>
      {error ? (
        <div role="alert">
          <p>{t("daily.statsUnavailable")}</p>
          <button onClick={() => setRetry((value) => value + 1)}>
            {t("daily.retryStatus")}
          </button>
        </div>
      ) : !stats ? (
        <p role="status">{t("daily.statsLoading")}</p>
      ) : (
        <>
          <p>
            {t("profile.currentStreak")}: <strong>{stats.currentStreak}</strong>
          </p>
          <p>
            {t("profile.bestStreak")}: <strong>{stats.bestStreak}</strong>
          </p>
          <GuessDistribution distribution={stats.guessDistribution} />
        </>
      )}
    </section>
  );
}
