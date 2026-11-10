-- Preserve existing answers; do not rewrite historical puzzles or remove repeats.
CREATE INDEX idx_puzzles_language_answer_date ON daily_puzzles(language, answer, played_at);

CREATE FUNCTION protect_daily_puzzle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Persisted daily puzzles cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF ROW(OLD.id, OLD.played_at, OLD.language, OLD.answer)
        IS DISTINCT FROM ROW(NEW.id, NEW.played_at, NEW.language, NEW.answer) THEN
        RAISE EXCEPTION 'Persisted daily puzzle identity and answer are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_daily_puzzle BEFORE UPDATE OR DELETE ON daily_puzzles
    FOR EACH ROW EXECUTE FUNCTION protect_daily_puzzle();
