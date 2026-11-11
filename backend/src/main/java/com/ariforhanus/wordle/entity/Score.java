package com.ariforhanus.wordle.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(
        name = "scores",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_score_daily",
                        columnNames = {"userId", "playedAt", "language"}),
        indexes = {
            @Index(name = "idx_scores_score_desc", columnList = "score"),
            @Index(name = "idx_scores_won_at", columnList = "wonAt"),
            @Index(name = "idx_scores_user_date_lang", columnList = "userId, playedAt, language")
        })
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @NotBlank
    @Size(min = 2, max = 64)
    @Column(nullable = false, length = 64)
    private String username;

    @NotBlank
    @Size(min = 2, max = 5)
    @Column(nullable = false, length = 5)
    private String language = "en"; // en, tr

    @Min(1)
    @Max(6)
    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false)
    private long durationMs;

    @Column(nullable = false)
    private Instant wonAt;

    @Column(nullable = false)
    private LocalDate playedAt;

    @Column(nullable = false)
    private int score;

    @Size(max = 5)
    private String word;

    /**
     * Whether the player won (true) or lost (false). Defaults to true for backward compatibility.
     */
    @Column(nullable = false)
    private boolean won = true;

    public Score() {}

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public LocalDate getPlayedAt() {
        return playedAt;
    }

    public void setPlayedAt(LocalDate playedAt) {
        this.playedAt = playedAt;
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

    public boolean isWon() {
        return won;
    }

    public void setWon(boolean won) {
        this.won = won;
    }
}
