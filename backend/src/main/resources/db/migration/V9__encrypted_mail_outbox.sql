-- Additive: keep existing tokens, games and historical answers unchanged.
ALTER TABLE account_tokens ADD CONSTRAINT uk_token_delivery_identity
    UNIQUE (token_hash, user_id, kind, expires_at);

CREATE TABLE mail_outbox (
    id UUID PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) UNIQUE,
    purpose VARCHAR(10) NOT NULL CHECK (purpose IN ('RESET','VERIFY')),
    message_id VARCHAR(512),
    state VARCHAR(12) NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING','PROCESSING','BLOCKED','SENT','FAILED','CANCELLED','EXPIRED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
    created_at TIMESTAMPTZ NOT NULL,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    lease_id UUID,
    lease_until TIMESTAMPTZ,
    key_id VARCHAR(32),
    nonce BYTEA,
    payload BYTEA,
    last_failure VARCHAR(24) CHECK (last_failure IN
        ('temporary','connection','uncertain','permanent','authentication','tls',
         'invalid_message','crypto','expired','revoked','max_attempts')),
    CONSTRAINT fk_outbox_token FOREIGN KEY (token_hash,user_id,purpose,expires_at)
        REFERENCES account_tokens(token_hash,user_id,kind,expires_at) ON DELETE CASCADE,
    CONSTRAINT ck_outbox_identity CHECK (
        (user_id IS NULL AND token_hash IS NULL AND message_id IS NULL AND purpose='RESET')
        OR (user_id IS NOT NULL AND token_hash IS NOT NULL AND message_id IS NOT NULL)),
    CONSTRAINT ck_outbox_payload CHECK (
        (state IN ('PENDING','PROCESSING','BLOCKED') AND user_id IS NOT NULL
            AND key_id IS NOT NULL AND nonce IS NOT NULL AND payload IS NOT NULL AND octet_length(nonce)=12
            AND octet_length(payload) BETWEEN 17 AND 2048)
        OR (state IN ('PENDING','PROCESSING') AND user_id IS NULL
            AND key_id IS NULL AND nonce IS NULL AND payload IS NULL)
        OR (state IN ('SENT','FAILED','CANCELLED','EXPIRED')
            AND key_id IS NULL AND nonce IS NULL AND payload IS NULL)),
    CONSTRAINT ck_outbox_lease CHECK (
        (state='PROCESSING' AND lease_id IS NOT NULL AND lease_until IS NOT NULL)
        OR (state<>'PROCESSING' AND lease_id IS NULL AND lease_until IS NULL)),
    CONSTRAINT ck_outbox_completion CHECK (
        (state IN ('SENT','FAILED','CANCELLED','EXPIRED') AND completed_at IS NOT NULL)
        OR (state IN ('PENDING','PROCESSING','BLOCKED') AND completed_at IS NULL)),
    CONSTRAINT ck_outbox_dates CHECK (expires_at > created_at),
    CONSTRAINT ck_outbox_message CHECK (message_id IS NULL OR
        (position(chr(10) in message_id)=0 AND position(chr(13) in message_id)=0))
);
CREATE INDEX idx_outbox_due ON mail_outbox(next_attempt_at,created_at,id)
    WHERE state IN ('PENDING','PROCESSING');
CREATE INDEX idx_outbox_created ON mail_outbox(created_at DESC,id);

-- Every token revocation path cancels pending delivery in the same transaction.
CREATE FUNCTION cancel_revoked_token_mail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL THEN
        UPDATE mail_outbox SET state='CANCELLED',completed_at=NEW.consumed_at,
            lease_id=NULL,lease_until=NULL,key_id=NULL,nonce=NULL,payload=NULL,last_failure='revoked'
        WHERE token_hash=NEW.token_hash AND state IN ('PENDING','PROCESSING','BLOCKED');
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER cancel_token_mail AFTER UPDATE OF consumed_at ON account_tokens
    FOR EACH ROW EXECUTE FUNCTION cancel_revoked_token_mail();
