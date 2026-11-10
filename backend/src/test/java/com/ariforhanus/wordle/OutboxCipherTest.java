package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.OutboxTestKeys.*;
import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.config.MailOutboxProperties;
import com.ariforhanus.wordle.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.util.*;

class OutboxCipherTest {
    private static final String TOKEN =
            Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
    private static final String EMAIL = "fixture@example.test";

    private MailOutboxProperties config(String active, String keys) {
        return new MailOutboxProperties(true, false, active, keys, 4, 3, 30, 10, 1000);
    }

    private OutboxCipher cipher(String active, String keys) {
        return new OutboxCipher(config(active, keys), new ObjectMapper(), "unrelated-jwt-test-key");
    }

    private OutboxCipher.Context context() {
        return new OutboxCipher.Context(
                UUID.randomUUID(),
                7,
                "RESET",
                AccountService.digest(TOKEN),
                DAYTIME.plusSeconds(1800),
                "<fixture@example.test>");
    }

    @Test
    void roundTripUsesUniqueNoncesAndRedactsSecretRepresentations() {
        var cipher = cipher("test-v1", RING);
        var context = context();
        var first = cipher.encrypt(context, EMAIL, TOKEN);
        var second = cipher.encrypt(context, EMAIL, TOKEN);
        assertFalse(Arrays.equals(first.nonce(), second.nonce()));
        assertFalse(Arrays.equals(first.payload(), second.payload()));
        var secret = cipher.decrypt(context, first.keyId(), first.nonce(), first.payload());
        assertEquals(EMAIL, secret.email());
        assertEquals(TOKEN, secret.token());
        assertFalse(secret.toString().contains(TOKEN));
        assertFalse(secret.toString().contains(EMAIL));
        assertFalse(config("test-v1", RING).toString().contains(FIRST));
        assertFalse(new String(first.payload(), StandardCharsets.UTF_8).contains(TOKEN));
    }

    @Test
    void everyAuthenticatedIdentityFieldIsBoundToThePayload() {
        var cipher = cipher("test-v1", RING);
        var c = context();
        var encrypted = cipher.encrypt(c, EMAIL, TOKEN);
        var changed =
                List.of(
                        new OutboxCipher.Context(
                                UUID.randomUUID(),
                                c.userId(),
                                c.purpose(),
                                c.tokenHash(),
                                c.expiresAt(),
                                c.messageId()),
                        new OutboxCipher.Context(
                                c.id(),
                                8,
                                c.purpose(),
                                c.tokenHash(),
                                c.expiresAt(),
                                c.messageId()),
                        new OutboxCipher.Context(
                                c.id(), 7, "VERIFY", c.tokenHash(), c.expiresAt(), c.messageId()),
                        new OutboxCipher.Context(
                                c.id(),
                                7,
                                c.purpose(),
                                "b".repeat(64),
                                c.expiresAt(),
                                c.messageId()),
                        new OutboxCipher.Context(
                                c.id(),
                                7,
                                c.purpose(),
                                c.tokenHash(),
                                c.expiresAt().plusNanos(1000),
                                c.messageId()),
                        new OutboxCipher.Context(
                                c.id(),
                                7,
                                c.purpose(),
                                c.tokenHash(),
                                c.expiresAt(),
                                "<different@example.test>"));
        for (var value : changed)
            assertThrows(
                    IllegalStateException.class,
                    () ->
                            cipher.decrypt(
                                    value,
                                    encrypted.keyId(),
                                    encrypted.nonce(),
                                    encrypted.payload()));
        encrypted.payload()[0] ^= 1;
        assertThrows(
                IllegalStateException.class,
                () -> cipher.decrypt(c, encrypted.keyId(), encrypted.nonce(), encrypted.payload()));
    }

    @Test
    void rotationReadsOldKeysAndNewEncryptionUsesOnlyTheActiveVersion() {
        var c = context();
        var old = cipher("test-v1", RING).encrypt(c, EMAIL, TOKEN);
        var rotated = cipher("test-v2", RING + ",test-v2:" + SECOND);
        assertEquals(TOKEN, rotated.decrypt(c, old.keyId(), old.nonce(), old.payload()).token());
        var next = rotated.encrypt(c, EMAIL, TOKEN);
        assertEquals("test-v2", next.keyId());
        assertThrows(
                IllegalStateException.class,
                () -> rotated.decrypt(c, "test-v1", next.nonce(), next.payload()));
        assertThrows(
                IllegalStateException.class,
                () ->
                        cipher("test-v1", "test-v1:" + SECOND)
                                .decrypt(c, old.keyId(), old.nonce(), old.payload()));
        assertThrows(
                IllegalStateException.class,
                () ->
                        cipher("test-v2", "test-v2:" + SECOND)
                                .decrypt(c, old.keyId(), old.nonce(), old.payload()));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "",
                "bad",
                "test-v1:!",
                "test-v1:YQ==",
                "test-v1:" + FIRST + ",test-v1:" + SECOND,
                "other:" + FIRST
            })
    void invalidRingsFailWithoutPrintingKeyMaterial(String keys) {
        var error = assertThrows(IllegalStateException.class, () -> cipher("test-v1", keys));
        assertFalse(error.getMessage().contains(FIRST));
        assertFalse(error.getMessage().contains(SECOND));
    }

    @Test
    void jwtKeyReuseIsRejectedAndDisabledModeNeedsNoSecret() {
        assertThrows(
                IllegalStateException.class,
                () -> new OutboxCipher(config("test-v1", RING), new ObjectMapper(), FIRST));
        var disabled = new MailOutboxProperties(false, true, "", "", 4, 3, 30, 10, 1000);
        assertTrue(new OutboxCipher(disabled, new ObjectMapper(), "jwt").keyIds().isEmpty());
    }
}
