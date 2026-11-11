package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.ariforhanus.wordle.service.AccountMail;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.server.ResponseStatusException;

class AccountMailConfigurationTest {
    private final JavaMailSender sender = mock(JavaMailSender.class);

    private AccountMail mail(boolean enabled, String url) {
        var beans = new StaticListableBeanFactory();
        beans.addBean("sender", sender);
        return new AccountMail(
                beans.getBeanProvider(JavaMailSender.class), enabled, url, "fixture@example.test");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(
            strings = {
                "/relative",
                "//example.test",
                "https:opaque",
                "https:/example.test",
                "https:///missing-host",
                "http://example.test",
                "http://localhost.attacker.test",
                "ftp://localhost",
                "https://user:sensitive-fixture@example.test",
                "https://example.test?secret=sensitive-fixture",
                "https://example.test/#sensitive-fixture",
                "https://example.test:0",
                "https://example.test:65536",
                "https://bad host.test"
            })
    void invalidPublicUrlsFailAtStartupWithoutEchoingConfigurationSecrets(String url) {
        var error = assertThrows(IllegalStateException.class, () -> mail(true, url));
        assertFalse(error.getMessage().contains("sensitive-fixture"));
        verifyNoInteractions(sender);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "https://example.test",
                "https://example.test/app/",
                "HTTPS://EXAMPLE.TEST:8443",
                "http://localhost:8080",
                "http://127.0.0.1:8080",
                "http://[::1]:8080"
            })
    void allowedRootsProduceFragmentCapabilitiesWithoutQueryTokens(String url) {
        mail(true, url).send("recipient@example.test", "RESET", "a".repeat(43));
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender).send(message.capture());
        String body = message.getValue().getText();
        var link = java.net.URI.create(body.substring(body.lastIndexOf('\n') + 1));
        assertEquals("token=" + "a".repeat(43), link.getFragment());
        assertNull(link.getRawQuery());
        assertTrue(link.getPath().endsWith("/reset-password"));
        assertEquals("fixture@example.test", message.getValue().getFrom());
    }

    @Test
    void disabledMailDoesNotUseAnUnusedUrlOrContactASender() {
        var disabled = mail(false, "unused invalid configuration");
        var error =
                assertThrows(
                        ResponseStatusException.class,
                        () -> disabled.send("recipient@example.test", "RESET", "unused-token"));
        assertEquals(503, error.getStatusCode().value());
        verifyNoInteractions(sender);
    }

    @Test
    void enabledMailRequiresASender() {
        var beans = new StaticListableBeanFactory();
        assertThrows(
                IllegalStateException.class,
                () ->
                        new AccountMail(
                                beans.getBeanProvider(JavaMailSender.class),
                                true,
                                "https://example.test",
                                "fixture@example.test"));
    }
}
