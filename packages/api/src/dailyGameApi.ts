import { get, post } from "./client.js";
interface GuessResult { guess: string; statuses: ("correct" | "present" | "absent")[]; }
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
export function start(lang: string): Promise<DailyGame> {
 return post(`/api/v1/daily/games?lang=${encodeURIComponent(lang)}`, {});
}
export function load(id: string): Promise<DailyGame> {
 return get(`/api/v1/daily/games/${encodeURIComponent(id)}`);
}
export function guess(id: string, guess: string, attempt: number): Promise<DailyGame> {
 return post(`/api/v1/daily/games/${encodeURIComponent(id)}/guesses`, { guess, attempt });
}
