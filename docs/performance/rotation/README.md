# Rotation-query index experiment

Local PostgreSQL 17.4, 2026-11-10. `reproduce.sql` creates transaction-private TEMP
tables, copying only the public puzzle table definition/constraints, then rolls
back. It reads no application rows and does not change the real puzzle table.
Run against the disposable fixture with:

```sh
docker exec -i wordle-review-postgres psql -X -qAt -U postgres -d wordle_test -v ON_ERROR_STOP=1 < docs/performance/rotation/reproduce.sql
```

The deterministic synthetic history has 20,000 puzzles: two existing language
codes, 10,000 dates each, 1,000 artificial five-letter answers per language.
`2030-01-01` is a named measurement fixture, not runtime application time.
The query body comes from DailyPuzzleService; the candidate index comes from V8.
Baseline retains the puzzle primary key and date/language uniqueness indexes.

`plans.json` records a representative complete EXPLAIN (ANALYZE, BUFFERS, FORMAT
JSON) plan, all three execution times per variant/query, total index bytes and
result count/hash. Before/after nearest-distance result hashes were identical.

| Candidate subset | Baseline median | V8 median | Representative plan |
| --- | ---: | ---: | --- |
| 20 of 1,000 answers | 1.569 ms | 0.090 ms | Sequential scan → bitmap index/heap scan; 128 → 14 local hit blocks at aggregate |
| All 1,000 answers | 3.597 ms | 3.197 ms | Sequential scan → bitmap index/heap scan; 128 → 168 local hit blocks at aggregate |

Total index storage grows from 1,236,992 to 1,884,160 bytes (+647,168). Retain V8
for selective candidate pools and its language/answer/date access path. This
measurement does not show a material full-pool speed advantage: the history
still must be aggregated. V8 also adds write/storage work; puzzle writes occur
only on first creation of a language/day, independently of player count.

Limits: three warm local executions, baseline-first order, synthetic data,
TEMP/local buffers (not WAL-logged production pages), and an analyze-built index.
These are plan/access-path observations, not production latency, cold-I/O,
write-throughput, capacity or migration-lock guarantees. Do not describe them as
the separate WAL-logged score-index write experiment. Rehearse V8 against an
authorized production copy and inspect actual pool/history distributions before
deployment. No production measurement or migration was performed.
