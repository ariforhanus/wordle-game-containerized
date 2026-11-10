package com.ariforhanus.wordle.support;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import javax.net.ssl.*;

/** Real loopback SMTP/STARTTLS, ephemeral identities and isolated trust; never production. */
public final class SmtpSecurityFixture implements AutoCloseable {
    public static final String USER = "smtp-fixture";
    public static final String PASSWORD = "local-fixture-password";
    private static final char[] STORE_PASSWORD = "ephemeral-test-store".toCharArray();

    public enum Mode {
        NORMAL,
        NO_STARTTLS,
        REJECT_STARTTLS,
        STALL_TLS,
        REJECT_AUTH
    }

    public record Identity(SSLContext server, java.security.cert.Certificate certificate) {}

    /** JDK-bundled keytool keeps tests portable; validity is relative, never a fixed date. */
    public static Identity identity(Path directory, String name, boolean matchesHost)
            throws Exception {
        Path store = directory.resolve(name + ".p12");
        String executable =
                System.getProperty("os.name").startsWith("Windows") ? "keytool.exe" : "keytool";
        var process =
                new ProcessBuilder(
                                Path.of(System.getProperty("java.home"), "bin", executable)
                                        .toString(),
                                "-genkeypair",
                                "-alias",
                                "smtp-fixture",
                                "-keyalg",
                                "EC",
                                "-groupname",
                                "secp256r1",
                                "-sigalg",
                                "SHA256withECDSA",
                                "-dname",
                                "CN=fixture.example.test",
                                "-ext",
                                matchesHost
                                        ? "SAN=ip:127.0.0.1,dns:localhost"
                                        : "SAN=dns:wrong.example.test",
                                "-startdate",
                                "-1d",
                                "-validity",
                                "2",
                                "-storetype",
                                "PKCS12",
                                "-keystore",
                                store.toString(),
                                "-storepass",
                                new String(STORE_PASSWORD),
                                "-noprompt")
                        .redirectErrorStream(true)
                        .start();
        if (!process.waitFor(20, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("Local SMTP identity generation timed out");
        }
        if (process.exitValue() != 0)
            throw new IOException("Local SMTP identity generation failed");
        var keys = KeyStore.getInstance("PKCS12");
        try (var input = Files.newInputStream(store)) {
            keys.load(input, STORE_PASSWORD);
        }
        var managers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        managers.init(keys, STORE_PASSWORD);
        var server = SSLContext.getInstance("TLS");
        server.init(managers.getKeyManagers(), null, new SecureRandom());
        return new Identity(server, keys.getCertificate("smtp-fixture"));
    }

    public static SSLContext trust(Identity... identities) throws Exception {
        var roots = KeyStore.getInstance("PKCS12");
        roots.load(null, null);
        for (int i = 0; i < identities.length; i++)
            roots.setCertificateEntry("fixture-" + i, identities[i].certificate());
        var managers = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        managers.init(roots);
        var client = SSLContext.getInstance("TLS");
        client.init(null, managers.getTrustManagers(), new SecureRandom());
        return client;
    }

    private final ServerSocket server;
    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private final Future<?> peer;
    private final CountDownLatch release = new CountDownLatch(1);
    private volatile Socket connection;
    public final AtomicInteger plaintextAuth = new AtomicInteger(),
            tlsAuth = new AtomicInteger(),
            messages = new AtomicInteger(),
            starttls = new AtomicInteger(),
            handshakes = new AtomicInteger();
    private volatile String body = "";

    public SmtpSecurityFixture(Identity identity, Mode mode) throws IOException {
        server = new ServerSocket();
        server.bind(new InetSocketAddress("127.0.0.1", 0));
        server.setSoTimeout(5000);
        peer =
                pool.submit(
                        () -> {
                            try {
                                serve(identity, mode);
                            } catch (Exception ex) {
                                throw new IllegalStateException("Local SMTP fixture failed", ex);
                            }
                        });
    }

    public int port() {
        return server.getLocalPort();
    }

    public String body() {
        return body;
    }

    public void await() throws Exception {
        peer.get(8, TimeUnit.SECONDS);
    }

    private static BufferedReader reader(Socket socket) throws IOException {
        return new BufferedReader(
                new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
    }

    private static void reply(Socket socket, String value) throws IOException {
        socket.getOutputStream().write(value.getBytes(StandardCharsets.UTF_8));
        socket.getOutputStream().flush();
    }

    private void serve(Identity identity, Mode mode) throws Exception {
        try (var accepted = server.accept()) {
            connection = accepted;
            accepted.setSoTimeout(5000);
            boolean tls = false, authenticated = false;
            var input = reader(accepted);
            reply(connection, "220 localhost isolated fixture\r\n");
            String line;
            while ((line = input.readLine()) != null) {
                String command = line.toUpperCase(Locale.ROOT);
                if (command.startsWith("EHLO") || command.startsWith("HELO")) {
                    // Deliberately offer AUTH before TLS: a secure client must upgrade first.
                    reply(
                            connection,
                            "250-localhost\r\n250-AUTH PLAIN\r\n"
                                    + (!tls && mode != Mode.NO_STARTTLS
                                            ? "250 STARTTLS\r\n"
                                            : "250 OK\r\n"));
                } else if (command.equals("STARTTLS")) {
                    starttls.incrementAndGet();
                    if (mode == Mode.REJECT_STARTTLS) {
                        reply(connection, "454 TLS temporarily unavailable\r\n");
                        continue;
                    }
                    reply(connection, "220 Ready for TLS\r\n");
                    if (mode == Mode.STALL_TLS) {
                        release.await(8, TimeUnit.SECONDS);
                        return;
                    }
                    var secure =
                            (SSLSocket)
                                    identity.server()
                                            .getSocketFactory()
                                            .createSocket(
                                                    accepted,
                                                    "127.0.0.1",
                                                    accepted.getPort(),
                                                    true);
                    connection = secure;
                    secure.setUseClientMode(false);
                    secure.setSoTimeout(5000);
                    try {
                        secure.startHandshake();
                    } catch (IOException clientRejectedCertificate) {
                        return;
                    }
                    handshakes.incrementAndGet();
                    tls = true;
                    input = reader(secure);
                } else if (command.startsWith("AUTH PLAIN")) {
                    if (tls) tlsAuth.incrementAndGet();
                    else plaintextAuth.incrementAndGet();
                    String response = line.substring("AUTH PLAIN".length()).trim();
                    if (response.isEmpty()) {
                        reply(connection, "334 \r\n");
                        response = input.readLine();
                    }
                    String credentials =
                            new String(
                                    Base64.getDecoder().decode(response), StandardCharsets.UTF_8);
                    // RFC 4616 permits an empty authzid or the authenticated identity.
                    String[] fields = credentials.split("\\x00", -1);
                    authenticated =
                            mode != Mode.REJECT_AUTH
                                    && fields.length == 3
                                    && (fields[0].isEmpty() || fields[0].equals(USER))
                                    && fields[1].equals(USER)
                                    && fields[2].equals(PASSWORD);
                    reply(
                            connection,
                            authenticated
                                    ? "235 authenticated\r\n"
                                    : "535 fixture authentication rejected\r\n");
                } else if (command.startsWith("MAIL FROM:") || command.startsWith("RCPT TO:")) {
                    reply(
                            connection,
                            tls && authenticated
                                    ? "250 OK\r\n"
                                    : "530 Secure authentication required\r\n");
                } else if (command.equals("DATA")) {
                    if (!tls || !authenticated) {
                        reply(connection, "530 Secure authentication required\r\n");
                        continue;
                    }
                    reply(connection, "354 send data\r\n");
                    var message = new StringBuilder();
                    while ((line = input.readLine()) != null && !line.equals("."))
                        message.append(line).append('\n');
                    if (line == null)
                        throw new EOFException("Incomplete local SMTP fixture message");
                    body = message.toString();
                    messages.incrementAndGet();
                    reply(connection, "250 accepted\r\n");
                } else if (command.equals("QUIT")) {
                    reply(connection, "221 bye\r\n");
                    return;
                } else if (command.equals("RSET") || command.equals("NOOP")) {
                    reply(connection, "250 OK\r\n");
                } else throw new IOException("Unexpected local SMTP fixture command");
            }
        } finally {
            Socket socket = connection;
            if (socket != null) socket.close();
        }
    }

    @Override
    public void close() throws Exception {
        release.countDown();
        try {
            await();
        } finally {
            Socket socket = connection;
            if (socket != null) socket.close();
            server.close();
            pool.shutdownNow();
        }
    }
}
