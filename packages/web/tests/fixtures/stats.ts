import type { UserStats, LanguageStats } from "@wordle/api";

/** Deliberately different per-language histories expose accidental cross-language rendering. */
export function statsFixture(language = "en"): UserStats {
  const byLanguage: Record<string, LanguageStats> = {
    en: {
      totalGames: 4,
      wins: 3,
      bestScore: 9999,
      averageScore: 7500,
      averageDurationSeconds: 2,
      currentStreak: 3,
      bestStreak: 3,
      guessDistribution: { 1: 2, 2: 1 },
    },
    tr: {
      totalGames: 3,
      wins: 2,
      bestScore: 6000,
      averageScore: 4000,
      averageDurationSeconds: 2,
      currentStreak: 0,
      bestStreak: 2,
      guessDistribution: { 2: 2 },
    },
  };
  return {
    totalGames: 7,
    bestScore: 9999,
    averageScore: 6000,
    averageDurationSeconds: 2,
    gamesPerLanguage: { en: 4, tr: 3 },
    currentStreak: byLanguage[language].currentStreak,
    bestStreak: byLanguage[language].bestStreak,
    guessDistribution: { 1: 2, 2: 3 },
    language,
    byLanguage,
  };
}
