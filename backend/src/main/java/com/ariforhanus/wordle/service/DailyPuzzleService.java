package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.config.SupportedLanguage;
import com.ariforhanus.wordle.service.provider.RandomWordApiProvider;

import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.*;

@Service
public class DailyPuzzleService {
    // Dedicated advisory-lock namespace. The language hash only partitions writers;
    // a hash collision would serialize extra languages, never weaken correctness.
    static final int PREFERRED_SPACING_DAYS = 30;
    private static final int ROTATION_LOCK_NAMESPACE = 0x574F5244;
    private final JdbcTemplate db;
    private final RandomWordApiProvider words;
    private final SecureRandom random = new SecureRandom();

    public DailyPuzzleService(JdbcTemplate db, RandomWordApiProvider words) {
        this.db = db;
        this.words = words;
    }

    @Transactional(isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Puzzle getOrCreate(LocalDate date, String language) {
        String lang = SupportedLanguage.fromParam(language).getCode();
        var existing = find(date, lang);
        // A persisted answer must survive dictionary removal/empty provider/reordering.
        if (existing.isPresent()) return existing.get();
        db.execute(
                (ConnectionCallback<Void>)
                        connection -> {
                            if (connection.getTransactionIsolation()
                                    != java.sql.Connection.TRANSACTION_READ_COMMITTED)
                                throw new IllegalStateException(
                                        "Daily rotation requires READ COMMITTED isolation");
                            try (var statement =
                                    connection.prepareStatement(
                                            "SELECT pg_advisory_xact_lock(?, ?)")) {
                                statement.setInt(1, ROTATION_LOCK_NAMESPACE);
                                statement.setInt(2, lang.hashCode());
                                statement.execute();
                            }
                            return null;
                        });
        existing = find(date, lang);
        if (existing.isPresent()) return existing.get();
        Locale locale = lang.equals("tr") ? Locale.forLanguageTag("tr-TR") : Locale.ROOT;
        String pattern = lang.equals("tr") ? "[A-ZÇĞİÖŞÜ]{5}" : "[A-Z]{5}";
        var answers =
                words.getAllWords(lang).stream()
                        .filter(Objects::nonNull)
                        .map(word -> word.trim().toUpperCase(locale))
                        .filter(word -> word.matches(pattern))
                        .distinct()
                        .sorted()
                        .toList();
        if (answers.isEmpty()) throw new IllegalStateException("No answers configured");
        Map<String, Integer> nearest = new HashMap<>();
        db.query(
                "SELECT answer, MIN(ABS(played_at - ?::date)) AS distance FROM daily_puzzles"
                        + " WHERE language = ? AND answer = ANY(?) GROUP BY answer",
                statement -> {
                    statement.setObject(1, date);
                    statement.setString(2, lang);
                    statement.setArray(
                            3,
                            statement.getConnection().createArrayOf("varchar", answers.toArray()));
                },
                (org.springframework.jdbc.core.RowCallbackHandler)
                        row -> nearest.put(row.getString("answer"), row.getInt("distance")));
        var candidates = candidates(answers, nearest);
        db.update(
                "INSERT INTO daily_puzzles(id, played_at, language, answer) VALUES (?, ?, ?, ?) ON"
                        + " CONFLICT DO NOTHING",
                date + "_" + lang,
                date,
                lang,
                candidates.get(random.nextInt(candidates.size())));
        return find(date, lang).orElseThrow();
    }

    static List<String> candidates(List<String> answers, Map<String, Integer> nearest) {
        var unused = answers.stream().filter(answer -> !nearest.containsKey(answer)).toList();
        if (!unused.isEmpty()) return unused;
        var spaced =
                answers.stream()
                        .filter(answer -> nearest.get(answer) >= PREFERRED_SPACING_DAYS)
                        .toList();
        if (!spaced.isEmpty()) return spaced;
        int farthest = answers.stream().mapToInt(nearest::get).max().orElseThrow();
        return answers.stream().filter(answer -> nearest.get(answer) == farthest).toList();
    }

    private Optional<Puzzle> find(LocalDate date, String lang) {
        return db
                .query(
                        "SELECT id,played_at,language,answer FROM daily_puzzles WHERE played_at = ?"
                                + " AND language = ?",
                        (rs, row) ->
                                new Puzzle(
                                        rs.getString("id"),
                                        rs.getObject("played_at", LocalDate.class),
                                        rs.getString("language"),
                                        rs.getString("answer")),
                        date,
                        lang)
                .stream()
                .findFirst();
    }

    public record Puzzle(String id, LocalDate date, String language, String answer) {}
}
