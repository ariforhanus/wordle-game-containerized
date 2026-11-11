package com.ariforhanus.wordle.dto;

import java.util.Map;

public record LanguageStatsResponse(
        long totalGames,
        long wins,
        int bestScore,
        double averageScore,
        double averageDurationSeconds,
        int currentStreak,
        int bestStreak,
        Map<Integer, Long> guessDistribution) {}
