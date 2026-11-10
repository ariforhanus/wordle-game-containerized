package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.OutboxTestKeys.*;
import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.ariforhanus.wordle.config.*;
import com.ariforhanus.wordle.jwt.JwtUtil;
import com.ariforhanus.wordle.service.*;
import com.ariforhanus.wordle.support.*;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

@SpringBootTest(
        properties = {
            "app.mail-outbox.enabled=true",
            "app.mail-outbox.worker-enabled=false",
            "app.mail-outbox.active-key-id=test-v1",
            "app.mail-outbox.keys=" + RING,
            "app.mail-outbox.max-pending=4",
            "app.mail-outbox.max-attempts=3",
            "app.mail-outbox.lease-seconds=30",
            "app.mail.enabled=true"
        })
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestClockConfiguration.class)
class MailOutboxIntegrationTest {
    @Autowired JdbcTemplate db;
    @Autowired MailOutbox outbox;
    @Autowired AccountService accounts;
    @Autowired OutboxCipher crypto;
    @Autowired MailOutboxProperties config;
    @Autowired MutableClock clock;
    @Autowired PlatformTransactionManager transactions;
    @Autowired AuditService audit;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder encoder;
    @Autowired MockMvc http;
    @Autowired JwtUtil jwt;
    @MockitoBean AccountMail mail;
    long user;

    private record Delivery(String email, String purpose, String token, String messageId) {
        @Override
        public String toString() {
            return "Delivery[REDACTED]";
        }
    }

    List<Delivery> delivered;

    @BeforeEach
    void resetData() {
        db.execute(
                "TRUNCATE"
                    + " auth_rate_limits,security_audit,account_tokens,daily_games,daily_puzzles,scores,users"
                    + " RESTART IDENTITY CASCADE");
        clock.set(DAYTIME);
        reset(mail);
        delivered = new CopyOnWriteArrayList<>();
        user = createUser("player");
        capture();
    }

    private long createUser(String name) {
        return db.queryForObject(
                "INSERT INTO users(username,email,password_hash,created_at) VALUES (?,?,?,?)"
                        + " RETURNING id",
                Long.class,
                name,
                name + "@example.test",
                encoder.encode("original-password-123"),
                Timestamp.from(clock.instant()));
    }

    private void capture() {
        doAnswer(
                        call -> {
                            delivered.add(
                                    new Delivery(
                                            call.getArgument(0),
                                            call.getArgument(1),
                                            call.getArgument(2),
                                            call.getArgument(3)));
                            return null;
                        })
                .when(mail)
                .sendQueued(anyString(), anyString(), anyString(), anyString());
    }

    private Map<String, Object> active(String purpose) {
        return db.queryForMap(
                "SELECT * FROM mail_outbox WHERE user_id=? AND purpose=? AND state IN"
                        + " ('PENDING','PROCESSING','BLOCKED')",
                user,
                purpose);
    }

    private UUID id(Map<String, Object> row) {
        return (UUID) row.get("id");
    }

    private String state(UUID id) {
        return db.queryForObject("SELECT state FROM mail_outbox WHERE id=?", String.class, id);
    }

    private OutboxCipher.Secret secret(Map<String, Object> row) {
        return crypto.decrypt(
                new OutboxCipher.Context(
                        id(row),
                        ((Number) row.get("user_id")).longValue(),
                        (String) row.get("purpose"),
                        (String) row.get("token_hash"),
                        ((Timestamp) row.get("expires_at")).toInstant(),
                        (String) row.get("message_id")),
                (String) row.get("key_id"),
                (byte[]) row.get("nonce"),
                (byte[]) row.get("payload"));
    }

    private MailOutbox worker(OutboxCipher keys) {
        return new MailOutbox(
                db,
                config,
                keys,
                mail,
                clock,
                audit,
                transactions,
                new SimpleMeterRegistry(),
                "http://localhost:8080");
    }

