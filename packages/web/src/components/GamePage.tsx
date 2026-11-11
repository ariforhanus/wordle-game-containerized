import { useState, useLayoutEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { wordApi } from "@wordle/api";
import { toUpperCase, getLanguage, isValidLetter } from "@wordle/engine";
import { useGame } from "../hooks/useGame";
import { useToast } from "./Toast";
import { usePageTitleKey } from "../hooks/usePageTitle";
import { buildShareText, copyToClipboard } from "../utils/shareResult";
import { TOAST_DURATION_LONG } from "../constants";
import GameModeInfo from "./GameModeInfo";
import Confetti from "./Confetti";
import HowToPlayModal from "./HowToPlayModal";
import Board from "./Board";
import Keyboard from "./Keyboard";
import "./GamePage.css";
import { useDialogFocus } from "../hooks/useDialogFocus";

async function loadWordList(lang: string, purpose: "answers" | "guesses"): Promise<string[]> {
  const response = await fetch(`/words_${lang}${purpose === "guesses" ? "_possible" : ""}.txt`);
  if (!response.ok) throw new Error("Practice word list unavailable");
  const words = (await response.text()).split("\n")
    .map(word => toUpperCase(word.trim(), lang))
    .filter(word => word.length === 5 && Array.from(word).every(letter => isValidLetter(letter, lang)));
  if (!words.length) throw new Error("Practice word list is empty");
  return [...new Set(words)];
}

export default function GamePage() {
  const { t, i18n } = useTranslation();
  usePageTitleKey("seo.practice");
  const toastCtx = useToast();
  const lang = i18n.language;

  const [answer, setAnswer] = useState("");
  const [definition, setDefinition] = useState("");
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const wordRequest = useRef(0);
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

  const { state, addLetter, removeLetter, submit, shakeRow, reset } = useGame({
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

  const hintConfirmRef = useDialogFocus(showHintConfirm, () => setShowHintConfirm(false));
  const hintTextRef = useDialogFocus(showHintText, () => setShowHintText(false));
  const resultRef = useDialogFocus(Boolean(resultMsg));
  const loadErrorMessage = t("game.loadError");
  const notifyLoadError = toastCtx.error;

  const loadWord = useCallback(async () => {
    const request = ++wordRequest.current;
    reset("", "");
    setAnswer("");
    setDefinition("");
    setValidWords(new Set());
    setLoading(true);
    setLoadError(false);
    setResultMsg(null);
    setShowConfetti(false);
    setHintsEnabled(false);
    setShowHintConfirm(false);
    setShowHintText(false);
    try {
      // One generation owns the answer and guess dictionary. Only a failed or
      // unusable API answer needs the selected language's curated fallback pool.
      const [remote, words] = await Promise.all([
        wordApi.getRandomWord(lang).catch(() => null),
        loadWordList(lang, "guesses"),
      ]);
      if (request !== wordRequest.current) return;
      const candidate = typeof remote?.word === "string" ? toUpperCase(remote.word, lang) : "";
      const online = candidate.length === 5 && Array.from(candidate).every(letter => isValidLetter(letter, lang));
      let word = candidate;
      if (!online) {
        const answers = await loadWordList(lang, "answers");
        if (request !== wordRequest.current) return;
        word = answers[Math.floor(Math.random() * answers.length)];
      }
      const hint = online && typeof remote?.definition === "string" ? remote.definition : "";
      setAnswer(word);
      setDefinition(hint);
      setValidWords(new Set([...words, word]));
      reset(word, hint); // Also restart when the next answer/definition are identical.
    } catch {
      if (request === wordRequest.current) {
        setLoadError(true);
        notifyLoadError(loadErrorMessage);
      }
    } finally {
      if (request === wordRequest.current) setLoading(false);
    }
  }, [lang, reset, notifyLoadError, loadErrorMessage]);

  // Invalidate the old language/round before paint or input, including unmount
  // and Strict Mode's effect replay. Only the newest request may publish state.
  useLayoutEffect(() => {
    void loadWord();
    return () => { wordRequest.current++; };
  }, [loadWord]);

  function toggleHardMode() {
    if (state.guesses.length > 0) {
      toastCtx.warning(t("game.hardModeLocked"));
      return;
    }
    const next = !hardMode;
    setHardMode(next);
    localStorage.setItem("wordle_hard_mode", next ? "1" : "0");
    if (next && !localStorage.getItem("wordle_hard_intro_seen")) {
      localStorage.setItem("wordle_hard_intro_seen", "1");
      toastCtx.toast(t("game.hardModeFirstTime") as string, "info", TOAST_DURATION_LONG);
    } else {
      toastCtx.info(next ? t("game.hardModeOn") : t("game.hardModeOff"));
    }
  }

  function toggleBlindMode() {
    if (state.guesses.length > 0) {
      toastCtx.warning(t("game.hardModeLocked"));
      return;
    }
    const next = !blindMode;
    setBlindMode(next);
    if (next && !localStorage.getItem("wordle_blind_intro_seen")) {
      localStorage.setItem("wordle_blind_intro_seen", "1");
      toastCtx.toast(t("game.blindModeFirstTime") as string, "info", TOAST_DURATION_LONG);
    } else {
      toastCtx.info(next ? t("game.blindModeOn") : t("game.blindModeOff"));
    }
  }

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

  if (loading) {
    return <div className="page-center"><div className="spinner" role="status" aria-label={t("daily.loading")} /></div>;
  }

  if (loadError) {
    return <div className="page-center"><div className="result-card">
      <p role="alert">{loadErrorMessage}</p>
      <button onClick={() => void loadWord()}>{t("a11y.retry")}</button>
    </div></div>;
  }

  return (
    <div className="game-page">
      <GameModeInfo />
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
          <i aria-hidden="true" className="fas fa-fire" />
          <span className="toolbar-label">{t("game.hardMode")}</span>
        </button>
        <button
          className={`mode-toggle ${blindMode ? "active" : ""}`}
          onClick={toggleBlindMode}
          title={t("game.blindMode")}
        >
          <i aria-hidden="true" className="fas fa-eye-slash" />
          <span className="toolbar-label">{t("game.blindMode")}</span>
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setShowHowToPlay(true)}
          disabled={state.status !== "playing"}
          aria-label={t("game.howToPlay")} title={t("game.howToPlay")}
        >
          <i aria-hidden="true" className="fas fa-question-circle" />
        </button>
      </div>

      {/* Hint button */}
      {hintAvailable && (
        <button
          className={`hint-btn ${hintsEnabled ? "" : "hint-disabled"}`}
          onClick={handleHintClick}
          title={t("game.hint")}
        >
          <i aria-hidden="true" className="fas fa-lightbulb" /> {t("game.hint")}
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
          <div ref={hintConfirmRef} tabIndex={-1} className="result-card hint-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("game.hintConfirmTitle") as string}>
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
          <div ref={hintTextRef} tabIndex={-1} className="result-card hint-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("game.hint") as string}>
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
          <div ref={resultRef} tabIndex={-1} className="result-card" role="dialog" aria-modal="true" aria-label={t("game.word") as string}>
            <p className="result-text">{resultMsg}</p>
            {definition && (
              <p className="result-def">
                {t("game.meaning")}: {definition}
              </p>
            )}
            <div className="result-actions">
              <button className="btn-share" onClick={handleShare}>
                <i aria-hidden="true" className="fas fa-share-alt" /> {t("game.share")}
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
