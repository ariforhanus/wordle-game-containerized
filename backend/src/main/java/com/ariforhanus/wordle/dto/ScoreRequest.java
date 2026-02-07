package com.ariforhanus.wordle.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public class ScoreRequest {
    @Min(1) @Max(6)
    private int attempts;

    @Min(0)
    private long durationMs;

    @Size(max = 20)
    private String word;

    /** true if the player won, false if they lost (used all attempts) */
    private boolean won = true;

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public String getWord() {
        return word;
    }

    public void setWord(String word) {
        this.word = word;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public boolean isWon() {
        return won;
    }

    public void setWon(boolean won) {
        this.won = won;
    }
}
