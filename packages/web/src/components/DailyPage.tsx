import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { wordApi, scoreApi, isAuthenticated } from "@wordle/api";
import { toUpperCase, getAttempts, getElapsedMs } from "@wordle/engine";
import { useGame } from "../hooks/useGame";
import Board from "./Board";
import Keyboard from "./Keyboard";
import "./GamePage.css";
import "./DailyPage.css";

export default function DailyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;

  const [answer, setAnswer] = useState("");
  const [definition, setDefinition] = useState("");
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [prevScore, setPrevScore] = useState<{
    score: number;
    attempts: number;
  } | null>(null);
  const [started, setStarted] = useState(false);
  const [timerText, setTimerText] = useState("00:00");
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const scoreSentRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const gameStartRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
      return;
    }

    async function init() {
      setLoading(true);
      try {
        const status = await scoreApi.getDailyStatus(lang);
        if (status.played) {
          setAlreadyPlayed(true);
          if (status.score) {
            setPrevScore({
              score: status.score.score,
              attempts: status.score.attempts,
            });
          }
          setLoading(false);
          return;
        }

        // Check localStorage cache first (Istanbul timezone)
        const now = new Date();
        const istOffset = 3 * 60; // Istanbul = UTC+3
        const istTime = new Date(now.getTime() + istOffset * 60_000 - now.getTimezoneOffset() * 60_000);
        const today = istTime.toISOString().split("T")[0];
        const cacheKey = `dailyWord_${lang}`;

        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.date === today) {
              setAnswer(toUpperCase(parsed.word, lang));
              setDefinition(parsed.definition);
              setLoading(false);
              return;
            }
          }
        } catch { /* ignore */ }

        const data = await wordApi.getDailyWord(lang);
        const word = toUpperCase(data.word, lang);
        setAnswer(word);
        setDefinition(data.definition);

        // Cache for today
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ word, definition: data.definition, date: today }));
        } catch { /* ignore */ }
      } catch (err) {
        console.error("Failed to init daily:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [lang, navigate]);

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
    if (!started) return;
    gameStartRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - gameStartRef.current) / 1000);
      const m = Math.floor(elapsed / 60)
        .toString()
        .padStart(2, "0");
      const s = (elapsed % 60).toString().padStart(2, "0");
      setTimerText(`${m}:${s}`);
    }, 1000);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [started]);

  const handleWin = useCallback(
    (gameState: { answer: string }) => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      setResultMsg(
        `${t("game.congrats")} ${t("game.word")}: ${gameState.answer}`
      );

      if (scoreSentRef.current) return;
      scoreSentRef.current = true;
      // Send score - we need the actual state, so we rely on the latest game state
    },
    [t]
  );

  const handleLose = useCallback(
    (gameState: { answer: string }) => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      setResultMsg(
        `${t("game.gameOver")} ${t("game.word")}: ${gameState.answer}`
      );
    },
    [t]
  );

  const { state, addLetter, removeLetter, submit, shakeRow } = useGame({
    answer: answer || "XXXXX", // placeholder until loaded
    definition,
    lang,
    validWords,
    onWin: handleWin,
    onLose: handleLose,
  });

  // Send score when game ends
  useEffect(() => {
    if (state.status === "won" && !scoreSentRef.current) {
      scoreSentRef.current = true;
      scoreApi
        .submitScore(lang, {
          attempts: getAttempts(state),
          durationMs: Date.now() - gameStartRef.current,
          word: state.answer,
        })
        .catch(console.error);
    }
  }, [state.status, state.answer, lang, state]);

  if (loading) {
    return (
      <div className="page-center">
        <div className="spinner" />
      </div>
    );
  }

  if (alreadyPlayed) {
    return (
      <div className="page-center">
        <div className="result-card">
          <h2>{t("daily.alreadyPlayed")}</h2>
          {prevScore && (
            <p className="result-text">
              {t("daily.todayScore", {
                score: prevScore.score,
                attempts: prevScore.attempts,
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

  if (!started) {
    return (
      <div className="page-center">
        <div className="result-card daily-start-card">
          <div className="daily-start-icon">
            <i className="fas fa-calendar-day" />
          </div>
          <h2>{t("daily.title")}</h2>
          <p className="daily-start-desc">{t("daily.desc")}</p>
          <button className="btn-primary" onClick={() => setStarted(true)}>
            <i className="fas fa-play" /> {t("daily.startGame")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-page">
      <div className="daily-timer">{timerText}</div>
      <Board state={state} shakeRow={shakeRow} />
      <Keyboard
        keyboard={state.keyboard}
        onKey={addLetter}
        onEnter={submit}
        onBackspace={removeLetter}
        disabled={state.status !== "playing"}
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
            <Link to="/leaderboard" className="btn-primary">
              {t("daily.goToLeaderboard")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
