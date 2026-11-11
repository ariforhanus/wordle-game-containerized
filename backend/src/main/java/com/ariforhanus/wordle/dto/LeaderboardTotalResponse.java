package com.ariforhanus.wordle.dto;

import java.time.Instant;

/** Period totals are player records, not individual game-score records. */
public record LeaderboardTotalResponse(
        Long userId,
        String username,
        long totalScore,
        long wins,
        Instant lastWinAt,
        int currentStreak) {
    /** Compatibility for cached leaderboard clients: id is a user identity for period totals. */
    public Long getId() {
        return userId;
    }

    public long getScore() {
        return totalScore;
    }
}
