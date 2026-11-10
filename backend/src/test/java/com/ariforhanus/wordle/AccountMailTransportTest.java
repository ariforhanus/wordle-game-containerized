package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.service.AccountMail;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

class AccountMailTransportTest {
    private AccountMail transport(int port) {
        return transport(port, 150);
    }

    private AccountMail transport(int port, int timeoutMillis) {
        var sender = new JavaMailSenderImpl();
        sender.setHost("127.0.0.1");
        sender.setPort(port);
        var properties = sender.getJavaMailProperties();
        properties.setProperty("mail.smtp.connectiontimeout", Integer.toString(timeoutMillis));
        properties.setProperty("mail.smtp.timeout", Integer.toString(timeoutMillis));
        properties.setProperty("mail.smtp.writetimeout", Integer.toString(timeoutMillis));
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

    @Test
    void temporaryRecipientRejectionDoesNotAutomaticallyRetryOrSendData() throws Exception {
        exerciseAmbiguousDelivery(true);
    }

    @Test
    void missingFinalAcknowledgementCanFailAfterTheServerAlreadyAcceptedTheMessage()
            throws Exception {
        exerciseAmbiguousDelivery(false);
    }

    private void exerciseAmbiguousDelivery(boolean rejectRecipient) throws Exception {
        try (var server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
                var pool = Executors.newSingleThreadExecutor()) {
            server.setSoTimeout(3000);
            var release = new CountDownLatch(1);
            var received = new AtomicInteger();
            var connections = new AtomicInteger();
            var peer =
                    pool.submit(
                            () -> {
                                try (var socket = server.accept();
                                        var reader =
                                                new BufferedReader(
                                                        new InputStreamReader(
                                                                socket.getInputStream(),
                                                                StandardCharsets.UTF_8));
                                        var writer =
                                                new PrintWriter(
                                                        new OutputStreamWriter(
                                                                socket.getOutputStream(),
                                                                StandardCharsets.UTF_8),
                                                        true)) {
                                    socket.setSoTimeout(3000);
                                    connections.incrementAndGet();
                                    writer.print("220 localhost fixture\r\n");
                                    writer.flush();
                                    String command;
                                    while ((command = reader.readLine()) != null) {
                                        if (command.startsWith("RCPT TO:") && rejectRecipient)
                                            writer.print("450 temporary recipient failure\r\n");
                                        else if (command.equals("DATA")) {
                                            writer.print("354 send data\r\n");
                                            writer.flush();
                                            String line;
                                            while ((line = reader.readLine()) != null
                                                    && !line.equals(".")) {}
                                            if (line == null)
                                                throw new EOFException(
                                                        "SMTP data was not complete");
                                            received.incrementAndGet();
                                            // Model acceptance with a lost final 250
                                            // acknowledgement.
                                            if (!release.await(3, TimeUnit.SECONDS))
                                                throw new IllegalStateException(
                                                        "Fixture release timeout");
                                            break;
                                        } else if (command.equals("QUIT")) {
                                            writer.print("221 goodbye\r\n");
                                            writer.flush();
                                            break;
                                        } else writer.print("250 OK\r\n");
                                        writer.flush();
                                    }
                                } catch (Exception ex) {
                                    throw new RuntimeException(ex);
                                }
                            });
            try {
                var error =
                        assertTimeoutPreemptively(
                                Duration.ofSeconds(4),
                                () ->
                                        assertThrows(
                                                MailException.class,
                                                () ->
                                                        transport(server.getLocalPort(), 500)
                                                                .send(
                                                                        "fixture@example.test",
                                                                        "RESET",
                                                                        "fixture-token")));
                if (rejectRecipient) assertTrue(error.getMessage().contains("450"));
                else assertTrue(hasTimeout(error));
                assertEquals(rejectRecipient ? 0 : 1, received.get());
                assertEquals(1, connections.get());
            } finally {
                release.countDown();
                peer.get(4, TimeUnit.SECONDS);
            }
        }
    }

    private boolean hasTimeout(Throwable error) {
        if (error instanceof SocketTimeoutException) return true;
        if (error instanceof org.springframework.mail.MailSendException failure)
            for (Exception nested : failure.getFailedMessages().values())
                if (nested != error && hasTimeout(nested)) return true;
        if (error.getCause() != null && error.getCause() != error && hasTimeout(error.getCause()))
            return true;
        if (error instanceof jakarta.mail.MessagingException mail
                && mail.getNextException() != null
                && mail.getNextException() != error) return hasTimeout(mail.getNextException());
        return false;
    }
}
