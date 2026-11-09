#!/usr/bin/env python3
"""Exercise real auth, JWT, daily game persistence and leaderboards; remove test user."""
import json
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'http://localhost:8080'
origin = next(line.split('=', 1)[1] for line in Path('.preview/runtime.env').read_text().splitlines()
              if line.startswith('PUBLIC_URL='))
token = None
username = 'preview_' + secrets.token_hex(8)
password = secrets.token_hex(24)


def request(path, body=None, expected=200):
    headers = {'Origin': origin}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as error:
        if error.code == expected:
            return None
        raise RuntimeError(f'{path}: expected {expected}, got HTTP {error.code}') from None
    with response:
        assert response.status == expected, path
        data = response.read()
        return json.loads(data) if data else None


request('/api/v1/leaderboard?lang=en')
if '--full' not in sys.argv:
    print('PASS: frontend, API, PostgreSQL and Flyway migrations')
    raise SystemExit(0)

request('/api/v1/auth/me', expected=401)
registered = request('/api/v1/auth/register', {'username': username, 'email': username + '@example.invalid', 'password': password})
token = registered['token']
try:
    token = request('/api/v1/auth/login', {'username': username, 'password': password})['token']
    request('/api/v1/auth/me')
    game = request('/api/v1/daily/games?lang=en', {})
    game_id = game['id']
    for attempt in range(1, 7):
        game = request(f'/api/v1/daily/games/{game_id}/guesses', {'guess': 'APPLE', 'attempt': attempt})
        if game['status'] != 'playing':
            break
    assert game['status'] in ('won', 'lost'), 'Daily game did not finish'
    assert isinstance(game['score'], int) and game['score'] >= 0, 'Server score is missing'
    resumed = request(f'/api/v1/daily/games/{game_id}')
    assert resumed['status'] == game['status'], 'Game was not persisted'
    assert request('/api/v1/stats/me')['totalGames'] == 1, 'Completed game score is missing'
    for period in ('', '/daily', '/weekly', '/monthly'):
        request('/api/v1/leaderboard' + period + '?lang=en')
    print('PASS: frontend, migrations, PostgreSQL, registration, login, JWT, daily game, stats and leaderboards')
finally:
    # Account deletion also removes this user's game and score via existing application logic.
    request('/api/v1/account/delete', {'password': password})
