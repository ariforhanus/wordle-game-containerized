import { get, post } from "./client.js";
import type {
  ScoreRequest,
  ScoreResponse,
  LeaderboardTotal,
  DailyStatus,
  UserStats,
} from "./types.js";

export function submitScore(
  lang: string,
  score: ScoreRequest,
): Promise<ScoreResponse> {
  return post<ScoreResponse>(`/api/v1/scores?lang=${lang}`, score);
}

export function getDailyStatus(lang: string): Promise<DailyStatus> {
  return get<DailyStatus>(`/api/v1/daily/status?lang=${lang}`);
}

export function getDailyLeaderboard(lang: string): Promise<ScoreResponse[]> {
  return get<ScoreResponse[]>(`/api/v1/leaderboard/daily?lang=${lang}`);
}

export function getWeeklyLeaderboard(
  lang: string,
): Promise<LeaderboardTotal[]> {
  return get<LeaderboardTotal[]>(`/api/v1/leaderboard/weekly?lang=${lang}`);
}

export function getMonthlyLeaderboard(
  lang: string,
): Promise<LeaderboardTotal[]> {
  return get<LeaderboardTotal[]>(`/api/v1/leaderboard/monthly?lang=${lang}`);
}

export function getMyStats(lang = "en"): Promise<UserStats> {
  return get<UserStats>(`/api/v1/stats/me?lang=${encodeURIComponent(lang)}`);
}
