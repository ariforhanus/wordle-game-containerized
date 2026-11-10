package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.config.RetentionTasks;
import com.ariforhanus.wordle.support.MutableClock;
import com.ariforhanus.wordle.support.TestClockConfiguration;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Timestamp;
import java.time.Duration;

@SpringBootTest
@Import(TestClockConfiguration.class)
@ActiveProfiles("test")
class RetentionTasksIntegrationTest {
    @Autowired JdbcTemplate db;
    @Autowired RetentionTasks retention;
    @Autowired MutableClock clock;

    @BeforeEach
    void seedBoundaryRows() {
        db.execute(
                "TRUNCATE"
                    + " auth_rate_limits,security_audit,account_tokens,daily_games,daily_puzzles,scores,users"
                    + " RESTART IDENTITY CASCADE");
        clock.set(DAYTIME);
        db.update(
                "INSERT INTO users(id,username,email,password_hash,created_at) VALUES"
                        + " (1,'fixture','fixture@example.test','unused',?)",
                Timestamp.from(clock.instant()));
        for (int seconds : new int[] {-1, 0, 1}) {
            var securityDate =
                    Timestamp.from(
                            DAYTIME.minus(RetentionTasks.SECURITY_RETENTION).plusSeconds(seconds));
            db.update(
                    "INSERT INTO auth_rate_limits(bucket_key,window_start,attempts) VALUES (?,?,1)",
                    "a".repeat(64),
                    securityDate);
            db.update(
                    "INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES"
                            + " (?,1,'RESET',?)",
                    Integer.toString(seconds + 2).repeat(64),
                    securityDate);
            db.update(
                    "INSERT INTO security_audit(actor_id,target_id,action,occurred_at) VALUES"
                            + " (1,1,'SESSIONS_REVOKED',?)",
                    Timestamp.from(
                            DAYTIME.minus(RetentionTasks.AUDIT_RETENTION).plusSeconds(seconds)));
        }
    }

    @Test
    void usesInjectedTimeAndStrictCutoffsForEveryRetentionCategory() {
        retention.purgeExpiredSecurityData();
        for (String table : new String[] {"auth_rate_limits", "account_tokens", "security_audit"})
            assertEquals(2, db.queryForObject("SELECT count(*) FROM " + table, Integer.class));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM users", Integer.class));
        clock.advance(Duration.ofSeconds(1));
        retention.purgeExpiredSecurityData();
        for (String table : new String[] {"auth_rate_limits", "account_tokens", "security_audit"})
            assertEquals(1, db.queryForObject("SELECT count(*) FROM " + table, Integer.class));
        retention.purgeExpiredSecurityData();
        assertEquals(1, db.queryForObject("SELECT count(*) FROM security_audit", Integer.class));
    }

    @Test
    void failureInLastCategoryRollsBackEarlierCleanupAndCanBeRetried() {
        db.execute(
                "CREATE FUNCTION reject_retention_fixture() RETURNS trigger LANGUAGE plpgsql AS $$"
                        + " BEGIN RAISE EXCEPTION 'injected cleanup failure'; END $$");
        db.execute(
                "CREATE TRIGGER reject_retention_fixture BEFORE DELETE ON security_audit FOR EACH"
                        + " ROW EXECUTE FUNCTION reject_retention_fixture()");
        try {
            assertThrows(DataAccessException.class, retention::purgeExpiredSecurityData);
            for (String table :
                    new String[] {"auth_rate_limits", "account_tokens", "security_audit"})
                assertEquals(3, db.queryForObject("SELECT count(*) FROM " + table, Integer.class));
        } finally {
            db.execute("DROP TRIGGER reject_retention_fixture ON security_audit");
            db.execute("DROP FUNCTION reject_retention_fixture()");
        }
        retention.purgeExpiredSecurityData();
        for (String table : new String[] {"auth_rate_limits", "account_tokens", "security_audit"})
            assertEquals(2, db.queryForObject("SELECT count(*) FROM " + table, Integer.class));
    }
}
