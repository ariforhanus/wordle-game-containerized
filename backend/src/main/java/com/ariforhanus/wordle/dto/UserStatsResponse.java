package com.ariforhanus.wordle.dto;

import java.util.Map;

public record UserStatsResponse(
        long totalGames,
        int bestScore,
        double averageScore,
        double averageDurationSeconds,
        Map<String, Long> gamesPerLanguage,
        int currentStreak,
        int bestStreak
) {}

