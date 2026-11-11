#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
mkdir -p .preview
# postStart runs on creation AND resume, never on a mere editor reconnect.
# The startup script's flock also serializes manual recovery and lifecycle jobs.
nohup bash scripts/start-preview.sh >.preview/startup.log 2>&1 </dev/null &
echo 'Wordle is starting in the background. See .preview/startup.log or the Ports tab (8080).'
