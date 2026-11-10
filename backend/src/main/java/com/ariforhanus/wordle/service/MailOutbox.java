package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.config.MailOutboxProperties;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.annotation.PostConstruct;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.security.SecureRandom;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

@Service
@DependsOnDatabaseInitialization
public class MailOutbox {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(MailOutbox.class);
    private final JdbcTemplate db;
    private final MailOutboxProperties config;
    private final OutboxCipher crypto;
    private final AccountMail mail;
    private final Clock clock;
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final MeterRegistry metrics;
    private final Map<String, Counter> outcomes = new HashMap<>();
    private final AtomicLong active = new AtomicLong(),
            blocked = new AtomicLong(),
            oldest = new AtomicLong(),
            refreshed = new AtomicLong();
    private final SecureRandom random = new SecureRandom();
    private final String messageDomain;

    public MailOutbox(
            JdbcTemplate db,
            MailOutboxProperties config,
            OutboxCipher crypto,
            AccountMail mail,
            Clock clock,
            AuditService audit,
            PlatformTransactionManager transactions,
            MeterRegistry metrics,
            @Value("${app.public-url:http://localhost:8080}") String publicUrl) {
        this.db = db;
        this.config = config;
        this.crypto = crypto;
        this.mail = mail;
        this.clock = clock;
        this.audit = audit;
        this.metrics = metrics;
        messageDomain = config.enabled() ? URI.create(publicUrl).getHost() : "localhost";
        if (config.enabled() && messageDomain == null)
            throw new IllegalStateException("Outbox requires a valid public URL");
        tx = new TransactionTemplate(transactions);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        for (String outcome :
                List.of(
                        "sent",
                        "retry",
                        "failed",
                        "blocked",
                        "cancelled",
                        "expired",
                        "noop",
                        "infrastructure",
                        "capacity"))
            outcomes.put(
                    outcome, metrics.counter("wordle.mail.outbox.outcomes", "outcome", outcome));
        metrics.gauge("wordle.mail.outbox.active", active);
        metrics.gauge("wordle.mail.outbox.blocked", blocked);
        metrics.gauge("wordle.mail.outbox.oldest.seconds", oldest);
        metrics.gauge("wordle.mail.outbox.refreshed.epoch.seconds", refreshed);
        metrics.gauge("wordle.mail.outbox.enabled", config, c -> c.enabled() ? 1 : 0);
        metrics.gauge(
                "wordle.mail.outbox.worker.enabled",
                config,
                c -> c.enabled() && c.workerEnabled() ? 1 : 0);
    }

    public boolean enabled() {
        return config.enabled();
    }

    @PostConstruct
    public void validateKeyCoverage() {
        if (config.enabled()) {
            mail.requireAvailable();
            for (String key :
                    db.queryForList(
                            "SELECT DISTINCT key_id FROM mail_outbox WHERE payload IS NOT NULL AND"
                                    + " expires_at>?",
                            String.class,
                            stamp(clock.instant())))
                if (!crypto.keyIds().contains(key))
                    throw new IllegalStateException(
                            "Mail outbox key ring is missing a live payload key");
        }
        refreshMetrics();
    }

