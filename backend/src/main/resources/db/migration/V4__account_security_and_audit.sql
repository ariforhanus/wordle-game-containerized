ALTER TABLE users ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE account_tokens (
 token_hash CHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind VARCHAR(10) NOT NULL CHECK (kind IN ('VERIFY', 'RESET')), expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ
);
CREATE INDEX idx_account_tokens_expiry ON account_tokens(expires_at);
CREATE TABLE security_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 action VARCHAR(50) NOT NULL, target_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_audit_time ON security_audit(occurred_at);
CREATE TABLE auth_rate_limits (
 bucket_key CHAR(64) NOT NULL, window_start TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL,
 PRIMARY KEY(bucket_key, window_start)
);
CREATE INDEX idx_auth_rate_expiry ON auth_rate_limits(window_start);
