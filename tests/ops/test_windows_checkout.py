"""Verify container scripts survive a real Git checkout with Windows autocrlf."""
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]


class WindowsCheckoutTests(unittest.TestCase):
    def test_shell_scripts_keep_lf_with_windows_autocrlf(self):
        with tempfile.TemporaryDirectory() as directory:
            checkout = pathlib.Path(directory)

            def git(*args):
                return subprocess.run(
                    ["git", "-C", str(checkout), *args],
                    check=True, capture_output=True, text=True,
                )

            git("init", "--quiet")
            git("config", "core.autocrlf", "true")
            git("config", "user.name", "Checkout Test")
            git("config", "user.email", "checkout@example.test")
            (checkout / ".gitattributes").write_bytes((ROOT / ".gitattributes").read_bytes())
            # Only tracked application scripts; exclude build/tool dependencies.
            tracked = subprocess.check_output(
                ["git", "-C", str(ROOT), "ls-files", "*.sh"], text=True
            ).splitlines()
            for name in tracked:
                target = checkout / name
                target.parent.mkdir(parents=True, exist_ok=True)
                # Deliberately stage CRLF inputs, as created by Windows tools.
                target.write_bytes((ROOT / name).read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
            git("add", ".")
            git("commit", "--quiet", "-m", "Fixture")
            for name in tracked:
                (checkout / name).unlink()
            git("checkout", "--", *tracked)
            self.assertIn("deploy/init-database.sh", tracked)
            for name in tracked:
                with self.subTest(script=name):
                    content = (checkout / name).read_bytes()
                    self.assertNotIn(b"\r", content)
                    self.assertTrue(content.startswith(b"#!/"))
                    interpreter = "bash" if b"bash" in content.splitlines()[0] else "sh"
                    subprocess.run([interpreter, "-n", str(checkout / name)], check=True)
