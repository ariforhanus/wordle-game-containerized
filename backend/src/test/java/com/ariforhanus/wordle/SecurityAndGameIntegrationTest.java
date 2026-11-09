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
    @Autowired com.ariforhanus.wordle.service.ScoreService scores;
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
    void statusAndReadRequestsNeverStartADailyGame() throws Exception {
        for (String language : java.util.List.of("en", "tr", "en")) {
            http.perform(
                            get("/api/v1/daily/status")
                                    .param("lang", language)
                                    .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.played").value(false));
            http.perform(
                            get("/api/v1/daily/games/not-started")
                                    .header("Authorization", "Bearer " + token))
                    .andExpect(status().isNotFound());
            clock.now.set(clock.instant().plusSeconds(30));
        }
        assertEquals(0, count("daily_games"));
        assertEquals(0, count("daily_puzzles"));
        assertEquals(0, count("scores"));

        Instant explicitStart = clock.instant();
        var response =
                http.perform(
                                post("/api/v1/daily/games")
                                        .param("lang", "tr")
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.elapsedMs").value(0))
                        .andExpect(jsonPath("$.language").value("tr"))
                        .andReturn();
        String id = json.readTree(response.getResponse().getContentAsString()).get("id").asText();
        assertEquals(1, count("daily_games"));
        assertEquals(
                explicitStart,
                db.queryForObject(
                                "SELECT started_at FROM daily_games WHERE id = ?",
                                java.sql.Timestamp.class,
                                id)
                        .toInstant());
        clock.now.set(explicitStart.plusSeconds(30));
        http.perform(get("/api/v1/daily/games/" + id).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.elapsedMs").value(30000));
        assertEquals(
                explicitStart,
                db.queryForObject(
                                "SELECT started_at FROM daily_games WHERE id = ?",
                                java.sql.Timestamp.class,
                                id)
                        .toInstant());
        assertEquals(1, count("daily_games"));
        assertEquals(0, count("scores"));
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

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"en", "tr"})
    void disconnectedTimeCountsAndResumeFromAnotherSessionKeepsTheOriginalStart(String language)
            throws Exception {
        // Stay within one puzzle day; midnight behavior has a separate acceptance item.
        clock.now.set(Instant.parse("2026-11-09T10:00:00Z"));
        Instant startedAt = clock.instant();
        var game = games.start(user.getId(), language);
        String answer = language.equals("tr") ? "İNCİR" : "APPLE";
        db.update(
                "UPDATE daily_puzzles SET answer = ? WHERE id = (SELECT puzzle_id FROM daily_games"
                        + " WHERE id = ?)",
                answer,
                game.id());
        // There are no game requests while this deterministic server clock advances.
        clock.now.set(startedAt.plusSeconds(120));
        String newSession = jwt.generateToken(user.getId(), user.getUsername(), "USER");
        for (int retry = 0; retry < 3; retry++) {
            http.perform(
                            post("/api/v1/daily/games")
                                    .param("lang", language)
                                    .header("Authorization", "Bearer " + newSession))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(game.id()))
                    .andExpect(jsonPath("$.elapsedMs").value(120000));
        }
        assertEquals(
                startedAt,
                db.queryForObject(
                                "SELECT started_at FROM daily_games WHERE id = ?",
                                java.sql.Timestamp.class,
                                game.id())
                        .toInstant());
        assertEquals(1, count("daily_games"));
        clock.now.set(startedAt.plusSeconds(180));
        http.perform(
                        post("/api/v1/daily/games/" + game.id() + "/guesses")
                                .header("Authorization", "Bearer " + newSession)
                                .contentType("application/json")
                                .content(
                                        json.writeValueAsString(
                                                java.util.Map.of("guess", answer, "attempt", 1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("won"))
                .andExpect(jsonPath("$.elapsedMs").value(180000))
                .andExpect(
                        jsonPath("$.score")
                                .value(
                                        com.ariforhanus.wordle.service.ScoreService.calculateScore(
                                                1, 180000)));
        assertEquals(
                180000L,
                db.queryForObject(
                        "SELECT duration_ms FROM scores WHERE user_id = ? AND language = ?",
                        Long.class,
                        user.getId(),
                        language));
        clock.now.set(startedAt.plusSeconds(240));
        var finished = games.start(user.getId(), language);
        assertEquals(game.id(), finished.id());
        assertEquals(180000, finished.elapsedMs());
        assertEquals(1, count("scores"));
        assertEquals(
                startedAt,
                db.queryForObject(
                                "SELECT started_at FROM daily_games WHERE id = ?",
                                java.sql.Timestamp.class,
                                game.id())
                        .toInstant());
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

    @Test
    void finalScoreWriteFailureRollsBackOnlyTheNewTurn() {
        var game = startApple();
        games.guess(user.getId(), game.id(), "CIGAR", 1);
        db.execute(
                "CREATE FUNCTION test_reject_score() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN"
                        + " RAISE EXCEPTION 'injected score failure'; END $$");
        db.execute(
                "CREATE TRIGGER test_reject_score BEFORE INSERT ON scores FOR EACH ROW EXECUTE"
                        + " FUNCTION test_reject_score()");
        try {
            assertThrows(
                    org.springframework.dao.DataAccessException.class,
                    () -> games.guess(user.getId(), game.id(), "APPLE", 2));
            var restored = games.get(user.getId(), game.id());
            assertEquals("playing", restored.status());
            assertEquals(
                    java.util.List.of("CIGAR"),
                    restored.guesses().stream().map(DailyGameService.Feedback::guess).toList());
            assertEquals(0, count("scores"));
            assertNull(restored.score());
        } finally {
            db.execute("DROP TRIGGER test_reject_score ON scores");
            db.execute("DROP FUNCTION test_reject_score()");
        }
        assertEquals("won", games.guess(user.getId(), game.id(), "APPLE", 2).status());
        assertEquals(1, count("scores"));
    }

    @Test
    void differentConcurrentGuessesAcceptExactlyOneTurn() throws Exception {
        var game = startApple();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            java.util.function.Function<String, Callable<String>> task =
                    word ->
                            () -> {
                                start.await();
                                try {
                                    games.guess(user.getId(), game.id(), word, 1);
                                    return word;
                                } catch (
                                        org.springframework.web.server.ResponseStatusException ex) {
                                    assertEquals(409, ex.getStatusCode().value());
                                    return "conflict";
                                }
                            };
            var first = pool.submit(task.apply("CIGAR"));
            var second = pool.submit(task.apply("REBUT"));
            start.countDown();
            var outcomes =
                    java.util.List.of(
                            first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            assertEquals(1, outcomes.stream().filter("conflict"::equals).count());
            var restored = games.get(user.getId(), game.id());
            assertEquals(1, restored.guesses().size());
            String accepted =
                    outcomes.stream().filter(v -> !v.equals("conflict")).findFirst().orElseThrow();
            assertEquals(accepted, restored.guesses().getFirst().guess());
            assertEquals(0, count("scores"));
        }
    }

    private String signedToken(String subject, Instant expiration, String signingSecret) {
        var builder = io.jsonwebtoken.Jwts.builder().claim("authVersion", 0).claim("role", "ADMIN");
        if (subject != null) builder.subject(subject);
        if (expiration != null) builder.expiration(java.util.Date.from(expiration));
        return builder.signWith(
                        io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                                signingSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .compact();
    }

    private static final String TEST_SIGNING_KEY =
            "test-only-signing-key-not-for-deployment-123456789";

    @Test
    void jwtExpirationRejectsTheExactExpiryInstant() throws Exception {
        var expires = clock.instant().plusSeconds(1);
        String shortToken = signedToken(user.getId().toString(), expires, TEST_SIGNING_KEY);
        clock.now.set(expires.minusMillis(1));
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + shortToken))
                .andExpect(status().isOk());
        clock.now.set(expires);
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + shortToken))
                .andExpect(status().isUnauthorized());
        clock.now.set(expires.plusMillis(1));
        assertFalse(jwt.isValid(shortToken));
    }

    @Test
    void jwtRejectsWrongKeysAndMissingRequiredIdentityOrExpiration() throws Exception {
        for (String invalid :
                java.util.List.of(
                        signedToken(
                                user.getId().toString(),
                                clock.instant().plusSeconds(60),
                                "different-signing-key-for-test-only-123456789"),
                        signedToken(null, clock.instant().plusSeconds(60), TEST_SIGNING_KEY),
                        signedToken(
                                "not-a-number", clock.instant().plusSeconds(60), TEST_SIGNING_KEY),
                        signedToken(user.getId().toString(), null, TEST_SIGNING_KEY))) {
            http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + invalid))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void roleClaimsCannotOverrideTheCurrentDatabaseRole() throws Exception {
        String forgedRole =
                signedToken(
                        user.getId().toString(), clock.instant().plusSeconds(60), TEST_SIGNING_KEY);
        http.perform(get("/api/v1/admin/users").header("Authorization", "Bearer " + forgedRole))
                .andExpect(status().isForbidden());
    }

    @Test
    void corsRejectsUntrustedOriginsAndDoesNotEchoThem() throws Exception {
        http.perform(
                        options("/api/v1/auth/login")
                                .header("Origin", "https://untrusted.example")
                                .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        http.perform(
                        post("/api/v1/auth/login")
                                .header("Origin", "https://untrusted.example")
                                .contentType("application/json")
                                .content(
                                        "{\"username\":\"player\",\"password\":\"a-long-test-password\"}"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        http.perform(
                        options("/api/v1/auth/login")
                                .header("Origin", "http://localhost:8080")
                                .header("Access-Control-Request-Method", "POST")
                                .header(
                                        "Access-Control-Request-Headers",
                                        "Content-Type,Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8080"));
    }

    private Long fixtureScore(Instant at, int points, boolean won, String username) {
        User owner =
                users.findByUsername(username)
                        .orElseGet(
                                () -> {
                                    var next = new User();
                                    next.setUsername(username);
                                    next.setEmail(username + "@example.com");
                                    next.setPasswordHash("unused");
                                    return users.save(next);
                                });
        return db.queryForObject(
                "INSERT INTO"
                    + " scores(user_id,username,language,attempts,duration_ms,won_at,played_at,score,word,won)"
                    + " VALUES (?,?,?,1,0,?,?,?,?,?) RETURNING id",
                Long.class,
                owner.getId(),
                username,
                "en",
                java.sql.Timestamp.from(at),
                at.atZone(ZoneId.of("Europe/Istanbul")).toLocalDate(),
                points,
                "APPLE",
                won);
    }

    @Test
    void dailyLeaderboardUsesHalfOpenIstanbulBoundaries() {
        clock.now.set(Instant.parse("2026-11-18T09:00:00Z"));
        var zone = ZoneId.of("Europe/Istanbul");
        var start = LocalDate.of(2026, 11, 18).atStartOfDay(zone).toInstant();
        fixtureScore(start.minusNanos(1000), 9999, true, "before");
        Long included = fixtureScore(start, 5000, true, "start");
        fixtureScore(start.plusSeconds(86400), 9999, true, "after");
        fixtureScore(start.plusSeconds(10), 9999, false, "lost");
        assertEquals(
                java.util.List.of(included),
                scores.dailyTop("en", 10, zone).stream()
                        .map(com.ariforhanus.wordle.dto.ScoreResponse::getId)
                        .toList());
    }

    @Test
    void weeklyAndMonthlyLeaderboardsExcludeTheirOuterBoundaries() {
        clock.now.set(Instant.parse("2026-11-18T09:00:00Z"));
        var zone = ZoneId.of("Europe/Istanbul");
        var week = LocalDate.of(2026, 11, 16).atStartOfDay(zone).toInstant();
        var month = LocalDate.of(2026, 11, 1).atStartOfDay(zone).toInstant();
        fixtureScore(month.minusNanos(1000), 9999, true, "beforemonth");
        Long monthFirst = fixtureScore(month, 1000, true, "monthfirst");
        Long beforeWeek = fixtureScore(week.minusNanos(1000), 2000, true, "beforeweek");
        Long weekFirst = fixtureScore(week, 3000, true, "weekfirst");
        var tomorrow = LocalDate.of(2026, 11, 19).atStartOfDay(zone).toInstant();
        fixtureScore(tomorrow, 9999, true, "tomorrow");
        assertEquals(
                java.util.List.of(weekFirst),
                scores.weeklyTop("en", 10, zone).stream()
                        .map(com.ariforhanus.wordle.dto.ScoreResponse::getId)
                        .toList());
        assertEquals(
                java.util.List.of(weekFirst, beforeWeek, monthFirst),
                scores.monthlyTop("en", 10, zone).stream()
                        .map(com.ariforhanus.wordle.dto.ScoreResponse::getId)
                        .toList());
    }

    @Test
    void tiesUseEarlierWinTimeAndOldStreaksExpire() {
        clock.now.set(Instant.parse("2026-11-18T09:00:00Z"));
        var instant = clock.instant();
        Long later = fixtureScore(instant, 5000, true, "late");
        Long earlier = fixtureScore(instant.minusSeconds(1), 5000, true, "early");
        assertEquals(
                java.util.List.of(earlier, later),
                scores.topGlobal("en").stream()
                        .map(com.ariforhanus.wordle.dto.ScoreResponse::getId)
                        .toList());
        for (int days = 5; days <= 7; days++)
            fixtureScore(instant.minusSeconds(days * 86400L), 1000, true, "player");
        var stats = scores.statsForUser(user.getId());
        assertEquals(0, stats.currentStreak());
        assertEquals(3, stats.bestStreak());
    }

    @Test
    void turkishGameHandlesLocaleCasing() {
        var game = games.start(user.getId(), "tr");
        db.update(
                "UPDATE daily_puzzles SET answer='İNCİR' WHERE id=(SELECT puzzle_id FROM"
                        + " daily_games WHERE id=?)",
                game.id());
        assertEquals("won", games.guess(user.getId(), game.id(), "incir", 1).status());
        assertEquals("İNCİR", games.get(user.getId(), game.id()).answer());
        assertEquals(1, count("scores"));
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
