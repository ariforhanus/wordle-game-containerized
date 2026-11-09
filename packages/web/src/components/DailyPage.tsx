import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { dailyGameApi, isAuthenticated, ApiError } from "@wordle/api";
import type { DailyGame } from "@wordle/api";
import { buildKeyboardState, isValidLetter, toUpperCase, type GameState } from "@wordle/engine";
import { useToast } from "./Toast";
import { usePageTitleKey } from "../hooks/usePageTitle";
import Board from "./Board";
import Keyboard from "./Keyboard";
import Confetti from "./Confetti";
import { buildShareText, copyToClipboard } from "../utils/shareResult";
import "./GamePage.css";
import "./DailyPage.css";

export default function DailyPage() {
 const { t, i18n } = useTranslation();
 const navigate = useNavigate();
 const toast = useToast();
 usePageTitleKey("seo.daily");
 const [game, setGame] = useState<DailyGame | null>(null);
 const [guess, setGuess] = useState("");
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState(false);
 const [alreadyPlayed, setAlreadyPlayed] = useState(false);
 const [elapsed, setElapsed] = useState(0);
 const inFlight = useRef(false);
 const selectedLang = useRef(i18n.language);
 selectedLang.current = i18n.language;
 const lang = game?.language ?? i18n.language;

 useEffect(() => { if (!isAuthenticated()) navigate("/login"); }, [navigate]);
 // Sessions and puzzle dates are stored by the server, so changing device or tab resumes the same game.
 useEffect(() => { setGame(null); setGuess(""); setError(false); setAlreadyPlayed(false); }, [i18n.language]);
 useEffect(() => {
  if (!game) return;
  const receivedAt = Date.now();
  setElapsed(game.elapsedMs);
  if (game.status !== "playing") return;
  const timer = window.setInterval(() => setElapsed(game.elapsedMs + Date.now() - receivedAt), 1000);
  return () => clearInterval(timer);
 }, [game]);

 async function start() {
  if (inFlight.current) return;
  inFlight.current = true; setBusy(true); setError(false);
  try { const result = await dailyGameApi.start(i18n.language); if (result.language === selectedLang.current) setGame(result); }
  catch (err) { if (err instanceof ApiError && err.status === 409) setAlreadyPlayed(true); else setError(true); }
  finally { inFlight.current = false; setBusy(false); }
 }
 const addLetter = useCallback((letter: string) => {
  if (inFlight.current || game?.status !== "playing") return;
  const upper = toUpperCase(letter, lang);
  if (isValidLetter(upper, lang)) setGuess(g => g.length < 5 ? g + upper : g);
 }, [game?.status, lang]);
 const removeLetter = useCallback(() => {
  if (!inFlight.current) setGuess(g => g.slice(0, -1));
 }, []);
 const submit = useCallback(async () => {
  if (!game || game.status !== "playing" || guess.length !== 5 || inFlight.current) return;
  inFlight.current = true; setBusy(true); setError(false);
  try {
   const updated = await dailyGameApi.guess(game.id, guess, game.guesses.length + 1);
   if (updated.language === selectedLang.current) { setGame(updated); setGuess(""); }
  } catch (err) {
   if (err instanceof ApiError && err.status === 400) toast.warning(t("game.invalidWord"));
   else if (err instanceof ApiError && err.status === 409) {
    try { const result = await dailyGameApi.load(game.id); if (result.language === selectedLang.current) { setGame(result); setGuess(""); } }
    catch (err) { if (err instanceof ApiError && err.status === 409) setAlreadyPlayed(true); else setError(true); }
   } else setError(true);
   // Keep the same guess and turn on network failure. Retrying is idempotent on the server.
  } finally { inFlight.current = false; setBusy(false); }
 }, [game, guess, toast, t]);
 useEffect(() => {
  function onKey(e: KeyboardEvent) {
   if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
   if (e.key === "Enter") { e.preventDefault(); void submit(); }
   else if (e.key === "Backspace") { e.preventDefault(); removeLetter(); }
   else if (isValidLetter(e.key, lang)) addLetter(e.key);
  }
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
 }, [submit, removeLetter, addLetter, lang]);

 if (!game) return <div className="page-center"><div className="result-card daily-start-card">
  <h1>{t("daily.title")}</h1><p>{t("daily.desc")}</p>
  <button className="btn-primary" onClick={start} disabled={busy || alreadyPlayed}>{t("daily.startResume")}</button>
  {alreadyPlayed && <p>{t("daily.alreadyPlayed")}</p>}
  {error && <p role="alert">{t("daily.saveError")}</p>}
 </div></div>;
 const state: GameState = {
  answer: game.answer ?? "", definition: "", guesses: game.guesses, currentGuess: guess,
  status: game.status, maxAttempts: 6, wordLength: 5, lang, keyboard: buildKeyboardState(game.guesses), startedAt: 0,
 };
 const seconds = Math.floor(elapsed / 1000);
 const timer = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
 return <div className="game-page">
  <Confetti active={game.status === "won"} />
  <p>{game.date}</p><div className="daily-timer" aria-label={t("daily.elapsed")}>{timer}</div>
  <Board state={state} shakeRow={false} />
  <Keyboard keyboard={state.keyboard} onKey={addLetter} onEnter={() => void submit()} onBackspace={removeLetter}
   disabled={busy || game.status !== "playing"} lang={lang} />
  {error && <div role="alert"><p>{t("daily.saveError")}</p><button onClick={() => void submit()} disabled={busy}>{t("daily.retry")}</button></div>}
  {game.status !== "playing" && <div className="result-card" role="status">
   <p>{t(game.status === "won" ? "game.congrats" : "game.gameOver")}</p>
   <p>{t("game.word")}: {game.answer}</p><p>{t("daily.confirmedScore", { score: game.score })}</p>
   <button className="btn-share" onClick={async () => {
    if (await copyToClipboard(buildShareText(state, "daily"))) toast.success(t("game.copied"));
   }}>{t("game.share")}</button>
   <Link to="/leaderboard" className="btn-primary">{t("daily.goToLeaderboard")}</Link>
  </div>}
 </div>;
}
