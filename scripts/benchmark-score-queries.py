#!/usr/bin/env python3
"""Bounded, synthetic EXPLAIN rehearsal in session-private TEMP tables only.

Requires a migrated local test PostgreSQL container. Never reads user/score rows;
only copies the scores table definition. Connection is through local docker exec.
"""

import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BENCH_DAY = (
    "2024-01-31"  # Named deterministic month-end data fixture, not application time.
)
PREPARE = """
CREATE TEMP TABLE users(id bigint PRIMARY KEY, username text NOT NULL);
CREATE TEMP TABLE scores (LIKE public.scores INCLUDING CONSTRAINTS);
INSERT INTO users SELECT id,'bench_'||id FROM generate_series(1,50) AS id;
INSERT INTO scores(id,user_id,username,language,attempts,duration_ms,won_at,played_at,score,word,won)
SELECT row_number() OVER (),u.id,u.username,l.lang,1,1000,
       ((DATE '__BENCH_DAY__'-d.day)::timestamp AT TIME ZONE 'Europe/Istanbul')+interval '12 hours',
       DATE '__BENCH_DAY__'-d.day,
       CASE WHEN (u.id+d.day)%5=0 THEN 0 ELSE 8500+(u.id*37+d.day*13)%1499 END,
       'APPLE',(u.id+d.day)%5<>0
FROM users u CROSS JOIN generate_series(0,199) AS d(day)
CROSS JOIN (VALUES ('en'),('tr')) AS l(lang);
CREATE UNIQUE INDEX bench_score_id ON scores(id);
CREATE UNIQUE INDEX bench_daily ON scores(user_id,played_at,language);
CREATE INDEX bench_old_user_date ON scores(user_id,played_at,language);
CREATE INDEX bench_old_score ON scores(score);
CREATE INDEX bench_old_time ON scores(won_at);
CREATE INDEX bench_old_language_period ON scores(language,won_at) WHERE won;
"""
CANDIDATE = (
    ROOT / "backend/src/main/resources/db/migration/V6__score_period_index.sql"
).read_text()


def queries():
    source = (
        ROOT
        / "backend/src/main/java/com/ariforhanus/wordle/repository/ScoreRepository.java"
    ).read_text()
    # Extract actual native SQL rather than hand-maintaining a second aggregate implementation.
    daily = re.search(
        r'value\s*=\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+),\s*nativeQuery', source
    )
    if not daily:
        raise ValueError("Could not extract daily query; update the benchmark adapter")
    daily_sql = "".join(
        json.loads(token) for token in re.findall(r'"(?:[^"\\]|\\.)*"', daily.group(1))
    )
    blocks = re.findall(r'"""(.*?)"""', source, re.S)
    totals = next(sql for sql in blocks if "SUM(s.score)" in sql)
    streaks = next(sql for sql in blocks if "WITH wins AS" in sql)

    def bind(sql, **values):
        for key, value in values.items():
            sql = re.sub(r":" + key + r"\b", lambda match: value, sql)
        return sql

    day = date.fromisoformat(BENCH_DAY)
    end = f"DATE '{day + timedelta(days=1)}'"
    week = f"DATE '{day - timedelta(days=day.weekday())}'"
    month = f"DATE '{day.replace(day=1)}'"
    return {
        "daily": bind(
            daily_sql, language="'en'", start=f"DATE '{BENCH_DAY}'", end=end, lim="10"
        ),
        "weekly": bind(totals, language="'en'", start=week, end=end, lim="10"),
        "monthly": bind(totals, language="'en'", start=month, end=end, lim="10"),
        "streaks": bind(
            streaks,
            ids=",".join(str(i) for i in range(1, 11)),
            today=f"DATE '{BENCH_DAY}'",
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--container", required=True, help="Local, migrated test PostgreSQL container"
    )
    parser.add_argument("--database", default="wordle_test")
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    summary = {
        "fixtureDay": BENCH_DAY,
        "players": 50,
        "days": 200,
        "languages": 2,
        "scoreRows": 20000,
        "measurements": [],
    }
    for name, sql in queries().items():
        for candidate in (False, True):
            setup = (
                PREPARE.replace("__BENCH_DAY__", BENCH_DAY)
                + (CANDIDATE if candidate else "")
                + "\nVACUUM ANALYZE scores; ANALYZE users;\n"
            )
            result = subprocess.run(
                [
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
                ],
                input=setup + "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + sql + ";\n",
                text=True,
                capture_output=True,
                check=True,
                timeout=60,
            )
            plan = json.loads(result.stdout)
            label = "candidate" if candidate else "baseline"
            (args.output / f"{name}-{label}.json").write_text(
                json.dumps(plan, indent=2) + "\n"
            )
            root = plan[0]["Plan"]
            row = {
                "query": name,
                "index": label,
                "executionMs": plan[0]["Execution Time"],
                "rowsReturned": root["Actual Rows"],
                "bufferHits": root.get("Shared Hit Blocks", 0)
                + root.get("Local Hit Blocks", 0),
                "bufferReads": root.get("Shared Read Blocks", 0)
                + root.get("Local Read Blocks", 0),
                "tempWrittenBlocks": root.get("Temp Written Blocks", 0),
            }
            summary["measurements"].append(row)
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
