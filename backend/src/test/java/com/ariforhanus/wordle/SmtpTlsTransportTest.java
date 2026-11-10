package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.service.*;
import com.ariforhanus.wordle.support.SmtpSecurityFixture;
import com.ariforhanus.wordle.support.SmtpSecurityFixture.*;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.mail.MailSenderAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.io.support.ResourcePropertySource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.*;

import java.nio.file.Path;
import java.util.function.Consumer;

import javax.net.ssl.SSLContext;

class SmtpTlsTransportTest {
    @TempDir static Path directory;
    static Identity matching, mismatching;
    static SSLContext trusted;

    @BeforeAll
    static void certificates() throws Exception {
        matching = SmtpSecurityFixture.identity(directory, "matching", true);
        mismatching = SmtpSecurityFixture.identity(directory, "mismatching", false);
        trusted = SmtpSecurityFixture.trust(matching, mismatching);
    }

    private void sender(
            SmtpSecurityFixture fixture, SSLContext trust, Consumer<AccountMail> assertion)
            throws java.io.IOException {
        var application = new ResourcePropertySource("classpath:application.properties");
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration.class))
                .withInitializer(
                        context ->
                                context.getEnvironment().getPropertySources().addLast(application))
                .withPropertyValues(
                        "spring.mail.host=127.0.0.1",
                        "spring.mail.port=" + fixture.port(),
                        "spring.mail.username=" + SmtpSecurityFixture.USER,
                        "spring.mail.password=" + SmtpSecurityFixture.PASSWORD,
                        "spring.mail.properties.mail.smtp.connectiontimeout=1500",
                        "spring.mail.properties.mail.smtp.timeout=1500",
                        "spring.mail.properties.mail.smtp.writetimeout=1500")
                .run(
                        context -> {
                            assertNull(context.getStartupFailure());
                            var sender = context.getBean(JavaMailSenderImpl.class);
                            var properties = sender.getJavaMailProperties();
                            assertEquals("true", properties.getProperty("mail.smtp.auth"));
                            assertEquals(
                                    "true", properties.getProperty("mail.smtp.starttls.enable"));
                            assertEquals(
                                    "true", properties.getProperty("mail.smtp.starttls.required"));
                            assertEquals(
                                    "true",
                                    properties.getProperty("mail.smtp.ssl.checkserveridentity"));
                            assertNull(properties.getProperty("mail.smtp.ssl.trust"));
                            // Private test trust manager, not a trust-all or process-wide trust
                            // override.
                            properties.put("mail.smtp.ssl.socketFactory", trust.getSocketFactory());
                            assertion.accept(
                                    new AccountMail(
                                            context.getBeanProvider(JavaMailSender.class),
                                            true,
                                            "http://localhost:8080",
                                            "fixture@example.test"));
                        });
    }

    private void send(AccountMail mail, boolean queued) {
        if (queued)
            mail.sendQueued(
                    "recipient@example.test", "RESET", "fixture-token", "<tls-fixture@localhost>");
        else mail.send("recipient@example.test", "RESET", "fixture-token");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void trustedMatchingIdentityAuthenticatesAndSendsOnlyAfterTls(boolean queued) throws Exception {
        try (var smtp = new SmtpSecurityFixture(matching, Mode.NORMAL)) {
            sender(smtp, trusted, mail -> assertDoesNotThrow(() -> send(mail, queued)));
            smtp.await();
            assertEquals(1, smtp.starttls.get());
            assertEquals(1, smtp.handshakes.get());
            assertEquals(0, smtp.plaintextAuth.get());
            assertEquals(1, smtp.tlsAuth.get());
            assertEquals(1, smtp.messages.get());
            assertTrue(smtp.body().contains("/reset-password#token=fixture-token"));
            if (queued) assertTrue(smtp.body().contains("Message-ID: <tls-fixture@localhost>"));
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void trustedCertificateWithWrongSanCannotAuthenticateOrSend(boolean queued) throws Exception {
        rejectedCertificate(mismatching, trusted, queued);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void matchingButUntrustedCertificateCannotAuthenticateOrSend(boolean queued) throws Exception {
        rejectedCertificate(matching, SmtpSecurityFixture.trust(mismatching), queued);
    }

    private void rejectedCertificate(Identity identity, SSLContext trust, boolean queued)
            throws Exception {
        try (var smtp = new SmtpSecurityFixture(identity, Mode.NORMAL)) {
            sender(
                    smtp,
                    trust,
                    mail -> {
                        var error = assertThrows(MailException.class, () -> send(mail, queued));
                        assertEquals(
                                new MailFailurePolicy.Failure("tls", false),
                                MailFailurePolicy.classify(error));
                    });
            smtp.await();
            assertEquals(1, smtp.starttls.get());
            assertEquals(0, smtp.plaintextAuth.get());
            assertEquals(0, smtp.tlsAuth.get());
            assertEquals(0, smtp.messages.get());
        }
    }

    @Test
    void missingStarttlsIsNeverDowngradedToPlaintext() throws Exception {
        negotiationFailure(Mode.NO_STARTTLS, "uncertain");
    }

    @Test
    void refusedStarttlsIsNeverDowngradedToPlaintext() throws Exception {
        negotiationFailure(Mode.REJECT_STARTTLS, "uncertain");
    }

    @Test
    void stalledTlsHandshakeTimesOutWithoutLeakingAuthOrMessage() throws Exception {
        negotiationFailure(Mode.STALL_TLS, "connection");
    }

    private void negotiationFailure(Mode mode, String code) throws Exception {
        try (var smtp = new SmtpSecurityFixture(matching, mode)) {
            sender(
                    smtp,
                    trusted,
                    mail -> {
                        var error = assertThrows(MailException.class, () -> send(mail, true));
                        assertEquals(
                                new MailFailurePolicy.Failure(code, true),
                                MailFailurePolicy.classify(error));
                    });
            assertEquals(0, smtp.plaintextAuth.get());
            assertEquals(0, smtp.tlsAuth.get());
            assertEquals(0, smtp.messages.get());
        }
    }

    @Test
    void authenticationRejectionAfterTlsIsTerminalAndSendsNoData() throws Exception {
        try (var smtp = new SmtpSecurityFixture(matching, Mode.REJECT_AUTH)) {
            sender(
                    smtp,
                    trusted,
                    mail -> {
                        var error = assertThrows(MailException.class, () -> send(mail, true));
                        assertEquals(
                                new MailFailurePolicy.Failure("authentication", false),
                                MailFailurePolicy.classify(error));
                    });
            smtp.await();
            assertEquals(0, smtp.plaintextAuth.get());
            assertEquals(1, smtp.tlsAuth.get());
            assertEquals(0, smtp.messages.get());
        }
    }
}
