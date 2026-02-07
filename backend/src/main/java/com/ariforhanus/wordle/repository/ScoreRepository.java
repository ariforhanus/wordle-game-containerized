package com.ariforhanus.wordle.repository;

import com.ariforhanus.wordle.entity.Score;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ScoreRepository extends JpaRepository<Score, Long> {
    List<Score> findTop10ByLanguageOrderByScoreDesc(String language);
    List<Score> findTop100ByLanguageOrderByScoreDesc(String language);

    @Query("select s from Score s where s.language = :language and s.wonAt between :start and :end order by s.score desc")
    List<Score> findTopDaily(String language, Instant start, Instant end);

    /**
     * Daily challenge: Kullanıcının bugün bu dilde oynayıp oynamadığını kontrol et
     */
    Optional<Score> findByUserIdAndPlayedAtAndLanguage(Long userId, LocalDate playedAt, String language);

    /**
     * Günlük leaderboard (playedAt + language bazlı)
     */
    List<Score> findByPlayedAtAndLanguageOrderByScoreDesc(LocalDate playedAt, String language);

    /**
     * Bir kullanıcının tüm skorları (istatistikler için)
     */
    List<Score> findByUserId(Long userId);

}
