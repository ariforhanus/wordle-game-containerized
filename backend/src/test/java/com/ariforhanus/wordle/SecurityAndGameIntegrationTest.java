package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.DailyGameService;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityAndGameIntegrationTest {
    @Autowired MockMvc http;
    @Autowired JdbcTemplate db;
    @Autowired javax.sql.DataSource dataSource;
    @Autowired UserRepository users;
    @Autowired JwtUtil jwt;
    @Autowired PasswordEncoder encoder;
    @Autowired DailyGameService games;
    @Autowired MutableClock clock;
    @Autowired ObjectMapper json;
    User user;
    String token;

    @BeforeEach
    void reset() {
        db.execute(
                "TRUNCATE TABLE auth_rate_limits, security_audit, daily_games, daily_puzzles,"
                        + " scores, users RESTART IDENTITY CASCADE");
        clock.now.set(Instant.parse("2026-11-09T20:59:00Z"));
        user = new User();
        user.setUsername("player");
        user.setEmail("player@example.com");
        user.setPasswordHash(encoder.encode("a-long-test-password"));
        user = users.save(user);
        token = jwt.generateToken(user.getId(), user.getUsername(), "USER");
    }

    @Test
    void protectedEndpointsRequireAuthentication() throws Exception {
        http.perform(post("/api/v1/daily/games")).andExpect(status().isUnauthorized());
        http.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
        http.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void removedAndDemotedAdminsCannotUseOldTokens() throws Exception {
        user.setRole("ADMIN");
        user = users.save(user);
        String adminToken = jwt.generateToken(user.getId(), user.getUsername(), "ADMIN");
        http.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
        user.setRole("USER");
        users.save(user);
        http.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isForbidden());
        users.deleteById(user.getId());
        http.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void tamperedTokensAreRejected() throws Exception {
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token + "invalid"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void apiResponsesCannotBeCached() throws Exception {
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void invalidRegistrationCannotCreateAnAccount() throws Exception {
        http.perform(
                        post("/api/v1/auth/register")
                                .contentType("application/json")
                                .content(
                                        "{\"username\":\"<img>\",\"email\":\"bad\",\"password\":\"x\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(1, users.count());
    }

    @Test
    void legacyScoreForgeryIsRejected() throws Exception {
        http.perform(
                        post("/api/v1/scores")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content(
                                        "{\"attempts\":1,\"durationMs\":0,\"word\":\"APPLE\",\"won\":true}"))
                .andExpect(status().isGone());
        assertEquals(0, count("scores"));
    }

    @Test
    void answerIsHiddenUntilCompletionAndDurationIsAuthoritative() throws Exception {
        var game = startApple();
        http.perform(
                        get("/api/v1/daily/games/" + game.id())
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").isEmpty());
        clock.now.set(clock.instant().plusSeconds(20));
        var result = games.guess(user.getId(), game.id(), "apple", 1);
        assertEquals("won", result.status());
        assertEquals("APPLE", result.answer());
        assertEquals(20000, result.elapsedMs());
        assertEquals(9899, result.score());
        assertEquals(1, count("scores"));
        assertEquals(result, games.guess(user.getId(), game.id(), "APPLE", 1));
    }

    @Test
    void gameOwnershipIsEnforced() throws Exception {
        var game = startApple();
        User other = new User();
        other.setUsername("other");
        other.setEmail("other@example.com");
        other.setPasswordHash("unused");
        other = users.save(other);
        String otherToken = jwt.generateToken(other.getId(), "other", "USER");
        http.perform(
                        get("/api/v1/daily/games/" + game.id())
                                .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound());
        http.perform(
                        post("/api/v1/daily/games/" + game.id() + "/guesses")
                                .header("Authorization", "Bearer " + otherToken)
                                .contentType("application/json")
                                .content("{\"guess\":\"APPLE\",\"attempt\":1}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void badWordsAndTurnsDoNotConsumeAnAttempt() throws Exception {
        var game = startApple();
        http.perform(
                        post("/api/v1/daily/games/" + game.id() + "/guesses")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content("{\"guess\":\"ZZZZZ\",\"attempt\":1}"))
                .andExpect(status().isBadRequest());
        assertThrows(Exception.class, () -> games.guess(user.getId(), game.id(), "APPLE", 2));
        assertEquals(0, games.get(user.getId(), game.id()).guesses().size());
    }

    @Test
    void concurrentStartsAndGuessesProduceOneGameAndOneScore() throws Exception {
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<DailyGameService.GameView> task =
                    () -> {
                        start.await();
                        return games.start(user.getId(), "en");
                    };
            var a = pool.submit(task);
            var b = pool.submit(task);
            start.countDown();
            var game = a.get(10, TimeUnit.SECONDS);
            assertEquals(game.id(), b.get(10, TimeUnit.SECONDS).id());
            db.update("UPDATE daily_puzzles SET answer='APPLE'");
            var turn = new CountDownLatch(1);
            Callable<DailyGameService.GameView> guess =
                    () -> {
                        turn.await();
                        return games.guess(user.getId(), game.id(), "APPLE", 1);
                    };
            var x = pool.submit(guess);
            var y = pool.submit(guess);
            turn.countDown();
            assertEquals("won", x.get(10, TimeUnit.SECONDS).status());
            assertEquals("won", y.get(10, TimeUnit.SECONDS).status());
            assertEquals(1, count("daily_games"));
            assertEquals(1, count("scores"));
        }
    }

    @Test
    void completionAcrossMidnightBelongsToOriginalPuzzle() {
        var game = startApple();
        clock.now.set(Instant.parse("2026-11-09T21:01:00Z"));
        var result = games.guess(user.getId(), game.id(), "APPLE", 1);
        assertEquals("2026-11-09", result.date());
        assertEquals(
                LocalDate.parse("2026-11-09"),
                db.queryForObject("SELECT played_at FROM scores", LocalDate.class));
        assertEquals("2026-11-10", games.start(user.getId(), "en").date());
    }

    @Test
    void sixIncorrectGuessesPersistALossAndBlockFurtherTurns() {
        var game = startApple();
        db.update("UPDATE daily_puzzles SET answer='CIGAR'");
        for (int i = 1; i <= 6; i++) games.guess(user.getId(), game.id(), "APPLE", i);
        var result = games.get(user.getId(), game.id());
        assertEquals("lost", result.status());
        assertEquals(0, result.score());
        assertEquals(1, count("scores"));
        assertThrows(Exception.class, () -> games.guess(user.getId(), game.id(), "CIGAR", 6));
    }

    @Test
    void databaseEnforcesDailyUniquenessAndCascadesDeletion() {
        var game = startApple();
        games.guess(user.getId(), game.id(), "APPLE", 1);
        assertThrows(
                org.springframework.dao.DataIntegrityViolationException.class,
                () ->
                        db.update(
                                "INSERT INTO scores(user_id, username, language, attempts,"
                                    + " duration_ms, won_at, played_at, score, word, won) SELECT"
                                    + " user_id, username, language, attempts, duration_ms, won_at,"
                                    + " played_at, score, word, won FROM scores"));
        users.deleteById(user.getId());
        assertEquals(0, count("scores"));
        assertEquals(0, count("daily_games"));
    }

    @Test
    void optimisticLockingRejectsStaleProfileUpdates() {
        var first = users.findById(user.getId()).orElseThrow();
        var stale = users.findById(user.getId()).orElseThrow();
        first.setRole("ADMIN");
        users.saveAndFlush(first);
        stale.setFirstName("stale");
        assertThrows(
                org.springframework.orm.ObjectOptimisticLockingFailureException.class,
                () -> users.saveAndFlush(stale));
        assertEquals("ADMIN", users.findById(user.getId()).orElseThrow().getRole());
    }

    @Test
    void feedbackHandlesDuplicateLetters() {
        assertEquals(
                java.util.List.of("correct", "present", "absent", "absent", "correct"),
                DailyGameService.evaluate("ALLEE", "APPLE").statuses());
    }

    @Test
    void publicLeaderboardsNeverExposeAnswers() throws Exception {
        var game = startApple();
        games.guess(user.getId(), game.id(), "APPLE", 1);
        var response =
                http.perform(get("/api/v1/leaderboard"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertFalse(response.contains("APPLE"));
        http.perform(get("/api/v1/word/daily").header("Authorization", "Bearer " + token))
                .andExpect(status().isGone());
    }

    @Test
    void zeroAttemptIsRejectedAtTheBoundary() throws Exception {
        var game = startApple();
        http.perform(
                        post("/api/v1/daily/games/" + game.id() + "/guesses")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content("{\"guess\":\"APPLE\",\"attempt\":0}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void historicalResultCannotBeReplacedByANewGame() {
        var game = startApple();
        games.guess(user.getId(), game.id(), "APPLE", 1);
        db.update("DELETE FROM daily_games WHERE id = ?", game.id());
        assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> games.start(user.getId(), "en"));
        assertEquals(1, count("scores"));
    }

    @Test
    void unsafeLegacyMigrationFailsWithoutDeletingData() throws Exception {
        db.execute("CREATE SCHEMA legacy_test");
        try {
            var pool = (com.zaxxer.hikari.HikariDataSource) dataSource;
            var source =
                    new org.springframework.jdbc.datasource.DriverManagerDataSource(
                            pool.getJdbcUrl(), pool.getUsername(), pool.getPassword());
            try (var connection = source.getConnection()) {
                connection.setSchema("legacy_test");
                new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(
                                new org.springframework.core.io.ClassPathResource(
                                        "db/migration/V1__initial_schema.sql"))
                        .populate(connection);
                try (var statement = connection.createStatement()) {
                    statement.execute(
                            "INSERT INTO scores(user_id, username, language, attempts, duration_ms,"
                                + " won_at, played_at, score, won) VALUES (1, 'legacy', 'en', 1, 0,"
                                + " now(), current_date, 1, true), (1, 'legacy', 'en', 1, 0, now(),"
                                + " current_date, 1, true)");
                }
            }
            var flyway =
                    org.flywaydb.core.Flyway.configure()
                            .dataSource(source)
                            .schemas("legacy_test")
                            .defaultSchema("legacy_test")
                            .baselineOnMigrate(true)
                            .baselineVersion("0")
                            .load();
            assertThrows(org.flywaydb.core.api.FlywayException.class, flyway::migrate);
            assertEquals(
                    2, db.queryForObject("SELECT COUNT(*) FROM legacy_test.scores", Integer.class));
        } finally {
            db.execute("DROP SCHEMA legacy_test CASCADE");
        }
    }

    @Test
    void unavailableEmailProviderReturnsAnExplicitServiceError() throws Exception {
        http.perform(
                        post("/api/v1/account/forgot-password")
                                .contentType("application/json")
                                .content("{\"email\":\"player@example.com\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("mail_unavailable"));
    }

    @Test
    void malformedJsonReturnsControlledValidationError() throws Exception {
        http.perform(post("/api/v1/auth/login").contentType("application/json").content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalid_input"));
    }

    private DailyGameService.GameView startApple() {
        var game = games.start(user.getId(), "en");
        db.update("UPDATE daily_puzzles SET answer='APPLE'");
        return games.get(user.getId(), game.id());
    }

    private int count(String table) {
        return db.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    @TestConfiguration
    static class TimeConfig {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }
    }

    static class MutableClock extends Clock {
        final AtomicReference<Instant> now =
                new AtomicReference<>(Instant.parse("2026-11-09T20:59:00Z"));

        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        public Clock withZone(ZoneId zone) {
            return Clock.fixed(instant(), zone);
        }

        public Instant instant() {
            return now.get();
        }
    }
}
