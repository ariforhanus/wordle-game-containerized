package com.ariforhanus.wordle.service;


import com.ariforhanus.wordle.dto.ScoreRequest;
import com.ariforhanus.wordle.dto.ScoreResponse;
import com.ariforhanus.wordle.dto.UserStatsResponse;
import com.ariforhanus.wordle.entity.Score;
import com.ariforhanus.wordle.repository.ScoreRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.time.LocalDate;
import java.util.stream.Collectors;

@Service
public class ScoreService {

    private final ScoreRepository repo;

    private static final int BASE = 10_000;
    private static final int ATTEMPT_PENALTY = 1_000;
    private static final int SECOND_PENALTY = 7;

    public ScoreService(ScoreRepository repo){
        this.repo = repo;
    }

    /**
     * Daily challenge için skor kaydet
     */
    public ScoreResponse saveForDaily(Long userId, String username, String language, ScoreRequest req) {
        // Bugün bu dilde zaten oynadı mı kontrol et
        Optional<Score> existing = repo.findByUserIdAndPlayedAtAndLanguage(userId, LocalDate.now(), language);
        if (existing.isPresent()) {
            throw new IllegalStateException("User already played today in " + language);
        }
        
        int score = calcScore(req.getAttempts(), req.getDurationMs());
        Score s = new Score(
                userId,
                username,
                language,
                req.getAttempts(),
                req.getDurationMs(),
                score,
                req.getWord()
        );
        Score saved = repo.save(s);
        return toResp(saved);
    }

    /**
     * Kullanıcı bugün bu dilde daily challenge oynadı mı?
     */
    public Optional<ScoreResponse> getDailyStatus(Long userId, String language) {
        return repo.findByUserIdAndPlayedAtAndLanguage(userId, LocalDate.now(), language)
                .map(this::toResp);
    }

    public List<ScoreResponse> topGlobal(String language){
        List<Score> list = repo.findTop10ByLanguageOrderByScoreDesc(language);
        return list.stream().map(this::toResp).collect(Collectors.toList());
    }

    public List<ScoreResponse> dailyTop(String language, int limit, ZoneId zone){
        Instant start = ZonedDateTime.now(zone).toLocalDate().atStartOfDay(zone).toInstant();
        Instant end =  ZonedDateTime.now(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant();

        List<Score> list = repo.findTopDaily(language, start, end);

        return list.stream().limit(limit).map(this::toResp).collect(Collectors.toList());
    }

    /**
     * Kullanıcının temel istatistiklerini döner.
     * Şu an için yalnızca kazandığı oyunlar kaydedildiğinden totalGames = totalWins kabul edilir.
     */
    public UserStatsResponse statsForUser(Long userId) {
        List<Score> all = repo.findByUserId(userId);
        if (all.isEmpty()) {
            return new UserStatsResponse(0, 0, 0.0, 0.0, Map.of(), 0, 0);
        }

        long totalGames = all.size();
        int bestScore = all.stream().mapToInt(Score::getScore).max().orElse(0);
        double avgScore = all.stream().mapToInt(Score::getScore).average().orElse(0.0);
        double avgDurationSec = all.stream()
                .mapToLong(Score::getDurationMs)
                .average()
                .orElse(0.0) / 1000.0;

        Map<String, Long> perLang = all.stream()
                .collect(Collectors.groupingBy(Score::getLanguage, Collectors.counting()));

        // Streak hesapla (kullanıcının tüm günleri üzerinden)
        StreakResult streak = calculateStreak(all);

        return new UserStatsResponse(
                totalGames,
                bestScore,
                avgScore,
                avgDurationSec,
                perLang,
                streak.currentStreak(),
                streak.bestStreak()
        );
    }


    private int calcScore(int attempts, long durationMs){
        long seconds = durationMs /1000L;
        long penalty = (long) attempts * ATTEMPT_PENALTY + seconds * SECOND_PENALTY;
        long result = BASE - penalty;
        if(result < 0) result = 0;
        if (result > Integer.MAX_VALUE) result = Integer.MAX_VALUE;
        return (int) result;
    }

    /**
     * Bir kullanıcının mevcut (son oynadığı güne kadar) ve en iyi streak değerlerini hesaplar.
     */
    private StreakResult calculateStreak(List<Score> scores) {
        if (scores == null || scores.isEmpty()) {
            return new StreakResult(0, 0);
        }

        // Aynı gün içinde birden fazla skor olursa (farklı diller), tek güne indir.
        List<LocalDate> days = scores.stream()
                .map(Score::getPlayedAt)
                .distinct()
                .sorted()
                .toList();

        if (days.isEmpty()) {
            return new StreakResult(0, 0);
        }

        int best = 1;
        int currentSeq = 1;

        for (int i = 1; i < days.size(); i++) {
            LocalDate prev = days.get(i - 1);
            LocalDate cur = days.get(i);
            if (cur.minusDays(1).equals(prev)) {
                currentSeq++;
            } else {
                currentSeq = 1;
            }
            if (currentSeq > best) {
                best = currentSeq;
            }
        }

        // Current streak: en son oynadığı günden geriye doğru kesintisiz gün sayısı
        int current = 1;
        LocalDate cursor = days.get(days.size() - 1);
        for (int i = days.size() - 2; i >= 0; i--) {
            LocalDate prev = days.get(i);
            if (cursor.minusDays(1).equals(prev)) {
                current++;
                cursor = prev;
            } else {
                break;
            }
        }

        return new StreakResult(current, best);
    }

    /**
     * Leaderboard satırları için kullanıcının current streak'ini hesaplar.
     */
    private int currentStreakForUser(Long userId) {
        List<Score> all = repo.findByUserId(userId);
        StreakResult sr = calculateStreak(all);
        return sr.currentStreak();
    }

    private ScoreResponse toResp(Score s){
        int currentStreak = currentStreakForUser(s.getUserId());
        return new ScoreResponse(
                s.getScore(),
                s.getAttempts(),
                s.getUsername(),
                s.getId(),
                s.getDurationMs(),
                s.getWord(),
                s.getWonAt(),
                currentStreak
        );
    }

    private record StreakResult(int currentStreak, int bestStreak) {}
}
