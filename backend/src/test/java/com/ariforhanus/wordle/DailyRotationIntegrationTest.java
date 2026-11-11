package com.ariforhanus.wordle;

import static com.ariforhanus.wordle.support.TestTimes.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.ariforhanus.wordle.service.DailyPuzzleService;
import com.ariforhanus.wordle.service.provider.RandomWordApiProvider;
import com.ariforhanus.wordle.support.TestClockConfiguration;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;

@SpringBootTest
@Import(TestClockConfiguration.class)
@ActiveProfiles("test")
class DailyRotationIntegrationTest {
    @Autowired JdbcTemplate db;
    @Autowired PlatformTransactionManager transactions;
    @Autowired javax.sql.DataSource dataSource;
    TransactionTemplate tx;
    RandomWordApiProvider provider;
    DailyPuzzleService first;
    DailyPuzzleService second;

    @BeforeEach
    void reset() {
        db.execute(
                "TRUNCATE TABLE"
                        + " auth_rate_limits,security_audit,daily_games,daily_puzzles,scores,users"
                        + " RESTART IDENTITY CASCADE");
        tx = new TransactionTemplate(transactions);
        provider = mock(RandomWordApiProvider.class);
        when(provider.getAllWords("en")).thenReturn(List.of("APPLE", "CIGAR", "REBUT"));
        when(provider.getAllWords("tr")).thenReturn(List.of("İNCİR", "KİTAP", "ELMAS"));
        first = new DailyPuzzleService(db, provider);
        second = new DailyPuzzleService(db, provider);
    }

    private DailyPuzzleService.Puzzle create(
            DailyPuzzleService service, LocalDate day, String language) {
        // Independent service instances, each with a real transaction-bound PG connection.
        return tx.execute(status -> service.getOrCreate(day, language));
    }

    @Test
    void sequentialDaysUseEachAnswerBeforeRepeatingAndMaintainSpacingAfterExhaustion() {
        var answers = new ArrayList<String>();
        for (int i = 0; i < 12; i++)
            answers.add(create(first, REFERENCE_DAY.plusDays(i), "en").answer());
        for (int i = 0; i <= 9; i++)
            assertEquals(3, new HashSet<>(answers.subList(i, i + 3)).size());
        assertEquals(12, db.queryForObject("SELECT count(*) FROM daily_puzzles", Integer.class));
    }

    @Test
    void languagesAreIndependentEvenWhenTheirAnswerStringsOverlap() {
        when(provider.getAllWords("en")).thenReturn(List.of("ELMAS"));
        when(provider.getAllWords("tr")).thenReturn(List.of("KİTAP"));
        create(first, REFERENCE_DAY.minusDays(1), "tr");
        assertEquals("ELMAS", create(first, REFERENCE_DAY, "en").answer());
        when(provider.getAllWords("tr")).thenReturn(List.of("ELMAS", "KİTAP"));
        assertEquals("ELMAS", create(first, REFERENCE_DAY, "tr").answer());
        assertEquals(3, db.queryForObject("SELECT count(*) FROM daily_puzzles", Integer.class));
    }

    @Test
    void persistedNoncanonicalIdSurvivesAnEmptyOrUnavailableDictionary() {
        db.update(
                "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                        + " ('legacy-puzzle',?,'en','APPLE')",
                REFERENCE_DAY);
        when(provider.getAllWords(anyString()))
                .thenThrow(new IllegalStateException("provider unavailable"));
        assertEquals("legacy-puzzle", create(first, REFERENCE_DAY, "en").id());
        assertEquals("APPLE", create(second, REFERENCE_DAY, "en").answer());
        verifyNoInteractions(provider);
    }

    @Test
    void dictionaryChangesNeverRewriteOldDaysAndNewAnswersArePreferred() {
        var old = create(first, REFERENCE_DAY, "en");
        when(provider.getAllWords("en")).thenReturn(List.of("HUMPH"));
        assertEquals("HUMPH", create(second, REFERENCE_DAY.plusDays(1), "en").answer());
        assertEquals(old, create(second, REFERENCE_DAY, "en"));
        when(provider.getAllWords("en")).thenReturn(List.of());
        assertEquals(old, create(first, REFERENCE_DAY, "en"));
        assertThrows(
                IllegalStateException.class, () -> create(first, REFERENCE_DAY.plusDays(2), "en"));
        assertEquals(2, db.queryForObject("SELECT count(*) FROM daily_puzzles", Integer.class));
    }