    /** Called before user lookup/locking, inside the account transaction. */
    public void guardEnqueue() {
        if (!enabled()) return;
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Outbox enqueue requires a transaction");
        db.queryForList("SELECT pg_advisory_xact_lock(?,?)", 0x4D41494C, 1);
        int count =
                db.queryForObject(
                        "SELECT count(*) FROM mail_outbox WHERE state IN"
                                + " ('PENDING','PROCESSING','BLOCKED')",
                        Integer.class);
        if (count >= config.maxPending()) {
            outcomes.get("capacity").increment();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "mail_queue_full");
        }
    }

    public void enqueue(
            long userId,
            String purpose,
            String hash,
            String email,
            String token,
            Instant issued,
            Instant expiry) {
        if (!enabled()) throw new IllegalStateException("Mail outbox is disabled");
        guardEnqueue();
        UUID id = UUID.randomUUID();
        String messageId = "<wordle-" + id + "@" + messageDomain + ">";
        var context = new OutboxCipher.Context(id, userId, purpose, hash, expiry, messageId);
        var encrypted = crypto.encrypt(context, email, token);
        db.update(
                "INSERT INTO"
                    + " mail_outbox(id,user_id,token_hash,purpose,message_id,created_at,next_attempt_at,expires_at,key_id,nonce,payload)"
                    + " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                id,
                userId,
                hash,
                purpose,
                messageId,
                stamp(issued),
                stamp(issued),
                stamp(expiry),
                encrypted.keyId(),
                encrypted.nonce(),
                encrypted.payload());
    }

    public void enqueueNoop() {
        if (!enabled()) throw new IllegalStateException("Mail outbox is disabled");
        guardEnqueue();
        Instant now = clock.instant();
        db.update(
                "INSERT INTO mail_outbox(id,purpose,created_at,next_attempt_at,expires_at) VALUES"
                        + " (?,'RESET',?,?,?)",
                UUID.randomUUID(),
                stamp(now),
                stamp(now),
                stamp(now.plusSeconds(300)));
    }

    @Scheduled(
            fixedDelayString = "${app.mail-outbox.poll-millis:5000}",
            initialDelayString = "${app.mail-outbox.poll-millis:5000}")
    public void tick() {
        if (!enabled() || !config.workerEnabled()) return;
        try {
            dispatchDue();
        } catch (RuntimeException ex) {
            outcomes.get("infrastructure").increment();
            log.warn("Mail outbox infrastructure operation failed");
        }
    }

    public int dispatchDue() {
        if (!enabled()) return 0;
        if (TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("SMTP dispatch must run outside a transaction");
        prune();
        int processed = 0;
        for (int i = 0; i < config.batchSize(); i++) {
            Claim claim = claim();
            if (claim == null) break;
            process(claim);
            processed++;
        }
        refreshMetrics();
        return processed;
    }

    private record Claim(UUID id, UUID lease) {}

    private record Item(
            OutboxCipher.Context context,
            String state,
            int attempts,
            String keyId,
            byte[] nonce,
            byte[] payload,
            String currentEmail,
            boolean tokenActive,
            Instant leaseUntil) {
        @Override
        public String toString() {
            return "OutboxItem[REDACTED]";
        }
    }

    private static Timestamp stamp(Instant value) {
        return Timestamp.from(value);
    }

    private Claim claim() {
        return tx.execute(
                status -> {
                    Instant now = clock.instant();
                    UUID lease = UUID.randomUUID();
                    var ids =
                            db.query(
                                    "WITH candidate AS (SELECT id FROM mail_outbox WHERE"
                                        + " ((state='PENDING' AND next_attempt_at<=?) OR"
                                        + " (state='PROCESSING' AND lease_until<=?)) AND"
                                        + " expires_at>? AND attempts<? AND (token_hash IS NULL OR"
                                        + " key_id=ANY(?)) ORDER BY next_attempt_at,created_at,id"
                                        + " FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE mail_outbox o"
                                        + " SET state='PROCESSING',attempts=attempts+1,lease_id=?,lease_until=?"
                                        + " FROM candidate c WHERE o.id=c.id RETURNING o.id",
                                    statement -> {
                                        statement.setTimestamp(1, stamp(now));
                                        statement.setTimestamp(2, stamp(now));
                                        statement.setTimestamp(3, stamp(now));
                                        statement.setInt(4, config.maxAttempts());
                                        statement.setArray(
                                                5,
                                                statement
                                                        .getConnection()
                                                        .createArrayOf(
                                                                "varchar",
                                                                crypto.keyIds().toArray()));
                                        statement.setObject(6, lease);
                                        statement.setTimestamp(
                                                7, stamp(now.plusSeconds(config.leaseSeconds())));
                                    },
                                    (row, n) -> row.getObject(1, UUID.class));
                    return ids.isEmpty() ? null : new Claim(ids.getFirst(), lease);
                });
    }

    private Item read(Claim claim, boolean lock) {
        var rows =
                db.query(
                        "SELECT o.*,u.email,u.email_verified,t.consumed_at AS"
                            + " token_consumed,t.token_hash AS actual_token FROM mail_outbox o LEFT"
                            + " JOIN users u ON u.id=o.user_id LEFT JOIN account_tokens t ON"
                            + " t.token_hash=o.token_hash WHERE o.id=? AND o.state='PROCESSING' AND"
                            + " o.lease_id=?"
                                + (lock ? " FOR UPDATE OF o" : ""),
                        (r, n) ->
                                new Item(
                                        new OutboxCipher.Context(
                                                r.getObject("id", UUID.class),
                                                r.getLong("user_id"),
                                                r.getString("purpose"),
                                                r.getString("token_hash"),
                                                r.getTimestamp("expires_at").toInstant(),
                                                r.getString("message_id")),
                                        r.getString("state"),
                                        r.getInt("attempts"),
                                        r.getString("key_id"),
                                        r.getBytes("nonce"),
                                        r.getBytes("payload"),
                                        r.getString("email"),
                                        r.getString("actual_token") != null
                                                && r.getTimestamp("token_consumed") == null
                                                && !(r.getString("purpose").equals("VERIFY")
                                                        && r.getBoolean("email_verified")),
                                        r.getTimestamp("lease_until").toInstant()),
                        claim.id(),
                        claim.lease());
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private void process(Claim claim) {
        Item item = tx.execute(status -> read(claim, false));
        if (item == null) return;
        if (item.context().tokenHash() == null) {
            int deleted =
                    tx.execute(
                            status ->
                                    db.update(
                                            "DELETE FROM mail_outbox WHERE id=? AND"
                                                    + " state='PROCESSING' AND lease_id=?",
                                            claim.id(),
                                            claim.lease()));
            if (deleted > 0) outcomes.get("noop").increment();
            return;
        }
        Instant now = clock.instant();
        if (!item.context().expiresAt().isAfter(now)
                || !item.tokenActive()
                || item.currentEmail() == null) {
            finish(claim, "cancelled", "revoked", false);
            return;
        }
        if (!item.leaseUntil().isAfter(now)) return;
        OutboxCipher.Secret secret;
        try {
            secret = crypto.decrypt(item.context(), item.keyId(), item.nonce(), item.payload());
        } catch (IllegalStateException ex) {
            finish(claim, "blocked", "crypto", false);
            return;
        }
        if (!secret.email().equals(item.currentEmail())) {
            finish(claim, "cancelled", "revoked", false);
            return;
        }
        try {
            mail.sendQueued(
                    secret.email(),
                    item.context().purpose(),
                    secret.token(),
                    item.context().messageId());
        } catch (MailException ex) {
            metrics.counter(
                            "wordle.mail.delivery.failures",
                            "purpose",
                            item.context().purpose().equals("RESET") ? "reset" : "verification")
                    .increment();
            var failure = MailFailurePolicy.classify(ex);
            finish(claim, "failed", failure.code(), failure.retryable());
            return;
        }
        finish(claim, "sent", null, false);
    }

    private void finish(Claim claim, String desired, String reason, boolean retryable) {
        String outcome =
                tx.execute(
                        status -> {
                            Item item = read(claim, true);
                            if (item == null) return null;
                            Instant now = clock.instant();
                            String state;
                            String failure = reason;
                            if (!item.context().expiresAt().isAfter(now)) {
                                state = "EXPIRED";
                                failure = "expired";
                            } else if (!item.tokenActive() || item.currentEmail() == null) {
                                state = "CANCELLED";
                                failure = "revoked";
                            } else if (desired.equals("blocked")) state = "BLOCKED";
                            else if (retryable && item.attempts() < config.maxAttempts())
                                state = "PENDING";
                            else state = desired.toUpperCase(Locale.ROOT);
                            boolean keep = state.equals("PENDING") || state.equals("BLOCKED");
                            long delay = Math.min(600, 30L << Math.min(item.attempts() - 1, 5));
                            if (state.equals("PENDING"))
                                delay =
                                        Math.min(
                                                600,
                                                delay + random.nextLong(Math.max(1, delay / 4)));
                            if (retryable
                                    && state.equals("FAILED")
                                    && item.attempts() >= config.maxAttempts())
                                failure = "max_attempts";
                            db.update(
                                    "UPDATE mail_outbox SET"
                                        + " state=?,lease_id=NULL,lease_until=NULL,completed_at=?,next_attempt_at=?,last_failure=?,key_id=?,nonce=?,payload=?"
                                        + " WHERE id=? AND state='PROCESSING' AND lease_id=?",
                                    state,
                                    keep ? null : stamp(now),
                                    stamp(now.plusSeconds(state.equals("PENDING") ? delay : 0)),
                                    failure,
                                    keep ? item.keyId() : null,
                                    keep ? item.nonce() : null,
                                    keep ? item.payload() : null,
                                    claim.id(),
                                    claim.lease());
                            return state.equals("PENDING")
                                    ? "retry"
                                    : state.toLowerCase(Locale.ROOT);
                        });
        if (outcome != null) outcomes.get(outcome).increment();
    }

    private void prune() {
        Instant now = clock.instant();
        int expired =
                tx.execute(
                        status ->
                                db.update(
                                        "UPDATE mail_outbox SET"
                                            + " state='EXPIRED',completed_at=?,lease_id=NULL,lease_until=NULL,key_id=NULL,nonce=NULL,payload=NULL,last_failure='expired'"
                                            + " WHERE state IN ('PENDING','PROCESSING','BLOCKED')"
                                            + " AND expires_at<=?",
                                        stamp(now),
                                        stamp(now)));
        if (expired > 0) outcomes.get("expired").increment(expired);
        int failed =
                tx.execute(
                        status ->
                                db.update(
                                        "UPDATE mail_outbox SET"
                                            + " state='FAILED',completed_at=?,lease_id=NULL,lease_until=NULL,key_id=NULL,nonce=NULL,payload=NULL,last_failure='max_attempts'"
                                            + " WHERE attempts>=? AND (state='PENDING' OR"
                                            + " (state='PROCESSING' AND lease_until<=?))",
                                        stamp(now),
                                        config.maxAttempts(),
                                        stamp(now)));
        if (failed > 0) outcomes.get("failed").increment(failed);
        tx.executeWithoutResult(
                status ->
                        db.update(
                                "DELETE FROM mail_outbox WHERE completed_at<? OR (token_hash IS"
                                        + " NULL AND expires_at<?)",
                                stamp(now.minusSeconds(86400)),
                                stamp(now.minusSeconds(86400))));
    }

    private void refreshMetrics() {
        Instant now = clock.instant();
        db.query(
                "SELECT count(*) FILTER (WHERE state IN ('PENDING','PROCESSING','BLOCKED')) AS"
                    + " active, count(*) FILTER (WHERE state='BLOCKED') AS blocked,min(created_at)"
                    + " FILTER (WHERE state IN ('PENDING','PROCESSING','BLOCKED')) AS oldest FROM"
                    + " mail_outbox",
                (org.springframework.jdbc.core.RowCallbackHandler)
                        row -> {
                            active.set(row.getLong("active"));
                            blocked.set(row.getLong("blocked"));
                            Timestamp first = row.getTimestamp("oldest");
                            oldest.set(
                                    first == null
                                            ? 0
                                            : Math.max(
                                                    0,
                                                    Duration.between(first.toInstant(), now)
                                                            .getSeconds()));
                        });
        refreshed.set(now.getEpochSecond());
    }

    public List<Map<String, Object>> jobs(int page) {
        if (page < 0 || page > 10000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        return db.queryForList(
                "SELECT"
                    + " id,purpose,state,attempts,next_attempt_at,lease_until,expires_at,last_failure,created_at,completed_at"
                    + " FROM mail_outbox ORDER BY created_at DESC,id LIMIT 50 OFFSET ?",
                page * 50);
    }

    public void retryBlocked(UUID id, long actorId) {
        if (!enabled())
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "mail_outbox_disabled");
        tx.executeWithoutResult(
                status -> {
                    var owners =
                            db.queryForList(
                                    "SELECT user_id FROM mail_outbox WHERE id=? AND state='BLOCKED'"
                                        + " AND user_id IS NOT NULL",
                                    Long.class,
                                    id);
                    if (owners.isEmpty())
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT, "mail_not_retryable");
                    // Account mutations lock users before token-triggered job cancellation.
                    // Include the audit actor, ordered, to avoid cross-account FK deadlocks.
                    long owner = owners.getFirst();
                    var lockedUsers =
                            db.queryForList(
                                    "SELECT id FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE",
                                    Long.class,
                                    owner,
                                    actorId);
                    if (!lockedUsers.contains(owner) || !lockedUsers.contains(actorId))
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT, "mail_not_retryable");
                    var rows =
                            db.query(
                                    "SELECT id FROM mail_outbox WHERE id=? AND state='BLOCKED' FOR"
                                            + " UPDATE",
                                    (r, n) -> r.getObject(1, UUID.class),
                                    id);
                    if (rows.isEmpty())
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT, "mail_not_retryable");
                    UUID lease = UUID.randomUUID();
                    db.update(
                            "UPDATE mail_outbox SET state='PROCESSING',lease_id=?,lease_until=?"
                                    + " WHERE id=?",
                            lease,
                            stamp(clock.instant().plusSeconds(config.leaseSeconds())),
                            id);
                    Item item = read(new Claim(id, lease), true);
                    if (item.attempts() >= config.maxAttempts()
                            || !item.context().expiresAt().isAfter(clock.instant())
                            || !item.tokenActive())
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT, "mail_not_retryable");
                    try {
                        var secret =
                                crypto.decrypt(
                                        item.context(), item.keyId(), item.nonce(), item.payload());
                        if (!secret.email().equals(item.currentEmail()))
                            throw new IllegalStateException();
                    } catch (IllegalStateException ex) {
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT, "mail_payload_unavailable");
                    }
                    db.update(
                            "UPDATE mail_outbox SET"
                                + " state='PENDING',lease_id=NULL,lease_until=NULL,next_attempt_at=?,last_failure=NULL"
                                + " WHERE id=?",
                            stamp(clock.instant()),
                            id);
                    audit.record(actorId, "MAIL_OUTBOX_RETRY", item.context().userId());
                });
    }
}