    private int activeCount() {
        return db.queryForObject(
                "SELECT count(*) FROM mail_outbox WHERE state IN"
                        + " ('PENDING','PROCESSING','BLOCKED')",
                Integer.class);
    }

    private void cleared(UUID id) {
        assertNull(
                db.queryForMap("SELECT payload,nonce,key_id FROM mail_outbox WHERE id=?", id)
                        .get("payload"));
    }

    @Test
    void enqueueCommitsOnlyEncryptedPayloadAndWorkerClearsItAfterDelivery() {
        clock.advance(Duration.ofNanos(123456789));
        accounts.requestReset("player@example.test");
        var row = active("RESET");
        var secret = secret(row);
        verify(mail, never()).send(anyString(), anyString(), anyString());
        assertTrue(delivered.isEmpty());
        String database =
                db.queryForObject(
                        "SELECT row_to_json(o)::text FROM mail_outbox o WHERE id=?",
                        String.class,
                        id(row));
        assertFalse(database.contains(secret.token()));
        assertFalse(database.contains(secret.email()));
        assertEquals(AccountService.digest(secret.token()), row.get("token_hash"));
        assertEquals(1, outbox.dispatchDue());
        assertEquals(1, delivered.size());
        assertEquals(secret.token(), delivered.getFirst().token());
        assertEquals("SENT", state(id(row)));
        cleared(id(row));
        accounts.consume(secret.token(), "RESET", "replacement-password-123");
        assertThrows(
                ResponseStatusException.class,
                () -> accounts.consume(secret.token(), "RESET", "replacement-password-123"));
    }

