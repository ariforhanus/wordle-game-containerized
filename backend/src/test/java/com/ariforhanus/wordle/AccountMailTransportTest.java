package com.ariforhanus.wordle;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.service.AccountMail;
import com.ariforhanus.wordle.service.MailFailurePolicy;

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
        exerciseAmbiguousDelivery(450);
    }

    @Test
    void missingFinalAcknowledgementCanFailAfterTheServerAlreadyAcceptedTheMessage()
            throws Exception {
        exerciseAmbiguousDelivery(0);
    }

    @Test
    void permanentRecipientRejectionIsNotRetryable() throws Exception {
        exerciseAmbiguousDelivery(550);
    }

    private void exerciseAmbiguousDelivery(int rejectionCode) throws Exception {
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
                                        if (command.startsWith("RCPT TO:") && rejectionCode != 0)
                                            writer.print(rejectionCode + " recipient failure\r\n");
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
                if (rejectionCode != 0) {
                    assertTrue(error.getMessage().contains(Integer.toString(rejectionCode)));
                    assertEquals(
                            new MailFailurePolicy.Failure(
                                    rejectionCode == 450 ? "temporary" : "permanent",
                                    rejectionCode == 450),
                            MailFailurePolicy.classify(error));
                } else {
                    assertTrue(hasTimeout(error));
                    assertTrue(MailFailurePolicy.classify(error).retryable());
                }
                assertEquals(rejectionCode != 0 ? 0 : 1, received.get());
                assertEquals(1, connections.get());
            } finally {
                release.countDown();
                peer.get(4, TimeUnit.SECONDS);
            }
        }
    }

    @Test
    void queuedRetriesPreserveTheActualSmtpMessageIdAndCapability() throws Exception {
        try (var server = new ServerSocket(0, 2, InetAddress.getLoopbackAddress());
                var pool = Executors.newSingleThreadExecutor()) {
            server.setSoTimeout(5000);
            var received = new java.util.ArrayList<String>();
            var peer =
                    pool.submit(
                            () -> {
                                for (int attempt = 0; attempt < 2; attempt++) {
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
                                        socket.setSoTimeout(5000);
                                        writer.print("220 localhost fixture\r\n");
                                        writer.flush();
                                        String command;
                                        while ((command = reader.readLine()) != null) {
                                            if (command.equals("DATA")) {
                                                writer.print("354 send data\r\n");
                                                writer.flush();
                                                var body = new StringBuilder();
                                                String line;
                                                while ((line = reader.readLine()) != null
                                                        && !line.equals("."))
                                                    body.append(line).append("\n");
                                                if (line == null)
                                                    throw new EOFException(
                                                            "Incomplete fixture message");
                                                received.add(body.toString());
                                                writer.print("250 accepted\r\n");
                                            } else if (command.equals("QUIT")) {
                                                writer.print("221 bye\r\n");
                                                writer.flush();
                                                break;
                                            } else writer.print("250 OK\r\n");
                                            writer.flush();
                                        }
                                    } catch (IOException ex) {
                                        throw new UncheckedIOException(ex);
                                    }
                                }
                            });
            String messageId = "<wordle-stable-fixture@localhost>";
            var mail = transport(server.getLocalPort(), 2000);
            mail.sendQueued("fixture@example.test", "RESET", "fixture-token", messageId);
            mail.sendQueued("fixture@example.test", "RESET", "fixture-token", messageId);
            peer.get(5, TimeUnit.SECONDS);
            assertEquals(2, received.size());
            for (String body : received) {
                assertTrue(body.contains("Message-ID: " + messageId + "\n"));
                assertTrue(
                        body.contains("http://localhost:8080/reset-password#token=fixture-token"));
                assertTrue(body.contains("To: fixture@example.test"));
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