    @Test
    void outOfOrderDatesConsiderAlreadySavedFutureAndPastNeighbours() {
        when(provider.getAllWords("en")).thenReturn(List.of("APPLE", "CIGAR"));
        db.update(
                "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                        + " ('past',?,'en','APPLE'),('future',?,'en','CIGAR')",
                REFERENCE_DAY.minusDays(10),
                REFERENCE_DAY.plusDays(1));
        assertEquals("APPLE", create(first, REFERENCE_DAY, "en").answer());
        assertEquals("CIGAR", create(first, REFERENCE_DAY.plusDays(1), "en").answer());
    }

    @Test
    void aSingleAnswerPoolRepeatsWithoutBreakingAvailabilityOrChangingHistory() {
        when(provider.getAllWords("tr"))
                .thenReturn(List.of("incir", "İNCİR", "incir", "bad", "12345"));
        assertEquals("İNCİR", create(first, REFERENCE_DAY, "tr").answer());
        assertEquals("İNCİR", create(first, REFERENCE_DAY.plusDays(1), "tr").answer());
    }

    @Test
    void invalidOrUnsupportedNewPoolsCannotCreatePuzzles() {
        when(provider.getAllWords("en")).thenReturn(Arrays.asList(null, "12ABC", "", "LONGER"));
        assertThrows(IllegalStateException.class, () -> create(first, REFERENCE_DAY, "en"));
        assertThrows(IllegalArgumentException.class, () -> create(first, REFERENCE_DAY, "de"));
        assertEquals(0, db.queryForObject("SELECT count(*) FROM daily_puzzles", Integer.class));
    }

    @Test
    void sameDayConcurrentInstancesConvergeOnOnePersistedPuzzle() throws Exception {
        try (var executor = Executors.newFixedThreadPool(6)) {
            var gate = new CountDownLatch(1);
            var tasks = new ArrayList<Future<DailyPuzzleService.Puzzle>>();
            for (int i = 0; i < 6; i++) {
                var service = i % 2 == 0 ? first : second;
                tasks.add(
                        executor.submit(
                                () -> {
                                    gate.await();
                                    return create(service, REFERENCE_DAY, "en");
                                }));
            }
            gate.countDown();
            var expected = tasks.getFirst().get(10, TimeUnit.SECONDS);
            for (var task : tasks) assertEquals(expected, task.get(10, TimeUnit.SECONDS));
            assertEquals(1, db.queryForObject("SELECT count(*) FROM daily_puzzles", Integer.class));
        }
    }

    @Test
    void differentDatesConcurrentInstancesReserveDistinctAnswersUnderTheLanguageLock()
            throws Exception {
        try (var executor = Executors.newFixedThreadPool(3)) {
            var gate = new CountDownLatch(1);
            var tasks = new ArrayList<Future<DailyPuzzleService.Puzzle>>();
            for (int i = 0; i < 3; i++) {
                var day = REFERENCE_DAY.plusDays(i);
                var service = i % 2 == 0 ? first : second;
                tasks.add(
                        executor.submit(
                                () -> {
                                    gate.await();
                                    return create(service, day, "en");
                                }));
            }
            gate.countDown();
            var answers = new HashSet<String>();
            for (var task : tasks) answers.add(task.get(10, TimeUnit.SECONDS).answer());
            assertEquals(3, answers.size());
        }
    }

    @Test
    void rollbackDoesNotConsumeAPuzzleOrHoldTheLanguageLock() throws Exception {
        assertThrows(
                IllegalStateException.class,
                () ->
                        tx.execute(
                                status -> {
                                    first.getOrCreate(REFERENCE_DAY, "en");
                                    throw new IllegalStateException("injected failure");
                                }));
        assertEquals(0, db.queryForObject("SELECT count(*) FROM daily_puzzles", Integer.class));
        try (var executor = Executors.newSingleThreadExecutor()) {
            assertNotNull(
                    executor.submit(() -> create(second, REFERENCE_DAY, "en"))
                            .get(10, TimeUnit.SECONDS));
        }
    }

    @Test
    void databaseRejectsAllAnswerIdentityEditsAndDeletionWhileAllowingIdempotentUpdates() {
        var saved = create(first, REFERENCE_DAY, "en");
        for (String assignment :
                List.of("answer='HUMPH'", "played_at=played_at+1", "language='tr'", "id='changed'"))
            assertThrows(
                    DataIntegrityViolationException.class,
                    () ->
                            db.update(
                                    "UPDATE daily_puzzles SET " + assignment + " WHERE id=?",
                                    saved.id()));
        assertThrows(
                DataIntegrityViolationException.class,
                () -> db.update("DELETE FROM daily_puzzles WHERE id=?", saved.id()));
        assertEquals(1, db.update("UPDATE daily_puzzles SET answer=answer WHERE id=?", saved.id()));
        assertEquals(saved, create(second, REFERENCE_DAY, "en"));
    }

