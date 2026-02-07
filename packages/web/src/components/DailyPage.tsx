import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { wordApi, scoreApi, isAuthenticated, getTokenUsername } from "@wordle/api";
import { toUpperCase, getAttempts, createGame, replayGuesses } from "@wordle/engine";
import { useGame } from "../hooks/useGame";
import { useToast } from "./Toast";
import { buildShareText, copyToClipboard } from "../utils/shareResult";
import Confetti from "./Confetti";
import Board from "./Board";
import Keyboard from "./Keyboard";
import "./GamePage.css";
import "./DailyPage.css";

// ── localStorage helpers (per-user + per-language keys) ──

interface DailySession {
  date: string;
  lang: string;
  elapsedMs: number;
  guesses: string[];
}

function getTodayIST(): string {
  const now = new Date();
  const istOffset = 3 * 60;
  const istTime = new Date(now.getTime() + istOffset * 60_000 - now.getTimezoneOffset() * 60_000);
  return istTime.toISOString().split("T")[0];
}

function sessionKey(lang: string): string {
  const user = getTokenUsername() ?? "anon";
  return `dailySession_${user}_${lang}`;
}

function loadSessionForLang(lang: string): DailySession | null {
  try {
    const raw = localStorage.getItem(sessionKey(lang));
    if (!raw) return null;
    const s: DailySession = JSON.parse(raw);
    if (s.date === getTodayIST() && s.lang === lang) return s;
    return null;
  } catch {
    return null;
  }
}

function saveSession(session: DailySession): void {
  try {
    localStorage.setItem(sessionKey(session.lang), JSON.stringify(session));
  } catch { /* ignore */ }
}

function clearSessionForLang(lang: string): void {
  try {
    localStorage.removeItem(sessionKey(lang));
  } catch { /* ignore */ }
}

// ── Clean up old keys from previous format ──
(function migrateOldSessions() {
  try {
    // Remove old single-key format
    localStorage.removeItem("dailySession");
    // Remove old per-lang (no user) format
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("dailySession_") && key.split("_").length === 2) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* ignore */ }
})();

// ── Pre-game screen: reacts to language changes ──

type PreGameStatus =
  | { type: "loading" }
  | { type: "already_played"; score?: number; attempts?: number }
  | { type: "continue"; session: DailySession }
  | { type: "start" };

function PreGameScreen({
  onStart,
  onResume,
}: {
  onStart: (lang: string) => void;
  onResume: (lang: string, session: DailySession) => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;

  const [status, setStatus] = useState<PreGameStatus>({ type: "loading" });

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }

    let cancelled = false;
    setStatus({ type: "loading" });

    async function check() {
      try {
        // Check if there's an active session for this lang
        const session = loadSessionForLang(lang);

        // Check backend status
        const result = await scoreApi.getDailyStatus(lang);
        if (cancelled) return;

        if (result.played) {
          setStatus({
            type: "already_played",
            score: result.score?.score,
            attempts: result.score?.attempts,
          });
        } else if (session) {
          // Session exists (game was started) — continue even if no guesses yet
          setStatus({ type: "continue", session });
        } else {
          setStatus({ type: "start" });
        }
      } catch {
        // If status check fails, check for local session
        const session = loadSessionForLang(lang);
        if (cancelled) return;
        if (session) {
          setStatus({ type: "continue", session });
        } else {
          setStatus({ type: "start" });
        }
      }
    }
    check();
    return () => { cancelled = true; };
  }, [lang, navigate]);

  if (status.type === "loading") {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

  if (status.type === "already_played") {
    return (
      <div className="page-center">
        <div className="result-card">
          <h2>{t("daily.alreadyPlayed")}</h2>
          {status.score != null && (
            <p className="result-text">
              {t("daily.todayScore", {
                score: status.score,
                attempts: status.attempts,
              })}
            </p>
          )}
          <Link to="/leaderboard" className="btn-primary">
            {t("daily.goToLeaderboard")}
          </Link>
        </div>
      </div>
    );
  }

  if (status.type === "continue") {
    return (
      <div className="page-center">
        <div className="result-card daily-start-card">
          <div className="daily-start-icon">
            <i className="fas fa-calendar-day" />
          </div>
          <h2>{t("daily.title")}</h2>
          <p className="daily-start-desc">{t("daily.desc")}</p>
          <button className="btn-primary" onClick={() => onResume(lang, status.session)}>
            <i className="fas fa-play" /> {t("daily.continue")}
          </button>
        </div>
      </div>
    );
  }

  // type === "start"
  return (
    <div className="page-center">
      <div className="result-card daily-start-card">
        <div className="daily-start-icon">
          <i className="fas fa-calendar-day" />
        </div>
        <h2>{t("daily.title")}</h2>
        <p className="daily-start-desc">{t("daily.desc")}</p>
        <button className="btn-primary" onClick={() => onStart(lang)}>
          <i className="fas fa-play" /> {t("daily.startGame")}
        </button>
      </div>
    </div>
  );
}

