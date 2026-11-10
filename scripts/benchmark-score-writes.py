#!/usr/bin/env python3
"""Compare V6 index write/storage cost on synthetic, WAL-logged PostgreSQL tables.

Uses an explicitly selected local Docker test DB, never application rows. Each
sample creates a private schema in a transaction and rolls it back. Not an API
latency, concurrent-load or commit/fsync benchmark.
"""

import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import statistics
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DAY = date(2024, 1, 31)
SEED_ROWS = 10000
BATCH_ROWS = 1000
CANDIDATE = (
    ROOT / "backend/src/main/resources/db/migration/V6__score_period_index.sql"
).read_text()

SETUP = """
CREATE TABLE users(id bigint PRIMARY KEY, username varchar(64) NOT NULL);
INSERT INTO users SELECT id,'bench_'||id FROM generate_series(1,50) AS id;
CREATE TABLE scores (LIKE public.scores INCLUDING CONSTRAINTS);
ALTER TABLE scores ADD PRIMARY KEY(id);
ALTER TABLE scores ADD UNIQUE(user_id,played_at,language);
ALTER TABLE scores ADD FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
"""
BASE_INDEXES = """
CREATE INDEX idx_scores_score_desc ON scores(score);
CREATE INDEX idx_scores_won_at ON scores(won_at);
CREATE INDEX idx_scores_user_date_lang ON scores(user_id,played_at,language);
CREATE INDEX idx_scores_language_period ON scores(language,won_at) WHERE won;
"""


def insert_sql(start_day, days, start_id, losses_only=False, returning=False):
    # Only named, derived fixtures enter SQL; no arbitrary input is interpolated.
    winning = "false" if losses_only else "(u.id+d.day)%5<>0"
    return f"""
INSERT INTO scores(id,user_id,username,language,attempts,duration_ms,won_at,played_at,score,word,won)
SELECT {start_id}+row_number() OVER (ORDER BY u.id,d.day,l.lang),u.id,u.username,l.lang,CASE WHEN {winning} THEN 1 ELSE 6 END,1000,
       (DATE '{start_day}'-d.day)::timestamp AT TIME ZONE 'Europe/Istanbul',
       DATE '{start_day}'-d.day,CASE WHEN {winning} THEN 9000 ELSE 0 END,'APPLE',{winning}
FROM users u CROSS JOIN generate_series(0,{days-1}) AS d(day)
CROSS JOIN (VALUES ('en'),('tr')) AS l(lang)
{"RETURNING id" if returning else ""};
"""


SIZES = """SELECT json_build_object(
 'rows',(SELECT count(*) FROM scores),
 'indexBytes',pg_indexes_size('scores'),
 'tableBytes',pg_table_size('scores'),
 'v6Bytes',COALESCE(pg_relation_size(to_regclass('idx_scores_language_played')),0),
 'indexBuildMs',COALESCE(NULLIF(current_setting('wordle_bench.index_build_ms',true),''),'0')::numeric);
"""


