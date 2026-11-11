"""Opt-in real Nginx tests in an already running, disposable review container.

Uses only temporary configs/secondary ports and a local header-echo fixture.
Never modifies the container's existing Nginx config or starts a new container.
"""

import ipaddress
import json
import os
from pathlib import Path
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = os.environ.get("WORDLE_PROXY_TEST_CONTAINER", "")


@unittest.skipUnless(
    CONTAINER, "Set WORDLE_PROXY_TEST_CONTAINER to the owned local fixture"
)
class ProxyHeaders(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not CONTAINER.startswith("wordle-review-"):
            raise ValueError("Refusing a non-review container")
        state = subprocess.check_output(
            ["docker", "inspect", "--format", "{{.State.Running}}", CONTAINER],
            text=True,
            timeout=10,
        ).strip()
        if state != "true":
            raise ValueError("Review container must already be running")
        host = os.environ.get("WORDLE_PROXY_TEST_HOST", "")
        if not host:
            raise ValueError(
                "Set WORDLE_PROXY_TEST_HOST to this executor's local IPv4 address"
            )
        host = str(ipaddress.IPv4Address(host))

        class Echo(BaseHTTPRequestHandler):
            def do_GET(self):
                body = json.dumps(
                    {key.lower(): value for key, value in self.headers.items()}
                ).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_):
                pass

        # Binding fails if the declared mapping is not an address on this executor.
        cls.server = ThreadingHTTPServer((host, 0), Echo)
        cls.addClassCleanup(cls.server.server_close)
        thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        thread.start()
        cls.addClassCleanup(cls.server.shutdown)
        cls.directory = "/tmp/wordle-proxy-" + uuid.uuid4().hex
        cls.run_docker("mkdir", cls.directory)
        cls.addClassCleanup(cls.run_docker, "rm", "-rf", cls.directory)
        cls.write_docker(
            cls.directory + "/headers.conf",
            (ROOT / "packages/web/security-headers.conf").read_text(),
        )
        cls.configs = {}
        for mode, path, port in [
            ("production", "packages/web/nginx.conf", 18081),
            ("preview", "deploy/nginx-preview.conf", 18082),
        ]:
            site = (ROOT / path).read_text().replace("listen 8080;", f"listen {port};")
            site = site.replace(
                "http://backend:8091", f"http://{host}:{cls.server.server_port}"
            )
            site = site.replace(
                "/etc/nginx/security-headers.conf", cls.directory + "/headers.conf"
            )
            target = cls.directory + "/" + mode + ".conf"
            cls.write_docker(
                target,
                f"worker_processes 1;\npid {cls.directory}/{mode}.pid;\nerror_log {cls.directory}/{mode}.log;\nevents {{ worker_connections 64; }}\nhttp {{\nclient_body_temp_path {cls.directory}/{mode}-body;\nproxy_temp_path {cls.directory}/{mode}-proxy;\nfastcgi_temp_path {cls.directory}/{mode}-fastcgi;\nuwsgi_temp_path {cls.directory}/{mode}-uwsgi;\nscgi_temp_path {cls.directory}/{mode}-scgi;\naccess_log off;\n"
                + site
                + "\n}\n",
            )
            cls.run_docker("nginx", "-t", "-c", target)
            cls.run_docker("nginx", "-c", target)
            cls.addClassCleanup(cls.run_docker, "nginx", "-c", target, "-s", "quit")
            cls.configs[mode] = port

    @classmethod
    def write_docker(cls, target, content):
        subprocess.run(
            ["docker", "exec", "-i", CONTAINER, "sh", "-c", 'cat > "$1"', "sh", target],
            input=content,
            text=True,
            check=True,
            capture_output=True,
            timeout=10,
        )

    @classmethod
    def run_docker(cls, *args):
        result = subprocess.run(
            ["docker", "exec", CONTAINER, *args],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=10,
        )
        if result.returncode:
            raise RuntimeError(result.stdout)
        return result.stdout

    def echo(self, mode, host):
        return json.loads(
            self.run_docker(
                "wget",
                "-Y",
                "off",
                "-T",
                "5",
                "-qO-",
                "--header=Host: " + host,
                "--header=X-Forwarded-For: 203.0.113.10, 203.0.113.11",
                "--header=X-Real-IP: 203.0.113.12",
                "--header=Forwarded: for=203.0.113.13;proto=https",
                "--header=X-Forwarded-Host: attacker.invalid",
                "--header=X-Forwarded-Port: 9",
                "--header=X-Forwarded-Prefix: /attacker",
                f"http://127.0.0.1:{self.configs[mode]}/api/header-fixture",
            )
        )

    def test_production_config_replaces_untrusted_forwarding_metadata(self):
        headers = self.echo("production", "fixture.example.test")
        self.assertEqual(headers["x-forwarded-for"], "127.0.0.1")
        self.assertEqual(headers["x-real-ip"], "127.0.0.1")
        self.assertEqual(headers["x-forwarded-proto"], "http")
        for key in [
            "forwarded",
            "x-forwarded-host",
            "x-forwarded-port",
            "x-forwarded-prefix",
        ]:
            self.assertNotIn(key, headers)

    def test_preview_config_retains_its_expected_host_scheme_policy_and_scrubs_identity(
        self,
    ):
        host = "fixture.app.github.dev"
        headers = self.echo("preview", host)
        self.assertEqual(headers["x-forwarded-for"], "127.0.0.1")
        self.assertEqual(headers["x-real-ip"], "127.0.0.1")
        self.assertEqual(headers["x-forwarded-proto"], "https")
        self.assertEqual(headers["x-forwarded-host"], host)
        self.assertEqual(headers["x-forwarded-port"], "443")
        self.assertNotIn("forwarded", headers)
        self.assertNotIn("x-forwarded-prefix", headers)


if __name__ == "__main__":
    unittest.main()
