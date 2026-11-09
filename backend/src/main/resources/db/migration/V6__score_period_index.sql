-- Canonical leaderboard periods filter puzzle played_at, not completion won_at.
-- Stage on a production-sized copy; a normal index build requires a migration write window.
CREATE INDEX idx_scores_language_played
    ON scores(language, played_at, user_id) INCLUDE(score, won_at) WHERE won;
