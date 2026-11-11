-- Resolve conflicting legacy addresses explicitly; never merge accounts automatically.
CREATE UNIQUE INDEX uk_user_email_casefold ON users(lower(email));
