-- Read-only diagnostics. Any returned rows require an explicit resolution before V2.
SELECT user_id, played_at, language, COUNT(*) FROM scores
 GROUP BY user_id, played_at, language HAVING COUNT(*) > 1;
SELECT s.id, s.user_id FROM scores s LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL;
SELECT id FROM scores WHERE attempts NOT BETWEEN 1 AND 6 OR duration_ms < 0 OR score NOT BETWEEN 0 AND 9999;
SELECT id, role FROM users WHERE role NOT IN ('USER', 'ADMIN');
