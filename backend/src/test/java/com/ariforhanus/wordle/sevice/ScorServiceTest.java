package com.ariforhanus.wordle.sevice;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.service.ScoreService;

import org.junit.jupiter.api.Test;

class ScorServiceTest {
    @Test
    void scoreUsesAttemptsAndServerDuration() {
        assertEquals(6992, ScoreService.calculateScore(3, 1500));
        assertEquals(9999, ScoreService.calculateScore(1, 0));
        assertEquals(1000, ScoreService.calculateScore(6, 300000));
        assertEquals(0, ScoreService.calculateScore(7, 0));
    }

    @Test
    void tiersNeverOverlap() {
        for (int i = 1; i < 6; i++)
            assertTrue(
                    ScoreService.calculateScore(i, 300000) > ScoreService.calculateScore(i + 1, 0));
    }

    @Test
    void lossTodayBreaksCurrentStreakButNotBestStreak() {
        var repo =
                org.mockito.Mockito.mock(com.ariforhanus.wordle.repository.ScoreRepository.class);
        var today = java.time.LocalDate.now(java.time.ZoneId.of("Europe/Istanbul"));
        var win = new com.ariforhanus.wordle.entity.Score();
        win.setPlayedAt(today.minusDays(1));
        win.setWon(true);
        win.setAttempts(2);
        var loss = new com.ariforhanus.wordle.entity.Score();
        loss.setPlayedAt(today);
        loss.setWon(false);
        loss.setAttempts(6);
        org.mockito.Mockito.when(repo.findByUserId(1L)).thenReturn(java.util.List.of(win, loss));
        var stats = new ScoreService(repo, "Europe/Istanbul").statsForUser(1L);
        assertEquals(0, stats.currentStreak());
        assertEquals(1, stats.bestStreak());
        assertFalse(stats.guessDistribution().containsKey(6));
    }
}
