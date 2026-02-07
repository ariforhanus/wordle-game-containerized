import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { wordApi } from "@wordle/api";
import { toUpperCase, getLanguage } from "@wordle/engine";
import { useGame } from "../hooks/useGame";
import { useToast } from "./Toast";
import { usePageTitleKey } from "../hooks/usePageTitle";
import { buildShareText, copyToClipboard } from "../utils/shareResult";
import { TOAST_DURATION_LONG } from "../constants";
import Confetti from "./Confetti";
import HowToPlayModal from "./HowToPlayModal";
import Board from "./Board";
import Keyboard from "./Keyboard";
import "./GamePage.css";

export default function GamePage() {
  const { t, i18n } = useTranslation();
  usePageTitleKey("seo.practice");
  const toastCtx = useToast();
  const lang = i18n.language;

  const [answer, setAnswer] = useState("");
  const [definition, setDefinition] = useState("");
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [hardMode, setHardMode] = useState(() =>
    localStorage.getItem("wordle_hard_mode") === "1"
  );
  const [blindMode, setBlindMode] = useState(false);

  // Hint state
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [showHintConfirm, setShowHintConfirm] = useState(false);
  const [showHintText, setShowHintText] = useState(false);

  // Offline fallback: pick random word from local word list
  const pickOfflineWord = useCallback(async () => {
    try {
      let res = await fetch(`/words_${lang}_possible.txt`);
      if (!res.ok) res = await fetch("/words_en_possible.txt");
      const text = await res.text();
      const words = text
        .split("\n")
        .map((w) => toUpperCase(w.trim(), lang))
        .filter((w) => w.length === 5);
      if (words.length > 0) {
        const word = words[Math.floor(Math.random() * words.length)];
        setAnswer(word);
        setDefinition("");
        return true;
      }
    } catch {
      // No fallback available
    }
    return false;
  }, [lang]);

  const loadWord = useCallback(async () => {
    setLoading(true);
    setResultMsg(null);
    setShowConfetti(false);
    setHintsEnabled(false);
    setShowHintConfirm(false);
    setShowHintText(false);
    try {
      const data = await wordApi.getRandomWord(lang);
      setAnswer(toUpperCase(data.word, lang));
      setDefinition(data.definition);
    } catch (err) {
      console.error("Failed to load word from API, trying offline fallback:", err);
      const ok = await pickOfflineWord();
      if (!ok) {
        toastCtx.error(t("game.loadError"));
      }
    } finally {
      setLoading(false);
    }
  }, [lang, pickOfflineWord, toastCtx]);

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

  function toggleHardMode() {
    if (state.guesses.length > 0) {
      toastCtx.warning(t("game.hardModeLocked"));
      return;
    }
    setHardMode((prev) => {
      const next = !prev;
      localStorage.setItem("wordle_hard_mode", next ? "1" : "0");
      if (next && !localStorage.getItem("wordle_hard_intro_seen")) {
        localStorage.setItem("wordle_hard_intro_seen", "1");
        toastCtx.toast(t("game.hardModeFirstTime") as string, "info", TOAST_DURATION_LONG);
      } else {
        toastCtx.info(next ? t("game.hardModeOn") : t("game.hardModeOff"));
      }
      return next;
    });
  }

  function toggleBlindMode() {
    if (state.guesses.length > 0) {
      toastCtx.warning(t("game.hardModeLocked"));
      return;
    }
    setBlindMode((prev) => {
      const next = !prev;
      if (next && !localStorage.getItem("wordle_blind_intro_seen")) {
        localStorage.setItem("wordle_blind_intro_seen", "1");
        toastCtx.toast(t("game.blindModeFirstTime") as string, "info", TOAST_DURATION_LONG);
      } else {
        toastCtx.info(next ? t("game.blindModeOn") : t("game.blindModeOff"));
      }
      return next;
    });
  }

  const { state, addLetter, removeLetter, submit, shakeRow } = useGame({
    answer,
    definition,
    lang,
    validWords,
    hardMode,
    onWin: (s) => {
      setShowConfetti(true);
      setResultMsg(
        `${t("game.congrats")} ${t("game.word")}: ${s.answer}`
      );
    },
    onLose: (s) => {
      setResultMsg(
        `${t("game.gameOver")} ${t("game.word")}: ${s.answer}`
      );
    },
    onInvalidWord: () => {
      toastCtx.warning(t("game.invalidWord"));
    },
    onHardModeError: (encoded) => {
      const [key, paramsJson] = encoded.split("|");
      const params = JSON.parse(paramsJson);
      toastCtx.warning(t(key, params) as string);
    },
  });

  async function handleShare() {
    let text = buildShareText(state, "practice");
    if (hardMode) text = text.replace("\n\n", "*\n\n"); // asterisk for hard mode
    const ok = await copyToClipboard(text);
    if (ok) toastCtx.success(t("game.copied"));
  }

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

  // Show hint button only for languages that have definition/hint support
  const langConfig = getLanguage(lang);
  const hintAvailable = langConfig.hasHints && state.status === "playing";

  if (loading && !answer) {
    return <div className="page-center"><div className="spinner" /></div>;
  }

  return (
    <div className="game-page">
      <Confetti active={showConfetti} />
      <HowToPlayModal
        forceOpen={showHowToPlay}
        manualOnly
        onClose={() => setShowHowToPlay(false)}
      />

      {/* Toolbar */}
      <div className="game-toolbar">
        <button
          className={`mode-toggle ${hardMode ? "active" : ""}`}
          onClick={toggleHardMode}
          title={t("game.hardMode")}
        >
          <i className="fas fa-fire" />
          <span className="toolbar-label">{t("game.hardMode")}</span>
        </button>
        <button
          className={`mode-toggle ${blindMode ? "active" : ""}`}
          onClick={toggleBlindMode}
          title={t("game.blindMode")}
        >
          <i className="fas fa-eye-slash" />
          <span className="toolbar-label">{t("game.blindMode")}</span>
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setShowHowToPlay(true)}
          title={t("game.howToPlay")}
        >
          <i className="fas fa-question-circle" />
        </button>
      </div>

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

      <Board state={state} shakeRow={shakeRow} blindMode={blindMode} />
      <Keyboard
        keyboard={state.keyboard}
        onKey={addLetter}
        onEnter={submit}
        onBackspace={removeLetter}
        disabled={state.status !== "playing"}
        blindMode={blindMode && state.status === "playing"}
      />

      {/* Hint enable confirmation popup */}
      {showHintConfirm && (
        <div className="result-overlay" onClick={() => setShowHintConfirm(false)} role="presentation">
          <div className="result-card hint-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("game.hintConfirmTitle") as string}>
            <p className="hint-confirm-text">
              {t("game.hintConfirmTitle")}
            </p>
            <p className="hint-confirm-sub">
              {t("game.hintConfirmDesc")}
            </p>
            <div className="hint-confirm-actions">
              <button className="btn-cancel" onClick={() => setShowHintConfirm(false)}>
                {t("profile.cancel")}
              </button>
              <button className="btn-primary" onClick={handleEnableHints}>
                {t("game.hintEnable")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hint display popup */}
      {showHintText && (
        <div className="result-overlay" onClick={() => setShowHintText(false)} role="presentation">
          <div className="result-card hint-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("game.hint") as string}>
            <div className="hint-display-icon">
              <i className="fas fa-lightbulb" aria-hidden="true" />
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
        <div className="result-overlay" role="presentation">
          <div className="result-card" role="dialog" aria-modal="true" aria-label={t("game.word") as string}>
            <p className="result-text">{resultMsg}</p>
            {definition && (
              <p className="result-def">
                {t("game.meaning")}: {definition}
              </p>
            )}
            <div className="result-actions">
              <button className="btn-share" onClick={handleShare}>
                <i className="fas fa-share-alt" /> {t("game.share")}
              </button>
              <button className="btn-primary" onClick={handlePlayAgain}>
                {t("game.playAgain")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
