import { get, post } from "./client.js";
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
  );
}
export function load(id: string): Promise<DailyGame> {
  return get(`/api/v1/daily/games/${encodeURIComponent(id)}`);
}
export function guess(
  id: string,
  guess: string,
  attempt: number,
): Promise<DailyGame> {
  return post(`/api/v1/daily/games/${encodeURIComponent(id)}/guesses`, {
    guess,
    attempt,
  });
}

export interface DailyGameStatus {
  date: string;
  timeZone: string;
  state: "not_started" | "playing" | "finished" | "already_played";
  game: DailyGame | null;
}
/** Read-only lookup: never creates a puzzle or starts a timer. */
export function status(lang: string): Promise<DailyGameStatus> {
  return get(`/api/v1/daily/games?lang=${encodeURIComponent(lang)}`);
}
