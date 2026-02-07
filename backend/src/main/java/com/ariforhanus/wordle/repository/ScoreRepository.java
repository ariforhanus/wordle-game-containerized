package com.ariforhanus.wordle.repository;

import com.ariforhanus.wordle.entity.Score;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ScoreRepository extends JpaRepository<Score, Long> {
    List<Score> findTop10ByLanguageOrderByScoreDesc(String language);

    /**
     * Leaderboard query with LIMIT pushed to DB level.
     * Only includes winners (won = true).
     * Tie-breaker: same score → earlier win time ranks higher.
     */
    @Query(value = "SELECT * FROM scores WHERE language = :language AND won = true AND won_at BETWEEN :start AND :end ORDER BY score DESC, won_at ASC LIMIT :lim",
            nativeQuery = true)
    List<Score> findTopByLanguageAndPeriod(
            @Param("language") String language,
            @Param("start") Instant start,
            @Param("end") Instant end,
            @Param("lim") int limit
    );

    /**
     * Daily challenge: check if user already played today in this language
     */
    Optional<Score> findByUserIdAndPlayedAtAndLanguage(Long userId, LocalDate playedAt, String language);

    /**
     * All scores for a user (for stats/streak calculation)
     */
    List<Score> findByUserId(Long userId);
}
