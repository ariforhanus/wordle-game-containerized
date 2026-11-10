-- Read-only V7 diagnostics for a database already migrated to V3 or later.
-- Zero rows means the V7 structural predicates pass at this snapshot only.
-- Never repair by deleting games; resolve each record explicitly before migration.
SELECT 'puzzle_answer_shape' AS issue, id FROM daily_puzzles
 WHERE NOT (answer COLLATE "C" ~ '^[A-ZÇĞİÖŞÜ]{5}$')
UNION ALL
SELECT 'game_guesses_shape', id FROM daily_games
 WHERE NOT (guesses = '' OR guesses COLLATE "C" ~ '^[A-ZÇĞİÖŞÜ]{5}(,[A-ZÇĞİÖŞÜ]{5}){0,5}$')
UNION ALL
SELECT 'game_turn_state', id FROM daily_games
 WHERE NOT ((status = 'playing' AND char_length(guesses) <= 29)
         OR (status = 'won' AND char_length(guesses) BETWEEN 5 AND 35)
         OR (status = 'lost' AND char_length(guesses) = 35))
UNION ALL
SELECT 'game_finished_state', id FROM daily_games
 WHERE (status = 'playing') <> (finished_at IS NULL);
