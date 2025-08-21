package com.ariforhanus.wordle.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

@Entity
@Table(name = "scores", indexes = {
        @Index(name = "idx_scores_score_desc", columnList = "score"),
        @Index(name = "idx_scores_won_at", columnList = "wonAt")
})
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank
    @Size(min = 2, max = 20)
    @Column(nullable = false, length = 20)
    private String username;

    @Min(1) @Max(6)
    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false)
    private long durationMs;

    @Column(nullable = false)
    private Instant wonAt = Instant.now();

    @Column(nullable = false)
    private int score;

    @Size(max = 5)
    private String word;

    public Score(){}

    public Score(String username, int attempts, long durationMs, int score, String word) {
        this.username = username;
        this.attempts = attempts;
        this.durationMs = durationMs;
        this.score = score;
        this.word = word;
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public Instant getWonAt() {
        return wonAt;
    }

    public void setWonAt(Instant wonAt) {
        this.wonAt = wonAt;
    }

    public int getScore() {
        return score;
    }

    public void setScore(int score) {
        this.score = score;
    }

    public String getWord() {
        return word;
    }

    public void setWord(String word) {
        this.word = word;
    }
}
