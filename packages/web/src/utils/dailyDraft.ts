import type { DailyGame } from "@wordle/api";
import { isValidLetter, toUpperCase } from "@wordle/engine";

const key = (language: string) => `wordle_daily_draft_${language}`;
export function clearDailyDraft(language: string): void {
  try { sessionStorage.removeItem(key(language)); } catch { /* Storage is optional. */ }
}
export function saveDailyDraft(game: DailyGame, guess: string, pending: boolean): void {
  if (game.status !== "playing" || !guess) return clearDailyDraft(game.language);
  try {
    sessionStorage.setItem(key(game.language), JSON.stringify({
      gameId: game.id, date: game.date, language: game.language,
      attempt: game.guesses.length + 1, guess, pending,
    }));
  } catch { /* A full/disabled store must not prevent online play. */ }
}
export function restoreDailyDraft(game: DailyGame): { guess: string; pending: boolean } {
  const empty = { guess: "", pending: false };
  if (game.status !== "playing") { clearDailyDraft(game.language); return empty; }
  try {
    const raw = sessionStorage.getItem(key(game.language));
    if (!raw) return empty;
    if (raw.length > 512) throw new Error("Oversized draft");
    const saved = JSON.parse(raw);
    if (!saved || saved.gameId !== game.id || saved.date !== game.date || saved.language !== game.language ||
        !Number.isInteger(saved.attempt) || saved.attempt < 1 || saved.attempt > game.guesses.length + 1 ||
        typeof saved.pending !== "boolean" || typeof saved.guess !== "string" || saved.guess.length < 1 || saved.guess.length > 5 ||
        (saved.pending && saved.guess.length !== 5) ||
        Array.from(saved.guess as string).some((letter) => !isValidLetter(letter, game.language) || letter !== toUpperCase(letter, game.language))) {
      throw new Error("Unrelated or invalid draft");
    }
    if (saved.attempt <= game.guesses.length) {
      if (saved.pending && game.guesses[saved.attempt - 1].guess === saved.guess) {
        clearDailyDraft(game.language);
        return empty;
      }
      // Another session advanced the board: preserve text as a draft, never auto-submit it.
      return { guess: saved.guess, pending: false };
    }
    return { guess: saved.guess, pending: saved.pending };
  } catch {
    clearDailyDraft(game.language);
    return empty;
  }
}
