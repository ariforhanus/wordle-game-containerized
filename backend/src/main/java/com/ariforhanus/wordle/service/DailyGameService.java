package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.config.SupportedLanguage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Service
public class DailyGameService {
    private final JdbcTemplate db;
    private final DailyPuzzleService puzzles;
    private final GuessDictionary dictionary;
    private final Clock clock;
    private final ZoneId zone;

    public DailyGameService(
            JdbcTemplate db,
            DailyPuzzleService puzzles,
            GuessDictionary dictionary,
            Clock clock,
            @Value("${app.timezone:Europe/Istanbul}") String timezone) {
        this.db = db;
        this.puzzles = puzzles;
        this.dictionary = dictionary;
        this.clock = clock;
        this.zone = ZoneId.of(timezone);
    }

    public record StatusView(String state, GameView game, String date, String timeZone) {}

    public static class DayChangedException extends RuntimeException {}

    @Transactional(readOnly = true)
    public StatusView status(long userId, String language) {
        String lang;
        try {
            lang = SupportedLanguage.fromParam(language).getCode();
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_lang");
        }
        LocalDate today = LocalDate.now(clock.withZone(zone));
        var ids =
                db.queryForList(
                        "SELECT g.id FROM daily_games g JOIN daily_puzzles p ON p.id = g.puzzle_id"
                                + " WHERE g.user_id = ? AND p.language = ? AND p.played_at = ?",
                        String.class,
                        userId,
                        lang,
                        today);
        if (!ids.isEmpty()) {
            var game = view(load(userId, ids.getFirst()));
            return new StatusView(
                    game.status().equals("playing") ? "playing" : "finished",
                    game,
                    today.toString(),
                    zone.getId());
        }
        boolean historicalResult =
                Boolean.TRUE.equals(
                        db.queryForObject(
                                "SELECT EXISTS (SELECT 1 FROM scores WHERE user_id = ? AND language"
                                        + " = ? AND played_at = ?)",
                                Boolean.class,
                                userId,
                                lang,
                                today));
        return new StatusView(
                historicalResult ? "already_played" : "not_started",
                null,
                today.toString(),
                zone.getId());
    }

    @Transactional
    public GameView start(long userId, String language) {
        return start(userId, language, null);
    }

