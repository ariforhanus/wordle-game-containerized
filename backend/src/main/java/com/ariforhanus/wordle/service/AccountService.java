package com.ariforhanus.wordle.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

@Service
public class AccountService {
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;
    private final AccountMail mail;
    private final AuditService audit;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AccountService(
            JdbcTemplate db,
            PasswordEncoder encoder,
            AccountMail mail,
            AuditService audit,
            Clock clock) {
        this.db = db;
        this.encoder = encoder;
        this.mail = mail;
        this.audit = audit;
        this.clock = clock;
    }

    public static String digest(String text) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private void lockUser(long id) {
        if (db.queryForList("SELECT id FROM users WHERE id=? FOR UPDATE", id).isEmpty())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }

    @Transactional
    public void requestReset(String email) {
        mail.requireAvailable();
        var ids =
                db.queryForList(
                        "SELECT id FROM users WHERE lower(email)=lower(?) ORDER BY id",
                        Long.class,
                        email.trim());
        // Same HTTP response for unknown addresses, and no token in any API response or log.
        for (Long id : ids) issue(id, "RESET");
    }

    @Transactional
    public void requestVerification(long id) {
        mail.requireAvailable();
        lockUser(id);
        issue(id, "VERIFY");
    }

    private void issue(long id, String kind) {
        lockUser(id);
        if (kind.equals("VERIFY")
                && Boolean.TRUE.equals(
                        db.queryForObject(
                                "SELECT email_verified FROM users WHERE id=?", Boolean.class, id)))
            return;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String email = db.queryForObject("SELECT email FROM users WHERE id=?", String.class, id);
        db.update(
                "UPDATE account_tokens SET consumed_at=? WHERE user_id=? AND kind=? AND consumed_at"
                    + " IS NULL",
                Timestamp.from(clock.instant()),
                id,
                kind);
        db.update(
                "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES (?,?,?,?)",
                digest(token),
                id,
                kind,
                Timestamp.from(
                        clock.instant()
                                .plus(Duration.ofMinutes(kind.equals("RESET") ? 30 : 1440))));
        mail.send(email, kind, token);
    }

    @Transactional
    public void consume(String token, String kind, String newPassword) {
        String hash = digest(token);
        var ids =
                db.queryForList(
                        "SELECT user_id FROM account_tokens WHERE token_hash=? AND kind=?",
                        Long.class,
                        hash,
                        kind);
        if (ids.size() != 1)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_or_expired_token");
        long id = ids.getFirst();
        lockUser(id);
        int consumed =
                db.update(
                        "UPDATE account_tokens SET consumed_at=? WHERE token_hash=? AND kind=? AND"
                            + " consumed_at IS NULL AND expires_at>?",
                        Timestamp.from(clock.instant()),
                        hash,
                        kind,
                        Timestamp.from(clock.instant()));
        if (consumed != 1)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_or_expired_token");
        if (kind.equals("VERIFY")) {
            db.update("UPDATE users SET email_verified=true, version=version+1 WHERE id=?", id);
            audit.record(id, "EMAIL_VERIFIED", id);
        } else {
            validatePassword(newPassword);
            db.update(
                    "UPDATE users SET password_hash=?, auth_version=auth_version+1,"
                        + " version=version+1 WHERE id=?",
                    encoder.encode(newPassword),
                    id);
            db.update(
                    "UPDATE account_tokens SET consumed_at=? WHERE user_id=? AND consumed_at IS"
                        + " NULL",
                    Timestamp.from(clock.instant()),
                    id);
            audit.record(id, "PASSWORD_RESET", id);
        }
    }

    @Transactional
    public void changePassword(long id, String current, String next) {
        lockUser(id);
        String hash =
                db.queryForObject("SELECT password_hash FROM users WHERE id=?", String.class, id);
        if (!encoder.matches(current, hash))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "incorrect_password");
        validatePassword(next);
        db.update(
                "UPDATE users SET password_hash=?, auth_version=auth_version+1, version=version+1"
                    + " WHERE id=?",
                encoder.encode(next),
                id);
        db.update(
                "UPDATE account_tokens SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL",
                Timestamp.from(clock.instant()),
                id);
        audit.record(id, "PASSWORD_CHANGED", id);
    }

    @Transactional
    public void logoutAll(long id) {
        lockUser(id);
        db.update("UPDATE users SET auth_version=auth_version+1, version=version+1 WHERE id=?", id);
        audit.record(id, "SESSIONS_REVOKED", id);
    }

    @Transactional
    public void delete(long id, String password) {
        lockUser(id);
        String hash =
                db.queryForObject("SELECT password_hash FROM users WHERE id=?", String.class, id);
        if (!encoder.matches(password, hash))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "incorrect_password");
        audit.record(id, "ACCOUNT_DELETED", id);
        db.update("DELETE FROM users WHERE id=?", id);
    }

    public static void validatePassword(String password) {
        if (password == null
                || password.length() < 12
                || password.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_password");
    }
}
