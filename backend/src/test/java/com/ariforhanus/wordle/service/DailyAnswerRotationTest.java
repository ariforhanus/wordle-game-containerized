package com.ariforhanus.wordle.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

class DailyAnswerRotationTest {
    private final List<String> answers = List.of("APPLE", "CIGAR", "REBUT");

    @Test
    void unseenAnswersTakePriorityOverBothOldAndRecentAnswers() {
        assertEquals(
                List.of("REBUT"),
                DailyPuzzleService.candidates(answers, Map.of("APPLE", 60, "CIGAR", 1)));
    }

    @Test
    void exhaustedPoolsRandomizeAcrossEligibleOldAnswersRatherThanRepeatingAFixedCycle() {
        assertEquals(
                List.of("APPLE", "CIGAR"),
                DailyPuzzleService.candidates(
                        answers, Map.of("APPLE", 30, "CIGAR", 60, "REBUT", 29)));
    }

    @Test
    void insufficientPoolsKeepOnlyTheFarthestCandidatesIncludingTies() {
        assertEquals(
                List.of("APPLE", "CIGAR"),
                DailyPuzzleService.candidates(answers, Map.of("APPLE", 3, "CIGAR", 3, "REBUT", 1)));
    }
}