    @Transactional
    public GameView start(long userId, String language, LocalDate expectedDate) {
        // Capture the accepted Start instant once: waiting for a transaction cannot reassign its
        // day.
        Instant startedAt = clock.instant();
        LocalDate today = startedAt.atZone(zone).toLocalDate();
        String lang;
        try {
            lang = SupportedLanguage.fromParam(language).getCode();
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_lang");
        }
        if (expectedDate != null && !expectedDate.equals(today)) throw new DayChangedException();
        var puzzle = puzzles.getOrCreate(today, lang);
        boolean historicalResult =
                Boolean.TRUE.equals(
                        db.queryForObject(
                                "SELECT EXISTS (SELECT 1 FROM scores WHERE user_id = ? AND"
                                    + " played_at = ? AND language = ?) AND NOT EXISTS (SELECT 1"
                                    + " FROM daily_games WHERE user_id = ? AND puzzle_id = ?)",
                                Boolean.class,
                                userId,
                                puzzle.date(),
                                lang,
                                userId,
                                puzzle.id()));
        if (historicalResult)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "already_played");
        db.update(
                "INSERT INTO daily_games(id, user_id, puzzle_id, started_at) VALUES (?, ?, ?, ?) ON"
                        + " CONFLICT DO NOTHING",
                UUID.randomUUID().toString(),
                userId,
                puzzle.id(),
                Timestamp.from(startedAt));
        String id =
                db.queryForObject(
                        "SELECT id FROM daily_games WHERE user_id = ? AND puzzle_id = ?",
                        String.class,
                        userId,
                        puzzle.id());
        return view(load(userId, id));
    }

    @Transactional(readOnly = true)
    public GameView get(long userId, String id) {
        return view(load(userId, id));
    }

    @Transactional
    public GameView guess(long userId, String id, String rawGuess, int attempt) {
        // Serialize guesses across tabs, processes, and retries, not just Java threads.
        var rows =
                db.queryForList(
                        "SELECT id FROM daily_games WHERE id = ? AND user_id = ? FOR UPDATE",
                        id,
                        userId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Game game = load(userId, id);
        String guess = dictionary.normalize(rawGuess, game.language());
        var guesses = new ArrayList<>(game.guesses());
        if (attempt <= guesses.size()) {
            if (guesses.get(attempt - 1).equals(guess))
                return view(game); // Lost response: same turn is idempotent.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "turn_conflict");
        }
        if (!game.status().equals("playing") || attempt != guesses.size() + 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "turn_conflict");
        if (!guess.matches("[A-ZÇĞİÖŞÜ]{5}") || !dictionary.contains(guess, game.language()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_word");
        guesses.add(guess);
        String status =
                guess.equals(game.answer()) ? "won" : guesses.size() == 6 ? "lost" : "playing";
        Instant finished = status.equals("playing") ? null : clock.instant();
        db.update(
                "UPDATE daily_games SET guesses = ?, status = ?, finished_at = ? WHERE id = ?",
                String.join(",", guesses),
                status,
                finished == null ? null : Timestamp.from(finished),
                id);
        if (finished != null) {
            long duration = Math.max(0, Duration.between(game.startedAt(), finished).toMillis());
            String username =
                    db.queryForObject(
                            "SELECT username FROM users WHERE id = ?", String.class, userId);
            int score =
                    status.equals("won")
                            ? ScoreService.calculateScore(guesses.size(), duration)
                            : 0;
            // Both the game and its score commit together. Historical daily scores cannot be
            // replaced. A conflicting score must roll back the game update too.
            db.update(
                    "INSERT INTO scores(user_id, username, language, attempts, duration_ms, won_at,"
                            + " played_at, score, word, won) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    userId,
                    username,
                    game.language(),
                    guesses.size(),
                    duration,
                    Timestamp.from(finished),
                    game.date(),
                    score,
                    game.answer(),
                    status.equals("won"));
        }
        return view(load(userId, id));
    }

    private Game load(long userId, String id) {
        var games =
                db.query(
                        "SELECT g.*, p.answer, p.language, p.played_at FROM daily_games g JOIN"
                            + " daily_puzzles p ON p.id = g.puzzle_id WHERE g.id = ? AND g.user_id"
                            + " = ?",
                        (rs, row) ->
                                new Game(
                                        rs.getString("id"),
                                        rs.getString("language"),
                                        rs.getObject("played_at", LocalDate.class),
                                        rs.getString("answer"),
                                        rs.getTimestamp("started_at").toInstant(),
                                        rs.getTimestamp("finished_at") == null
                                                ? null
                                                : rs.getTimestamp("finished_at").toInstant(),
                                        rs.getString("guesses").isEmpty()
                                                ? List.of()
                                                : List.of(rs.getString("guesses").split(",")),
                                        rs.getString("status")),
                        id,
                        userId);
        if (games.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return games.getFirst();
    }

    private GameView view(Game game) {
        long elapsed =
                Math.max(
                        0,
                        Duration.between(
                                        game.startedAt(),
                                        game.finishedAt() == null
                                                ? clock.instant()
                                                : game.finishedAt())
                                .toMillis());
        Integer score =
                game.status().equals("playing")
                        ? null
                        : game.status().equals("won")
                                ? ScoreService.calculateScore(game.guesses().size(), elapsed)
                                : 0;
        return new GameView(
                game.id(),
                game.date().toString(),
                game.language(),
                game.status(),
                elapsed,
                game.guesses().stream().map(g -> evaluate(g, game.answer())).toList(),
                game.status().equals("playing") ? null : game.answer(),
                score);
    }

    public static Feedback evaluate(String guess, String answer) {
        var status = new ArrayList<>(Collections.nCopies(5, "absent"));
        var remaining = new HashMap<Character, Integer>();
        for (int i = 0; i < 5; i++) {
            if (guess.charAt(i) == answer.charAt(i)) status.set(i, "correct");
            else remaining.merge(answer.charAt(i), 1, Integer::sum);
        }
        for (int i = 0; i < 5; i++) {
            char ch = guess.charAt(i);
            if (!status.get(i).equals("correct") && remaining.getOrDefault(ch, 0) > 0) {
                status.set(i, "present");
                remaining.merge(ch, -1, Integer::sum);
            }
        }
        return new Feedback(guess, status);
    }

    private record Game(
            String id,
            String language,
            LocalDate date,
            String answer,
            Instant startedAt,
            Instant finishedAt,
            List<String> guesses,
            String status) {}

    public record Feedback(String guess, List<String> statuses) {}

    public record GameView(
            String id,
            String date,
            String language,
            String status,
            long elapsedMs,
            List<Feedback> guesses,
            String answer,
            Integer score) {}
}
