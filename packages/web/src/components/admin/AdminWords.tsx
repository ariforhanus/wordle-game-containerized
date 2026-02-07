import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "@wordle/api";
import type { DailyWordInfo } from "@wordle/api";
import { LANGUAGES } from "@wordle/engine";

export default function AdminWords() {
  const { t } = useTranslation();
  const [words, setWords] = useState<DailyWordInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getDailyWord()
      .then(setWords)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="admin-loading"><div className="spinner" /></div>;
  }

  return (
    <div>
      <h1 className="admin-page-title">{t("admin.words")}</h1>

      <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 16 }}>
        {t("admin.dailyWords")}
      </h2>

      <div className="admin-words-grid">
        {words && Object.entries(words).map(([lang, info]) => {
          const langConfig = LANGUAGES[lang];
          const flag = langConfig?.flag ?? "";
          const langName = langConfig?.name ?? lang.toUpperCase();
          const isError = "error" in info;

          return (
            <div key={lang} className="admin-word-card">
              <div className="admin-word-lang">
                {flag} {langName}
              </div>
              {isError ? (
                <div className="admin-word-def" style={{ color: "#e53935" }}>
                  Error: {(info as { error: string }).error}
                </div>
              ) : (
                <>
                  <div className="admin-word-value">
                    {(info as { word: string; definition?: string }).word}
                  </div>
                  {(info as { word: string; definition?: string }).definition && (
                    <div className="admin-word-def">
                      {(info as { word: string; definition?: string }).definition}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
