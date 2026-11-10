# Score query plan baseline

Measured on 2026-11-10 (Europe/Istanbul) against local PostgreSQL 17.4 with 20,000 synthetic scores: 50 users × 200 days × two languages. The fixed fixture period ends 2024-01-31; it is reproducible test data, not application time. Each case uses session-private TEMP tables, pre-V6 equivalent indexes, VACUUM/ANALYZE, and actual native query text extracted from ScoreRepository. The candidate uses the exact V6 migration DDL. No application rows are copied or changed.

```sh
python scripts/benchmark-score-queries.py --container wordle-review-postgres --output docs/performance
```

Run only with an explicitly selected, migrated local test container. No real dataset is imported. JSON plans include ANALYZE/BUFFERS evidence; `summary.json` has the measured counters. TEMP tables use local buffers, so hits/reads below combine local and shared counters. These are single-run local observations on fresh equivalent fixtures, not p95 latency, disk-throughput or production-capacity guarantees.

| Query | Baseline ms | Candidate ms | Buffer hits | Buffer reads |
| --- | ---: | ---: | ---: | ---: |
| daily | 1.012 | 0.111 | 2622 → 40 | 7 → 3 |
| weekly | 1.782 | 0.270 | 229 → 2 | 9 → 3 |
| monthly | 2.075 | 0.551 | 229 → 2 | 9 → 10 |
| streaks | 5.762 | 6.107 | 274 → 274 | 17 → 17 |

The `(language, played_at, user_id) INCLUDE(score, won_at) WHERE won` index sharply reduces period filtering work in this dataset. V6 adds it without removing existing indexes. It adds storage and winning-score write maintenance; a bounded WAL-logged insert/storage comparison is now recorded in [writes/README.md](writes/README.md). Sustained/concurrent production write load remains unmeasured. The streak query is selected by user, partitions by language and still processes winning history in PostgreSQL. The period index does not reduce its observed buffer work; timing differences for that query must not be presented as a speedup.

Application memory is bounded by per-language summary/distribution rows, not all historic Score entities. An integration case checks two thousand games and independent thousand-day runs. PostgreSQL window sorting can still grow/spill with larger histories; production-sized plans and sustained load remain release gates.

V6 uses a regular transactional index build, not CONCURRENTLY. It needs the documented migration write window and a rehearsal on an authorized production-sized copy. The local 20k-row read experiment does not establish production index-build duration or zero-downtime safety. No production migration was executed.
