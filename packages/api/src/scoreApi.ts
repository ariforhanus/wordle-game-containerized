import { get, post } from "./client.js";
import type { ScoreRequest, ScoreResponse, DailyStatus, UserStats } from "./types.js";

export function submitScore(
  lang: string,
  score: ScoreRequest
): Promise<ScoreResponse> {
  return post<ScoreResponse>(`/api/v1/scores?lang=${lang}`, score);
}

export function getDailyStatus(lang: string): Promise<DailyStatus> {
  return get<DailyStatus>(`/api/v1/daily/status?lang=${lang}`);
}

export function getDailyLeaderboard(
  lang: string
): Promise<ScoreResponse[]> {
  return get<ScoreResponse[]>(`/api/v1/leaderboard/daily?lang=${lang}`);
}

export function getMyStats(): Promise<UserStats> {
  return get<UserStats>(`/api/v1/stats/me`);
}
