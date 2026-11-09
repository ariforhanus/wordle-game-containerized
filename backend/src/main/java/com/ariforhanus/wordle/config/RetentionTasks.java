package com.ariforhanus.wordle.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.*;

@Configuration
@EnableScheduling
public class RetentionTasks {
    private final JdbcTemplate db;

    public RetentionTasks(JdbcTemplate db) {
        this.db = db;
    }

    @Scheduled(fixedDelay = 3600000, initialDelay = 3600000)
    public void purgeExpiredSecurityData() {
        db.update("DELETE FROM auth_rate_limits WHERE window_start < now()-interval '1 day'");
        db.update("DELETE FROM account_tokens WHERE expires_at < now()-interval '1 day'");
        db.update("DELETE FROM security_audit WHERE occurred_at < now()-interval '90 days'");
    }
}
