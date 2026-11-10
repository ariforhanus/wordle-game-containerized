package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ariforhanus.wordle.entity.User;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.repository.UserRepository;
import com.ariforhanus.wordle.service.*;
import com.ariforhanus.wordle.support.MutableClock;
import com.ariforhanus.wordle.support.TestClockConfiguration;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

@SpringBootTest(properties = "app.require-verified-email=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestClockConfiguration.class)
class AccountSecurityIntegrationTest {
    private static final byte[] AVATAR_FIXTURE =
            Base64.getDecoder()
                    .decode(
                            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8m0AAAAASUVORK5CYII=");
    @Autowired MockMvc http;
    @Autowired JdbcTemplate db;
    @Autowired UserRepository users;
    @Autowired JwtUtil jwt;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean PasswordEncoder encoder;
    @Autowired ObjectMapper json;
    @Autowired AccountService accounts;
    @Autowired io.micrometer.core.instrument.MeterRegistry metrics;
    @Autowired DailyGameService games;
    @Autowired AuditService audit;
    @Autowired MutableClock clock;
    @MockitoBean AccountMail mail;
    User user;
    String token;
    List<String> delivered;

    @BeforeEach
    void setup() {
        db.execute(
                "TRUNCATE auth_rate_limits, security_audit, daily_games, daily_puzzles, scores,"
                        + " users RESTART IDENTITY CASCADE");
        clock.set(BEFORE_MIDNIGHT);
        user = new User();
        user.setCreatedAt(clock.instant());
        user.setUsername("player");
        user.setEmail("player@example.com");
        user.setPasswordHash(encoder.encode("original-password-123"));
        user = users.save(user);
        token = jwt.generateToken(user.getId(), user.getUsername(), "USER");
        reset(mail);
        delivered = new ArrayList<>();
        doAnswer(
                        inv -> {
                            delivered.add(inv.getArgument(2));
                            return null;
                        })
                .when(mail)
                .send(anyString(), anyString(), anyString());
    }

    @Test
    void passwordChangeRevokesEveryOldToken() throws Exception {
        http.perform(
                        post("/api/v1/account/password")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content(
                                        "{\"currentPassword\":\"wrong\",\"password\":\"next-password-123\"}"))
                .andExpect(status().isBadRequest());
        http.perform(
                        post("/api/v1/account/password")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content(
                                        "{\"currentPassword\":\"original-password-123\",\"password\":\"next-password-123\"}"))
                .andExpect(status().isOk());
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        var result =
                http.perform(
                                post("/api/v1/auth/login")
                                        .contentType("application/json")
                                        .content(
                                                "{\"username\":\"player\",\"password\":\"next-password-123\"}"))
                        .andExpect(status().isOk())
                        .andReturn();
        String next =
                json.readTree(result.getResponse().getContentAsString()).path("token").asText();
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + next))
                .andExpect(status().isOk());
    }

    @Test
    void logoutAllRevokesCopiedTokens() throws Exception {
        http.perform(post("/api/v1/account/logout-all").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void resetIsPrivateSingleUseAndRevokesSessions() throws Exception {
        var unknown =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content("{\"email\":\"unknown@example.com\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertTrue(delivered.isEmpty());
        var known =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content("{\"email\":\"player@example.com\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertEquals(unknown, known);
        String raw = delivered.getFirst();
        assertFalse(known.contains(raw));
        assertEquals(
                AccountService.digest(raw),
                db.queryForObject("SELECT token_hash FROM account_tokens", String.class));
        accounts.consume(raw, "RESET", "reset-password-123");
        assertThrows(Exception.class, () -> accounts.consume(raw, "RESET", "again-password-123"));
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        assertTrue(
                encoder.matches(
                        "reset-password-123",
                        users.findById(user.getId()).orElseThrow().getPasswordHash()));
    }

    @Test
    void resetExpiresAndOlderLinksAreInvalidated() {
        accounts.requestReset(user.getEmail());
        String first = delivered.getFirst();
        accounts.requestReset(user.getEmail());
        String second = delivered.getLast();
        assertThrows(Exception.class, () -> accounts.consume(first, "RESET", "next-password-123"));
        clock.advance(Duration.ofMinutes(30).plusSeconds(1));
        assertThrows(Exception.class, () -> accounts.consume(second, "RESET", "next-password-123"));
    }

    @Test
    void verificationCannotBeUsedAsAPasswordResetAndUnlocksRankedPlay() throws Exception {
        http.perform(get("/api/v1/daily/games").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        http.perform(post("/api/v1/daily/games").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        accounts.requestVerification(user.getId());
        String link = delivered.getFirst();
        assertThrows(Exception.class, () -> accounts.consume(link, "RESET", "next-password-123"));
        accounts.consume(link, "VERIFY", null);
        assertTrue(users.findById(user.getId()).orElseThrow().isEmailVerified());
        http.perform(get("/api/v1/daily/games").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        http.perform(post("/api/v1/daily/games").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        assertThrows(Exception.class, () -> accounts.consume(link, "VERIFY", null));
    }

    @Test
    void concurrentResetConsumesTokenOnce() throws Exception {
        accounts.requestReset(user.getEmail());
        String link = delivered.getFirst();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<Boolean> action =
                    () -> {
                        start.await();
                        try {
                            accounts.consume(link, "RESET", "reset-password-123");
                            return true;
                        } catch (org.springframework.web.server.ResponseStatusException ex) {
                            return false;
                        }
                    };
            var a = pool.submit(action);
            var b = pool.submit(action);
            start.countDown();
            assertNotEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
        }
        assertEquals(1L, users.findById(user.getId()).orElseThrow().getAuthVersion());
    }

    @Test
    void loginLimitsFollowAccountAcrossDifferentAddresses() throws Exception {
        for (int i = 0; i < 10; i++) {
            final int index = i;
            http.perform(
                            post("/api/v1/auth/login")
                                    .with(
                                            req -> {
                                                req.setRemoteAddr("192.0.2." + index);
                                                return req;
                                            })
                                    .contentType("application/json")
                                    .content("{\"username\":\"player\",\"password\":\"wrong\"}"))
                    .andExpect(status().isUnauthorized());
        }
        http.perform(
                        post("/api/v1/auth/login")
                                .contentType("application/json")
                                .content("{\"username\":\"player\",\"password\":\"wrong\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
    }

    @Test
    void resetRequestRateLimitDoesNotRevealAccountExistence() throws Exception {
        for (int i = 0; i < 3; i++)
            http.perform(
                            post("/api/v1/account/forgot-password")
                                    .contentType("application/json")
                                    .content("{\"email\":\"unknown@example.com\"}"))
                    .andExpect(status().isOk());
        http.perform(
                        post("/api/v1/account/forgot-password")
                                .contentType("application/json")
                                .content("{\"email\":\"unknown@example.com\"}"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void deletionRequiresPasswordAndErasesLinkedData() throws Exception {
        seedDeletionHistory();
        User other = new User();
        other.setCreatedAt(clock.instant());
        other.setUsername("other-player");
        other.setEmail("other@example.test");
        other.setPasswordHash(encoder.encode("other-password-123"));
        other = users.save(other);
        games.start(other.getId(), "en");
        accounts.requestVerification(other.getId());
        audit.record(user.getId(), "SESSIONS_REVOKED", other.getId());
        audit.record(other.getId(), "SESSIONS_REVOKED", user.getId());
        var otherGames =
                db.queryForList("SELECT * FROM daily_games WHERE user_id=?", other.getId());
        var puzzles = db.queryForList("SELECT * FROM daily_puzzles ORDER BY id");
        accounts.requestReset(user.getEmail());
        http.perform(
                        post("/api/v1/account/delete")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content("{\"password\":\"wrong\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(2, users.count());
        assertEquals(
                2,
                db.queryForObject(
                        "SELECT count(*) FROM daily_games WHERE user_id=?",
                        Integer.class,
                        user.getId()));
        assertEquals(
                1,
                db.queryForObject(
                        "SELECT count(*) FROM scores WHERE user_id=?",
                        Integer.class,
                        user.getId()));
        http.perform(
                        post("/api/v1/account/delete")
                                .header("Authorization", "Bearer " + token)
                                .contentType("application/json")
                                .content("{\"password\":\"original-password-123\"}"))
                .andExpect(status().isOk());
        assertEquals(1, users.count());
        assertTrue(users.findById(user.getId()).isEmpty());
        assertTrue(users.findById(other.getId()).isPresent());
        for (String table : List.of("daily_games", "scores", "account_tokens"))
            assertEquals(
                    0,
                    db.queryForObject(
                            "SELECT count(*) FROM " + table + " WHERE user_id=?",
                            Integer.class,
                            user.getId()));
        assertEquals(
                1,
                db.queryForObject(
                        "SELECT count(*) FROM account_tokens WHERE user_id=?",
                        Integer.class,
                        other.getId()));
        assertEquals(
                otherGames,
                db.queryForList("SELECT * FROM daily_games WHERE user_id=?", other.getId()));
        assertEquals(puzzles, db.queryForList("SELECT * FROM daily_puzzles ORDER BY id"));
        assertEquals(
                0,
                db.queryForObject(
                        "SELECT count(*) FROM security_audit WHERE actor_id=? OR target_id=?",
                        Integer.class,
                        user.getId(),
                        user.getId()));
        assertEquals(
                1,
                db.queryForObject(
                        "SELECT count(*) FROM security_audit WHERE actor_id=? AND target_id IS"
                                + " NULL",
                        Integer.class,
                        other.getId()));
        assertEquals(
                1,
                db.queryForObject(
                        "SELECT count(*) FROM security_audit WHERE target_id=? AND actor_id IS"
                                + " NULL",
                        Integer.class,
                        other.getId()));
        assertNull(
                db.queryForMap("SELECT actor_id FROM security_audit WHERE action='ACCOUNT_DELETED'")
                        .get("actor_id"));
        assertNull(
                db.queryForMap(
                                "SELECT target_id FROM security_audit WHERE"
                                        + " action='ACCOUNT_DELETED'")
                        .get("target_id"));
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        String otherToken = jwt.generateToken(other.getId(), other.getUsername(), "USER");
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk());
    }

    private void seedDeletionHistory() {
        db.update(
                "UPDATE users SET avatar=?,avatar_content_type='image/png',avatar_size=? WHERE"
                        + " id=?",
                AVATAR_FIXTURE,
                AVATAR_FIXTURE.length,
                user.getId());
        var completed = games.start(user.getId(), "en");
        String answer =
                db.queryForObject(
                        "SELECT p.answer FROM daily_puzzles p JOIN daily_games g ON"
                                + " g.puzzle_id=p.id WHERE g.id=?",
                        String.class,
                        completed.id());
        assertEquals("won", games.guess(user.getId(), completed.id(), answer, 1).status());
        games.start(user.getId(), "tr");
        accounts.requestVerification(user.getId());
    }

    @Test
    void failedDeletionRollsBackUserChildrenAndAudit() {
        seedDeletionHistory();
        var beforeGames = db.queryForList("SELECT * FROM daily_games ORDER BY id");
        var beforeScores = db.queryForList("SELECT * FROM scores ORDER BY id");
        var beforeTokens = db.queryForList("SELECT * FROM account_tokens ORDER BY token_hash");
        var beforeAudit = db.queryForList("SELECT * FROM security_audit ORDER BY id");
        db.execute("CREATE TABLE deletion_failure_fixture(user_id BIGINT REFERENCES users(id))");
        try {
            db.update("INSERT INTO deletion_failure_fixture VALUES (?)", user.getId());
            assertThrows(
                    org.springframework.dao.DataIntegrityViolationException.class,
                    () -> accounts.delete(user.getId(), "original-password-123"));
            assertTrue(users.findById(user.getId()).isPresent());
            assertArrayEquals(
                    AVATAR_FIXTURE,
                    db.queryForObject(
                            "SELECT avatar FROM users WHERE id=?", byte[].class, user.getId()));
            assertEquals(beforeGames, db.queryForList("SELECT * FROM daily_games ORDER BY id"));
            assertEquals(beforeScores, db.queryForList("SELECT * FROM scores ORDER BY id"));
            assertEquals(
                    beforeTokens,
                    db.queryForList("SELECT * FROM account_tokens ORDER BY token_hash"));
            assertEquals(beforeAudit, db.queryForList("SELECT * FROM security_audit ORDER BY id"));
        } finally {
            db.execute("DROP TABLE deletion_failure_fixture");
        }
    }

    @Test
    void adminRoleChangesAreAuditedAndRevokeTargetSessions() throws Exception {
        User admin = new User();
        admin.setCreatedAt(clock.instant());
        admin.setUsername("admin");
        admin.setEmail("admin@example.com");
        admin.setPasswordHash("unused");
        admin.setRole("ADMIN");
        admin = users.save(admin);
        String adminToken = jwt.generateToken(admin.getId(), "admin", "ADMIN");
        http.perform(
                        put("/api/v1/admin/users/" + user.getId() + "/role")
                                .header("Authorization", "Bearer " + adminToken)
                                .contentType("application/json")
                                .content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isOk());
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        http.perform(get("/api/v1/admin/audit").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("ADMIN_ROLE_ADMIN"));
    }

    @Test
    void passwordResetDuringLoginCannotMintANewerSessionVersion() throws Exception {
        doAnswer(
                        invocation -> {
                            db.update(
                                    "UPDATE users SET auth_version=auth_version+1,"
                                            + " version=version+1 WHERE id=?",
                                    user.getId());
                            return invocation.callRealMethod();
                        })
                .when(encoder)
                .matches(eq("original-password-123"), anyString());
        var result =
                http.perform(
                                post("/api/v1/auth/login")
                                        .contentType("application/json")
                                        .content(
                                                "{\"username\":\"player\",\"password\":\"original-password-123\"}"))
                        .andExpect(status().isOk())
                        .andReturn();
        String stale =
                json.readTree(result.getResponse().getContentAsString()).path("token").asText();
        http.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + stale))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void verificationExpiresExactlyAtTwentyFourHours() {
        accounts.requestVerification(user.getId());
        String raw = delivered.getFirst();
        var issued = clock.instant();
        clock.set(issued.plus(Duration.ofHours(24)));
        assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> accounts.consume(raw, "VERIFY", null));
        assertFalse(users.findById(user.getId()).orElseThrow().isEmailVerified());
        assertNull(db.queryForMap("SELECT consumed_at FROM account_tokens").get("consumed_at"));
    }

    @Test
    void verificationIsAcceptedImmediatelyBeforeExpiry() {
        accounts.requestVerification(user.getId());
        String raw = delivered.getFirst();
        clock.advance(Duration.ofHours(24).minusMillis(1));
        accounts.consume(raw, "VERIFY", null);
        assertTrue(users.findById(user.getId()).orElseThrow().isEmailVerified());
    }

    @Test
    void smtpFailureRollsBackNewTokenAndPreservesOlderLink() {
        accounts.requestReset(user.getEmail());
        String original = delivered.getFirst();
        doThrow(new org.springframework.mail.MailSendException("injected transport failure"))
                .when(mail)
                .send(anyString(), anyString(), anyString());
        assertThrows(
                org.springframework.mail.MailSendException.class,
                () -> accounts.requestReset(user.getEmail()));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
        assertNull(db.queryForMap("SELECT consumed_at FROM account_tokens").get("consumed_at"));
        accounts.consume(original, "RESET", "replacement-password-123");
        assertTrue(
                encoder.matches(
                        "replacement-password-123",
                        users.findById(user.getId()).orElseThrow().getPasswordHash()));
    }

    @Test
    @org.junit.jupiter.api.extension.ExtendWith(
            org.springframework.boot.test.system.OutputCaptureExtension.class)
    void publicResetKeepsTheSameResponseAfterSmtpFailureAndRecordsOnlySafeFailureData(
            org.springframework.boot.test.system.CapturedOutput output) throws Exception {
        accounts.requestReset(user.getEmail());
        String original = delivered.getFirst();
        var counter = metrics.counter("wordle.mail.delivery.failures", "purpose", "reset");
        double before = counter.count();
        doThrow(new org.springframework.mail.MailSendException("sensitive-provider-fixture"))
                .when(mail)
                .send(anyString(), anyString(), anyString());
        var known =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content(
                                                json.writeValueAsString(
                                                        Map.of("email", user.getEmail()))))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        var unknown =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content("{\"email\":\"unknown@example.test\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertEquals(known, unknown);
        assertEquals(before + 1, counter.count());
        assertFalse(output.toString().contains("sensitive-provider-fixture"));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
        assertNull(db.queryForMap("SELECT consumed_at FROM account_tokens").get("consumed_at"));
        accounts.consume(original, "RESET", "replacement-password-123");
    }

    @Test
    void authenticatedVerificationSmtpFailureReturnsRetryableUnavailableAndPreservesOldLink()
            throws Exception {
        accounts.requestVerification(user.getId());
        String original = delivered.getFirst();
        var counter = metrics.counter("wordle.mail.delivery.failures", "purpose", "verification");
        double before = counter.count();
        doThrow(new org.springframework.mail.MailSendException("injected provider failure"))
                .when(mail)
                .send(anyString(), anyString(), anyString());
        http.perform(
                        post("/api/v1/account/verification")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isServiceUnavailable());
        assertEquals(before + 1, counter.count());
        assertEquals(1, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
        accounts.consume(original, "VERIFY", null);
        assertTrue(users.findById(user.getId()).orElseThrow().isEmailVerified());
    }

    @Test
    void disabledMailRemainsUnavailableForKnownAndUnknownPublicAddresses() throws Exception {
        doThrow(
                        new org.springframework.web.server.ResponseStatusException(
                                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                                "mail_unavailable"))
                .when(mail)
                .requireAvailable();
        for (String email : List.of(user.getEmail(), "unknown@example.test"))
            http.perform(
                            post("/api/v1/account/forgot-password")
                                    .contentType("application/json")
                                    .content(json.writeValueAsString(Map.of("email", email))))
                    .andExpect(status().isServiceUnavailable());
        verify(mail, never()).send(anyString(), anyString(), anyString());
        assertEquals(0, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
    }

    @Test
    void smtpWaitHoldsTheUserLockAndTokenIsInvisibleUntilCommit() throws Exception {
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(
                        invocation -> {
                            entered.countDown();
                            if (!release.await(5, TimeUnit.SECONDS))
                                throw new IllegalStateException("fixture release timed out");
                            return null;
                        })
                .when(mail)
                .send(anyString(), anyString(), anyString());
        try (var pool = Executors.newSingleThreadExecutor()) {
            var request = pool.submit(() -> accounts.requestReset(user.getEmail()));
            try {
                assertTrue(entered.await(5, TimeUnit.SECONDS));
                assertEquals(
                        0, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
                var conflict =
                        assertThrows(
                                org.springframework.dao.DataAccessException.class,
                                () ->
                                        db.queryForObject(
                                                "SELECT id FROM users WHERE id=? FOR UPDATE NOWAIT",
                                                Long.class,
                                                user.getId()));
                var sql =
                        assertInstanceOf(
                                java.sql.SQLException.class, conflict.getMostSpecificCause());
                assertEquals("55P03", sql.getSQLState());
            } finally {
                release.countDown();
            }
            request.get(5, TimeUnit.SECONDS);
        }
        assertEquals(
                user.getId(),
                db.queryForObject(
                        "SELECT id FROM users WHERE id=? FOR UPDATE NOWAIT",
                        Long.class,
                        user.getId()));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
    }

    @Test
    void smtpAcceptanceCannotBeRolledBackIfTheDatabaseCommitPhaseAborts() {
        accounts.requestReset(user.getEmail());
        String original = delivered.getFirst();
        doAnswer(
                        invocation -> {
                            delivered.add(invocation.getArgument(2));
                            org.springframework.transaction.support
                                    .TransactionSynchronizationManager.registerSynchronization(
                                    new org.springframework.transaction.support
                                            .TransactionSynchronization() {
                                        @Override
                                        public void beforeCommit(boolean readOnly) {
                                            throw new IllegalStateException(
                                                    "injected commit-phase abort");
                                        }
                                    });
                            return null;
                        })
                .when(mail)
                .send(anyString(), anyString(), anyString());
        assertThrows(IllegalStateException.class, () -> accounts.requestReset(user.getEmail()));
        String alreadyAcceptedBySmtp = delivered.getLast();
        assertNotEquals(original, alreadyAcceptedBySmtp);
        assertEquals(1, db.queryForObject("SELECT count(*) FROM account_tokens", Integer.class));
        assertThrows(
                org.springframework.web.server.ResponseStatusException.class,
                () -> accounts.consume(alreadyAcceptedBySmtp, "RESET", "replacement-password-123"));
        accounts.consume(original, "RESET", "replacement-password-123");
    }
}
