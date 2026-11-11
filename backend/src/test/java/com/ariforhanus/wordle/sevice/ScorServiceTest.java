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
}
