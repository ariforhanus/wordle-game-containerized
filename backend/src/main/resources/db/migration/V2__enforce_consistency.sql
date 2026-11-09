-- Intentionally fail instead of deleting or silently rewriting historical data.
-- Resolve duplicate daily scores and orphaned user IDs before this migration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD CONSTRAINT ck_user_role CHECK (role IN ('USER', 'ADMIN'));
ALTER TABLE scores ALTER COLUMN username TYPE VARCHAR(64);
ALTER TABLE scores ADD CONSTRAINT uk_score_daily UNIQUE(user_id, played_at, language);
ALTER TABLE scores ADD CONSTRAINT fk_score_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE scores ADD CONSTRAINT ck_score_attempts CHECK (attempts BETWEEN 1 AND 6);
ALTER TABLE scores ADD CONSTRAINT ck_score_duration CHECK (duration_ms >= 0);
ALTER TABLE scores ADD CONSTRAINT ck_score_range CHECK (score BETWEEN 0 AND 9999);
CREATE INDEX IF NOT EXISTS idx_scores_score_desc ON scores(score);
CREATE INDEX IF NOT EXISTS idx_scores_won_at ON scores(won_at);
CREATE INDEX IF NOT EXISTS idx_scores_user_date_lang ON scores(user_id, played_at, language);
CREATE INDEX IF NOT EXISTS idx_scores_language_period ON scores(language, won_at) WHERE won;
