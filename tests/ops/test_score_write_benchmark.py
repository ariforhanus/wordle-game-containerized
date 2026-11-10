"""Benchmark mutation boundaries; real PostgreSQL case is opt-in."""

import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/benchmark-score-writes.py"


class WriteBenchmarkSafetyTests(unittest.TestCase):
    def test_refuses_non_test_database_before_using_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "results"
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--container",
                    "must-not-be-used",
                    "--database",
                    "production",
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Refusing a database", result.stderr)
            self.assertFalse(output.exists())

    @unittest.skipUnless(
        os.environ.get("WORDLE_BENCHMARK_TEST_CONTAINER"),
        "Set WORDLE_BENCHMARK_TEST_CONTAINER for real PostgreSQL fault test",
    )
    def test_failed_sample_rolls_back_all_objects(self):
        spec = importlib.util.spec_from_file_location("score_write_benchmark", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        schema = "wordle_write_bench_" + uuid.uuid4().hex
        sql = module.sample_sql(schema, True, False)
        # Abort after creating/loading tables and building the index, before timed DML.
        sql = sql.replace("EXPLAIN (ANALYZE", "SELECT 1/0; EXPLAIN (ANALYZE", 1)
        command = [
            "docker",
            "exec",
            "-i",
            os.environ["WORDLE_BENCHMARK_TEST_CONTAINER"],
            "psql",
            "--no-psqlrc",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "wordle_test",
        ]
        result = subprocess.run(
            command, input=sql, capture_output=True, text=True, timeout=60
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("division by zero", result.stderr)
        result = subprocess.run(
            command,
            input=f"SELECT count(*) FROM pg_namespace WHERE nspname='{schema}';",
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        self.assertEqual(result.stdout.strip(), "0")
