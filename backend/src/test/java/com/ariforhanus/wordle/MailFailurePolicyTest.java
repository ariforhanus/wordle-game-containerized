package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.service.MailFailurePolicy;

import jakarta.mail.internet.InternetAddress;

import org.junit.jupiter.api.Test;
import org.springframework.mail.*;

import java.io.IOException;
import java.util.Map;

import javax.net.ssl.SSLHandshakeException;

class MailFailurePolicyTest {
    @Test
    void smtpStatusClassificationDoesNotDependOnProviderText() throws Exception {
        for (int code : new int[] {450, 550}) {
            var nested =
                    new org.eclipse.angus.mail.smtp.SMTPAddressFailedException(
                            new InternetAddress("fixture@example.test"),
                            "RCPT TO",
                            code,
                            "sensitive fixture");
            var result =
                    MailFailurePolicy.classify(new MailSendException(Map.of(new Object(), nested)));
            assertEquals(code == 450, result.retryable());
            assertEquals(code == 450 ? "temporary" : "permanent", result.code());
            assertFalse(result.toString().contains("sensitive"));
        }
    }

    @Test
    void authenticationTlsAndInvalidMessagesAreNotBlindlyRetried() {
        assertFalse(
                MailFailurePolicy.classify(new MailAuthenticationException("private")).retryable());
        assertEquals(
                "tls",
                MailFailurePolicy.classify(
                                new MailSendException(
                                        "private", new SSLHandshakeException("private")))
                        .code());
        assertFalse(
                MailFailurePolicy.classify(new MailPreparationException("private")).retryable());
        assertTrue(
                MailFailurePolicy.classify(
                                new MailSendException("private", new IOException("private")))
                        .retryable());
        assertFalse(
                MailFailurePolicy.classify(
                                new MailSendException(
                                        "private",
                                        new jakarta.mail.AuthenticationFailedException("private")))
                        .retryable());
        var failures = new java.util.HashMap<Object, Exception>();
        failures.put(new Object(), null);
        failures.put(new Object(), new MailParseException("private"));
        assertEquals(
                "invalid_message",
                MailFailurePolicy.classify(new MailSendException(failures)).code());
        assertTrue(
                MailFailurePolicy.classify(new MailSendException("ambiguous acknowledgement"))
                        .retryable());
    }
}
