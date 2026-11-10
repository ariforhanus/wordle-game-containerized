import { useState, useEffect, useCallback } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getTheme, type ThemeConfig } from "@wordle/engine";
import { useGame } from "../hooks/useGame";
import { useToast } from "./Toast";
import { usePageTitle } from "../hooks/usePageTitle";
import { buildShareText, copyToClipboard } from "../utils/shareResult";
import Confetti from "./Confetti";
import Board from "./Board";
import Keyboard from "./Keyboard";
import "./ThemedGamePage.css";
import { useDialogFocus } from "../hooks/useDialogFocus";

export default function ThemedGamePage() {
  const { themeId } = useParams<{ themeId: string }>();
  const { t } = useTranslation();

  const theme = themeId ? getTheme(themeId) : undefined;

  if (!theme) {
    return <Navigate to="/themes" replace />;
  }

  return <ThemedGame theme={theme} />;
}

// ── Inner component (theme is guaranteed) ──

function ThemedGame({ theme }: { theme: ThemeConfig }) {
  const { t } = useTranslation();
  usePageTitle(theme.name);
  const toastCtx = useToast();

  const [words, setWords] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [won, setWon] = useState(false);
  const [retry, setRetry] = useState(0);
  const resultRef = useDialogFocus(Boolean(resultMsg));

  // Load words from static JSON
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setAnswer("");
      setResultMsg(null);
      setWon(false);
      try {
        const res = await fetch(theme.wordsFile);
        if (!res.ok) throw new Error("Theme words unavailable");
        const data = await res.json();
        if (!Array.isArray(data.words)) throw new Error("Invalid theme word list");
        const wordList: string[] = [...new Set<string>(data.words
          .filter((word: unknown): word is string => typeof word === "string")
          .map((word: string) => word.toUpperCase().trim())
          .filter((word: string) => word.length === theme.wordLength && /^[A-Z]+$/.test(word)))];
        if (!cancelled && wordList.length > 0) {
          setWords(wordList);
          setValidWords(new Set(wordList));
          // Pick first random word
          const pick = wordList[Math.floor(Math.random() * wordList.length)];
          setAnswer(pick);
        }
      } catch (err) {
        console.error("Failed to load theme words:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [theme, retry]);

  const { state, addLetter, removeLetter, submit, shakeRow, reset } = useGame({
    answer,
    definition: "",
    lang: "en", // themed words use English keyboard
    validWords,
    onWin: (s) => {
      setWon(true);
      setResultMsg(`${t("game.congrats")} ${t("game.word")}: ${s.answer}`);
    },
    onLose: (s) => {
      setWon(false);
      setResultMsg(`${t("game.gameOver")} ${t("game.word")}: ${s.answer}`);
    },
    onInvalidWord: () => {
      toastCtx.warning(t("game.invalidWord"));
    },
  });

  const pickNewWord = useCallback(() => {
    if (words.length === 0) return;
    setResultMsg(null);
    setWon(false);
    const pick = words[Math.floor(Math.random() * words.length)];
    if (pick === answer) reset(pick, "");
    setAnswer(pick);
  }, [words, answer, reset]);

  if (loading) {
    return <div className="page-center"><div className="spinner" role="status" aria-label={t("themes.loading")} /></div>;
  }

  if (!answer) return <div className="page-center"><div className="result-card">
    <p role="alert">{t("themes.loadError")}</p>
    <button onClick={() => setRetry((value) => value + 1)}>{t("themes.retry")}</button>
    <Link to="/themes">{t("themes.back")}</Link>
  </div></div>;

  return (
    <div className="game-page themed-game-page">
      <Confetti active={won} />

      {/* Theme header badge */}
      <div
        className="theme-badge"
        style={{
          borderColor: theme.color,
        }}
      >
        <i aria-hidden="true" className={`fas ${theme.icon}`} />
        <span>{theme.name}</span>
      </div>

      <Board state={state} shakeRow={shakeRow} />
      <Keyboard
        keyboard={state.keyboard}
        onKey={addLetter}
        onEnter={submit}
        onBackspace={removeLetter}
        disabled={state.status !== "playing"}
        lang="en"
      />

      {/* Result popup */}
      {resultMsg && (
        <div className="result-overlay" role="presentation">
          <div ref={resultRef} tabIndex={-1} className="result-card" role="dialog" aria-modal="true" aria-label={t("game.word")}>
            <p className="result-text">{resultMsg}</p>
            <div className="themed-result-actions">
              <button className="btn-share" onClick={async () => {
                const text = buildShareText(state, "themed", { themeName: theme.name });
                const ok = await copyToClipboard(text);
                if (ok) toastCtx.success(t("game.copied"));
              }}>
                <i aria-hidden="true" className="fas fa-share-alt" /> {t("game.share")}
              </button>
              <button className="btn-primary" onClick={pickNewWord}>
                <i aria-hidden="true" className="fas fa-redo" /> {t("themes.playAgain")}
              </button>
              <Link to="/themes" className="btn-secondary themed-back-btn">
                <i aria-hidden="true" className="fas fa-arrow-left" /> {t("themes.back")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
