package com.ariforhanus.wordle.repository;

import com.ariforhanus.wordle.entity.Score;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ScoreRepository extends JpaRepository<Score, Long> {
    List<Score> findTop10ByLanguageAndWonTrueOrderByScoreDescWonAtAscIdAsc(String language);

    /**
     * Leaderboard query with LIMIT pushed to DB level. Only includes winners (won = true). Period
     * membership uses puzzle played_at, not completion time. Tie-breaker: same score → earlier win
     * time ranks higher.
     */
    @Query(
            value =
                    "SELECT * FROM scores WHERE language = :language AND won = true AND played_at"
                        + " >= :start AND played_at < :end ORDER BY score DESC, won_at ASC, user_id"
                        + " ASC, id ASC LIMIT :lim",
            nativeQuery = true)
    List<Score> findTopByLanguageAndPeriod(
            @Param("language") String language,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end,
            @Param("lim") int limit);

    @Query(
            value =
                    """
                    SELECT s.user_id AS "userId", u.username AS "username", SUM(s.score) AS "totalScore",
                           COUNT(*) AS "wins", MAX(s.won_at) AS "lastWinAt"
                    FROM scores s JOIN users u ON u.id = s.user_id
                    WHERE s.language = :language AND s.won = true
                      AND s.played_at >= :start AND s.played_at < :end
                    GROUP BY s.user_id, u.username
                    ORDER BY SUM(s.score) DESC, MAX(s.won_at) ASC, s.user_id ASC
                    LIMIT :lim
                    """,
            nativeQuery = true)
    List<PeriodTotal> totalByLanguageAndPeriod(
            @Param("language") String language,
            @Param("start") LocalDate start,
            @Param("end") LocalDate end,
            @Param("lim") int limit);

    interface PeriodTotal {
        Long getUserId();

        String getUsername();

        long getTotalScore();

        long getWins();

        java.time.Instant getLastWinAt();
    }

    @Query(
            value = "SELECT id AS \"userId\", username FROM users WHERE id IN (:ids)",
            nativeQuery = true)
    List<CurrentName> currentNames(@Param("ids") java.util.Collection<Long> ids);

    interface CurrentName {
        Long getUserId();

        String getUsername();
    }

    /** Daily challenge: check if user already played today in this language */
    Optional<Score> findByUserIdAndPlayedAtAndLanguage(
            Long userId, LocalDate playedAt, String language);

    long countByUserId(Long userId);

    @Query("select count(distinct s.userId) from Score s where s.playedAt = :date")
    long countPlayersOn(@Param("date") LocalDate date);

    @Query("select count(distinct s.userId) from Score s where s.playedAt >= :date")
    long countPlayersSince(@Param("date") LocalDate date);

    @Query(
            "select s.language as language, count(s) as games, sum(case when s.won=true then 1 else"
                + " 0 end) as wins, sum(s.score) as points, sum(s.durationMs) as duration,"
                + " max(s.score) as bestScore from Score s where s.userId=:userId and s.playedAt <="
                + " :today group by s.language")
    List<LanguageSummary> languageSummaries(
            @Param("userId") Long userId, @Param("today") LocalDate today);

    interface LanguageSummary {
        String getLanguage();

        long getGames();

        long getWins();

        long getPoints();

        long getDuration();

        int getBestScore();
    }

    @Query(
            "select s.language as language, s.attempts as attempts, count(s) as wins from Score s"
                    + " where s.userId=:userId and s.playedAt <= :today and s.won=true group by"
                    + " s.language,s.attempts")
    List<GuessCount> guessCounts(@Param("userId") Long userId, @Param("today") LocalDate today);

    interface GuessCount {
        String getLanguage();

        int getAttempts();

        long getWins();
    }

    @Query(
            value =
                    """
                    WITH wins AS (
                      SELECT user_id, language, played_at,
                             played_at - (row_number() OVER (PARTITION BY user_id,language ORDER BY played_at))::integer AS island
                      FROM scores WHERE user_id IN (:ids) AND won=true AND played_at <= :today
                    ), runs AS (
                      SELECT user_id,language,COUNT(*) AS length,MAX(played_at) AS last_day
                      FROM wins GROUP BY user_id,language,island
                    ), ordered AS (
                      SELECT *,row_number() OVER (PARTITION BY user_id,language ORDER BY last_day DESC) AS position FROM runs
                    )
                    SELECT r.user_id AS "userId",r.language AS "language",MAX(r.length)::integer AS "bestStreak",
                           CASE WHEN EXISTS (
                             SELECT 1 FROM scores s WHERE s.user_id=r.user_id AND s.language=r.language
                               AND s.played_at=:today AND s.won=false
                           ) THEN 0 ELSE COALESCE(MAX(r.length) FILTER (
                               WHERE r.position=1 AND r.last_day >= (CAST(:today AS date)-1)),0)::integer END AS "currentStreak"
                    FROM ordered r GROUP BY r.user_id,r.language
                    """,
            nativeQuery = true)
    List<LanguageStreak> streaksForUsers(
            @Param("ids") java.util.Collection<Long> ids, @Param("today") LocalDate today);

    interface LanguageStreak {
        Long getUserId();

        String getLanguage();

        int getCurrentStreak();

        int getBestStreak();
    }
}
