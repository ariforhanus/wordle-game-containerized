package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.OutboxTestKeys.*;
import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.service.*;
import com.ariforhanus.wordle.support.*;
import com.ariforhanus.wordle.support.SmtpSecurityFixture.*;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.*;
import java.util.regex.Pattern;

import javax.net.ssl.SSLContext;

@SpringBootTest(
        properties = {
            "app.mail.enabled=true",
            "app.mail-outbox.enabled=true",
            "app.mail-outbox.worker-enabled=false",
            "app.mail-outbox.active-key-id=test-v1",
            "app.mail-outbox.keys=" + RING,
            "spring.mail.host=127.0.0.1",
            "spring.mail.port=1",
            "spring.mail.username=" + SmtpSecurityFixture.USER,
            "spring.mail.password=" + SmtpSecurityFixture.PASSWORD,
            "spring.mail.properties.mail.smtp.auth=true",
            "spring.mail.properties.mail.smtp.starttls.enable=true",
            "spring.mail.properties.mail.smtp.starttls.required=true",
            "spring.mail.properties.mail.smtp.connectiontimeout=1500",
            "spring.mail.properties.mail.smtp.timeout=1500",
            "spring.mail.properties.mail.smtp.writetimeout=1500"
        })
@ActiveProfiles("test")
@Import(TestClockConfiguration.class)
class MailOutboxTransportIntegrationTest {
    @TempDir static Path directory;
    static Identity matching, mismatching;
    static SSLContext trusted;
    @Autowired JdbcTemplate db;
    @Autowired AccountService accounts;
    @Autowired MailOutbox outbox;
    @Autowired JavaMailSenderImpl sender;
    @Autowired PasswordEncoder encoder;
    @Autowired MutableClock clock;

    @BeforeAll
    static void certificates() throws Exception {
        matching = SmtpSecurityFixture.identity(directory, "matching", true);
        mismatching = SmtpSecurityFixture.identity(directory, "mismatching", false);
        trusted = SmtpSecurityFixture.trust(matching, mismatching);
    }

    @BeforeEach
    void prepare() {
        db.execute(
                "TRUNCATE"
                    + " auth_rate_limits,security_audit,account_tokens,daily_games,daily_puzzles,scores,users"
                    + " RESTART IDENTITY CASCADE");
        clock.set(DAYTIME);
        db.update(
                "INSERT INTO users(username,email,password_hash,created_at) VALUES"
                        + " ('tls-player','tls-player@example.test',?,?)",
                encoder.encode("original-password-123"),
                Timestamp.from(clock.instant()));
        assertEquals(
                "true",
                sender.getJavaMailProperties().getProperty("mail.smtp.ssl.checkserveridentity"));
    }

    private Map<String, Object> row() {
        return db.queryForMap("SELECT * FROM mail_outbox");
    }

    private void configure(SmtpSecurityFixture smtp, SSLContext trust) {
        sender.setPort(smtp.port());
        sender.getJavaMailProperties().put("mail.smtp.ssl.socketFactory", trust.getSocketFactory());
    }

    @Test
    void queuedCapabilitySendsOverAuthenticatedTlsAndRemainsSingleUse() throws Exception {
        try (var smtp = new SmtpSecurityFixture(matching, Mode.NORMAL)) {
            configure(smtp, trusted);
            accounts.requestReset("tls-player@example.test");
            assertEquals("PENDING", row().get("state"));
            assertEquals(1, outbox.dispatchDue());
            smtp.await();
            var completed = row();
            assertEquals("SENT", completed.get("state"));
            assertNull(completed.get("payload"));
            assertNull(completed.get("last_failure"));
            assertEquals(0, smtp.plaintextAuth.get());
            assertEquals(1, smtp.tlsAuth.get());
            assertEquals(1, smtp.messages.get());
            assertTrue(smtp.body().contains("Message-ID: " + completed.get("message_id")));
            var token =
                    Pattern.compile("/reset-password#token=([A-Za-z0-9_-]{43})")
                            .matcher(smtp.body());
            assertTrue(token.find());
            String raw = token.group(1);
            assertEquals(completed.get("token_hash"), AccountService.digest(raw));
            accounts.consume(raw, "RESET", "replacement-password-123");
            assertThrows(
                    ResponseStatusException.class,
                    () -> accounts.consume(raw, "RESET", "replacement-password-123"));
            assertEquals(0, outbox.dispatchDue());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"wrong-host", "untrusted", "authentication"})
    void certificateAndAuthenticationFailuresAreTerminalAndClearCiphertext(String failure)
            throws Exception {
        Identity identity = failure.equals("wrong-host") ? mismatching : matching;
        Mode mode = failure.equals("authentication") ? Mode.REJECT_AUTH : Mode.NORMAL;
        SSLContext trust =
                failure.equals("untrusted") ? SmtpSecurityFixture.trust(mismatching) : trusted;
        try (var smtp = new SmtpSecurityFixture(identity, mode)) {
            configure(smtp, trust);
            accounts.requestReset("tls-player@example.test");
            var issued = row();
            assertEquals(1, outbox.dispatchDue());
            smtp.await();
            var terminal = row();
            assertEquals("FAILED", terminal.get("state"));
            assertEquals(1, terminal.get("attempts"));
            assertEquals(
                    failure.equals("authentication") ? "authentication" : "tls",
                    terminal.get("last_failure"));
            assertNull(terminal.get("payload"));
            assertNull(terminal.get("nonce"));
            assertNull(terminal.get("key_id"));
            assertEquals(issued.get("expires_at"), terminal.get("expires_at"));
            // Delivery failure does not undo committed issuance or mint a replacement.
            assertEquals(
                    1,
                    db.queryForObject(
                            "SELECT count(*) FROM account_tokens WHERE token_hash=? AND consumed_at"
                                    + " IS NULL",
                            Integer.class,
                            issued.get("token_hash")));
            clock.advance(Duration.ofMinutes(10));
            assertEquals(0, outbox.dispatchDue());
            assertEquals(0, smtp.plaintextAuth.get());
            assertEquals(failure.equals("authentication") ? 1 : 0, smtp.tlsAuth.get());
            assertEquals(0, smtp.messages.get());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"NO_STARTTLS", "REJECT_STARTTLS", "STALL_TLS"})
    void untypedNegotiationOrTimeoutFailureRetriesWithTheSameEncryptedCapability(String scenario)
            throws Exception {
        Mode mode = Mode.valueOf(scenario);
        try (var smtp = new SmtpSecurityFixture(matching, mode)) {
            configure(smtp, trusted);
            accounts.requestReset("tls-player@example.test");
            var issued = row();
            assertEquals(1, outbox.dispatchDue());
            var pending = row();
            assertEquals("PENDING", pending.get("state"));
            assertEquals(1, pending.get("attempts"));
            assertEquals(
                    mode == Mode.STALL_TLS ? "connection" : "uncertain",
                    pending.get("last_failure"));
            assertArrayEquals((byte[]) issued.get("payload"), (byte[]) pending.get("payload"));
            assertEquals(issued.get("token_hash"), pending.get("token_hash"));
            assertEquals(issued.get("expires_at"), pending.get("expires_at"));
            assertTrue(
                    ((Timestamp) pending.get("next_attempt_at"))
                            .toInstant()
                            .isAfter(clock.instant()));
            assertEquals(0, outbox.dispatchDue());
            assertEquals(0, smtp.plaintextAuth.get());
            assertEquals(0, smtp.tlsAuth.get());
            assertEquals(0, smtp.messages.get());
        }
    }
}
