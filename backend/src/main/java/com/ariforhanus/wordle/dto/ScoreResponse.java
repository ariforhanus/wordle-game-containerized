package com.ariforhanus.wordle.dto;

import java.time.Instant;

public class ScoreResponse {

    private Long id;
    private String username;
    private int attempts;
    private long durationMs;
    private int score;
    private String word;
    private Instant wonAt;

    public ScoreResponse(int score, int attempts, String username, Long id, long durationMs, String word, Instant wonAt) {
        this.score = score;
        this.attempts = attempts;
        this.username = username;
        this.id = id;
        this.durationMs = durationMs;
        this.word = word;
        this.wonAt = wonAt;
    }

    public Long getId() {
        return id;
    }

    public int getAttempts() {
        return attempts;
    }

    public String getUsername() {
        return username;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public int getScore() {
        return score;
    }

    public String getWord() {
        return word;
    }

    public Instant getWonAt() {
        return wonAt;
    }
}
