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

  // Load words from static JSON
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(theme.wordsFile);
        const data = await res.json();
        const wordList: string[] = (data.words as string[])
          .map((w) => w.toUpperCase().trim())
          .filter((w) => w.length === theme.wordLength);
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
  }, [theme]);

  const pickNewWord = useCallback(() => {
    if (words.length === 0) return;
    setResultMsg(null);
    setWon(false);
    const pick = words[Math.floor(Math.random() * words.length)];
    setAnswer(pick);
  }, [words]);

  const { state, addLetter, removeLetter, submit, shakeRow } = useGame({
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

  if (loading) {
    return <div className="page-center"><div className="spinner" /></div>;
  }

  return (
    <div className="game-page themed-game-page">
      <Confetti active={won} />

      {/* Theme header badge */}
      <div
        className="theme-badge"
        style={{
          background: `linear-gradient(135deg, ${theme.color}, ${theme.colorEnd ?? theme.color})`,
        }}
      >
        <i className={`fas ${theme.icon}`} />
        <span>{theme.name}</span>
      </div>

      <Board state={state} shakeRow={shakeRow} />
      <Keyboard
        keyboard={state.keyboard}
        onKey={addLetter}
        onEnter={submit}
        onBackspace={removeLetter}
        disabled={state.status !== "playing"}
      />

      {/* Result popup */}
      {resultMsg && (
        <div className="result-overlay">
          <div className="result-card">
            <p className="result-text">{resultMsg}</p>
            <div className="themed-result-actions">
              <button className="btn-share" onClick={async () => {
                const text = buildShareText(state, "themed", { themeName: theme.name });
                const ok = await copyToClipboard(text);
                if (ok) toastCtx.success(t("game.copied"));
              }}>
                <i className="fas fa-share-alt" /> {t("game.share")}
              </button>
              <button className="btn-primary" onClick={pickNewWord}>
                <i className="fas fa-redo" /> {t("themes.playAgain")}
              </button>
              <Link to="/themes" className="btn-secondary themed-back-btn">
                <i className="fas fa-arrow-left" /> {t("themes.back")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
