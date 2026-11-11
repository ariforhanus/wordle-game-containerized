package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;

import com.ariforhanus.wordle.support.TestClockConfiguration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;

import java.nio.file.*;

@SpringBootTest
@Import(TestClockConfiguration.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DailyGameConsistencyIntegrationTest {
    @Autowired JdbcTemplate db;
    @Autowired javax.sql.DataSource dataSource;

    @BeforeEach
    void reset() {
        db.execute(
                "TRUNCATE TABLE auth_rate_limits, security_audit, daily_games, daily_puzzles,"
                        + " scores, users RESTART IDENTITY CASCADE");
        db.update(
                "INSERT INTO users(id,username,email,password_hash,created_at) VALUES"
                        + " (1,'fixture','fixture@example.test','unused',?)",
                java.sql.Timestamp.from(PERIOD_TIME));
        db.update(
                "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                        + " ('puzzle',?,'en','APPLE')",
                REFERENCE_DAY);
        db.update(
                "INSERT INTO daily_games(id,user_id,puzzle_id,started_at) VALUES"
                        + " ('game',1,'puzzle',?)",
                java.sql.Timestamp.from(PERIOD_TIME));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "APPL",
                "APPLES",
                "apple",
                "APP1E",
                "APPLE,",
                ",APPLE",
                "APPLE,,CIGAR",
                "APPLE\n",
                "APPLE,CIGAR,APPLE,CIGAR,APPLE,CIGAR,APPLE"
            })
    void rejectsMalformedGuesses(String guesses) {
        assertThrows(
                DataIntegrityViolationException.class,
                () -> db.update("UPDATE daily_games SET guesses=? WHERE id='game'", guesses));
        assertEquals("", db.queryForObject("SELECT guesses FROM daily_games", String.class));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "status='won'",
                "status='lost'",
                "finished_at=started_at",
                "status='won',finished_at=started_at",
                "guesses='APPLE,CIGAR,APPLE,CIGAR,APPLE,CIGAR'",
                "status='lost',finished_at=started_at,guesses='APPLE'"
            })
    void rejectsIncoherentState(String assignment) {
        // Assignments are compile-time test data, never application user input.
        assertThrows(
                DataIntegrityViolationException.class,
                () -> db.update("UPDATE daily_games SET " + assignment + " WHERE id='game'"));
        assertEquals("playing", db.queryForObject("SELECT status FROM daily_games", String.class));
        assertNull(
                db.queryForObject("SELECT finished_at FROM daily_games", java.sql.Timestamp.class));
    }

    @Test
    void acceptsRepeatedTurkishGuessesAndAtomicCompletion() {
        db.update(
                "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                    + " ('tr-puzzle',?,'tr','İNCİR')",
                REFERENCE_DAY);
        db.update("UPDATE daily_games SET puzzle_id='tr-puzzle'");
        db.update("UPDATE daily_games SET guesses='KİTAP,KİTAP,KİTAP,KİTAP,KİTAP'");
        db.update(
                "UPDATE daily_games SET"
                    + " guesses='KİTAP,KİTAP,KİTAP,KİTAP,KİTAP,İNCİR',status='won',finished_at=started_at");
        assertEquals(
                "KİTAP,KİTAP,KİTAP,KİTAP,KİTAP,İNCİR",
                db.queryForObject("SELECT guesses FROM daily_games", String.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"APPL", "apple", "APP1E", "APP,E"})
    void rejectsMalformedAnswers(String answer) {
        assertThrows(
                DataIntegrityViolationException.class,
                () ->
                        db.update(
                                "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                                    + " ('invalid',?,'tr',?)",
                                REFERENCE_DAY,
                                answer));
        assertEquals("APPLE", db.queryForObject("SELECT answer FROM daily_puzzles", String.class));
    }

    @Test
    void foreignKeysRejectOrphansAndPuzzleDeletion() {
        assertThrows(
                DataIntegrityViolationException.class,
                () -> db.update("UPDATE daily_games SET user_id=999"));
        assertThrows(
                DataIntegrityViolationException.class,
                () -> db.update("UPDATE daily_games SET puzzle_id='missing'"));
        assertThrows(
                DataIntegrityViolationException.class,
                () -> db.update("DELETE FROM daily_puzzles"));
    }

    @Test
    void v7RejectsCorruptHistoryTransactionallyAndPreflightDiagnosesIt() throws Exception {
        String schema = "daily_structure_migration_test";
        db.execute("CREATE SCHEMA " + schema);
        try {
            var pool = (com.zaxxer.hikari.HikariDataSource) dataSource;
            var source =
                    new DriverManagerDataSource(
                            pool.getJdbcUrl(), pool.getUsername(), pool.getPassword());
            Flyway.configure()
                    .dataSource(source)
                    .schemas(schema)
                    .defaultSchema(schema)
                    .target("6")
                    .load()
                    .migrate();
            try (var connection = source.getConnection()) {
                connection.setSchema(schema);
                var scoped =
                        new JdbcTemplate(
                                new org.springframework.jdbc.datasource.SingleConnectionDataSource(
                                        connection, true));
                scoped.update(
                        "INSERT INTO users(id,username,email,password_hash,created_at) VALUES"
                                + " (1,'legacy','legacy@example.test','unused',?)",
                        java.sql.Timestamp.from(PERIOD_TIME));
                scoped.update(
                        "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                                + " ('legacy-puzzle',?,'en','APPLE')",
                        REFERENCE_DAY);
                scoped.update(
                        "INSERT INTO daily_games(id,user_id,puzzle_id,started_at,guesses) VALUES"
                                + " ('legacy-game',1,'legacy-puzzle',?,'apple')",
                        java.sql.Timestamp.from(PERIOD_TIME));
                String preflight = Files.readString(Path.of("../deploy/preflight-daily-games.sql"));
                assertEquals(
                        "game_guesses_shape",
                        scoped.queryForList(preflight).getFirst().get("issue"));
                var flyway =
                        Flyway.configure()
                                .dataSource(source)
                                .schemas(schema)
                                .defaultSchema(schema)
                                .load();
                assertThrows(FlywayException.class, flyway::migrate);
                assertEquals(
                        "apple",
                        scoped.queryForObject("SELECT guesses FROM daily_games", String.class));
                assertEquals(
                        0,
                        scoped.queryForObject(
                                "SELECT COUNT(*) FROM pg_constraint WHERE"
                                        + " connamespace=?::regnamespace AND"
                                        + " conname='ck_puzzle_answer_shape'",
                                Integer.class,
                                schema));
                assertEquals(
                        0,
                        scoped.queryForObject(
                                "SELECT COUNT(*) FROM flyway_schema_history WHERE version='7'",
                                Integer.class));
                // Explicit repair of a disposable fixture; production repairs need reviewed data.
                scoped.update("UPDATE daily_games SET guesses='APPLE'");
                assertTrue(scoped.queryForList(preflight).isEmpty());
                flyway.migrate();
                assertEquals(
                        1,
                        scoped.queryForObject("SELECT COUNT(*) FROM daily_games", Integer.class));
                assertEquals(
                        "APPLE",
                        scoped.queryForObject("SELECT guesses FROM daily_games", String.class));
                assertThrows(
                        DataIntegrityViolationException.class,
                        () -> scoped.update("UPDATE daily_games SET guesses='apple'"));
            }
        } finally {
            db.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }
}
