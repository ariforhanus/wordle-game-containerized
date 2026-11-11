"""Failure injection for operator scripts. No production database or disk filling."""

import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]


class BackupFailures(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.backups = self.root / "backups"
        self.backups.mkdir()
        self.marker = self.backups / "last-success"
        self.marker.write_text("previous-success")
        self.calls = self.root / "calls"
        self.env = {
            **os.environ,
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "PGHOST": "test-only",
            "PGUSER": "test-only",
            "PGDATABASE": "source_test",
            "BACKUP_DIR": str(self.backups),
            "RESTORE_TEST_DATABASE": "wordle_restore_unit",
            "CALLS": str(self.calls),
        }
        self.command(
            "pg_dump",
            'echo dump >> "$CALLS"; for arg in "$@"; do case "$arg" in --file=*) dest=${arg#--file=};; esac; done; printf "fixture archive" > "$dest"; if [ "${DUMP_FAIL:-0}" = 1 ]; then echo "No space left on device" >&2; exit 1; fi',
        )
        self.command(
            "pg_restore",
            'echo restore >> "$CALLS"; if [ "$1" = --list ]; then exit "${LIST_FAIL:-0}"; fi; exit "${RESTORE_FAIL:-0}"',
        )
        self.command("createdb", 'echo create >> "$CALLS"; exit "${CREATE_FAIL:-0}"')
        self.command("dropdb", 'echo drop >> "$CALLS"')
        self.command("psql", 'echo verify >> "$CALLS"')

    def tearDown(self):
        self.tmp.cleanup()

    def command(self, name, body):
        p = self.bin / name
        p.write_text("#!/bin/sh\nset -eu\n" + body + "\n")
        p.chmod(0o755)

    def run_script(self, name, *args, **extra):
        return subprocess.run(
            ["sh", str(ROOT / "deploy" / name), *map(str, args)],
            env={**self.env, **extra},
            capture_output=True,
            text=True,
        )

    def events(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def archive(self):
        p = self.backups / "wordle-fixture.dump"
        p.write_bytes(b"fixture archive")
        Path(str(p) + ".sha256").write_text(
            hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name + "\n"
        )
        return p

    def test_dump_failure_removes_partial_and_keeps_previous_success(self):
        result = self.run_script("backup.sh", DUMP_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(self.backups.glob("*.dump*")), [])
        self.assertEqual(self.marker.read_text(), "previous-success")

    def test_bad_retention_is_rejected_before_dump(self):
        result = self.run_script("backup.sh", BACKUP_RETENTION_DAYS="-1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.events(), [])

    def test_invalid_archive_does_not_publish_backup(self):
        self.assertNotEqual(self.run_script("backup.sh", LIST_FAIL="1").returncode, 0)
        self.assertEqual(list(self.backups.glob("*.dump*")), [])

    def test_missing_backup_does_not_create_database(self):
        self.assertNotEqual(
            self.run_script("restore-check.sh", self.root / "missing.dump").returncode,
            0,
        )
        self.assertEqual(self.events(), [])

    def test_wrong_checksum_does_not_create_database(self):
        p = self.archive()
        p.write_bytes(b"tampered")
        result = self.run_script("restore-check.sh", p)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.events(), [])

    def test_corrupt_archive_with_matching_checksum_does_not_create_database(self):
        result = self.run_script("restore-check.sh", self.archive(), LIST_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("create", self.events())

    def test_existing_database_is_never_dropped(self):
        self.assertNotEqual(
            self.run_script(
                "restore-check.sh", self.archive(), CREATE_FAIL="1"
            ).returncode,
            0,
        )
        self.assertNotIn("drop", self.events())

    def test_restore_failure_cleans_up_only_its_created_database(self):
        self.assertNotEqual(
            self.run_script(
                "restore-check.sh", self.archive(), RESTORE_FAIL="1"
            ).returncode,
            0,
        )
        self.assertEqual(self.events(), ["restore", "create", "restore", "drop"])

    def test_successful_restore_verifies_tables_and_cleans_up(self):
        self.assertEqual(
            self.run_script("restore-check.sh", self.archive()).returncode, 0
        )
        self.assertEqual(
            self.events(), ["restore", "create", "restore", "verify", "drop"]
        )

    def test_production_database_name_is_rejected_without_external_commands(self):
        self.assertNotEqual(
            self.run_script(
                "restore-check.sh", self.archive(), RESTORE_TEST_DATABASE="PGDatabase"
            ).returncode,
            0,
        )
        self.assertEqual(self.events(), [])

    def test_checksum_tool_failure_keeps_last_success(self):
        self.command("sha256sum", "exit 1")
        self.assertNotEqual(self.run_script("backup.sh").returncode, 0)
        self.assertEqual(self.marker.read_text(), "previous-success")

    def test_retention_uses_whole_days_and_only_top_level_reserved_files(self):
        # Real find/mtime behavior; half-day margins avoid a clock-boundary race.
        now = time.time()
        nested = self.backups / "nested"
        nested.mkdir()
        cases = [
            (self.backups / "wordle-recent.dump", 14.5, True),
            (self.backups / "wordle-expired.dump", 15.5, False),
            (self.backups / "unrelated.dump", 30, True),
            (nested / "wordle-nested.dump", 30, True),
            (self.root / "wordle-outside.dump", 30, True),
        ]
        for path, age, _ in cases:
            for file in (path, Path(str(path) + ".sha256")):
                file.write_text("retention fixture")
                stamp = now - age * 86400
                os.utime(file, (stamp, stamp))
        result = self.run_script("backup.sh", BACKUP_RETENTION_DAYS="14")
        self.assertEqual(result.returncode, 0, result.stderr)
        for path, _, retained in cases:
            self.assertEqual(path.exists(), retained, str(path))
            self.assertEqual(Path(str(path) + ".sha256").exists(), retained)
        published = [
            p
            for p in self.backups.glob("wordle-*.dump")
            if p.name != "wordle-recent.dump"
        ]
        self.assertEqual(len(published), 1)
        for file in (published[0], Path(str(published[0]) + ".sha256")):
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_failed_backup_defers_retention_cleanup(self):
        old = self.archive()
        stamp = time.time() - 30 * 86400
        os.utime(old, (stamp, stamp))
        result = self.run_script("backup.sh", BACKUP_RETENTION_DAYS="14", DUMP_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(old.exists())
        self.assertEqual(self.marker.read_text(), "previous-success")


if __name__ == "__main__":
    unittest.main()
