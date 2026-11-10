package com.ariforhanus.wordle.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;

@Configuration
@EnableScheduling
public class RetentionTasks {
    public static final Duration AUDIT_RETENTION = Duration.ofDays(90);
    public static final Duration SECURITY_RETENTION = Duration.ofDays(1);
    private final JdbcTemplate db;
    private final Clock clock;

    public RetentionTasks(JdbcTemplate db, Clock clock) {
        this.db = db;
        this.clock = clock;
    }

    @Scheduled(fixedDelay = 3600000, initialDelay = 3600000)
    @Transactional
    public void purgeExpiredSecurityData() {
        var now = clock.instant();
        var securityCutoff = Timestamp.from(now.minus(SECURITY_RETENTION));
        db.update("DELETE FROM auth_rate_limits WHERE window_start < ?", securityCutoff);
        db.update("DELETE FROM account_tokens WHERE expires_at < ?", securityCutoff);
        db.update(
                "DELETE FROM security_audit WHERE occurred_at < ?",
                Timestamp.from(now.minus(AUDIT_RETENTION)));
    }
}