def sample_sql(schema, candidate, losses_only):
    return (
        f'BEGIN; CREATE SCHEMA "{schema}"; SET LOCAL search_path TO "{schema}",pg_catalog;\n'
        + SETUP
        + insert_sql(FIXTURE_DAY, SEED_ROWS // 100, 0)
        + BASE_INDEXES
        + (
            "DO $bench$ DECLARE started timestamptz := clock_timestamp(); BEGIN "
            "EXECUTE $index$" + CANDIDATE + "$index$; "
            "PERFORM set_config('wordle_bench.index_build_ms', "
            "(EXTRACT(EPOCH FROM clock_timestamp()-started)*1000)::text,true); END $bench$;"
            if candidate
            else ""
        )
        + "ANALYZE users; ANALYZE scores;\n"
        + SIZES
        + "EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) "
        + insert_sql(
            FIXTURE_DAY + timedelta(days=BATCH_ROWS // 100),
            BATCH_ROWS // 100,
            SEED_ROWS,
            losses_only,
            returning=True,
        )
        + SIZES
        + "ROLLBACK;\n"
    )


def decode_documents(output):
    decoder = json.JSONDecoder()
    documents = []
    remaining = output.strip()
    while remaining:
        value, end = decoder.raw_decode(remaining)
        documents.append(value)
        remaining = remaining[end:].strip()
    return documents


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", required=True)
    parser.add_argument("--database", default="wordle_test")
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--repetitions", type=int, default=5, choices=range(3, 11))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.database.endswith(("_test", "_benchmark")):
        parser.error("Refusing a database without a _test or _benchmark suffix")
    command = [
        "docker",
        "exec",
        "-i",
        args.container,
        "psql",
        "--no-psqlrc",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        args.user,
        "-d",
        args.database,
    ]

    def run(sql):
        return subprocess.run(
            command, input=sql, text=True, capture_output=True, check=True, timeout=60
        ).stdout

    metadata = json.loads(
        run(
            """SELECT json_build_object('version',version(),
      'fsync',current_setting('fsync'),'fullPageWrites',current_setting('full_page_writes'),
      'synchronousCommit',current_setting('synchronous_commit'),'walLevel',current_setting('wal_level'));"""
        )
    )
    assert (
        metadata["fsync"]
        == metadata["fullPageWrites"]
        == metadata["synchronousCommit"]
        == "on"
    )
    args.output.mkdir(parents=True, exist_ok=True)
    samples = []
    for workload in ("mixed", "losses"):
        for repetition in range(args.repetitions):
            # Alternate paired order to reduce systematic first/second cache bias.
            for candidate in ((False, True) if repetition % 2 == 0 else (True, False)):
                schema = "wordle_write_bench_" + uuid.uuid4().hex
                before, plan, after = decode_documents(
                    run(sample_sql(schema, candidate, workload == "losses"))
                )
                assert (
                    before["rows"] == SEED_ROWS
                    and after["rows"] == SEED_ROWS + BATCH_ROWS
                )
                root = plan[0]["Plan"]
                assert root["Actual Rows"] == BATCH_ROWS
                assert root.get("WAL Records", 0) > 0 and root.get("WAL Bytes", 0) > 0
                label = "v6" if candidate else "baseline"
                name = f"{workload}-{repetition+1}-{label}.json"
                (args.output / name).write_text(
                    json.dumps(dict(before=before, plan=plan, after=after), indent=2)
                    + "\n"
                )
                samples.append(
                    dict(
                        workload=workload,
                        repetition=repetition + 1,
                        index=label,
                        executionMs=plan[0]["Execution Time"],
                        walBytes=root["WAL Bytes"],
                        walRecords=root["WAL Records"],
                        fullPageImages=root.get("WAL FPI", 0),
                        indexGrowthBytes=after["indexBytes"] - before["indexBytes"],
                        indexBuildMs=before["indexBuildMs"],
                        v6BeforeBytes=before["v6Bytes"],
                        v6AfterBytes=after["v6Bytes"],
                    )
                )
                # Verify rollback removed this sample's objects, even though the DML generated WAL.
                assert (
                    run(
                        f"SELECT count(*) FROM pg_namespace WHERE nspname='{schema}';"
                    ).strip()
                    == "0"
                )
                # Bound retained WAL/disk in the disposable test instance, outside timed work.
                run("CHECKPOINT;")
    summaries = []
    for workload in ("mixed", "losses"):
        for label in ("baseline", "v6"):
            selected = [
                s for s in samples if s["workload"] == workload and s["index"] == label
            ]
            summaries.append(
                dict(
                    workload=workload,
                    index=label,
                    medianMs=statistics.median(s["executionMs"] for s in selected),
                    medianIndexBuildMs=statistics.median(
                        s["indexBuildMs"] for s in selected
                    ),
                    minMs=min(s["executionMs"] for s in selected),
                    maxMs=max(s["executionMs"] for s in selected),
                    medianWalBytes=statistics.median(s["walBytes"] for s in selected),
                    medianIndexGrowthBytes=statistics.median(
                        s["indexGrowthBytes"] for s in selected
                    ),
                    medianV6AfterBytes=statistics.median(
                        s["v6AfterBytes"] for s in selected
                    ),
                )
            )
    report = dict(
        metadata=metadata,
        fixtureDay=str(FIXTURE_DAY),
        seedRows=SEED_ROWS,
        batchRows=BATCH_ROWS,
        repetitions=args.repetitions,
        samples=samples,
        summary=summaries,
    )
    (args.output / "summary.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(summaries, indent=2))


if __name__ == "__main__":
    main()
