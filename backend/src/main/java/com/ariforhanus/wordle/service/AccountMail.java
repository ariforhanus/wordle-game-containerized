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
        URI uri = URI.create(baseUrl);
        if (enabled
                && (!"https".equals(uri.getScheme())
                        && !("http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()))))
            throw new IllegalStateException("PUBLIC_URL must use HTTPS outside localhost");
        if (enabled && senders.getIfAvailable() == null)
            throw new IllegalStateException("SMTP_HOST is required when mail is enabled");
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
