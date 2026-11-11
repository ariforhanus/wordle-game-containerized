import { get, post } from "./client.js";
// A timeout does not prove a POST was rejected: the UI retains its exact pending draft.
const REQUEST_TIMEOUT_MS = 15000;

interface GuessResult {
  guess: string;
  statuses: ("correct" | "present" | "absent")[];
}
export interface DailyGame {
  id: string;
  date: string;
  language: string;
  status: "playing" | "won" | "lost";
  elapsedMs: number;
  guesses: GuessResult[];
  answer: string | null;
  score: number | null;
}
export function start(lang: string, date?: string): Promise<DailyGame> {
  return post(
    `/api/v1/daily/games?lang=${encodeURIComponent(lang)}${date ? `&date=${encodeURIComponent(date)}` : ""}`,
    {},
    REQUEST_TIMEOUT_MS,
  );
}
export function load(id: string): Promise<DailyGame> {
  return get(`/api/v1/daily/games/${encodeURIComponent(id)}`, REQUEST_TIMEOUT_MS);
}
export function guess(
  id: string,
  guess: string,
  attempt: number,
): Promise<DailyGame> {
  return post(`/api/v1/daily/games/${encodeURIComponent(id)}/guesses`, {
    guess,
    attempt,
  }, REQUEST_TIMEOUT_MS);
}

export interface DailyGameStatus {
  // Optional for cached clients talking to an older backend; countdown fails closed.
  serverNow?: string;
  nextGameAt?: string;
  date: string;
  timeZone: string;
  state: "not_started" | "playing" | "finished" | "already_played";
  game: DailyGame | null;
}
/** Read-only lookup: never creates a puzzle or starts a timer. */
export function status(lang: string): Promise<DailyGameStatus> {
  return get(`/api/v1/daily/games?lang=${encodeURIComponent(lang)}`, REQUEST_TIMEOUT_MS);
}
