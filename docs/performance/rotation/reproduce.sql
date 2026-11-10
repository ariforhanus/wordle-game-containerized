-- Synthetic TEMP-only rotation-query experiment; no application rows are read.
BEGIN;
SET LOCAL statement_timeout = '20s';
CREATE TEMP TABLE daily_puzzles (LIKE public.daily_puzzles INCLUDING CONSTRAINTS);
CREATE UNIQUE INDEX bench_puzzle_pk ON daily_puzzles(id);
CREATE UNIQUE INDEX bench_puzzle_day ON daily_puzzles(played_at,language);
INSERT INTO daily_puzzles SELECT lang||'_'||n,DATE '2000-01-01'+n,lang,
 'AA'||chr(65+((n%1000)/676)%26)||chr(65+((n%1000)/26)%26)||chr(65+(n%1000)%26)
FROM generate_series(0,9999) n CROSS JOIN (VALUES ('en'),('tr')) l(lang);
ANALYZE daily_puzzles;
SELECT ARRAY(SELECT DISTINCT answer FROM daily_puzzles WHERE language='en' ORDER BY answer LIMIT 20) AS pool20,
       ARRAY(SELECT DISTINCT answer FROM daily_puzzles WHERE language='en' ORDER BY answer LIMIT 1000) AS pool1000 \gset
SELECT json_build_object('rows',count(*),'version',version()) FROM daily_puzzles;
SELECT json_build_object('variant','baseline','index_bytes',pg_indexes_size('daily_puzzles'));
SELECT COALESCE(jsonb_object_agg(answer,distance),'{}'::jsonb) FROM (SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer) nearest;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer;
SELECT COALESCE(jsonb_object_agg(answer,distance),'{}'::jsonb) FROM (SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer) nearest;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer;
CREATE INDEX idx_puzzles_language_answer_date ON daily_puzzles(language, answer, played_at);
ANALYZE daily_puzzles;
SELECT json_build_object('variant','v8','index_bytes',pg_indexes_size('daily_puzzles'));
SELECT COALESCE(jsonb_object_agg(answer,distance),'{}'::jsonb) FROM (SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer) nearest;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool20'::varchar[]) GROUP BY answer;
SELECT COALESCE(jsonb_object_agg(answer,distance),'{}'::jsonb) FROM (SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer) nearest;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT answer, MIN(ABS(played_at - DATE '2030-01-01'::date)) AS distance FROM daily_puzzles WHERE language = 'en' AND answer = ANY(:'pool1000'::varchar[]) GROUP BY answer;
ROLLBACK;
