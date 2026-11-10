import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { dailyGameApi, isAuthenticated, ApiError } from "@wordle/api";
import type { DailyGame, DailyGameStatus } from "@wordle/api";
import {
  buildKeyboardState,
  isValidLetter,
  toUpperCase,
  type GameState,
} from "@wordle/engine";
import { useToast } from "./Toast";
import { usePageTitleKey } from "../hooks/usePageTitle";
import Board from "./Board";
import Keyboard from "./Keyboard";
import Confetti from "./Confetti";
import DailyResultStats from "./DailyResultStats";
import GameModeInfo from "./GameModeInfo";
import DailyCountdown from "./DailyCountdown";
import { buildShareText, copyToClipboard } from "../utils/shareResult";
import { clearDailyDraft, restoreDailyDraft, saveDailyDraft } from "../utils/dailyDraft";
import "./GamePage.css";
import "./DailyPage.css";

export default function DailyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  usePageTitleKey("seo.daily");
  const [available, setAvailable] = useState<DailyGameStatus | null>(null);
  const [lookup, setLookup] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [lookupVersion, setLookupVersion] = useState(0);
  const [game, setGame] = useState<DailyGame | null>(null);
  const [guess, setGuess] = useState("");
  const [pending, setPending] = useState(false);
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [recovered, setRecovered] = useState(false);
  const gameRef = useRef<DailyGame | null>(null);
  gameRef.current = game;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [dayChanged, setDayChanged] = useState(false);
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const inFlight = useRef(false);
  const selectedLang = useRef(i18n.language);
  selectedLang.current = i18n.language;
  const lang = game?.language ?? i18n.language;

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) navigate("/login");
  }, [navigate]);
  // Sessions and puzzle dates are stored by the server, so changing device or tab resumes the same game.
  useEffect(() => {
    let active = true;
    setGame(null);
    setGuess("");
    setPending(false);
    setRecovered(false);
    setError(false);
    setAlreadyPlayed(false);
    setVerificationNeeded(false);
    setAvailable(null);
    setLookup("loading");
    if (isAuthenticated()) {
      dailyGameApi
        .status(i18n.language)
        .then((result) => {
          if (!active) return;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || !result.timeZone) {
            throw new Error("Daily status is missing calendar metadata");
          }
          setAvailable(result);
          setAlreadyPlayed(result.state === "already_played");
          setLookup("ready");
        })
        .catch((err) => {
          if (!active) return;
          setVerificationNeeded(err instanceof ApiError && err.status === 403);
          setLookup("error");
        });
    }
    return () => {
      active = false;
    };
  }, [i18n.language, lookupVersion]);
  useEffect(() => {
    if (!game) return;
    const receivedAt = performance.now();
    setElapsed(game.elapsedMs);
    if (game.status !== "playing") return;
    const timer = window.setInterval(
      () => setElapsed(game.elapsedMs + performance.now() - receivedAt),
      1000,
    );
    return () => clearInterval(timer);
  }, [game]);

  useEffect(() => {
    if (game) saveDailyDraft(game, guess, pending);
  }, [game, guess, pending]);

  const acceptSavedGame = useCallback((result: DailyGame) => {
    const draft = restoreDailyDraft(result);
    setGame(result);
    setGuess(draft.guess);
    setPending(draft.pending);
  }, []);

  const refreshToday = useCallback(() => {
    if (gameRef.current) clearDailyDraft(gameRef.current.language);
    setPending(false);
    setGame(null);
    setGuess("");
    setDayChanged(true);
    setLookupVersion((v) => v + 1);
  }, []);

  async function start() {
    if (inFlight.current || lookup !== "ready" || alreadyPlayed) return;
    const requestedLang = i18n.language;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    setDayChanged(false);
    try {
      const result = available?.game
        ? await dailyGameApi.load(available.game.id)
        : await dailyGameApi.start(requestedLang, available!.date);
      if (
        mounted.current && result.language === selectedLang.current &&
        requestedLang === selectedLang.current
      )
        acceptSavedGame(result);
    } catch (err) {
      if (!mounted.current || requestedLang !== selectedLang.current) return;
      if (err instanceof ApiError && err.status === 410) {
        refreshToday();
      } else if (
        err instanceof ApiError &&
        err.status === 409 &&
        typeof err.body === "object" &&
        err.body !== null &&
        "error" in err.body &&
        err.body.error === "day_changed"
      ) {
        setDayChanged(true);
        setLookupVersion((v) => v + 1);
      } else if (err instanceof ApiError && err.status === 409)
        setAlreadyPlayed(true);
      else if (err instanceof ApiError && err.status === 403)
        setVerificationNeeded(true);
      else setError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const addLetter = useCallback(
    (letter: string) => {
      if (inFlight.current || pending || game?.status !== "playing") return;
      const upper = toUpperCase(letter, lang);
      if (isValidLetter(upper, lang))
        setGuess((g) => (g.length < 5 ? g + upper : g));
    },
    [game?.status, lang, pending],
  );
  const removeLetter = useCallback(() => {
    if (!inFlight.current && !pending) setGuess((g) => g.slice(0, -1));
  }, [pending]);
  const submit = useCallback(async () => {
    if (
      !game ||
      game.status !== "playing" ||
      guess.length !== 5 ||
      inFlight.current
    )
      return;
    if (offline) { setError(true); return; }
    setPending(true);
    saveDailyDraft(game, guess, true);
    inFlight.current = true;
    setBusy(true);
    setError(false);
    try {
      const updated = await dailyGameApi.guess(
        game.id,
        guess,
        game.guesses.length + 1,
      );
      if (mounted.current && updated.language === selectedLang.current && gameRef.current?.id === game.id) {
        clearDailyDraft(game.language);
        setGame(updated);
        setGuess("");
        setPending(false);
      }
    } catch (err) {
      if (!mounted.current || game.language !== selectedLang.current || gameRef.current?.id !== game.id) return;
      if (err instanceof ApiError && err.status === 400) {
        setPending(false);
        toast.warning(t("game.invalidWord"));
      }
      else if (err instanceof ApiError && err.status === 410) refreshToday();
      else if (err instanceof ApiError && err.status === 409) {
        try {
          const result = await dailyGameApi.load(game.id);
          if (mounted.current && result.language === selectedLang.current && gameRef.current?.id === game.id) {
            acceptSavedGame(result);
            setRecovered(true);
          }
        } catch (err) {
          if (!mounted.current || game.language !== selectedLang.current || gameRef.current?.id !== game.id) return;
          if (err instanceof ApiError && err.status === 410) refreshToday();
          else if (err instanceof ApiError && err.status === 409)
            setAlreadyPlayed(true);
          else if (err instanceof ApiError && err.status === 403)
            setVerificationNeeded(true);
          else setError(true);
        }
      } else setError(true);
      // Keep the same guess and turn on network failure. Retrying is idempotent on the server.
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [game, guess, toast, t, refreshToday, offline, acceptSavedGame]);
  const reconnect = useCallback(async () => {
    if (inFlight.current) return;
    const current = gameRef.current;
    if (!current) { setLookupVersion((value) => value + 1); return; }
    if (current.status !== "playing") return;
    inFlight.current = true;
    setBusy(true);
    setRecovered(false);
    try {
      const result = await dailyGameApi.load(current.id);
      if (!mounted.current || gameRef.current?.id !== current.id || selectedLang.current !== current.language) return;
      acceptSavedGame(result);
      setError(false);
      setRecovered(true);
    } catch (err) {
      if (!mounted.current || gameRef.current?.id !== current.id || selectedLang.current !== current.language) return;
      if (err instanceof ApiError && err.status === 410) refreshToday();
      else setError(true);
    } finally { inFlight.current = false; setBusy(false); }
  }, [acceptSavedGame, refreshToday]);

  useEffect(() => {
    const disconnected = () => { setOffline(true); setRecovered(false); };
    const connected = () => { setOffline(false); void reconnect(); };
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", connected);
    return () => {
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("online", connected);
    };
  }, [reconnect]);

  useEffect(() => {
    // Preserve native keyboard activation of Start/Resume/result buttons outside active play.
    if (!game || game.status !== "playing") return;
    function onKey(e: KeyboardEvent) {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof HTMLElement &&
          /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))
      )
        return;
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        removeLetter();
      } else if (isValidLetter(e.key, lang)) addLetter(e.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, removeLetter, addLetter, lang, game?.status]);

  if (!game)
    return (
      <div className="page-center">
        <div className="result-card daily-start-card">
          <h1>
            {t(
              available?.state === "playing"
                ? "daily.resumeTitle"
                : "daily.title",
            )}
          </h1>
          <p>{t("daily.desc")}</p>
          <GameModeInfo />
          {lookup === "loading" && <p role="status">{t("daily.loading")}</p>}
          {dayChanged && <p role="status">{t("daily.dayChanged")}</p>}
          {lookup === "ready" && available && (
            <p>
              {t("daily.puzzleDay", {
                date: available.game?.date ?? available.date,
                timeZone: available.timeZone,
              })}
            </p>
          )}
          {lookup === "ready" && !alreadyPlayed && (
            <p id="daily-timer-rule">
              {t(
                available?.state === "playing"
                  ? "daily.resumeRule"
                  : available?.state === "finished"
                    ? "daily.finishedRule"
                    : "daily.startRule",
              )}
            </p>
          )}
          {lookup !== "error" && (
            <button
              className="btn-primary"
              onClick={start}
              aria-describedby={
                lookup === "ready" && !alreadyPlayed
                  ? "daily-timer-rule"
                  : undefined
              }
              disabled={lookup !== "ready" || busy || alreadyPlayed}
            >
              {t(
                lookup === "loading"
                  ? "daily.loading"
                  : available?.state === "playing"
                    ? "daily.resume"
                    : available?.state === "finished"
                      ? "daily.viewResult"
                      : "daily.start",
              )}
            </button>
          )}
          {lookup === "error" && (
            <div role="alert">
              <p>{t("daily.statusError")}</p>
              <button onClick={() => setLookupVersion((v) => v + 1)}>
                {t("daily.retryStatus")}
              </button>
            </div>
          )}
          {verificationNeeded && (
            <Link to="/account">{t("account.verifyToPlay")}</Link>
          )}
          {alreadyPlayed && <p>{t("daily.alreadyPlayed")}</p>}
          {error && <p role="alert">{t("daily.saveError")}</p>}
        </div>
      </div>
    );
  const state: GameState = {
    answer: game.answer ?? "",
    definition: "",
    guesses: game.guesses,
    currentGuess: guess,
    status: game.status,
    maxAttempts: 6,
    wordLength: 5,
    lang,
    keyboard: buildKeyboardState(game.guesses),
    startedAt: 0,
  };
  const seconds = Math.floor(elapsed / 1000);
  const timer = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return (
    <div className="game-page">
      <GameModeInfo />
      <Confetti active={game.status === "won"} />
      {offline && <p role="status">{t("daily.offlineRule")}</p>}
      {pending && <p role="status">{t("daily.pendingRule")}</p>}
      {recovered && <p role="status">{t("daily.reconnected")}</p>}
      <p>{game.date}</p>
      <p>{t("daily.rolloverRule")}</p>
      <div className="daily-timer" aria-label={t("daily.elapsed")}>
        {timer}
      </div>
      <Board state={state} shakeRow={false} />
      <Keyboard
        keyboard={state.keyboard}
        onKey={addLetter}
        onEnter={() => void submit()}
        onBackspace={removeLetter}
        disabled={busy || game.status !== "playing"}
        lang={lang}
      />
      {(error || pending) && game.status === "playing" && (
        <div role={error ? "alert" : undefined}>
          {error && <p>{t("daily.saveError")}</p>}
          <button onClick={() => void submit()} disabled={busy || offline || guess.length !== 5}>
            {t("daily.retry")}
          </button>
          <button onClick={() => void reconnect()} disabled={busy || offline}>{t("daily.checkSaved")}</button>
        </div>
      )}
      {game.status !== "playing" && (
        <div className="result-card" role="status">
          <p>{t(game.status === "won" ? "game.congrats" : "game.gameOver")}</p>
          <p>
            {t("game.word")}: {game.answer}
          </p>
          <p>{t("daily.confirmedScore", { score: game.score })}</p>
          <DailyResultStats language={game.language} gameId={game.id} />
          <DailyCountdown key={game.id} language={game.language} gameDate={game.date} onCheckToday={refreshToday} />
          <button
            className="btn-share"
            onClick={async () => {
              if (await copyToClipboard(buildShareText(state, "daily")))
                toast.success(t("game.copied"));
            }}
          >
            {t("game.share")}
          </button>
          <Link to="/leaderboard" className="btn-primary">
            {t("daily.goToLeaderboard")}
          </Link>
        </div>
      )}
    </div>
  );
}
