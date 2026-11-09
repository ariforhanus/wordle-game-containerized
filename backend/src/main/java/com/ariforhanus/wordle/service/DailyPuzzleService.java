package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.service.provider.RandomWordApiProvider;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDate;

@Service
public class DailyPuzzleService {
    private final JdbcTemplate db;
    private final RandomWordApiProvider words;
    private final SecureRandom random = new SecureRandom();

    public DailyPuzzleService(JdbcTemplate db, RandomWordApiProvider words) {
        this.db = db;
        this.words = words;
    }

    @Transactional
    public Puzzle getOrCreate(LocalDate date, String lang) {
        String id = date + "_" + lang;
        var answers = words.getAllWords(lang);
        if (answers.isEmpty()) throw new IllegalStateException("No answers configured");
        db.update(
                "INSERT INTO daily_puzzles(id, played_at, language, answer) VALUES (?, ?, ?, ?) ON"
                        + " CONFLICT DO NOTHING",
                id,
                date,
                lang,
                answers.get(random.nextInt(answers.size())));
        return db.queryForObject(
                "SELECT * FROM daily_puzzles WHERE id = ?",
                (rs, row) ->
                        new Puzzle(
                                rs.getString("id"),
                                rs.getObject("played_at", LocalDate.class),
                                rs.getString("language"),
                                rs.getString("answer")),
                id);
    }

    public record Puzzle(String id, LocalDate date, String language, String answer) {}
}
