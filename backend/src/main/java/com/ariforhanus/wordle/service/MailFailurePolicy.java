package com.ariforhanus.wordle.service;

import jakarta.mail.MessagingException;

import org.springframework.mail.*;

import java.io.IOException;
import java.util.*;

import javax.net.ssl.SSLException;

/** Bounded codes only: provider messages/addresses are never retained. */
public final class MailFailurePolicy {
    public record Failure(String code, boolean retryable) {}

    private MailFailurePolicy() {}

    public static Failure classify(MailException error) {
        if (error instanceof MailAuthenticationException)
            return new Failure("authentication", false);
        if (error instanceof MailParseException || error instanceof MailPreparationException)
            return new Failure("invalid_message", false);
        var queue = new ArrayDeque<Throwable>();
        queue.add(error);
        var seen = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
        boolean io = false,
                temporary = false,
                permanent = false,
                tls = false,
                authentication = false,
                invalid = false;
        while (!queue.isEmpty() && seen.size() < 32) {
            Throwable next = queue.removeFirst();
            if (!seen.add(next)) continue;
            authentication |=
                    next instanceof MailAuthenticationException
                            || next instanceof jakarta.mail.AuthenticationFailedException;
            invalid |=
                    next instanceof MailParseException
                            || next instanceof MailPreparationException
                            || next instanceof jakarta.mail.internet.AddressException;
            tls |= next instanceof SSLException;
            io |= next instanceof IOException;
            // Angus exposes numeric SMTP status without parsing or storing sensitive text.
            int code = 0;
            if (next instanceof org.eclipse.angus.mail.smtp.SMTPAddressFailedException address)
                code = address.getReturnCode();
            if (next instanceof org.eclipse.angus.mail.smtp.SMTPSendFailedException send)
                code = send.getReturnCode();
            temporary |= code >= 400 && code < 500;
            permanent |= code >= 500 && code < 600;
            if (next.getCause() != null) queue.add(next.getCause());
            if (next instanceof MessagingException messaging
                    && messaging.getNextException() != null)
                queue.add(messaging.getNextException());
            if (next instanceof MailSendException send)
                for (Exception failure : send.getFailedMessages().values())
                    if (failure != null) queue.add(failure);
        }
        if (authentication) return new Failure("authentication", false);
        if (invalid) return new Failure("invalid_message", false);
        if (tls) return new Failure("tls", false);
        if (permanent) return new Failure("permanent", false);
        if (temporary) return new Failure("temporary", true);
        return new Failure(io ? "connection" : "uncertain", true);
    }
}