// ── Main game screen: language is locked ──

function DailyGame({
  gameLang,
  initialSession,
}: {
  gameLang: string;
  initialSession: DailySession | null;
}) {
  const { t } = useTranslation();
  const toastCtx = useToast();
  const lang = gameLang; // locked

  const [answer, setAnswer] = useState("");
  const [definition, setDefinition] = useState("");
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [timerText, setTimerText] = useState("00:00");
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const scoreSentRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const gameEndedRef = useRef(false);

  const accumulatedMsRef = useRef(initialSession?.elapsedMs ?? 0);
  const segmentStartRef = useRef(Date.now());

  // Always-up-to-date session ref — used for saving on unmount
  const sessionRef = useRef<DailySession>({
    date: getTodayIST(),
    lang,
    elapsedMs: initialSession?.elapsedMs ?? 0,
    guesses: initialSession?.guesses ?? [],
  });

  const [restoredGuesses, setRestoredGuesses] = useState<string[] | null>(
    initialSession && initialSession.guesses.length > 0 ? initialSession.guesses : null
  );

  const getTotalElapsed = useCallback(() => {
    return accumulatedMsRef.current + (Date.now() - segmentStartRef.current);
  }, []);

  const snapshotElapsed = useCallback(() => {
    accumulatedMsRef.current += Date.now() - segmentStartRef.current;
    segmentStartRef.current = Date.now();
  }, []);

  // Load word
  useEffect(() => {
    let cancelled = false;
    async function loadWord() {
      try {
        const today = getTodayIST();
        const cacheKey = `dailyWord_${lang}`;
        let word = "";
        let def = "";

        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.date === today) {
              word = toUpperCase(parsed.word, lang);
              def = parsed.definition;
            }
          }
        } catch { /* ignore */ }

        if (!word) {
          const data = await wordApi.getDailyWord(lang);
          if (cancelled) return;
          word = toUpperCase(data.word, lang);
          def = data.definition;
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ word, definition: def, date: today }));
          } catch { /* ignore */ }
        }

        setAnswer(word);
        setDefinition(def);
      } catch (err) {
        console.error("Failed to load daily word:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadWord();
    return () => { cancelled = true; };
  }, [lang]);

  // Load valid words
  useEffect(() => {
    async function load() {
      try {
        let res = await fetch(`/words_${lang}_possible.txt`);
        if (!res.ok) res = await fetch("/words_en_possible.txt");
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

  // Timer
  useEffect(() => {
    function tick() {
      const totalSec = Math.floor(getTotalElapsed() / 1000);
      const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
      const s = (totalSec % 60).toString().padStart(2, "0");
      setTimerText(`${m}:${s}`);
    }
    tick();
    timerRef.current = window.setInterval(tick, 1000);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [getTotalElapsed]);

  // Pause on tab hidden
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        snapshotElapsed();
        if (timerRef.current !== null) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } else {
        segmentStartRef.current = Date.now();
        if (timerRef.current === null) {
          timerRef.current = window.setInterval(() => {
            const totalSec = Math.floor(getTotalElapsed() / 1000);
            const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
            const s = (totalSec % 60).toString().padStart(2, "0");
            setTimerText(`${m}:${s}`);
          }, 1000);
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [snapshotElapsed, getTotalElapsed]);

  // Save session on unmount — uses ref directly (no localStorage read)
  useEffect(() => {
    function saveBeforeUnload() {
      if (gameEndedRef.current) return;
      snapshotElapsed();
      sessionRef.current.elapsedMs = accumulatedMsRef.current;
      saveSession(sessionRef.current);
    }
    window.addEventListener("beforeunload", saveBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", saveBeforeUnload);
      // Component unmounting — save from ref
      if (gameEndedRef.current) return;
      snapshotElapsed();
      sessionRef.current.elapsedMs = accumulatedMsRef.current;
      saveSession(sessionRef.current);
    };
  }, [lang, snapshotElapsed]);

  const handleWin = useCallback(
    (gameState: { answer: string }) => {
      gameEndedRef.current = true;
      if (timerRef.current !== null) clearInterval(timerRef.current);
      setShowConfetti(true);
      setResultMsg(
        `${t("game.congrats")} ${t("game.word")}: ${gameState.answer}`
      );
      clearSessionForLang(lang);
    },
    [t, lang]
  );

  const handleLose = useCallback(
    (gameState: { answer: string }) => {
      gameEndedRef.current = true;
      if (timerRef.current !== null) clearInterval(timerRef.current);
      setResultMsg(
        `${t("game.gameOver")} ${t("game.word")}: ${gameState.answer}`
      );
      clearSessionForLang(lang);
    },
    [t, lang]
  );

  const { state, addLetter, removeLetter, submit, shakeRow, setState } = useGame({
    answer: answer || "XXXXX",
    definition,
    lang,
    validWords,
    onWin: handleWin,
    onLose: handleLose,
    onInvalidWord: () => {
      toastCtx.warning(t("game.invalidWord"));
    },
  });

  // Replay restored guesses
  useEffect(() => {
    if (restoredGuesses && answer && answer !== "XXXXX") {
      const fresh = createGame(answer, definition, lang);
      const restored = replayGuesses(fresh, restoredGuesses);
      setState(restored);
      setRestoredGuesses(null);
    }
  }, [restoredGuesses, answer, definition, lang, setState]);

  // Persist guesses + keep sessionRef up to date
  useEffect(() => {
    if (!answer || answer === "XXXXX") return;

    // Always update the ref with latest guesses
    const guessStrings = state.guesses.map((g) => g.guess);
    sessionRef.current.guesses = guessStrings;

    if (state.guesses.length === 0) return;
    if (state.status !== "playing") return;

    snapshotElapsed();
    sessionRef.current.elapsedMs = accumulatedMsRef.current;
    saveSession(sessionRef.current);
  }, [state.guesses, state.status, answer, lang, snapshotElapsed]);

  // Send score
  useEffect(() => {
    if (state.status === "won" && !scoreSentRef.current) {
      scoreSentRef.current = true;
      scoreApi
        .submitScore(lang, {
          attempts: getAttempts(state),
          durationMs: getTotalElapsed(),
          word: state.answer,
        })
        .catch(console.error);
    }
  }, [state.status, state.answer, lang, state, getTotalElapsed]);

  // Save initial session if new game
  useEffect(() => {
    if (!initialSession) {
      saveSession({
        date: getTodayIST(),
        lang,
        elapsedMs: 0,
        guesses: [],
      });
    }
  }, [lang, initialSession]);

  if (loading) {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="game-page">
      <Confetti active={showConfetti} />
      <div className="daily-timer">{timerText}</div>
      <Board state={state} shakeRow={shakeRow} />
      <Keyboard
        keyboard={state.keyboard}
        onKey={addLetter}
        onEnter={submit}
        onBackspace={removeLetter}
        disabled={state.status !== "playing"}
        lang={lang}
      />

      {resultMsg && (
        <div className="result-overlay">
          <div className="result-card">
            <p className="result-text">{resultMsg}</p>
            {definition && (
              <p className="result-def">
                {t("game.meaning")}: {definition}
              </p>
            )}
            <div className="result-actions">
              <button className="btn-share" onClick={async () => {
                const text = buildShareText(state, "daily");
                const ok = await copyToClipboard(text);
                if (ok) toastCtx.success(t("game.copied"));
              }}>
                <i className="fas fa-share-alt" /> {t("game.share")}
              </button>
              <Link to="/leaderboard" className="btn-primary">
                {t("daily.goToLeaderboard")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Container: switches between PreGame and Game ──

export default function DailyPage() {
  const { i18n } = useTranslation();

  const [gameState, setGameState] = useState<{
    lang: string;
    session: DailySession | null;
  } | null>(null);

  // When user changes language mid-game → go back to pre-game screen
  // DailyGame's cleanup will save the session via its ref
  useEffect(() => {
    if (gameState && i18n.language !== gameState.lang) {
      setGameState(null);
    }
  }, [i18n.language, gameState]);

  function handleStart(lang: string) {
    setGameState({ lang, session: null });
  }

  function handleResume(lang: string, session: DailySession) {
    setGameState({ lang, session });
  }

  if (gameState) {
    return (
      <DailyGame
        gameLang={gameState.lang}
        initialSession={gameState.session}
      />
    );
  }

  return <PreGameScreen onStart={handleStart} onResume={handleResume} />;
}
