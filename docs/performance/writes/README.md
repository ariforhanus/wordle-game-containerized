# V6 write and storage comparison

Measured 2026-11-10 (Europe/Istanbul), local PostgreSQL 17.4. Each sample has 10,000 synthetic scores (50 players × 100 days × two languages), then inserts 1,000 new scores for the next ten fixture days. Mixed workload wins 80%; loss-only workload wins 0%. Fixture dates derive from 2024-01-31, independent of application time. Loss attempts are six, win attempts one. The data is synthetic and contains no application records.

Unlike the earlier TEMP read experiment, these are ordinary WAL-logged tables. fsync, full_page_writes and synchronous_commit are on; wal_level is replica. Both variants have the same primary key, user/day/language unique constraint, user FK and pre-V6 equivalent indexes. The candidate adds the actual V6 migration SQL. Five paired repetitions alternate baseline/candidate order; each runs in a new private schema and rolls back. All 20 samples assert 1,000 inserted rows, positive WAL and complete schema cleanup. A checkpoint outside each timed sample bounds retained WAL in the disposable instance.

| 1,000-score insert workload | Baseline median ms (range) | V6 median ms (range) | Baseline → V6 WAL bytes | Index growth KiB |
| --- | ---: | ---: | ---: | ---: |
| 80% wins | 11.912 (11.070–12.397) | 14.190 (13.521–15.690) | 534,188 → 628,164 | 128 → 184 |
| Only losses | 11.155 (10.673–12.119) | 11.296 (10.377–14.007) | 473,604 → 473,604 | 128 → 128 |

For mixed inserts, median statement time rose 19.1% and WAL rose 17.6%. The V6 index adds 408 KiB on the seed and grows to 464 KiB after the mixed batch (56 KiB extra growth). Loss-only inserts leave it at 408 KiB; their WAL and total index growth match baseline. Small timing variation in loss-only samples does not establish a speedup or regression.

The extra V6 index build took a median 7.508 ms for the mixed fixtures (all candidate medians: 7.508–7.881 ms). This measures its DDL within the small private fixture, not production lock duration. The migration uses a regular transactional index build, which blocks writers; baseline has no new index to build. Reserve a migration write window and rehearse with authorized production-sized data before release.

Decision: retain V6 for the selective day/language period reads, with the measured write/storage tradeoff documented. Existing indexes stay intact in this checkpoint. This does not establish a production SLA or justify removing other indexes. The duplicated user/date/language non-unique index could be evaluated separately against the unique constraint index with full query/dependency checks before any removal.

The timed SQL includes synthetic-row generation, RETURNING and FK checks. IDs are explicitly assigned, so identity sequence overhead is excluded in both variants. Each fixture is fresh and warm after setup/index build; cache/checkpoint conditions differ from a long-lived production table. Transactions roll back: commit/fsync latency, replication acknowledgement, multi-session contention, autovacuum, sustained traffic, API p95 and real storage throughput are not measured. Reported ranges are five samples, not confidence intervals. Do not extrapolate these batch times into single-request capacity. These limitations leave staging capacity/recovery and production-sized migration gates open.

```sh
python scripts/benchmark-score-writes.py --container wordle-review-postgres --output docs/performance/writes
WORDLE_BENCHMARK_TEST_CONTAINER=wordle-review-postgres python -m unittest discover -s tests/ops -p 'test_*.py' -v
```

Run only on an explicitly selected disposable local test instance. The CLI refuses database names without `_test` or `_benchmark`; this naming check does not itself prove an instance is disposable. A separate fault-injection test fails after creating/seeding/indexing and verifies transaction rollback removes all benchmark objects. Without the opt-in environment variable, that real-DB fault test is skipped; the database-name refusal test still runs. No schema migration or application code changed.
