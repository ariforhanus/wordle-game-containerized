package com.ariforhanus.wordle.service;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;

@Service
public class AccountMail {
    private final ObjectProvider<JavaMailSender> senders;
    private final boolean enabled;
    private final String baseUrl;
    private final String from;

    public AccountMail(
            ObjectProvider<JavaMailSender> senders,
            @Value("${app.mail.enabled:false}") boolean enabled,
            @Value("${app.public-url:http://localhost:8080}") String baseUrl,
            @Value("${app.mail.from:wordle@localhost}") String from) {
        this.senders = senders;
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.from = from;
        if (enabled) validatePublicUrl(baseUrl);
        if (enabled && senders.getIfAvailable() == null)
            throw new IllegalStateException("SMTP_HOST is required when mail is enabled");
    }

    private static void validatePublicUrl(String value) {
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new IllegalStateException("PUBLIC_URL must be a valid absolute HTTPS URL");
        }
        boolean localHttp =
                "http".equalsIgnoreCase(uri.getScheme())
                        && java.util.Set.of("localhost", "127.0.0.1", "[::1]")
                                .contains(
                                        uri.getHost() == null
                                                ? ""
                                                : uri.getHost().toLowerCase(java.util.Locale.ROOT));
        if (!uri.isAbsolute()
                || uri.isOpaque()
                || uri.getHost() == null
                || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null
                || uri.getRawFragment() != null
                || uri.getPort() == 0
                || uri.getPort() > 65535
                || !("https".equalsIgnoreCase(uri.getScheme()) || localHttp))
            throw new IllegalStateException(
                    "PUBLIC_URL requires HTTPS (or loopback HTTP), a host and no user info, query"
                            + " or fragment");
    }

    public void requireAvailable() {
        if (!enabled)
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "mail_unavailable");
    }

    public void send(String email, String kind, String token) {
        requireAvailable();
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject(
                kind.equals("VERIFY") ? "Verify your Wordle email" : "Reset your Wordle password");
        // Fragment tokens never reach proxy access logs or the HTTP referrer.
        message.setText(
                "Open this link to continue. If you did not request it, ignore this email.\n\n"
                        + baseUrl.replaceAll("/+$", "")
                        + (kind.equals("VERIFY")
                                ? "/verify-email#token="
                                : "/reset-password#token=")
                        + token);
        senders.getObject().send(message);
    }
}