    @Test
    void publicKnownAndUnknownQueueResponsesAreNeutralAndNoopContainsNoAddress() throws Exception {
        String known =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content("{\"email\":\"player@example.test\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        String unknown =
                http.perform(
                                post("/api/v1/account/forgot-password")
                                        .contentType("application/json")
                                        .content("{\"email\":\"unknown@example.test\"}"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        assertEquals(known, unknown);
        assertEquals(2, activeCount());
        var noop = db.queryForMap("SELECT * FROM mail_outbox WHERE user_id IS NULL");
        for (String column : List.of("payload", "nonce", "key_id", "token_hash", "message_id"))
            assertNull(noop.get(column));
        outbox.dispatchDue();
        assertEquals(1, delivered.size());
        assertEquals(0, activeCount());
    }

    @Test
    void fullQueueRejectsKnownAndUnknownBeforeRevokingAnExistingLink() throws Exception {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        for (int i = 0; i < 3; i++) accounts.requestReset("missing" + i + "@example.test");
        for (String email : List.of("player@example.test", "unknown@example.test"))
            http.perform(
                            post("/api/v1/account/forgot-password")
                                    .contentType("application/json")
                                    .content(json.writeValueAsString(Map.of("email", email))))
                    .andExpect(status().isServiceUnavailable());
        assertEquals(4, activeCount());
        assertEquals("PENDING", state(id(original)));
        assertNull(
                db.queryForObject(
                        "SELECT consumed_at FROM account_tokens WHERE token_hash=?",
                        Timestamp.class,
                        original.get("token_hash")));
    }

    @Test
    void failedEnqueueRollsBackTokenRevocationAndCancellation() {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        db.execute(
                "CREATE FUNCTION reject_outbox_fixture() RETURNS trigger LANGUAGE plpgsql AS $$"
                        + " BEGIN RAISE EXCEPTION 'injected enqueue failure'; END $$");
        db.execute(
                "CREATE TRIGGER reject_outbox_fixture BEFORE INSERT ON mail_outbox FOR EACH ROW"
                        + " EXECUTE FUNCTION reject_outbox_fixture()");
        try {
            assertThrows(
                    RuntimeException.class, () -> accounts.requestReset("player@example.test"));
        } finally {
            db.execute("DROP TRIGGER reject_outbox_fixture ON mail_outbox");
            db.execute("DROP FUNCTION reject_outbox_fixture()");
        }
        assertEquals("PENDING", state(id(original)));
        assertEquals(1, activeCount());
        assertArrayEquals(
                (byte[]) original.get("payload"), (byte[]) active("RESET").get("payload"));
        outbox.dispatchDue();
        assertEquals(secret(original).token(), delivered.getFirst().token());
    }

    @Test
    void newerIssuanceRevokesOldTokenAndWipesItsPendingDelivery() {
        accounts.requestReset("player@example.test");
        var old = active("RESET");
        String oldToken = secret(old).token();
        accounts.requestReset("player@example.test");
        var next = active("RESET");
        assertNotEquals(id(old), id(next));
        assertEquals("CANCELLED", state(id(old)));
        cleared(id(old));
        assertThrows(
                ResponseStatusException.class,
                () -> accounts.consume(oldToken, "RESET", "replacement-password-123"));
        outbox.dispatchDue();
        assertEquals(1, delivered.size());
        assertEquals(secret(next).token(), delivered.getFirst().token());
    }

    @ParameterizedTest
    @ValueSource(strings = {"password", "reset", "delete"})
    void securityChangesCancelPendingJobsInTheSameTransaction(String action) {
        accounts.requestReset("player@example.test");
        String raw = secret(active("RESET")).token();
        accounts.requestVerification(user);
        switch (action) {
            case "password" ->
                    accounts.changePassword(
                            user, "original-password-123", "replacement-password-123");
            case "reset" -> accounts.consume(raw, "RESET", "replacement-password-123");
            case "delete" -> accounts.delete(user, "original-password-123");
        }
        assertEquals(0, activeCount());
        outbox.dispatchDue();
        assertTrue(delivered.isEmpty());
        assertEquals(
                0,
                db.queryForObject(
                        "SELECT count(*) FROM mail_outbox WHERE payload IS NOT NULL",
                        Integer.class));
    }

    @Test
    void logoutKeepsExistingLinkSemanticsAndVerificationConsumptionDoesNotCancelReset() {
        accounts.requestReset("player@example.test");
        accounts.requestVerification(user);
        accounts.logoutAll(user);
        accounts.consume(secret(active("VERIFY")).token(), "VERIFY", null);
        assertEquals(1, activeCount());
        outbox.dispatchDue();
        assertEquals("RESET", delivered.getFirst().purpose());
    }

    @Test
    void smtpHasNoUserLockOrBorrowedDatabaseConnectionAndCancellationWinsFinalization()
            throws Exception {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        String raw = secret(original).token();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(
                        call -> {
                            assertFalse(
                                    TransactionSynchronizationManager.isActualTransactionActive());
                            entered.countDown();
                            if (!release.await(5, TimeUnit.SECONDS))
                                throw new IllegalStateException("fixture release timeout");
                            return null;
                        })
                .when(mail)
                .sendQueued(anyString(), anyString(), anyString(), anyString());
        try (var pool = Executors.newSingleThreadExecutor()) {
            var task = pool.submit(outbox::dispatchDue);
            try {
                assertTrue(entered.await(5, TimeUnit.SECONDS));
                assertEquals(
                        user,
                        db.queryForObject(
                                "SELECT id FROM users WHERE id=? FOR UPDATE NOWAIT",
                                Long.class,
                                user));
                var source = (com.zaxxer.hikari.HikariDataSource) db.getDataSource();
                assertEquals(0, source.getHikariPoolMXBean().getActiveConnections());
                accounts.changePassword(user, "original-password-123", "replacement-password-123");
            } finally {
                release.countDown();
            }
            task.get(5, TimeUnit.SECONDS);
        }
        assertEquals("CANCELLED", state(id(original)));
        cleared(id(original));
        assertThrows(
                ResponseStatusException.class,
                () -> accounts.consume(raw, "RESET", "replacement-password-123"));
    }

    @Test
    void workersSkipLockedJobsAndNeverDoubleClaimOneLease() throws Exception {
        accounts.requestReset("player@example.test");
        var locked = active("RESET");
        for (int i = 0; i < 3; i++) {
            long other = createUser("other" + i);
            accounts.requestVerification(other);
        }
        try (var connection = db.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var stmt =
                    connection.prepareStatement(
                            "SELECT id FROM mail_outbox WHERE id=? FOR UPDATE")) {
                stmt.setObject(1, id(locked));
                stmt.executeQuery().close();
            }
            try (var pool = Executors.newFixedThreadPool(2)) {
                var gate = new CountDownLatch(1);
                var second = worker(crypto);
                var firstTask =
                        pool.submit(
                                () -> {
                                    gate.await();
                                    return outbox.dispatchDue();
                                });
                var secondTask =
                        pool.submit(
                                () -> {
                                    gate.await();
                                    return second.dispatchDue();
                                });
                gate.countDown();
                assertEquals(
                        3,
                        firstTask.get(5, TimeUnit.SECONDS) + secondTask.get(5, TimeUnit.SECONDS));
            } finally {
                connection.rollback();
            }
        }
        assertEquals(3, delivered.size());
        assertEquals(1, outbox.dispatchDue());
        assertEquals(4, delivered.size());
        assertEquals(4, delivered.stream().map(Delivery::messageId).distinct().count());
    }

    @Test
    void crashAndExpiredLeaseRetryTheSameCapabilityWithoutExtendingExpiry() {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        doAnswer(
                        call -> {
                            delivered.add(
                                    new Delivery(
                                            call.getArgument(0),
                                            call.getArgument(1),
                                            call.getArgument(2),
                                            call.getArgument(3)));
                            throw new IllegalStateException("simulated process crash");
                        })
                .when(mail)
                .sendQueued(anyString(), anyString(), anyString(), anyString());
        assertThrows(IllegalStateException.class, outbox::dispatchDue);
        assertEquals("PROCESSING", state(id(original)));
        capture();
        clock.advance(Duration.ofSeconds(31));
        worker(crypto).dispatchDue();
        assertEquals(2, delivered.size());
        assertEquals(delivered.get(0), delivered.get(1));
        assertEquals(
                original.get("expires_at"),
                db.queryForObject(
                        "SELECT expires_at FROM mail_outbox WHERE id=?",
                        Timestamp.class,
                        id(original)));
        assertEquals("SENT", state(id(original)));
        cleared(id(original));
    }

    @Test
    void staleWorkerCannotOverwriteTheNewLeaseOutcome() throws Exception {
        accounts.requestReset("player@example.test");
        UUID id = id(active("RESET"));
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var calls = new AtomicInteger();
        doAnswer(
                        call -> {
                            if (calls.incrementAndGet() == 1) {
                                entered.countDown();
                                if (!release.await(5, TimeUnit.SECONDS))
                                    throw new IllegalStateException();
                                throw new MailSendException("late stale failure");
                            }
                            return null;
                        })
                .when(mail)
                .sendQueued(anyString(), anyString(), anyString(), anyString());
        try (var pool = Executors.newSingleThreadExecutor()) {
            var first = pool.submit(outbox::dispatchDue);
            try {
                assertTrue(entered.await(5, TimeUnit.SECONDS));
                clock.advance(Duration.ofSeconds(31));
                worker(crypto).dispatchDue();
            } finally {
                release.countDown();
            }
            first.get(5, TimeUnit.SECONDS);
        }
        assertEquals("SENT", state(id));
        assertEquals(
                2,
                db.queryForObject(
                        "SELECT attempts FROM mail_outbox WHERE id=?", Integer.class, id));
        cleared(id);
    }

    @Test
    void transientRetriesAreDueBoundedAndNeverPersistProviderDetails() {
        accounts.requestReset("player@example.test");
        UUID id = id(active("RESET"));
        doThrow(new MailSendException("sensitive-provider", new IOException("sensitive-address")))
                .when(mail)
                .sendQueued(anyString(), anyString(), anyString(), anyString());
        for (int attempt = 1; attempt <= 3; attempt++) {
            outbox.dispatchDue();
            assertEquals(
                    attempt,
                    db.queryForObject(
                            "SELECT attempts FROM mail_outbox WHERE id=?", Integer.class, id));
            String dump =
                    db.queryForObject(
                            "SELECT row_to_json(o)::text FROM mail_outbox o WHERE id=?",
                            String.class,
                            id);
            assertFalse(dump.contains("sensitive"));
            if (attempt < 3) {
                assertEquals("PENDING", state(id));
                assertEquals(0, outbox.dispatchDue());
                Instant next =
                        db.queryForObject(
                                        "SELECT next_attempt_at FROM mail_outbox WHERE id=?",
                                        Timestamp.class,
                                        id)
                                .toInstant();
                assertTrue(Duration.between(clock.instant(), next).getSeconds() >= 30);
                assertTrue(Duration.between(clock.instant(), next).getSeconds() <= 600);
                clock.set(next);
            }
        }
        assertEquals("FAILED", state(id));
        cleared(id);
        assertEquals(0, outbox.dispatchDue());
    }

    @Test
    void permanentAuthenticationFailureStopsAfterOneAttempt() {
        accounts.requestReset("player@example.test");
        UUID id = id(active("RESET"));
        doThrow(new MailAuthenticationException("sensitive-provider"))
                .when(mail)
                .sendQueued(anyString(), anyString(), anyString(), anyString());
        outbox.dispatchDue();
        assertEquals("FAILED", state(id));
        cleared(id);
        clock.advance(Duration.ofMinutes(10));
        assertEquals(0, outbox.dispatchDue());
        verify(mail, times(1)).sendQueued(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void wrongKeyBlocksWithoutSendingAndAdminCanRetryAfterKeyRecovery() throws Exception {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        UUID id = id(original);
        var wrong =
                new OutboxCipher(
                        new MailOutboxProperties(
                                true, false, "test-v1", "test-v1:" + SECOND, 4, 3, 30, 10, 1000),
                        json,
                        "different-jwt");
        worker(wrong).dispatchDue();
        assertEquals("BLOCKED", state(id));
        assertNotNull(active("RESET").get("payload"));
        assertTrue(delivered.isEmpty());
        String token = jwt.generateToken(user, "player", "USER");
        http.perform(get("/api/v1/admin/mail-outbox")).andExpect(status().isUnauthorized());
        http.perform(
                        post("/api/v1/admin/mail-outbox/" + id + "/retry")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        db.update("UPDATE users SET role='ADMIN' WHERE id=?", user);
        String view =
                http.perform(
                                get("/api/v1/admin/mail-outbox")
                                        .header("Authorization", "Bearer " + token))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        for (String forbidden : List.of("payload", "nonce", "key_id", "token_hash", "email"))
            assertFalse(view.contains(forbidden));
        http.perform(
                        post("/api/v1/admin/mail-outbox/" + id + "/retry")
                                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        assertEquals(
                1,
                db.queryForObject(
                        "SELECT count(*) FROM security_audit WHERE action='MAIL_OUTBOX_RETRY'",
                        Integer.class));
        outbox.dispatchDue();
        assertEquals("SENT", state(id));
        assertEquals(secret(original).token(), delivered.getFirst().token());
    }

    @Test
    void missingLiveKeyFailsValidationAndTamperingCannotBeRetriedIntoDelivery() {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        var missing =
                new OutboxCipher(
                        new MailOutboxProperties(
                                true, false, "test-v2", "test-v2:" + SECOND, 4, 3, 30, 10, 1000),
                        json,
                        "different-jwt");
        assertThrows(IllegalStateException.class, () -> worker(missing).validateKeyCoverage());
        byte[] damaged = ((byte[]) original.get("payload")).clone();
        damaged[0] ^= 1;
        db.update("UPDATE mail_outbox SET payload=? WHERE id=?", damaged, id(original));
        outbox.dispatchDue();
        assertEquals("BLOCKED", state(id(original)));
        assertThrows(ResponseStatusException.class, () -> outbox.retryBlocked(id(original), user));
        assertEquals("BLOCKED", state(id(original)));
        assertTrue(delivered.isEmpty());
    }

    @Test
    void exactExpiryWipesPayloadAndDispatchInsideATransactionFailsClosed() {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        assertThrows(
                IllegalStateException.class,
                () ->
                        new TransactionTemplate(transactions)
                                .execute(status -> outbox.dispatchDue()));
        clock.set(((Timestamp) original.get("expires_at")).toInstant());
        outbox.dispatchDue();
        assertEquals("EXPIRED", state(id(original)));
        cleared(id(original));
        assertTrue(delivered.isEmpty());
    }

    @Test
    void recipientChangesCancelRatherThanRetargetAndDatabaseConstraintsRejectPayloadlessLiveRows() {
        accounts.requestReset("player@example.test");
        var original = active("RESET");
        assertThrows(
                DataIntegrityViolationException.class,
                () -> db.update("UPDATE mail_outbox SET payload=NULL WHERE id=?", id(original)));
        assertThrows(
                DataIntegrityViolationException.class,
                () ->
                        db.update(
                                "UPDATE mail_outbox SET user_id=? WHERE id=?",
                                createUser("other"),
                                id(original)));
        db.update("UPDATE users SET email='changed@example.test' WHERE id=?", user);
        outbox.dispatchDue();
        assertEquals("CANCELLED", state(id(original)));
        cleared(id(original));
        assertTrue(delivered.isEmpty());
    }

    @Test
    void rotationKeepsOldPayloadsReadableAndOldWorkersSkipNewKeys() {
        accounts.requestReset("player@example.test");
        var old = active("RESET");
        var ring =
                new OutboxCipher(
                        new MailOutboxProperties(
                                true,
                                false,
                                "test-v2",
                                RING + ",test-v2:" + SECOND,
                                4,
                                3,
                                30,
                                10,
                                1000),
                        json,
                        "different-jwt");
        worker(ring).validateKeyCoverage();
        worker(ring).dispatchDue();
        assertEquals("SENT", state(id(old)));
        assertEquals(secret(old).token(), delivered.getFirst().token());
        var expiry = clock.instant().plus(Duration.ofMinutes(30));
        String token =
                java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
        String hash = AccountService.digest(token);
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        status -> {
                            db.update(
                                    "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at)"
                                            + " VALUES (?,?,'RESET',?)",
                                    hash,
                                    user,
                                    Timestamp.from(expiry));
                            worker(ring)
                                    .enqueue(
                                            user,
                                            "RESET",
                                            hash,
                                            "player@example.test",
                                            token,
                                            clock.instant(),
                                            expiry);
                        });
        UUID fresh = id(active("RESET"));
        assertEquals(0, outbox.dispatchDue());
        assertEquals("PENDING", state(fresh));
        assertEquals(
                0,
                db.queryForObject(
                        "SELECT attempts FROM mail_outbox WHERE id=?", Integer.class, fresh));
        worker(ring).dispatchDue();
        assertEquals("SENT", state(fresh));
        assertEquals(token, delivered.getLast().token());
    }

    @Test
    void crashOnLastAttemptExpiresTheLeaseAndStopsRatherThanLooping() {
        accounts.requestReset("player@example.test");
        UUID id = id(active("RESET"));
        db.update("UPDATE mail_outbox SET attempts=2 WHERE id=?", id);
        doThrow(new IllegalStateException("simulated process death"))
                .when(mail)
                .sendQueued(anyString(), anyString(), anyString(), anyString());
        assertThrows(IllegalStateException.class, outbox::dispatchDue);
        clock.advance(Duration.ofSeconds(31));
        assertEquals(0, outbox.dispatchDue());
        assertEquals("FAILED", state(id));
        cleared(id);
        verify(mail, times(1)).sendQueued(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void deleteAndReregisterNeverRetargetsOldMailAndVerifiedAccountsAreRechecked() {
        accounts.requestReset("player@example.test");
        UUID id = id(active("RESET"));
        accounts.delete(user, "original-password-123");
        long replacement = createUser("player");
        assertNotEquals(user, replacement);
        assertEquals(0, outbox.dispatchDue());
        assertEquals(
                0,
                db.queryForObject(
                        "SELECT count(*) FROM mail_outbox WHERE id=?", Integer.class, id));
        accounts.requestVerification(replacement);
        id =
                db.queryForObject(
                        "SELECT id FROM mail_outbox WHERE user_id=?", UUID.class, replacement);
        db.update("UPDATE users SET email_verified=true WHERE id=?", replacement);
        outbox.dispatchDue();
        assertEquals("CANCELLED", state(id));
        cleared(id);
        assertTrue(delivered.isEmpty());
    }

    @Test
    void hourlyRetentionCleansNoopsAndExpiredCiphertextEvenWithWorkerPaused() {
        accounts.requestReset("player@example.test");
        accounts.requestReset("unknown@example.test");
        clock.advance(Duration.ofHours(25).plusMinutes(31));
        new TransactionTemplate(transactions)
                .executeWithoutResult(
                        status -> new RetentionTasks(db, clock).purgeExpiredSecurityData());
        assertEquals(0, db.queryForObject("SELECT count(*) FROM mail_outbox", Integer.class));
        assertTrue(delivered.isEmpty());
    }

    @Test
    void v9MigrationPreservesExistingTokensAndRollsBackAnInterruptedUpgrade() throws Exception {
        String schema = "mail_outbox_migration_test";
        db.execute("CREATE SCHEMA " + schema);
        try {
            var pool = (com.zaxxer.hikari.HikariDataSource) db.getDataSource();
            var source =
                    new org.springframework.jdbc.datasource.DriverManagerDataSource(
                            pool.getJdbcUrl(), pool.getUsername(), pool.getPassword());
            org.flywaydb.core.Flyway.configure()
                    .dataSource(source)
                    .schemas(schema)
                    .defaultSchema(schema)
                    .target("8")
                    .load()
                    .migrate();
            try (var connection = source.getConnection()) {
                connection.setSchema(schema);
                var scoped =
                        new JdbcTemplate(
                                new org.springframework.jdbc.datasource.SingleConnectionDataSource(
                                        connection, true));
                long oldUser =
                        scoped.queryForObject(
                                "INSERT INTO users(username,email,password_hash,created_at) VALUES"
                                    + " ('old','old@example.test','test-hash',CURRENT_TIMESTAMP)"
                                    + " RETURNING id",
                                Long.class);
                scoped.update(
                        "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES"
                                + " (?,?,'RESET',?)",
                        AccountService.digest("old-capability"),
                        oldUser,
                        Timestamp.from(clock.instant().plusSeconds(1800)));
                scoped.update(
                        "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                                + " ('history',?,'en','APPLE')",
                        REFERENCE_DAY);
                var tokens = scoped.queryForList("SELECT * FROM account_tokens");
                var puzzles = scoped.queryForList("SELECT * FROM daily_puzzles");
                // Force failure after ALTER TABLE, proving PostgreSQL migration atomicity.
                scoped.execute("CREATE TABLE mail_outbox(collision INTEGER)");
                assertThrows(
                        org.flywaydb.core.api.FlywayException.class,
                        () ->
                                org.flywaydb.core.Flyway.configure()
                                        .dataSource(source)
                                        .schemas(schema)
                                        .defaultSchema(schema)
                                        .load()
                                        .migrate());
                assertEquals(
                        0,
                        scoped.queryForObject(
                                "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON"
                                        + " n.oid=c.connamespace WHERE n.nspname=? AND"
                                        + " c.conname='uk_token_delivery_identity'",
                                Integer.class,
                                schema));
                assertEquals(
                        "8",
                        scoped.queryForObject(
                                "SELECT version FROM flyway_schema_history WHERE success AND"
                                    + " version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1",
                                String.class));
                scoped.execute("DROP TABLE mail_outbox");
                org.flywaydb.core.Flyway.configure()
                        .dataSource(source)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .load()
                        .migrate();
                assertEquals(tokens, scoped.queryForList("SELECT * FROM account_tokens"));
                assertEquals(puzzles, scoped.queryForList("SELECT * FROM daily_puzzles"));
                assertEquals(
                        0,
                        scoped.queryForObject("SELECT count(*) FROM mail_outbox", Integer.class));
            }
        } finally {
            db.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }

    @Test
    void reviewedRetryLocksUsersBeforeJobsAndAuditToMatchAccountMutationOrder() throws Exception {
        accounts.requestReset("player@example.test");
        UUID id = id(active("RESET"));
        db.update("UPDATE mail_outbox SET state='BLOCKED',last_failure='crypto' WHERE id=?", id);
        long actor = createUser("administrator");
        var checkedAudit =
                new AuditService(db) {
                    @Override
                    public void record(Long caller, String action, Long target) {
                        for (long identity : new long[] {caller, target}) {
                            try (var connection = db.getDataSource().getConnection();
                                    var statement =
                                            connection.prepareStatement(
                                                    "SELECT id FROM users WHERE id=? FOR KEY SHARE"
                                                            + " NOWAIT")) {
                                statement.setLong(1, identity);
                                var locked =
                                        assertThrows(
                                                java.sql.SQLException.class,
                                                statement::executeQuery);
                                assertEquals("55P03", locked.getSQLState());
                            } catch (java.sql.SQLException ex) {
                                throw new IllegalStateException(ex);
                            }
                        }
                        super.record(caller, action, target);
                    }
                };
        var reviewed =
                new MailOutbox(
                        db,
                        config,
                        crypto,
                        mail,
                        clock,
                        checkedAudit,
                        transactions,
                        new SimpleMeterRegistry(),
                        "http://localhost:8080");
        try (var blocker = db.getDataSource().getConnection();
                var pool = Executors.newSingleThreadExecutor()) {
            blocker.setAutoCommit(false);
            int blockerPid;
            try (var statement = blocker.createStatement();
                    var row = statement.executeQuery("SELECT pg_backend_pid()")) {
                row.next();
                blockerPid = row.getInt(1);
            }
            try (var lock =
                    blocker.prepareStatement("SELECT id FROM users WHERE id=? FOR UPDATE")) {
                lock.setLong(1, user);
                lock.executeQuery().close();
            }
            var retry = pool.submit(() -> reviewed.retryBlocked(id, actor));
            try {
                org.awaitility.Awaitility.await()
                        .atMost(Duration.ofSeconds(3))
                        .until(
                                () ->
                                        retry.isDone()
                                                || Boolean.TRUE.equals(
                                                        db.queryForObject(
                                                                "SELECT EXISTS (SELECT 1 FROM"
                                                                    + " pg_stat_activity WHERE"
                                                                    + " ?=ANY(pg_blocking_pids(pid)))",
                                                                Boolean.class,
                                                                blockerPid)));
                assertFalse(retry.isDone(), "Retry must wait behind the account mutation");
                // While retry waits for the user, it must not hold the job lock:
                // token revocation needs this row next in the mutation transaction.
                try (var job =
                        blocker.prepareStatement(
                                "SELECT id FROM mail_outbox WHERE id=? FOR UPDATE NOWAIT")) {
                    job.setObject(1, id);
                    job.executeQuery().close();
                }
            } finally {
                blocker.rollback();
            }
            retry.get(5, TimeUnit.SECONDS);
        }
        assertEquals("PENDING", state(id));
        assertEquals(
                1,
                db.queryForObject(
                        "SELECT count(*) FROM security_audit WHERE action='MAIL_OUTBOX_RETRY'",
                        Integer.class));
        assertTrue(delivered.isEmpty());
    }
}
