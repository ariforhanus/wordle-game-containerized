package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.DailyGameService;
import com.ariforhanus.wordle.support.MutableClock;
import com.ariforhanus.wordle.support.TestClockConfiguration;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.ObjectMapper;

import java.time.*;
import java.util.concurrent.*;

@SpringBootTest
@Import(TestClockConfiguration.class)
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
    @Autowired com.ariforhanus.wordle.service.WordService words;
    @Autowired com.ariforhanus.wordle.service.ScoreService scores;
    @Autowired MutableClock clock;
    @Autowired ObjectMapper json;
    @Autowired com.ariforhanus.wordle.controller.AdminController admin;
    User user;
    String token;

    @Test
    void renamedUsernameKeepsOldJwtBoundToItsImmutableOwnerEvenWhenNameIsReused() throws Exception {
        var game = startApple();
        String originalName = user.getUsername();
        String renamed = "renamed_player";
        http.perform(
                        post("/api/v1/auth/profile")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content(
                                        json.writeValueAsString(
                                                java.util.Map.of("username", renamed))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(renamed));
        assertEquals(originalName, jwt.extractUsername(token)); // informational issuance snapshot
        assertEquals(user.getId(), jwt.extractUserId(token));

        var replacement = new User();
        replacement.setUsername(originalName);
        replacement.setEmail("replacement@example.test");
        replacement.setPasswordHash(encoder.encode("different-owner-password"));
        replacement.setCreatedAt(clock.instant());
        users.save(replacement);
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value(renamed))
                .andExpect(jsonPath("$.email").value(user.getEmail()));
        http.perform(
                        get("/api/v1/daily/games/" + game.id())
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(game.id()));
        http.perform(
                        post("/api/v1/auth/login")
                                .contentType("application/json")
                                .content(
                                        json.writeValueAsString(
                                                java.util.Map.of(
                                                        "username",
                                                        originalName,
                                                        "password",
                                                        "a-long-test-password"))))
                .andExpect(status().isUnauthorized());
        var signedIn =
                http.perform(
                                post("/api/v1/auth/login")
                                        .contentType("application/json")
                                        .content(
                                                json.writeValueAsString(
                                                        java.util.Map.of(
                                                                "username",
                                                                renamed,
                                                                "password",
                                                                "a-long-test-password"))))
                        .andExpect(status().isOk())
                        .andReturn();
        String newToken =
                json.readTree(signedIn.getResponse().getContentAsString()).get("token").asText();
        assertEquals(renamed, jwt.extractUsername(newToken));
        assertEquals(user.getId(), jwt.extractUserId(newToken));
        http.perform(post("/api/v1/account/logout-all").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        for (String session : java.util.List.of(token, newToken)) {
            http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + session))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void adminRenameUsesTheCurrentDatabasePrincipalForAuthorizationAndAudit() throws Exception {
        user.setRole("ADMIN");
        users.save(user);
        String session = jwt.generateToken(user.getId(), user.getUsername(), "ADMIN");
        http.perform(
                        post("/api/v1/auth/profile")
                                .header("Authorization", "Bearer " + session)
                                .contentType("application/json")
                                .content("{\"username\":\"renamed_admin\"}"))
                .andExpect(status().isOk());
        var target = new User();
        target.setUsername("target_player");
        target.setEmail("target@example.test");
        target.setPasswordHash("unused");
        target.setCreatedAt(clock.instant());
        target = users.save(target);
        http.perform(
                        put("/api/v1/admin/users/" + target.getId() + "/role")
                                .header("Authorization", "Bearer " + session)
                                .contentType("application/json")
                                .content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isOk());
        assertEquals(
                user.getId(),
                db.queryForObject(
                        "SELECT actor_id FROM security_audit WHERE action='ADMIN_ROLE_ADMIN'",
                        Long.class));
        assertEquals("ADMIN", users.findById(target.getId()).orElseThrow().getRole());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"role", "delete"})
    void adminMutationsLockActorBeforeHigherIdTarget(String operation) throws Exception {
        user.setRole("ADMIN");
        users.save(user);
        var target = new User();
        target.setUsername("other_admin");
        target.setEmail("other_admin@example.test");
        target.setPasswordHash("unused");
        target.setRole("ADMIN");
        target.setCreatedAt(clock.instant());
        Long targetId = users.save(target).getId();
        var actor =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        user.getUsername(), null);
        var pool = Executors.newSingleThreadExecutor();
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            int blockerId;
            try (var query = blocker.createStatement();
                    var row = query.executeQuery("SELECT pg_backend_pid()")) {
                row.next();
                blockerId = row.getInt(1);
            }
            try (var lock =
                    blocker.prepareStatement("SELECT id FROM users WHERE id=? FOR UPDATE")) {
                lock.setLong(1, user.getId());
                lock.executeQuery().close();
            }
            var pending =
                    pool.submit(
                            () ->
                                    operation.equals("role")
                                            ? admin.changeRole(
                                                    targetId,
                                                    java.util.Map.of("role", "USER"),
                                                    actor)
                                            : admin.deleteUser(targetId, actor));
            try {
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                boolean waiting;
                do {
                    waiting =
                            Boolean.TRUE.equals(
                                    db.queryForObject(
                                            "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ?"
                                                    + " = ANY(pg_blocking_pids(pid)))",
                                            Boolean.class,
                                            blockerId));
                    if (waiting) break;
                    Thread.sleep(10);
                } while (System.nanoTime() < deadline);
                assertTrue(waiting, "admin mutation must really wait for the actor lock");
                // The mail retry path locks the same two users in ascending ID order.
                // Holding the target before waiting for the actor can deadlock that path.
                try (var probe =
                        blocker.prepareStatement(
                                "SELECT id FROM users WHERE id=? FOR UPDATE NOWAIT")) {
                    probe.setLong(1, targetId);
                    assertDoesNotThrow(() -> probe.executeQuery().close());
                }
            } finally {
                blocker.rollback();
            }
            assertEquals(200, pending.get(10, TimeUnit.SECONDS).getStatusCode().value());
            assertEquals(
                    1,
                    db.queryForObject(
                            "SELECT count(*) FROM security_audit WHERE actor_id=? AND action=?",
                            Integer.class,
                            user.getId(),
                            operation.equals("role") ? "ADMIN_ROLE_USER" : "ADMIN_USER_DELETED"));
        } finally {
            pool.shutdown();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    @BeforeEach
    void reset() {
        db.execute(
                "TRUNCATE TABLE auth_rate_limits, security_audit, daily_games, daily_puzzles,"
                        + " scores, users RESTART IDENTITY CASCADE");
        clock.set(BEFORE_MIDNIGHT);
        user = new User();
        user.setCreatedAt(clock.instant());
        user.setUsername("player");
        user.setEmail("player@example.com");
        user.setPasswordHash(encoder.encode("a-long-test-password"));
        user = users.save(user);
        token = jwt.generateToken(user.getId(), user.getUsername(), "USER");
    }

    @Test
    void calendarMetadataIsServerAuthoritativeAndNeverStartsAGame() throws Exception {
        http.perform(get("/api/v1/daily/games").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serverNow").value(clock.instant().toString()))
                .andExpect(
                        jsonPath("$.nextGameAt")
                                .value(
                                        REFERENCE_DAY
                                                .plusDays(1)
                                                .atStartOfDay(APP_ZONE)
                                                .toInstant()
                                                .toString()));
        assertEquals(0, count("daily_games"));
        assertEquals(0, count("daily_puzzles"));
        var game = startApple();
        games.guess(user.getId(), game.id(), "APPLE", 1);
        assertEquals(clock.instant(), games.status(user.getId(), "en").serverNow());
        assertEquals(
                REFERENCE_DAY.plusDays(1).atStartOfDay(APP_ZONE).toInstant(),
                games.status(user.getId(), "en").nextGameAt());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
        "2024-03-10T05:00:00Z,2024-03-11T04:00:00Z,23",
        "2024-11-03T04:00:00Z,2024-11-04T05:00:00Z,25"
    })
    void calendarUsesActualZoneDayLengthAtKnownDstTransitions(String start, String end, int hours) {
        // Purpose-specific known New York DST boundaries, not production clock values.
        var service =
                new DailyGameService(
                        db,
                        org.mockito.Mockito.mock(
                                com.ariforhanus.wordle.service.DailyPuzzleService.class),
                        org.mockito.Mockito.mock(
                                com.ariforhanus.wordle.service.GuessDictionary.class),
                        Clock.fixed(Instant.parse(start), ZoneOffset.UTC),
                        "America/New_York");
        var status = service.status(user.getId(), "en");
        assertEquals(Instant.parse(end), status.nextGameAt());
        assertEquals(hours, Duration.between(status.serverNow(), status.nextGameAt()).toHours());
        assertEquals("America/New_York", status.timeZone());
        assertEquals(0, count("daily_games"));
    }

    @Test
    void registrationPersistsTheInjectedCreationInstant() throws Exception {
        http.perform(
                        post("/api/v1/auth/register")
                                .contentType("application/json")
                                .content(
                                        "{\"username\":\"clock_user\",\"email\":\"clock_user@example.com\",\"password\":\"long-test-password-123\"}"))
                .andExpect(status().isOk());
        assertEquals(
                clock.instant(), users.findByUsername("clock_user").orElseThrow().getCreatedAt());
    }

    @Test
    void adminDashboardUsesTheSameApplicationDayAsTheGame() throws Exception {
        clock.set(PERIOD_TIME);
        user.setRole("ADMIN");
        users.save(user);
        String adminToken = jwt.generateToken(user.getId(), user.getUsername(), "ADMIN");
        fixtureScore(clock.instant(), 1000, true, "todayplayer");
        fixtureScore(clock.instant().minus(Duration.ofDays(1)), 1000, true, "yesterdayplayer");
        http.perform(get("/api/v1/admin/stats").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.todayPlayers").value(1))
                .andExpect(jsonPath("$.activeUsers").value(2));
    }

    @Test
    void dailyWordAndDailyGameUseTheSameInjectedCalendar() {
        clock.set(BEFORE_MIDNIGHT);
        var word = words.getDailyWord("tr");
        var game = games.start(user.getId(), "tr");
        assertEquals(REFERENCE_DAY.toString(), game.date());
        assertEquals(
                word.word(),
                db.queryForObject(
                        "SELECT answer FROM daily_puzzles WHERE played_at = ? AND language = 'tr'",
                        String.class,
                        REFERENCE_DAY));
        clock.advance(Duration.ofMinutes(2));
        words.getDailyWord("tr");
        assertEquals(2, count("daily_puzzles"));
        assertEquals(REFERENCE_DAY.plusDays(1).toString(), games.start(user.getId(), "tr").date());
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
                            get("/api/v1/daily/games")
                                    .param("lang", language)
                                    .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.state").value("not_started"))
                    .andExpect(jsonPath("$.game").isEmpty());
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
            clock.advance(Duration.ofSeconds(30));
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
        clock.set(explicitStart.plusSeconds(30));
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
    void statusRequiresAuthenticationAndValidLanguage() throws Exception {
        http.perform(get("/api/v1/daily/games")).andExpect(status().isUnauthorized());
        http.perform(
                        get("/api/v1/daily/games")
                                .param("lang", "invalid")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        assertEquals(0, count("daily_games"));
        assertEquals(0, count("daily_puzzles"));
    }

    @Test
    void statusFindsOnlyTheCurrentUsersLanguageAndDayWithoutResettingTime() throws Exception {
        var game = startApple();
        Instant original = clock.instant();
        clock.set(original.plusSeconds(10));
        http.perform(
                        get("/api/v1/daily/games")
                                .param("lang", "en")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("playing"))
                .andExpect(jsonPath("$.game.id").value(game.id()))
                .andExpect(jsonPath("$.game.elapsedMs").value(10000))
                .andExpect(jsonPath("$.game.answer").isEmpty());
        http.perform(
                        get("/api/v1/daily/games")
                                .param("lang", "tr")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("not_started"));
        var other = new User();
        other.setCreatedAt(clock.instant());
        other.setUsername("other");
        other.setEmail("other@example.com");
        other.setPasswordHash("unused");
        other = users.save(other);
        String otherToken = jwt.generateToken(other.getId(), "other", "USER");
        http.perform(
                        get("/api/v1/daily/games")
                                .param("lang", "en")
                                .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("not_started"));
        assertEquals(
                original,
                db.queryForObject(
                                "SELECT started_at FROM daily_games WHERE id = ?",
                                java.sql.Timestamp.class,
                                game.id())
                        .toInstant());
        clock.set(original.plusSeconds(120));
        String fresh = jwt.generateToken(user.getId(), user.getUsername(), "USER");
        http.perform(
                        get("/api/v1/daily/games")
                                .param("lang", "en")
                                .header("Authorization", "Bearer " + fresh))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("not_started"));
        assertEquals(1, count("daily_games"));
        assertEquals(1, count("daily_puzzles"));
    }

    @Test
    void statusDistinguishesSavedResultsFromLegacyCompletedScores() throws Exception {
        var game = startApple();
        games.guess(user.getId(), game.id(), "APPLE", 1);
        http.perform(
                        get("/api/v1/daily/games")
                                .param("lang", "en")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("finished"))
                .andExpect(jsonPath("$.game.answer").value("APPLE"));
        db.update("DELETE FROM daily_games WHERE id = ?", game.id());
        http.perform(
                        get("/api/v1/daily/games")
                                .param("lang", "en")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("already_played"))
                .andExpect(jsonPath("$.game").isEmpty());
        assertEquals(1, count("scores"));
        assertEquals(0, count("daily_games"));
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
        clock.advance(Duration.ofSeconds(20));
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
        clock.set(DAYTIME);
        Instant startedAt = clock.instant();
        String answer = language.equals("tr") ? "İNCİR" : "APPLE";
        seedAnswer(language, answer);
        var game = games.start(user.getId(), language);
        // There are no game requests while this deterministic server clock advances.
        clock.set(startedAt.plusSeconds(120));
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
        clock.set(startedAt.plusSeconds(180));
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
        clock.set(startedAt.plusSeconds(240));
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
        other.setCreatedAt(clock.instant());
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
        seedAnswer("en", "APPLE");
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

    private static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments>
            midnightCases() {
        var sunday =
                REFERENCE_DAY.with(
                        java.time.temporal.TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        var monthEnd = REFERENCE_DAY.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());
        var yearEnd = REFERENCE_DAY.with(java.time.temporal.TemporalAdjusters.lastDayOfYear());
        return java.util.stream.Stream.of(
                org.junit.jupiter.params.provider.Arguments.of("en", REFERENCE_DAY, true),
                org.junit.jupiter.params.provider.Arguments.of("tr", REFERENCE_DAY, true),
                org.junit.jupiter.params.provider.Arguments.of("en", sunday, true),
                org.junit.jupiter.params.provider.Arguments.of("tr", monthEnd, true),
                org.junit.jupiter.params.provider.Arguments.of("en", yearEnd, true),
                org.junit.jupiter.params.provider.Arguments.of("tr", yearEnd, true),
                org.junit.jupiter.params.provider.Arguments.of(
                        "en",
                        REFERENCE_DAY
                                .withMonth(2)
                                .with(java.time.temporal.TemporalAdjusters.lastDayOfMonth()),
                        true),
                org.junit.jupiter.params.provider.Arguments.of(
                        "tr",
                        REFERENCE_DAY
                                .withMonth(2)
                                .with(java.time.temporal.TemporalAdjusters.lastDayOfMonth()),
                        true),
                org.junit.jupiter.params.provider.Arguments.of("en", REFERENCE_DAY, false),
                org.junit.jupiter.params.provider.Arguments.of("tr", REFERENCE_DAY, false));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.MethodSource("midnightCases")
    void midnightKeepsPuzzleDatesAndRequiresAnExplicitNewDayStart(
            String language, LocalDate oldDate, boolean winning) throws Exception {
        var zone = APP_ZONE;
        Instant boundary = oldDate.plusDays(1).atStartOfDay(zone).toInstant();
        clock.set(boundary.minusMillis(1));
        String session = jwt.generateToken(user.getId(), user.getUsername(), "USER");
        var before = gameRequest(get("/api/v1/daily/games").param("lang", language), session);
        assertEquals(oldDate.toString(), before.get("date").asText());
        assertEquals(boundary.toString(), before.get("nextGameAt").asText());
        assertEquals("Europe/Istanbul", before.get("timeZone").asText());
        assertEquals(0, count("daily_puzzles"));
        String word = language.equals("tr") ? "İNCİR" : "APPLE";
        String oldAnswer = winning ? word : language.equals("tr") ? "KİTAP" : "CIGAR";
        seedAnswer(language, oldAnswer);
        var old =
                gameRequest(
                        post("/api/v1/daily/games")
                                .param("lang", language)
                                .param("date", oldDate.toString()),
                        session);
        String oldId = old.get("id").asText();
        int finalTurn = winning ? 1 : 6;
        for (int turn = 1; turn < finalTurn; turn++) games.guess(user.getId(), oldId, word, turn);
        clock.set(boundary);
        LocalDate today = oldDate.plusDays(1);
        var after = gameRequest(get("/api/v1/daily/games").param("lang", language), session);
        assertEquals("not_started", after.get("state").asText());
        assertEquals(today.toString(), after.get("date").asText());
        assertEquals(
                today.plusDays(1).atStartOfDay(zone).toInstant().toString(),
                after.get("nextGameAt").asText());
        assertEquals(1, count("daily_games"));
        assertEquals(1, count("daily_puzzles"));
        http.perform(
                        post("/api/v1/daily/games")
                                .param("lang", language)
                                .param("date", oldDate.toString())
                                .header("Authorization", "Bearer " + session))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("day_changed"));
        http.perform(
                        post("/api/v1/daily/games")
                                .param("lang", language)
                                .param("date", today.plusDays(1).toString())
                                .header("Authorization", "Bearer " + session))
                .andExpect(status().isConflict());
        http.perform(
                        post("/api/v1/daily/games")
                                .param("lang", language)
                                .param("date", "invalid")
                                .header("Authorization", "Bearer " + session))
                .andExpect(status().isBadRequest());
        assertEquals(1, count("daily_games"));
        assertEquals(1, count("daily_puzzles"));
        seedAnswer(language, word);
        var next =
                gameRequest(
                        post("/api/v1/daily/games")
                                .param("lang", language)
                                .param("date", today.toString()),
                        session);
        String nextId = next.get("id").asText();
        assertNotEquals(oldId, nextId);
        assertEquals(today.toString(), next.get("date").asText());
        clock.set(boundary.plusSeconds(20));
        http.perform(
                        turnRequest(oldId, word, finalTurn)
                                .header("Authorization", "Bearer " + session))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.error").value("game_expired"));
        http.perform(
                        get("/api/v1/daily/games/" + oldId)
                                .header("Authorization", "Bearer " + session))
                .andExpect(status().isGone());
        if (finalTurn > 1)
            http.perform(turnRequest(oldId, word, 1).header("Authorization", "Bearer " + session))
                    .andExpect(status().isGone());
        assertEquals(0, count("scores"));
        assertEquals(
                finalTurn - 1,
                db.queryForObject(
                        "SELECT CASE WHEN guesses='' THEN 0 ELSE"
                                + " cardinality(string_to_array(guesses,',')) END FROM daily_games"
                                + " WHERE id=?",
                        Integer.class,
                        oldId));
        assertNull(
                db.queryForObject(
                        "SELECT finished_at FROM daily_games WHERE id=?",
                        java.sql.Timestamp.class,
                        oldId));
        assertEquals(0, scores.dailyTop(language, 10, zone).size());
        gameRequest(turnRequest(nextId, word, 1), session);
        assertEquals(2, count("daily_games"));
        assertEquals(1, count("scores"));
        assertEquals(1, scores.dailyTop(language, 10, zone).size());
        assertEquals(
                db.queryForObject("SELECT id FROM scores WHERE played_at = ?", Long.class, today),
                scores.dailyTop(language, 10, zone).getFirst().getId());
        assertEquals(
                boundary.minusMillis(1),
                db.queryForObject(
                                "SELECT started_at FROM daily_games WHERE id = ?",
                                java.sql.Timestamp.class,
                                oldId)
                        .toInstant());
    }

    @Test
    void aStartBlockedAcrossMidnightRollsBackTheExpiredGame() throws Exception {
        var zone = APP_ZONE;
        LocalDate oldDate = REFERENCE_DAY;
        Instant boundary = oldDate.plusDays(1).atStartOfDay(zone).toInstant();
        clock.set(boundary.minusMillis(1));
        var pool = Executors.newSingleThreadExecutor();
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try {
                try (var insert =
                        blocker.prepareStatement(
                                "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                                        + " (?,?,'en','APPLE')")) {
                    insert.setString(1, oldDate + "_en");
                    insert.setObject(2, oldDate);
                    insert.executeUpdate();
                }
                var pending = pool.submit(() -> games.start(user.getId(), "en", oldDate));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                int waiting;
                do {
                    waiting =
                            db.queryForObject(
                                    "SELECT count(*) FROM pg_stat_activity WHERE"
                                        + " datname=current_database() AND wait_event_type='Lock'"
                                        + " AND query ILIKE '%INSERT INTO daily_puzzles%'",
                                    Integer.class);
                    if (waiting > 0) break;
                    Thread.sleep(10);
                } while (System.nanoTime() < deadline);
                assertTrue(waiting > 0, "Start must be blocked on the uncommitted puzzle");
                clock.set(boundary.plusSeconds(1));
                blocker.commit();
                var failed =
                        assertThrows(
                                ExecutionException.class, () -> pending.get(10, TimeUnit.SECONDS));
                var expired =
                        assertInstanceOf(
                                org.springframework.web.server.ResponseStatusException.class,
                                failed.getCause());
                assertEquals(410, expired.getStatusCode().value());
                assertEquals(0, count("daily_games"));
                assertEquals("not_started", games.status(user.getId(), "en").state());
                assertEquals(
                        oldDate.plusDays(1).toString(),
                        games.start(user.getId(), "en", oldDate.plusDays(1)).date());
            } finally {
                blocker.rollback();
                pool.shutdownNow();
            }
        }
    }

    @Test
    void aGuessWaitingForARowLockExpiresBeforeItCanChangeTheGame() throws Exception {
        Instant midnight = REFERENCE_DAY.plusDays(1).atStartOfDay(APP_ZONE).toInstant();
        clock.set(midnight.minusMillis(1));
        var game = startApple();
        var pool = Executors.newSingleThreadExecutor();
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try {
                try (var lock =
                        blocker.prepareStatement(
                                "SELECT id FROM daily_games WHERE id=? FOR UPDATE")) {
                    lock.setString(1, game.id());
                    lock.executeQuery().close();
                }
                var pending = pool.submit(() -> games.guess(user.getId(), game.id(), "APPLE", 1));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                int waiting;
                do {
                    waiting =
                            db.queryForObject(
                                    "SELECT count(*) FROM pg_stat_activity WHERE"
                                        + " datname=current_database() AND wait_event_type='Lock'"
                                        + " AND query ILIKE '%daily_games%FOR UPDATE%'",
                                    Integer.class);
                    if (waiting > 0) break;
                    Thread.sleep(10);
                } while (System.nanoTime() < deadline);
                assertTrue(waiting > 0);
                clock.set(midnight);
                blocker.commit();
                var failed =
                        assertThrows(
                                ExecutionException.class, () -> pending.get(10, TimeUnit.SECONDS));
                var expired =
                        assertInstanceOf(
                                org.springframework.web.server.ResponseStatusException.class,
                                failed.getCause());
                assertEquals(410, expired.getStatusCode().value());
                assertEquals("game_expired", expired.getReason());
                assertEquals(0, count("scores"));
                assertEquals(
                        "",
                        db.queryForObject(
                                "SELECT guesses FROM daily_games WHERE id=?",
                                String.class,
                                game.id()));
            } finally {
                blocker.rollback();
                pool.shutdownNow();
            }
        }
    }

    @Test
    void completedResultsRemainReadableButUnfinishedGamesExpire() {
        var game = startApple();
        var completed = games.guess(user.getId(), game.id(), "APPLE", 1);
        clock.set(REFERENCE_DAY.plusDays(1).atStartOfDay(APP_ZONE).toInstant());
        assertEquals(completed, games.get(user.getId(), game.id()));
        assertEquals(completed, games.guess(user.getId(), game.id(), "APPLE", 1));
        assertEquals(1, count("scores"));
        assertEquals(REFERENCE_DAY.plusDays(1).toString(), games.start(user.getId(), "en").date());
    }

    @Test
    void sixIncorrectGuessesPersistALossAndBlockFurtherTurns() {
        seedAnswer("en", "CIGAR");
        var game = games.start(user.getId(), "en");
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
    void conflictingHistoricalScoreRollsBackCompletionAndReturns409() throws Exception {
        var game = startApple();
        db.update(
                "INSERT INTO"
                    + " scores(user_id,username,language,attempts,duration_ms,won_at,played_at,score,word,won)"
                    + " VALUES (?,'player','en',2,1000,?,?,123,'CIGAR',true)",
                user.getId(),
                java.sql.Timestamp.from(clock.instant()),
                REFERENCE_DAY);
        http.perform(
                        post("/api/v1/daily/games/" + game.id() + "/guesses")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content("{\"guess\":\"APPLE\",\"attempt\":1}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("conflict"));
        var unchanged = games.get(user.getId(), game.id());
        assertEquals("playing", unchanged.status());
        assertTrue(unchanged.guesses().isEmpty());
        assertNull(
                db.queryForObject(
                        "SELECT finished_at FROM daily_games WHERE id=?",
                        java.sql.Timestamp.class,
                        game.id()));
        assertEquals(1, count("scores"));
        assertEquals(123, db.queryForObject("SELECT score FROM scores", Integer.class));
        assertEquals("CIGAR", db.queryForObject("SELECT word FROM scores", String.class));
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

    private java.util.List<String> independentSessions(int count) {
        clock.set(DAYTIME);
        var sessions = new java.util.ArrayList<String>();
        for (int index = 0; index < count; index++) {
            clock.advance(Duration.ofSeconds(1));
            sessions.add(jwt.generateToken(user.getId(), user.getUsername(), "USER"));
        }
        assertEquals(count, sessions.stream().distinct().count());
        return sessions;
    }

    private tools.jackson.databind.JsonNode gameRequest(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            String session)
            throws Exception {
        if (session != null) request.header("Authorization", "Bearer " + session);
        var result = http.perform(request).andExpect(status().isOk()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder turnRequest(
            String id, String word, int turn) throws Exception {
        return post("/api/v1/daily/games/" + id + "/guesses")
                .contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("guess", word, "attempt", turn)));
    }

    private <T> java.util.List<T> race(java.util.List<Callable<T>> tasks) throws Exception {
        var pool = Executors.newFixedThreadPool(tasks.size());
        var ready = new CountDownLatch(tasks.size());
        var go = new CountDownLatch(1);
        var futures = new java.util.ArrayList<Future<T>>();
        try {
            for (var task : tasks)
                futures.add(
                        pool.submit(
                                () -> {
                                    ready.countDown();
                                    assertTrue(
                                            go.await(5, TimeUnit.SECONDS), "race gate timed out");
                                    return task.call();
                                }));
            assertTrue(ready.await(5, TimeUnit.SECONDS), "workers did not reach the race gate");
            go.countDown();
            var results = new java.util.ArrayList<T>();
            for (var future : futures) results.add(future.get(10, TimeUnit.SECONDS));
            return results;
        } finally {
            go.countDown();
            futures.forEach(future -> future.cancel(true));
            pool.shutdownNow();
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"en", "tr"})
    void staleStartScreensAcrossSessionsAndMixedResumesKeepOneGame(String language)
            throws Exception {
        var sessions = independentSessions(4);
        for (String session : sessions) {
            assertEquals(
                    "not_started",
                    gameRequest(get("/api/v1/daily/games").param("lang", language), session)
                            .get("state")
                            .asText());
        }
        Instant startedAt = clock.instant();
        var starts = new java.util.ArrayList<Callable<tools.jackson.databind.JsonNode>>();
        for (String session : sessions)
            starts.add(
                    () ->
                            gameRequest(
                                    post("/api/v1/daily/games").param("lang", language), session));
        var results = race(starts);
        String id = results.getFirst().get("id").asText();
        for (var result : results) assertEquals(id, result.get("id").asText());
        clock.set(startedAt.plusSeconds(30));
        var resumes =
                race(
                        java.util.List.<Callable<tools.jackson.databind.JsonNode>>of(
                                () ->
                                        gameRequest(
                                                post("/api/v1/daily/games").param("lang", language),
                                                sessions.get(0)),
                                () ->
                                        gameRequest(
                                                post("/api/v1/daily/games").param("lang", language),
                                                sessions.get(1)),
                                () ->
                                        gameRequest(
                                                get("/api/v1/daily/games/" + id), sessions.get(2)),
                                () ->
                                        gameRequest(
                                                get("/api/v1/daily/games/" + id), sessions.get(3)),
                                () ->
                                        gameRequest(
                                                        get("/api/v1/daily/games")
                                                                .param("lang", language),
                                                        sessions.get(0))
                                                .get("game"),
                                () ->
                                        gameRequest(
                                                        get("/api/v1/daily/games")
                                                                .param("lang", language),
                                                        sessions.get(1))
                                                .get("game")));
        for (var result : resumes) {
            assertEquals(id, result.get("id").asText());
            assertEquals(30000, result.get("elapsedMs").asLong());
            assertTrue(result.get("answer").isNull());
        }
        assertEquals(1, count("daily_games"));
        assertEquals(1, count("daily_puzzles"));
        assertEquals(0, count("scores"));
        assertEquals(
                startedAt,
                db.queryForObject(
                                "SELECT started_at FROM daily_games WHERE id = ?",
                                java.sql.Timestamp.class,
                                id)
                        .toInstant());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"en,true", "en,false", "tr,true", "tr,false"})
    void finalTurnWaitsForDatabaseLockAndCommitsOnceAcrossSessions(String language, boolean winning)
            throws Exception {
        var sessions = independentSessions(3);
        String guess = language.equals("tr") ? "İNCİR" : "APPLE";
        String answer = winning ? guess : language.equals("tr") ? "KİTAP" : "CIGAR";
        seedAnswer(language, answer);
        var game = games.start(user.getId(), language);
        Instant startedAt = clock.instant();
        int turn = winning ? 1 : 6;
        for (int index = 1; index < turn; index++)
            games.guess(user.getId(), game.id(), guess, index);
        clock.set(startedAt.plusSeconds(20));
        var pool = Executors.newFixedThreadPool(3);
        try (var blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try {
                try (var lock =
                        blocker.prepareStatement(
                                "SELECT id FROM daily_games WHERE id = ? FOR UPDATE")) {
                    lock.setString(1, game.id());
                    lock.executeQuery().close();
                }
                var first =
                        pool.submit(
                                () ->
                                        gameRequest(
                                                turnRequest(game.id(), guess, turn),
                                                sessions.get(0)));
                var second =
                        pool.submit(
                                () ->
                                        gameRequest(
                                                turnRequest(game.id(), guess, turn),
                                                sessions.get(1)));
                var resumed =
                        pool.submit(
                                () ->
                                        gameRequest(
                                                post("/api/v1/daily/games").param("lang", language),
                                                sessions.get(2)));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                int waiting;
                do {
                    waiting =
                            db.queryForObject(
                                    "SELECT count(*) FROM pg_stat_activity WHERE datname ="
                                            + " current_database() AND wait_event_type = 'Lock' AND"
                                            + " query ILIKE '%daily_games%FOR UPDATE%'",
                                    Integer.class);
                    if (waiting >= 2) break;
                    Thread.sleep(10);
                } while (System.nanoTime() < deadline);
                assertTrue(waiting >= 2, "both HTTP turns must actually wait on PostgreSQL locks");
                var snapshot =
                        gameRequest(get("/api/v1/daily/games/" + game.id()), sessions.get(2));
                assertEquals("playing", snapshot.get("status").asText());
                assertEquals(turn - 1, snapshot.get("guesses").size());
                assertEquals(0, count("scores"));
                blocker.commit();
                var completed = first.get(10, TimeUnit.SECONDS);
                assertEquals(completed, second.get(10, TimeUnit.SECONDS));
                assertEquals(game.id(), resumed.get(10, TimeUnit.SECONDS).get("id").asText());
                assertEquals(winning ? "won" : "lost", completed.get("status").asText());
                assertEquals(turn, completed.get("guesses").size());
                assertEquals(20000, completed.get("elapsedMs").asLong());
                clock.set(startedAt.plusSeconds(40));
                assertEquals(
                        completed,
                        gameRequest(turnRequest(game.id(), guess, turn), sessions.get(2)));
                http.perform(
                                turnRequest(
                                                game.id(),
                                                winning
                                                        ? answer.equals("APPLE") ? "REBUT" : "ELMAS"
                                                        : answer,
                                                turn)
                                        .header("Authorization", "Bearer " + sessions.get(1)))
                        .andExpect(status().isConflict());
                assertEquals(1, count("daily_games"));
                assertEquals(1, count("scores"));
                assertEquals(
                        20000L, db.queryForObject("SELECT duration_ms FROM scores", Long.class));
                assertEquals(
                        completed.get("score").asInt(),
                        db.queryForObject("SELECT score FROM scores", Integer.class));
                assertEquals(
                        startedAt,
                        db.queryForObject(
                                        "SELECT started_at FROM daily_games WHERE id = ?",
                                        java.sql.Timestamp.class,
                                        game.id())
                                .toInstant());
            } finally {
                blocker.rollback();
                pool.shutdownNow();
            }
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"en", "tr"})
    void differentSessionHttpTurnsConflictWithoutOverwritingTheAcceptedGuess(String language)
            throws Exception {
        var sessions = independentSessions(2);
        seedAnswer(language, language.equals("tr") ? "İNCİR" : "APPLE");
        var game = games.start(user.getId(), language);
        var words =
                language.equals("tr")
                        ? java.util.List.of("ELMAS", "KİTAP")
                        : java.util.List.of("CIGAR", "REBUT");
        var results =
                race(
                        java.util.List.<Callable<org.springframework.test.web.servlet.MvcResult>>of(
                                () ->
                                        http.perform(
                                                        turnRequest(game.id(), words.get(0), 1)
                                                                .header(
                                                                        "Authorization",
                                                                        "Bearer "
                                                                                + sessions.get(0)))
                                                .andReturn(),
                                () ->
                                        http.perform(
                                                        turnRequest(game.id(), words.get(1), 1)
                                                                .header(
                                                                        "Authorization",
                                                                        "Bearer "
                                                                                + sessions.get(1)))
                                                .andReturn()));
        assertEquals(
                java.util.List.of(200, 409),
                results.stream().map(result -> result.getResponse().getStatus()).sorted().toList());
        var persisted = games.get(user.getId(), game.id());
        assertEquals(1, persisted.guesses().size());
        String accepted = persisted.guesses().getFirst().guess();
        assertTrue(words.contains(accepted));
        assertEquals(
                1,
                gameRequest(turnRequest(game.id(), accepted, 1), sessions.get(1))
                        .get("guesses")
                        .size());
        String rejected =
                words.stream().filter(word -> !word.equals(accepted)).findFirst().orElseThrow();
        http.perform(
                        turnRequest(game.id(), rejected, 1)
                                .header("Authorization", "Bearer " + sessions.get(0)))
                .andExpect(status().isConflict());
        assertEquals(accepted, games.get(user.getId(), game.id()).guesses().getFirst().guess());
        assertEquals(0, count("scores"));
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
        clock.set(expires.minusMillis(1));
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + shortToken))
                .andExpect(status().isOk());
        clock.set(expires);
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + shortToken))
                .andExpect(status().isUnauthorized());
        clock.set(expires.plusMillis(1));
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
        return fixtureScoreInLanguage(at, points, won, username, "en");
    }

    private Long fixtureScoreInLanguage(
            Instant at, int points, boolean won, String username, String language) {
        User owner =
                users.findByUsername(username)
                        .orElseGet(
                                () -> {
                                    var next = new User();
                                    next.setCreatedAt(clock.instant());
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
                language,
                java.sql.Timestamp.from(at),
                at.atZone(APP_ZONE).toLocalDate(),
                points,
                "APPLE",
                won);
    }

    @Test
    void lossTodayBreaksCurrentStreakButNotBestStreak() {
        clock.set(PERIOD_TIME);
        fixtureScore(clock.instant().minus(Duration.ofDays(1)), 1000, true, "player");
        fixtureScore(clock.instant(), 0, false, "player");
        db.update("UPDATE scores SET attempts=6 WHERE won=false");
        var stats = scores.statsForUser(user.getId(), "en");
        assertEquals(0, stats.currentStreak());
        assertEquals(1, stats.bestStreak());
        assertFalse(stats.guessDistribution().containsKey(6));
    }

    @Test
    void aLossInTurkishNeverBreaksTheEnglishStreakOrMixesItsDistribution() throws Exception {
        clock.set(PERIOD_TIME);
        for (int day = 0; day < 3; day++)
            fixtureScoreInLanguage(
                    clock.instant().minus(Duration.ofDays(day)), 1000, true, "player", "en");
        for (int day = 1; day < 3; day++)
            fixtureScoreInLanguage(
                    clock.instant().minus(Duration.ofDays(day)), 1000, true, "player", "tr");
        fixtureScoreInLanguage(clock.instant(), 0, false, "player", "tr");
        var en = scores.statsForUser(user.getId(), "en");
        var tr = scores.statsForUser(user.getId(), "tr");
        assertEquals(6, en.totalGames());
        assertEquals(3, en.currentStreak());
        assertEquals(3, en.bestStreak());
        assertEquals(0, tr.currentStreak());
        assertEquals(2, tr.bestStreak());
        assertEquals(3, en.byLanguage().get("en").guessDistribution().get(1));
        assertEquals(2, en.byLanguage().get("tr").guessDistribution().get(1));
        assertEquals(3, scores.weeklyTop("en", 10, APP_ZONE).getFirst().currentStreak());
        assertEquals(0, scores.weeklyTop("tr", 10, APP_ZONE).getFirst().currentStreak());
        String session = jwt.generateToken(user.getId(), user.getUsername(), "USER");
        var api = gameRequest(get("/api/v1/stats/me").param("lang", "tr"), session);
        assertEquals("tr", api.get("language").asText());
        assertEquals(0, api.get("currentStreak").asInt());
        assertEquals(3, api.get("byLanguage").get("en").get("currentStreak").asInt());
        http.perform(
                        get("/api/v1/stats/me")
                                .param("lang", "invalid")
                                .header("Authorization", "Bearer " + session))
                .andExpect(status().isBadRequest());
    }

    @Test
    void skippingOneLanguageExpiresOnlyThatLanguagesCurrentStreak() {
        clock.set(PERIOD_TIME);
        for (int day = 1; day <= 2; day++)
            fixtureScoreInLanguage(
                    clock.instant().minus(Duration.ofDays(day)), 1000, true, "player", "en");
        for (int day = 0; day <= 2; day++)
            fixtureScoreInLanguage(
                    clock.instant().minus(Duration.ofDays(day)), 1000, true, "player", "tr");
        assertEquals(2, scores.statsForUser(user.getId(), "en").currentStreak());
        for (int day = 0; day < 2; day++) {
            clock.advance(Duration.ofDays(1));
            fixtureScoreInLanguage(clock.instant(), 1000, true, "player", "tr");
        }
        var stats = scores.statsForUser(user.getId(), "tr");
        assertEquals(5, stats.currentStreak());
        assertEquals(0, stats.byLanguage().get("en").currentStreak());
        assertEquals(2, stats.byLanguage().get("en").bestStreak());
    }

    @Test
    void streaksUsePuzzleDatesAndIgnoreFutureDatedRecords() {
        clock.set(PERIOD_TIME);
        for (int day = 0; day < 3; day++)
            fixtureScore(clock.instant().minus(Duration.ofDays(day)), 1000, true, "player");
        db.update("UPDATE scores SET won_at=?", java.sql.Timestamp.from(clock.instant()));
        fixtureScore(clock.instant().plus(Duration.ofDays(1)), 9999, true, "player");
        var stats = scores.statsForUser(user.getId());
        assertEquals(3, stats.totalGames());
        assertEquals(1000, stats.bestScore());
        assertEquals(3, stats.currentStreak());
        assertEquals(3, stats.bestStreak());
    }

    @Test
    void emptyAndLossOnlyHistoriesHaveZeroStreaksAndFutureLanguageKeysStayIndependent() {
        clock.set(PERIOD_TIME);
        var empty = scores.statsForUser(user.getId(), "tr");
        assertEquals(0, empty.totalGames());
        assertEquals(0, empty.byLanguage().get("tr").bestStreak());
        fixtureScore(clock.instant(), 0, false, "player");
        fixtureScoreInLanguage(clock.instant(), 1000, true, "player", "de");
        var stats = scores.statsForUser(user.getId(), "en");
        assertEquals(0, stats.currentStreak());
        assertEquals(0, stats.bestStreak());
        assertEquals(1, stats.byLanguage().get("de").currentStreak());
        assertTrue(stats.byLanguage().get("en").guessDistribution().isEmpty());
    }

    @Test
    void longHistoriesReturnBoundedLanguageSummariesWithWeightedOverallMetrics() {
        clock.set(PERIOD_TIME);
        db.update(
                """
                INSERT INTO scores(user_id,username,language,attempts,duration_ms,won_at,played_at,score,word,won)
                SELECT ?, 'player', lang,1,1000,?::timestamptz,CAST(? AS date)-day,1000,'APPLE',true
                FROM generate_series(0,999) AS day CROSS JOIN (VALUES ('en'),('tr')) AS languages(lang)
                """,
                user.getId(),
                java.sql.Timestamp.from(clock.instant()),
                PERIOD_DAY);
        var stats = scores.statsForUser(user.getId(), "tr");
        assertEquals(2000, stats.totalGames());
        assertEquals(2, stats.byLanguage().size());
        assertEquals(1000, stats.currentStreak());
        assertEquals(1000, stats.bestStreak());
        assertEquals(1000, stats.averageScore());
        assertEquals(1, stats.averageDurationSeconds());
        assertEquals(1000, stats.byLanguage().get("en").guessDistribution().get(1));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"en", "tr"})
    void dailyRanksOnlyTenWinningGamesForTheSelectedPuzzleDayAndLanguage(String language)
            throws Exception {
        clock.set(PERIOD_TIME);
        for (int index = 0; index < 14; index++)
            fixtureScoreInLanguage(
                    clock.instant(), 9000 - index * 100, true, "rank" + index, language);
        fixtureScoreInLanguage(clock.instant(), 9999, false, "loss", language);
        fixtureScoreInLanguage(
                clock.instant().minus(Duration.ofDays(1)), 9999, true, "yesterday", language);
        fixtureScoreInLanguage(
                clock.instant().plus(Duration.ofDays(1)), 9999, true, "tomorrow", language);
        fixtureScoreInLanguage(
                clock.instant(), 9999, true, "other_language", language.equals("en") ? "tr" : "en");
        var board = gameRequest(get("/api/v1/leaderboard/daily").param("lang", language), null);
        assertEquals(10, board.size());
        for (int index = 0; index < 10; index++) {
            assertEquals("rank" + index, board.get(index).get("username").asText());
            assertEquals(9000 - index * 100, board.get(index).get("score").asInt());
            assertTrue(board.get(index).get("word").isNull());
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"en", "tr"})
    void periodBoardsSumWinsOncePerPlayerWithoutMixingLanguagesOrDates(String language)
            throws Exception {
        clock.set(PERIOD_TIME);
        for (int day = 0; day < 3; day++)
            fixtureScoreInLanguage(
                    clock.instant().minus(Duration.ofDays(day)), 9000, true, "collector", language);
        fixtureScoreInLanguage(clock.instant(), 9999, true, "single", language);
        fixtureScoreInLanguage(clock.instant(), 9999, false, "loss", language);
        fixtureScoreInLanguage(
                clock.instant(), 9999, true, "other", language.equals("en") ? "tr" : "en");
        fixtureScoreInLanguage(
                PERIOD_DAY.withDayOfMonth(1).minusDays(1).atStartOfDay(APP_ZONE).toInstant(),
                9999,
                true,
                "outside",
                language);
        fixtureScoreInLanguage(
                clock.instant().plus(Duration.ofDays(1)), 9999, true, "future", language);
        db.update("UPDATE users SET username='collector_current' WHERE username='collector'");
        assertTrue(
                scores.dailyTop(language, 10, APP_ZONE).stream()
                        .anyMatch(row -> row.getUsername().equals("collector_current")));
        assertFalse(
                scores.topGlobal(language).stream()
                        .anyMatch(row -> row.getUsername().equals("collector")));
        Long collector = users.findByUsername("collector_current").orElseThrow().getId();
        assertEquals(
                "collector_current",
                scores.getDailyStatus(collector, language).orElseThrow().getUsername());
        assertEquals(
                "collector",
                db.queryForObject(
                        "SELECT username FROM scores WHERE user_id=? LIMIT 1",
                        String.class,
                        collector));
        for (String period : java.util.List.of("weekly", "monthly")) {
            var response =
                    gameRequest(get("/api/v1/leaderboard/" + period).param("lang", language), null);
            assertEquals(27000L, response.get(0).get("totalScore").asLong());
            assertEquals(27000L, response.get(0).get("score").asLong());
            assertEquals(response.get(0).get("userId"), response.get(0).get("id"));
            assertEquals(3, response.get(0).get("wins").asInt());
            assertTrue(response.get(0).hasNonNull("userId"));
            assertTrue(response.get(0).hasNonNull("lastWinAt"));
        }
        for (var board :
                java.util.List.of(
                        scores.weeklyTop(language, 10, APP_ZONE),
                        scores.monthlyTop(language, 10, APP_ZONE))) {
            assertEquals(2, board.size());
            assertEquals("collector_current", board.getFirst().username());
            assertEquals(27000L, board.getFirst().totalScore());
            assertEquals(3L, board.getFirst().wins());
            assertEquals(clock.instant(), board.getFirst().lastWinAt());
            assertEquals("single", board.get(1).username());
            assertEquals(9999L, board.get(1).totalScore());
            assertEquals(
                    2,
                    board.stream()
                            .map(com.ariforhanus.wordle.dto.LeaderboardTotalResponse::userId)
                            .distinct()
                            .count());
        }
    }

    @Test
    void periodLimitIsAppliedAfterGroupingAndSumming() {
        clock.set(PERIOD_TIME);
        for (int index = 0; index < 11; index++)
            fixtureScore(clock.instant(), 9999, true, "single" + index);
        fixtureScore(clock.instant(), 6000, true, "collector");
        fixtureScore(clock.instant().minus(Duration.ofDays(1)), 6000, true, "collector");
        var result = scores.weeklyTop("en", 10, APP_ZONE);
        assertEquals(10, result.size());
        assertEquals("collector", result.getFirst().username());
        assertEquals(12000, result.getFirst().totalScore());
    }

    @Test
    void tiedTotalsAndDailyScoresUseCompletionTimeThenStableIdentity() {
        clock.set(PERIOD_TIME);
        fixtureScore(
                PERIOD_DAY.withDayOfMonth(1).minusDays(1).atStartOfDay(APP_ZONE).toInstant(),
                1,
                true,
                "older_id");
        fixtureScore(clock.instant(), 5000, true, "newer_id");
        fixtureScore(clock.instant(), 5000, true, "older_id");
        fixtureScore(clock.instant().minusSeconds(1), 5000, true, "earlier_win");
        var expected = java.util.List.of("earlier_win", "older_id", "newer_id");
        for (int repeat = 0; repeat < 2; repeat++) {
            assertEquals(
                    expected,
                    scores.dailyTop("en", 10, APP_ZONE).stream()
                            .map(com.ariforhanus.wordle.dto.ScoreResponse::getUsername)
                            .toList());
            assertEquals(
                    expected,
                    scores.weeklyTop("en", 10, APP_ZONE).stream()
                            .map(com.ariforhanus.wordle.dto.LeaderboardTotalResponse::username)
                            .toList());
            assertEquals(
                    expected,
                    scores.monthlyTop("en", 10, APP_ZONE).stream()
                            .map(com.ariforhanus.wordle.dto.LeaderboardTotalResponse::username)
                            .toList());
        }
    }

    @Test
    void monthlyTotalsKeepAllThirtyOneDaysAndDailyScoresKeepTheirOwnRange() {
        var lastDay = REFERENCE_DAY.with(java.time.temporal.TemporalAdjusters.lastDayOfMonth());
        clock.set(lastDay.atTime(12, 0).atZone(APP_ZONE).toInstant());
        for (int day = 1; day <= lastDay.lengthOfMonth(); day++)
            fixtureScore(
                    lastDay.withDayOfMonth(day).atTime(10, 0).atZone(APP_ZONE).toInstant(),
                    9999,
                    true,
                    "monthly");
        var result = scores.monthlyTop("en", 10, APP_ZONE).getFirst();
        assertEquals(31L * 9999, result.totalScore());
        assertEquals(31, result.wins());
        assertEquals(9999, scores.dailyTop("en", 10, APP_ZONE).getFirst().getScore());
    }

    @Test
    void dailyLeaderboardUsesHalfOpenIstanbulBoundaries() {
        clock.set(PERIOD_TIME);
        var zone = APP_ZONE;
        var start = PERIOD_DAY.atStartOfDay(zone).toInstant();
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
        clock.set(PERIOD_TIME);
        var zone = APP_ZONE;
        var week = PERIOD_DAY.with(DayOfWeek.MONDAY).atStartOfDay(zone).toInstant();
        var month = PERIOD_DAY.withDayOfMonth(1).atStartOfDay(zone).toInstant();
        fixtureScore(month.minusNanos(1000), 9999, true, "beforemonth");
        Long monthFirst = fixtureScore(month, 1000, true, "monthfirst");
        Long beforeWeek = fixtureScore(week.minusNanos(1000), 2000, true, "beforeweek");
        Long weekFirst = fixtureScore(week, 3000, true, "weekfirst");
        var tomorrow = PERIOD_DAY.plusDays(1).atStartOfDay(zone).toInstant();
        fixtureScore(tomorrow, 9999, true, "tomorrow");
        assertEquals(
                java.util.List.of("weekfirst"),
                scores.weeklyTop("en", 10, zone).stream()
                        .map(com.ariforhanus.wordle.dto.LeaderboardTotalResponse::username)
                        .toList());
        assertEquals(
                java.util.List.of("weekfirst", "beforeweek", "monthfirst"),
                scores.monthlyTop("en", 10, zone).stream()
                        .map(com.ariforhanus.wordle.dto.LeaderboardTotalResponse::username)
                        .toList());
    }

    @Test
    void tiesUseEarlierWinTimeAndOldStreaksExpire() {
        clock.set(PERIOD_TIME);
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
        seedAnswer("tr", "İNCİR");
        var game = games.start(user.getId(), "tr");
        assertEquals("won", games.guess(user.getId(), game.id(), "incir", 1).status());
        assertEquals("İNCİR", games.get(user.getId(), game.id()).answer());
        assertEquals(1, count("scores"));
    }

    private DailyGameService.GameView startApple() {
        seedAnswer("en", "APPLE");
        return games.start(user.getId(), "en");
    }

    private void seedAnswer(String language, String answer) {
        LocalDate day = LocalDate.now(clock.withZone(APP_ZONE));
        db.update(
                "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES (?,?,?,?) ON"
                        + " CONFLICT DO NOTHING",
                day + "_" + language,
                day,
                language,
                answer);
        assertEquals(
                answer,
                db.queryForObject(
                        "SELECT answer FROM daily_puzzles WHERE played_at=? AND language=?",
                        String.class,
                        day,
                        language));
    }

    private int count(String table) {
        return db.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }
}
