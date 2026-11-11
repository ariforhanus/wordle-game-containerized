package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.dto.LanguageStatsResponse;
import com.ariforhanus.wordle.dto.LeaderboardTotalResponse;
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
@org.springframework.transaction.annotation.Transactional(
        readOnly = true,
        isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
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
        LocalDate today = LocalDate.now(clock.withZone(appZone));
        List<Score> list =
                repo.findTop10ByLanguageAndWonTrueOrderByScoreDescWonAtAscIdAsc(language);
        return enrichWithStreaks(list, today);
    }

    public List<ScoreResponse> dailyTop(String language, int limit, ZoneId zone) {
        LocalDate today = ZonedDateTime.now(clock.withZone(zone)).toLocalDate();
        LocalDate start = today;
        LocalDate end = today.plusDays(1);

        List<Score> list = repo.findTopByLanguageAndPeriod(language, start, end, limit);
        return enrichWithStreaks(list, today);
    }

    public List<LeaderboardTotalResponse> weeklyTop(String language, int limit, ZoneId zone) {
        LocalDate today = ZonedDateTime.now(clock.withZone(zone)).toLocalDate();
        LocalDate monday = today.with(java.time.DayOfWeek.MONDAY);
        // End of week = next Monday (or end of today if we only want up-to-now)
        // We include the full current day
        LocalDate start = monday;
        LocalDate end = today.plusDays(1);

        return periodTotals(language, start, end, limit, today);
    }

    public List<LeaderboardTotalResponse> monthlyTop(String language, int limit, ZoneId zone) {
        LocalDate today = ZonedDateTime.now(clock.withZone(zone)).toLocalDate();
        LocalDate firstOfMonth = today.withDayOfMonth(1);
        LocalDate start = firstOfMonth;
        LocalDate end = today.plusDays(1);

        return periodTotals(language, start, end, limit, today);
    }

    private List<LeaderboardTotalResponse> periodTotals(
            String language, LocalDate start, LocalDate end, int limit, LocalDate today) {
        var totals = repo.totalByLanguageAndPeriod(language, start, end, limit);
        if (totals.isEmpty()) return List.of();
        var ids =
                totals.stream()
                        .map(ScoreRepository.PeriodTotal::getUserId)
                        .collect(Collectors.toSet());
        var streaks = currentStreaks(ids, language, today);
        return totals.stream()
                .map(
                        row ->
                                new LeaderboardTotalResponse(
                                        row.getUserId(),
                                        row.getUsername(),
                                        row.getTotalScore(),
                                        row.getWins(),
                                        row.getLastWinAt(),
                                        streaks.getOrDefault(row.getUserId(), 0)))
                .toList();
    }

    // ── User stats ──

    public UserStatsResponse statsForUser(Long userId) {
        return statsForUser(userId, "en");
    }

    public UserStatsResponse statsForUser(Long userId, String language) {
        LocalDate today = LocalDate.now(clock.withZone(appZone));
        var summaries = repo.languageSummaries(userId, today);
        var distributions = new java.util.HashMap<String, Map<Integer, Long>>();
        var globalDistribution = new java.util.HashMap<Integer, Long>();
        for (var row : repo.guessCounts(userId, today)) {
            distributions
                    .computeIfAbsent(row.getLanguage(), ignored -> new java.util.HashMap<>())
                    .put(row.getAttempts(), row.getWins());
            globalDistribution.merge(row.getAttempts(), row.getWins(), Long::sum);
        }
        var streaks =
                repo.streaksForUsers(Set.of(userId), today).stream()
                        .collect(
                                Collectors.toMap(
                                        ScoreRepository.LanguageStreak::getLanguage, row -> row));
        var byLanguage = new java.util.TreeMap<String, LanguageStatsResponse>();
        for (String code : com.ariforhanus.wordle.config.SupportedLanguage.supportedCodes())
            byLanguage.put(code, emptyLanguageStats());
        var counts = new java.util.TreeMap<String, Long>();
        long total = 0, points = 0, duration = 0;
        int best = 0;
        for (var summary : summaries) {
            String code = summary.getLanguage();
            var streak = streaks.get(code);
            long games = summary.getGames();
            counts.put(code, games);
            total += games;
            points += summary.getPoints();
            duration += summary.getDuration();
            best = Math.max(best, summary.getBestScore());
            byLanguage.put(
                    code,
                    new LanguageStatsResponse(
                            games,
                            summary.getWins(),
                            summary.getBestScore(),
                            (double) summary.getPoints() / games,
                            (double) summary.getDuration() / games / 1000,
                            streak == null ? 0 : streak.getCurrentStreak(),
                            streak == null ? 0 : streak.getBestStreak(),
                            Map.copyOf(distributions.getOrDefault(code, Map.of()))));
        }
        var selected = byLanguage.getOrDefault(language, emptyLanguageStats());
        return new UserStatsResponse(
                total,
                best,
                total == 0 ? 0 : (double) points / total,
                total == 0 ? 0 : (double) duration / total / 1000,
                Map.copyOf(counts),
                selected.currentStreak(),
                selected.bestStreak(),
                Map.copyOf(globalDistribution),
                language,
                Map.copyOf(byLanguage));
    }

    private LanguageStatsResponse emptyLanguageStats() {
        return new LanguageStatsResponse(0, 0, 0, 0, 0, 0, 0, Map.of());
    }

    // ── Score calculation ──

    public static int calculateScore(int attempts, long durationMs) {
        if (attempts < 1 || attempts > 6) return 0;

        int base = ATTEMPT_BASE[attempts];
        int timeBonus =
                (int) Math.max(0, TIME_BONUS_MAX - (Math.max(0, durationMs) / MS_PER_POINT));

        return base + timeBonus;
    }

    // ── Batch streak enrichment (avoids N+1 queries) ──

    private List<ScoreResponse> enrichWithStreaks(List<Score> scores, LocalDate today) {
        if (scores.isEmpty()) return List.of();

        // Collect unique user IDs from leaderboard results
        Set<Long> userIds = scores.stream().map(Score::getUserId).collect(Collectors.toSet());

        var streakMap = currentStreaks(userIds, scores.getFirst().getLanguage(), today);
        var names = currentNames(userIds);
        return scores.stream()
                .map(
                        s ->
                                new ScoreResponse(
                                        s.getScore(),
                                        s.getAttempts(),
                                        names.getOrDefault(s.getUserId(), s.getUsername()),
                                        s.getId(),
                                        s.getDurationMs(),
                                        null,
                                        s.getWonAt(),
                                        streakMap.getOrDefault(s.getUserId(), 0)))
                .collect(Collectors.toList());
    }

    private Map<Long, Integer> currentStreaks(Set<Long> ids, String language, LocalDate today) {
        return repo.streaksForUsers(ids, today).stream()
                .filter(row -> language.equals(row.getLanguage()))
                .collect(
                        Collectors.toMap(
                                ScoreRepository.LanguageStreak::getUserId,
                                ScoreRepository.LanguageStreak::getCurrentStreak));
    }

    private Map<Long, String> currentNames(Set<Long> ids) {
        return repo.currentNames(ids).stream()
                .collect(
                        Collectors.toMap(
                                ScoreRepository.CurrentName::getUserId,
                                ScoreRepository.CurrentName::getUsername));
    }

    /** Simple response without streak (for status checks, score submission) */
    private ScoreResponse toRespSimple(Score s) {
        var names = currentNames(Set.of(s.getUserId()));
        return new ScoreResponse(
                s.getScore(),
                s.getAttempts(),
                names.getOrDefault(s.getUserId(), s.getUsername()),
                s.getId(),
                s.getDurationMs(),
                null,
                s.getWonAt(),
                0);
    }
}
