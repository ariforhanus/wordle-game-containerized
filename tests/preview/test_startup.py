"""Failure and repeat-start checks without needing a Docker daemon or GitHub token."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class StartupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(ROOT / 'scripts', self.root / 'scripts')
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.env = dict(os.environ, PATH=str(self.bin) + ':' + os.environ['PATH'],
                        CODESPACES='false', CALLS=str(self.root / 'calls'))
        self.fake('docker', '''#!/bin/bash
if [[ "$1" == volume && "${HAS_VOLUME:-}" == true ]]; then echo wordle-preview_postgres-data; fi
if [[ "$1" == compose ]]; then
  printf '%s\\n' "$*" >> "$CALLS"
  [[ "$*" != *' exec '* ]] || echo 8
  [[ "$*" != *' up '* || "${FAIL_UP:-}" != true ]]
fi
''')
        self.fake('curl', '#!/bin/sh\necho \'<div id="root"></div>\'\n')
        self.fake('python3', '#!/bin/sh\nexit 0\n')
        self.fake('gh', '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\nexit "${GH_RESULT:-0}"\n')

    def fake(self, name, content):
        path = self.bin / name
        path.write_text(content)
        path.chmod(0o755)

    def start(self, **env):
        return subprocess.run(['bash', 'scripts/start-preview.sh'], cwd=self.root,
                              env=dict(self.env, **env), text=True, capture_output=True)

    def test_repeat_start_preserves_credentials_and_never_removes_data(self):
        self.assertEqual(self.start().returncode, 0)
        secret_file = self.root / '.preview/secrets.env'
        secrets = secret_file.read_bytes()
        self.assertEqual(secret_file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.start().returncode, 0)
        self.assertEqual(secret_file.read_bytes(), secrets)
        calls = (self.root / 'calls').read_text()
        self.assertNotIn(' down ', calls)
        self.assertNotIn(' rm ', calls)
        self.assertIn('--project-name wordle-preview', calls)

    def test_missing_secrets_with_existing_database_refuses_to_rotate(self):
        result = self.start(HAS_VOLUME='true')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Restore .preview/secrets.env', result.stderr)
        self.assertFalse((self.root / '.preview/secrets.env').exists())

    def test_failed_build_preserves_credentials_for_recovery(self):
        self.assertNotEqual(self.start(FAIL_UP='true').returncode, 0)
        saved = (self.root / '.preview/secrets.env').read_bytes()
        self.assertEqual(self.start().returncode, 0)
        self.assertEqual((self.root / '.preview/secrets.env').read_bytes(), saved)

    def test_codespaces_enforces_private_and_exact_origin(self):
        result = self.start(CODESPACES='true', CODESPACE_NAME='example',
                            GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN='app.github.dev')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('ports visibility 8080:private -c example', (self.root / 'calls').read_text())
        self.assertIn('PUBLIC_URL=https://example-8080.app.github.dev',
                      (self.root / '.preview/runtime.env').read_text())

    def test_visibility_failure_does_not_start_stack(self):
        result = self.start(CODESPACES='true', CODESPACE_NAME='example',
                            GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN='app.github.dev', GH_RESULT='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(' up ', (self.root / 'calls').read_text())

    def test_concurrent_starts_serialize(self):
        self.fake('docker', (self.bin / 'docker').read_text().replace(
            "printf '%s\\n'", "[[ \"$*\" != *' up '* ]] || sleep 0.2\n  printf '%s\\n'"))
        with subprocess.Popen(['bash', 'scripts/start-preview.sh'], cwd=self.root,
                              env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as first:
            second = self.start()
            first.communicate(timeout=15)
        self.assertEqual(first.returncode, 0)
        self.assertEqual(second.returncode, 0, second.stderr)


if __name__ == '__main__':
    unittest.main()
