-- Validate existing rows; abort rather than rewriting malformed historical games.
-- Run deploy/preflight-daily-games.sql before upgrading an existing V3+ database.
ALTER TABLE daily_puzzles ADD CONSTRAINT ck_puzzle_answer_shape
    CHECK (answer COLLATE "C" ~ '^[A-ZÇĞİÖŞÜ]{5}$');
ALTER TABLE daily_games ADD CONSTRAINT ck_game_guesses_shape
    CHECK (guesses = '' OR guesses COLLATE "C" ~ '^[A-ZÇĞİÖŞÜ]{5}(,[A-ZÇĞİÖŞÜ]{5}){0,5}$');
ALTER TABLE daily_games ADD CONSTRAINT ck_game_turn_state
    CHECK ((status = 'playing' AND char_length(guesses) <= 29)
        OR (status = 'won' AND char_length(guesses) BETWEEN 5 AND 35)
        OR (status = 'lost' AND char_length(guesses) = 35));
ALTER TABLE daily_games ADD CONSTRAINT ck_game_finished_state
    CHECK ((status = 'playing') = (finished_at IS NULL));