    @Test
    void v8PreservesExistingRepeatedAnswersWithoutRewritingHistory() throws Exception {
        String schema = "rotation_migration_test";
        db.execute("CREATE SCHEMA " + schema);
        try {
            var pool = (com.zaxxer.hikari.HikariDataSource) dataSource;
            var source =
                    new org.springframework.jdbc.datasource.DriverManagerDataSource(
                            pool.getJdbcUrl(), pool.getUsername(), pool.getPassword());
            org.flywaydb.core.Flyway.configure()
                    .dataSource(source)
                    .schemas(schema)
                    .defaultSchema(schema)
                    .target("7")
                    .load()
                    .migrate();
            try (var connection = source.getConnection()) {
                connection.setSchema(schema);
                var scoped =
                        new JdbcTemplate(
                                new org.springframework.jdbc.datasource.SingleConnectionDataSource(
                                        connection, true));
                scoped.update(
                        "INSERT INTO daily_puzzles(id,played_at,language,answer) VALUES"
                                + " ('old1',?,'en','APPLE'),('old2',?,'en','APPLE')",
                        REFERENCE_DAY,
                        REFERENCE_DAY.plusDays(1));
                var before = scoped.queryForList("SELECT * FROM daily_puzzles ORDER BY played_at");
                org.flywaydb.core.Flyway.configure()
                        .dataSource(source)
                        .schemas(schema)
                        .defaultSchema(schema)
                        .load()
                        .migrate();
                assertEquals(
                        before,
                        scoped.queryForList("SELECT * FROM daily_puzzles ORDER BY played_at"));
                assertThrows(
                        DataIntegrityViolationException.class,
                        () ->
                                scoped.update(
                                        "UPDATE daily_puzzles SET answer='CIGAR' WHERE id='old1'"));
            }
        } finally {
            db.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }

    @Test
    void incompatibleParentSnapshotsFailClosedForNewPuzzlesButCanReadExistingOnes() {
        var saved = create(first, REFERENCE_DAY, "en");
        var repeatable = new TransactionTemplate(transactions);
        repeatable.setIsolationLevel(
                org.springframework.transaction.TransactionDefinition.ISOLATION_REPEATABLE_READ);
        assertEquals(saved, repeatable.execute(status -> first.getOrCreate(REFERENCE_DAY, "en")));
        assertThrows(
                IllegalStateException.class,
                () ->
                        repeatable.execute(
                                status -> first.getOrCreate(REFERENCE_DAY.plusDays(1), "en")));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM daily_puzzles", Integer.class));
    }

    @Test
    void savedAnswerRemainsPlayableWhenNewDictionariesRemoveIt() {
        when(provider.getAllWords("en")).thenReturn(List.of("APPLE"));
        create(first, REFERENCE_DAY, "en");
        when(provider.getAllWords("en")).thenReturn(List.of());
        db.update(
                "INSERT INTO users(id,username,email,password_hash,created_at) VALUES"
                    + " (1,'fixture','fixture@example.test','unused',?)",
                java.sql.Timestamp.from(DAYTIME));
        var dictionary = mock(com.ariforhanus.wordle.service.GuessDictionary.class);
        when(dictionary.normalize(anyString(), eq("en")))
                .thenAnswer(call -> call.getArgument(0, String.class).toUpperCase(Locale.ROOT));
        when(dictionary.contains(anyString(), eq("en"))).thenReturn(false);
        var gameService =
                new com.ariforhanus.wordle.service.DailyGameService(
                        db,
                        first,
                        dictionary,
                        java.time.Clock.fixed(DAYTIME, java.time.ZoneOffset.UTC),
                        APP_ZONE.getId());
        var game = tx.execute(status -> gameService.start(1, "en"));
        var invalid =
                assertThrows(
                        org.springframework.web.server.ResponseStatusException.class,
                        () -> tx.execute(status -> gameService.guess(1, game.id(), "ZZZZZ", 1)));
        assertEquals(400, invalid.getStatusCode().value());
        var won = tx.execute(status -> gameService.guess(1, game.id(), "apple", 1));
        assertEquals("won", won.status());
        assertEquals("APPLE", won.answer());
        assertEquals(1, db.queryForObject("SELECT count(*) FROM scores", Integer.class));
    }
}
