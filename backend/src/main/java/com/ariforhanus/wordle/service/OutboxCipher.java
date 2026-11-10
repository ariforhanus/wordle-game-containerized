package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.config.MailOutboxProperties;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

@Component
public class OutboxCipher {
    public record Context(
            UUID id,
            long userId,
            String purpose,
            String tokenHash,
            Instant expiresAt,
            String messageId) {}

    public record Encrypted(String keyId, byte[] nonce, byte[] payload) {}

    public record Secret(String email, String token) {
        @Override
        public String toString() {
            return "OutboxSecret[REDACTED]";
        }
    }

    private final Map<String, SecretKeySpec> keys;
    private final String active;
    private final ObjectMapper json;
    private final SecureRandom random = new SecureRandom();

    public OutboxCipher(
            MailOutboxProperties config, ObjectMapper json, @Value("${jwt.secret}") String jwt) {
        this.json = json;
        active = config.activeKeyId();
        var parsed = new HashMap<String, SecretKeySpec>();
        if (config.enabled()) {
            try {
                for (String entry : config.keys().split(",", -1)) {
                    String[] pair = entry.trim().split(":", 2);
                    if (pair.length != 2 || !pair[0].matches("[A-Za-z0-9_-]{1,32}"))
                        throw new IllegalArgumentException();
                    byte[] raw = Base64.getDecoder().decode(pair[1]);
                    if (raw.length != 32
                            || pair[1].equals(jwt)
                            || MessageDigest.isEqual(raw, jwt.getBytes(StandardCharsets.UTF_8))
                            || parsed.putIfAbsent(pair[0], new SecretKeySpec(raw, "AES")) != null)
                        throw new IllegalArgumentException();
                }
                if (parsed.size() > 8 || !parsed.containsKey(active))
                    throw new IllegalArgumentException();
            } catch (RuntimeException ex) {
                throw new IllegalStateException(
                        "Mail outbox requires a separate AES-256 key ring and active key ID");
            }
        }
        keys = Map.copyOf(parsed);
    }

    public Set<String> keyIds() {
        return keys.keySet();
    }

    private byte[] aad(Context context, String keyId) {
        return (keyId
                        + "|"
                        + context.id()
                        + "|"
                        + context.userId()
                        + "|"
                        + context.purpose()
                        + "|"
                        + context.tokenHash()
                        + "|"
                        + context.expiresAt().getEpochSecond()
                        + ":"
                        + context.expiresAt().getNano()
                        + "|"
                        + context.messageId())
                .getBytes(StandardCharsets.UTF_8);
    }

    public Encrypted encrypt(Context context, String email, String token) {
        try {
            byte[] nonce = new byte[12];
            random.nextBytes(nonce);
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keys.get(active), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad(context, active));
            byte[] result =
                    cipher.doFinal(json.writeValueAsBytes(Map.of("email", email, "token", token)));
            if (result.length > 2048) throw new IllegalArgumentException();
            return new Encrypted(active, nonce, result);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot encrypt mail outbox payload");
        }
    }

    public Secret decrypt(Context context, String keyId, byte[] nonce, byte[] payload) {
        try {
            if (nonce.length != 12
                    || payload.length < 17
                    || payload.length > 2048
                    || !keys.containsKey(keyId)) throw new IllegalArgumentException();
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keys.get(keyId), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad(context, keyId));
            var data = json.readTree(cipher.doFinal(payload));
            String email = data.path("email").asText("");
            String token = data.path("token").asText("");
            if (email.isBlank()
                    || email.length() > 120
                    || email.contains("\r")
                    || email.contains("\n")
                    || !token.matches("[A-Za-z0-9_-]{43}")
                    || !MessageDigest.isEqual(
                            AccountService.digest(token).getBytes(StandardCharsets.US_ASCII),
                            context.tokenHash().getBytes(StandardCharsets.US_ASCII)))
                throw new IllegalArgumentException();
            return new Secret(email, token);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot authenticate mail outbox payload");
        }
    }
}
