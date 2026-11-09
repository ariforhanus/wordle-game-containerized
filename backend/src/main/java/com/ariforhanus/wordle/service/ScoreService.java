package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.dto.ScoreResponse;
import com.ariforhanus.wordle.dto.UserStatsResponse;
import com.ariforhanus.wordle.entity.Score;
import com.ariforhanus.wordle.repository.ScoreRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ScoreService {

    private final ScoreRepository repo;
    private final ZoneId appZone;
    private final java.time.Clock clock;

    /**
     * Scoring system: 0–9999 range (stored and displayed as-is).
     *
     * <p>Attempt base (gap = 1500): 1 → 8500 4 → 4000 2 → 7000 5 → 2500 3 → 5500 6 → 1000
     *
     * <p>Time bonus: 0–1499 (max < gap → no tier overlap) Decays 1 point per 200ms → at 300s (5
     * min) bonus = 0.
     *
     * <p>Gap (1500) > max time bonus (1499) → fewer attempts ALWAYS beats more attempts.
     *
     * <p>200ms resolution → ~1500 unique values per tier; ties are extremely rare.
     *
     * <p>Examples: 1 attempt, 3s → 8500 + 1484 = 9984 2 attempts, 20s → 7000 + 1399 = 8399 3
     * attempts, 60s → 5500 + 1199 = 6699 4 attempts, 90s → 4000 + 1049 = 5049 5 attempts, 3min →
     * 2500 + 599 = 3099 6 attempts, 5min → 1000 + 0 = 1000 Lost → 0
     */
    private static final int[] ATTEMPT_BASE = {0, 8500, 7000, 5500, 4000, 2500, 1000};

    private static final int TIME_BONUS_MAX = 1499;
    private static final int MS_PER_POINT = 200; // 1 point per 200ms

    public ScoreService(
            ScoreRepository repo,
            @Value("${app.timezone:Europe/Istanbul}") String timezone,
            java.time.Clock clock) {
        this.repo = repo;
        this.appZone = ZoneId.of(timezone);
        this.clock = clock;
    }

    // ── Daily score submission ──

    // ── Daily status check ──

    public Optional<ScoreResponse> getDailyStatus(Long userId, String language) {
        LocalDate today = ZonedDateTime.now(clock.withZone(appZone)).toLocalDate();
        return repo.findByUserIdAndPlayedAtAndLanguage(userId, today, language)
                .map(this::toRespSimple);
    }

    // ── Leaderboards ──

    public List<ScoreResponse> topGlobal(String language) {
        List<Score> list = repo.findTop10ByLanguageAndWonTrueOrderByScoreDescWonAtAsc(language);
        return enrichWithStreaks(list);
    }

    public List<ScoreResponse> dailyTop(String language, int limit, ZoneId zone) {
        LocalDate today = ZonedDateTime.now(clock.withZone(zone)).toLocalDate();
        LocalDate start = today;
        LocalDate end = today.plusDays(1);

        List<Score> list = repo.findTopByLanguageAndPeriod(language, start, end, limit);
        return enrichWithStreaks(list);
    }

    public List<ScoreResponse> weeklyTop(String language, int limit, ZoneId zone) {
        LocalDate today = ZonedDateTime.now(clock.withZone(zone)).toLocalDate();
        LocalDate monday = today.with(java.time.DayOfWeek.MONDAY);
        // End of week = next Monday (or end of today if we only want up-to-now)
        // We include the full current day
        LocalDate start = monday;
        LocalDate end = today.plusDays(1);

        List<Score> list = repo.findTopByLanguageAndPeriod(language, start, end, limit);
        return enrichWithStreaks(list);
    }

    public List<ScoreResponse> monthlyTop(String language, int limit, ZoneId zone) {
        LocalDate today = ZonedDateTime.now(clock.withZone(zone)).toLocalDate();
        LocalDate firstOfMonth = today.withDayOfMonth(1);
        LocalDate start = firstOfMonth;
        LocalDate end = today.plusDays(1);

        List<Score> list = repo.findTopByLanguageAndPeriod(language, start, end, limit);
        return enrichWithStreaks(list);
    }

    // ── User stats ──

    public UserStatsResponse statsForUser(Long userId) {
        List<Score> all = repo.findByUserId(userId);
        if (all.isEmpty()) {
            return new UserStatsResponse(0, 0, 0.0, 0.0, Map.of(), 0, 0, Map.of());
        }

        long totalGames = all.size();
        int bestScore = all.stream().mapToInt(Score::getScore).max().orElse(0);
        double avgScore = all.stream().mapToInt(Score::getScore).average().orElse(0.0);
        double avgDurationSec =
                all.stream().mapToLong(Score::getDurationMs).average().orElse(0.0) / 1000.0;

        Map<String, Long> perLang =
                all.stream()
                        .collect(Collectors.groupingBy(Score::getLanguage, Collectors.counting()));

        StreakResult streak = calculateStreak(all);

        Map<Integer, Long> guessDistribution =
                all.stream()
                        .filter(Score::isWon)
                        .collect(Collectors.groupingBy(Score::getAttempts, Collectors.counting()));

        return new UserStatsResponse(
                totalGames,
                bestScore,
                avgScore,
                avgDurationSec,
                perLang,
                streak.currentStreak(),
                streak.bestStreak(),
                guessDistribution);
    }

    // ── Score calculation ──

    public static int calculateScore(int attempts, long durationMs) {
        if (attempts < 1 || attempts > 6) return 0;

        int base = ATTEMPT_BASE[attempts];
        int timeBonus =
                (int) Math.max(0, TIME_BONUS_MAX - (Math.max(0, durationMs) / MS_PER_POINT));

        return base + timeBonus;
    }

    // ── Streak calculation ──

    private StreakResult calculateStreak(List<Score> scores) {
        if (scores == null || scores.isEmpty()) {
            return new StreakResult(0, 0);
        }

        var result =
                calculateStreakDays(
                        scores.stream().filter(Score::isWon).map(Score::getPlayedAt).toList());
        LocalDate today = LocalDate.now(clock.withZone(appZone));
        boolean playedToday = scores.stream().anyMatch(s -> s.getPlayedAt().equals(today));
        boolean wonToday =
                scores.stream().anyMatch(s -> s.isWon() && s.getPlayedAt().equals(today));
        return playedToday && !wonToday ? new StreakResult(0, result.bestStreak()) : result;
    }

    private StreakResult calculateStreakDays(List<LocalDate> playedDays) {
        List<LocalDate> days = playedDays.stream().distinct().sorted().toList();
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

        // Current streak: count backwards from the last played day
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

        if (days.getLast().isBefore(LocalDate.now(clock.withZone(appZone)).minusDays(1)))
            current = 0;
        return new StreakResult(current, best);
    }

    // ── Batch streak enrichment (avoids N+1 queries) ──

    private List<ScoreResponse> enrichWithStreaks(List<Score> scores) {
        if (scores.isEmpty()) return List.of();

        // Collect unique user IDs from leaderboard results
        Set<Long> userIds = scores.stream().map(Score::getUserId).collect(Collectors.toSet());

        var history = repo.playedDays(userIds);
        Map<Long, List<LocalDate>> daysByUser =
                history.stream()
                        .filter(ScoreRepository.PlayedDay::getWon)
                        .collect(
                                Collectors.groupingBy(
                                        ScoreRepository.PlayedDay::getUserId,
                                        Collectors.mapping(
                                                ScoreRepository.PlayedDay::getPlayedAt,
                                                Collectors.toList())));
        LocalDate today = LocalDate.now(clock.withZone(appZone));
        Set<Long> playedToday =
                history.stream()
                        .filter(d -> d.getPlayedAt().equals(today))
                        .map(ScoreRepository.PlayedDay::getUserId)
                        .collect(Collectors.toSet());
        Map<Long, Integer> streakMap =
                userIds.stream()
                        .collect(
                                Collectors.toMap(
                                        uid -> uid,
                                        uid -> {
                                            var winningDays =
                                                    daysByUser.getOrDefault(uid, List.of());
                                            return playedToday.contains(uid)
                                                            && !winningDays.contains(today)
                                                    ? 0
                                                    : calculateStreakDays(winningDays)
                                                            .currentStreak();
                                        }));

        return scores.stream()
                .map(
                        s ->
                                new ScoreResponse(
                                        s.getScore(),
                                        s.getAttempts(),
                                        s.getUsername(),
                                        s.getId(),
                                        s.getDurationMs(),
                                        null,
                                        s.getWonAt(),
                                        streakMap.getOrDefault(s.getUserId(), 0)))
                .collect(Collectors.toList());
    }

    /** Simple response without streak (for status checks, score submission) */
    private ScoreResponse toRespSimple(Score s) {
        return new ScoreResponse(
                s.getScore(),
                s.getAttempts(),
                s.getUsername(),
                s.getId(),
                s.getDurationMs(),
                null,
                s.getWonAt(),
                0);
    }

    private record StreakResult(int currentStreak, int bestStreak) {}
}
