import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { wordApi } from "@wordle/api";
import { toUpperCase } from "@wordle/engine";
import { useGame } from "../hooks/useGame";
import Board from "./Board";
import Keyboard from "./Keyboard";
import "./GamePage.css";

export default function GamePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [answer, setAnswer] = useState("");
  const [definition, setDefinition] = useState("");
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  // Hint state
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [showHintConfirm, setShowHintConfirm] = useState(false);
  const [showHintText, setShowHintText] = useState(false);

  const loadWord = useCallback(async () => {
    setLoading(true);
    setResultMsg(null);
    setHintsEnabled(false);
    setShowHintConfirm(false);
    setShowHintText(false);
    try {
      const data = await wordApi.getRandomWord(lang);
      setAnswer(toUpperCase(data.word, lang));
      setDefinition(data.definition);
    } catch (err) {
      console.error("Failed to load word:", err);
    } finally {
      setLoading(false);
    }
  }, [lang]);

  // Load valid words list
  useEffect(() => {
    async function load() {
      try {
        let res = await fetch(`/words_${lang}_possible.txt`);
        if (!res.ok) {
          res = await fetch("/words_en_possible.txt");
        }
        const text = await res.text();
        const words = text
          .split("\n")
          .map((w) => toUpperCase(w.trim(), lang))
          .filter((w) => w.length === 5);
        setValidWords(new Set(words));
      } catch (err) {
        console.error("Failed to load valid words:", err);
      }
    }
    load();
  }, [lang]);

  useEffect(() => {
    loadWord();
  }, [loadWord]);

  const { state, addLetter, removeLetter, submit, shakeRow } = useGame({
    answer,
    definition,
    lang,
    validWords,
    onWin: (s) => {
      setResultMsg(
        `${t("game.congrats")} ${t("game.word")}: ${s.answer}`
      );
    },
    onLose: (s) => {
      setResultMsg(
        `${t("game.gameOver")} ${t("game.word")}: ${s.answer}`
      );
    },
  });

  function handlePlayAgain() {
    loadWord();
  }

  function handleHintClick() {
    if (!hintsEnabled) {
      setShowHintConfirm(true);
    } else {
      setShowHintText(true);
    }
  }

  function handleEnableHints() {
    setHintsEnabled(true);
    setShowHintConfirm(false);
    setShowHintText(true);
  }

  // Only show hint button for English (no Turkish definition API)
  const hintAvailable = lang === "en" && state.status === "playing";

  if (loading && !answer) {
    return <div className="page-center"><div className="spinner" /></div>;
  }

  return (
    <div className="game-page">
      {/* Hint button */}
      {hintAvailable && (
        <button
          className={`hint-btn ${hintsEnabled ? "" : "hint-disabled"}`}
          onClick={handleHintClick}
          title={t("game.hint")}
        >
          <i className="fas fa-lightbulb" /> {t("game.hint")}
        </button>
      )}

      <Board state={state} shakeRow={shakeRow} />
      <Keyboard
        keyboard={state.keyboard}
        onKey={addLetter}
        onEnter={submit}
        onBackspace={removeLetter}
        disabled={state.status !== "playing"}
      />

      {/* Hint enable confirmation popup */}
      {showHintConfirm && (
        <div className="result-overlay" onClick={() => setShowHintConfirm(false)}>
          <div className="result-card hint-card" onClick={(e) => e.stopPropagation()}>
            <p className="hint-confirm-text">
              {lang === "tr"
                ? "İpuçlarını etkinleştirmek istiyor musun?"
                : "Do you want to enable hints?"}
            </p>
            <p className="hint-confirm-sub">
              {lang === "tr"
                ? "Kelimenin tanımını görebileceksin."
                : "You'll be able to see the word's definition."}
            </p>
            <div className="hint-confirm-actions">
              <button className="btn-cancel" onClick={() => setShowHintConfirm(false)}>
                {lang === "tr" ? "İptal" : "Cancel"}
              </button>
              <button className="btn-primary" onClick={handleEnableHints}>
                {lang === "tr" ? "Etkinleştir" : "Enable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hint display popup */}
      {showHintText && (
        <div className="result-overlay" onClick={() => setShowHintText(false)}>
          <div className="result-card hint-card" onClick={(e) => e.stopPropagation()}>
            <div className="hint-display-icon">
              <i className="fas fa-lightbulb" />
            </div>
            <p className="hint-display-text">{definition}</p>
            <button className="btn-primary" onClick={() => setShowHintText(false)}>
              OK
            </button>
          </div>
        </div>
      )}

      {/* Result popup */}
      {resultMsg && (
        <div className="result-overlay">
          <div className="result-card">
            <p className="result-text">{resultMsg}</p>
            {definition && (
              <p className="result-def">
                {t("game.meaning")}: {definition}
              </p>
            )}
            <button className="btn-primary" onClick={handlePlayAgain}>
              {t("game.playAgain")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
