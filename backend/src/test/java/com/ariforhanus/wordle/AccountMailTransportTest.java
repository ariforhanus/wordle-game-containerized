package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.service.AccountMail;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.net.*;
import java.time.Duration;
import java.util.concurrent.*;

class AccountMailTransportTest {
    private AccountMail transport(int port) {
        var sender = new JavaMailSenderImpl();
        sender.setHost("127.0.0.1");
        sender.setPort(port);
        var properties = sender.getJavaMailProperties();
        properties.setProperty("mail.smtp.connectiontimeout", "150");
        properties.setProperty("mail.smtp.timeout", "150");
        properties.setProperty("mail.smtp.writetimeout", "150");
        var beans = new StaticListableBeanFactory();
        beans.addBean("sender", sender);
        return new AccountMail(
                beans.getBeanProvider(JavaMailSender.class),
                true,
                "http://localhost:8080",
                "fixture@example.com");
    }

    @Test
    void unresponsiveSmtpServerHonorsReadTimeout() throws Exception {
        try (var server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
                var pool = Executors.newSingleThreadExecutor()) {
            var release = new CountDownLatch(1);
            var peer =
                    pool.submit(
                            () -> {
                                try (var socket = server.accept()) {
                                    release.await(5, TimeUnit.SECONDS);
                                } catch (Exception ex) {
                                    throw new RuntimeException(ex);
                                }
                            });
            try {
                assertTimeoutPreemptively(
                        Duration.ofSeconds(3),
                        () -> {
                            var failure =
                                    assertThrows(
                                            MailException.class,
                                            () ->
                                                    transport(server.getLocalPort())
                                                            .send(
                                                                    "fixture@example.com",
                                                                    "RESET",
                                                                    "fixture-token"));
                            assertTrue(
                                    hasTimeout(failure),
                                    "SMTP failure must be a read timeout, not an unrelated error");
                        });
            } finally {
                release.countDown();
                peer.get(5, TimeUnit.SECONDS);
            }
        }
    }

    @Test
    void refusedSmtpConnectionFailsWithinTheConfiguredBudget() throws Exception {
        int port;
        try (var server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            port = server.getLocalPort();
        }
        assertTimeoutPreemptively(
                Duration.ofSeconds(3),
                () ->
                        assertThrows(
                                MailException.class,
                                () ->
                                        transport(port)
                                                .send(
                                                        "fixture@example.com",
                                                        "RESET",
                                                        "fixture-token")));
    }

    private boolean hasTimeout(Throwable error) {
        if (error instanceof SocketTimeoutException) return true;
        if (error.getCause() != null && error.getCause() != error && hasTimeout(error.getCause()))
            return true;
        if (error instanceof jakarta.mail.MessagingException mail
                && mail.getNextException() != null
                && mail.getNextException() != error) return hasTimeout(mail.getNextException());
        return false;
    }
}
