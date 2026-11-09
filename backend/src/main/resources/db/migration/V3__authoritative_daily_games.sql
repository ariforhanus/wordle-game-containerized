CREATE TABLE daily_puzzles (
 id VARCHAR(100) PRIMARY KEY, played_at DATE NOT NULL, language VARCHAR(5) NOT NULL,
 answer VARCHAR(5) NOT NULL, CONSTRAINT uk_puzzle_date_lang UNIQUE(played_at, language)
);
CREATE TABLE daily_games (
 id VARCHAR(36) PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 puzzle_id VARCHAR(100) NOT NULL REFERENCES daily_puzzles(id),
 started_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ,
 guesses TEXT NOT NULL DEFAULT '', status VARCHAR(10) NOT NULL DEFAULT 'playing',
 CONSTRAINT uk_game_user_puzzle UNIQUE(user_id, puzzle_id),
 CONSTRAINT ck_game_status CHECK(status IN ('playing', 'won', 'lost'))
);
