# Score identity and displayed usernames

Scores retain `user_id` as identity and `username` as the historical completion snapshot. Public rankings and completed-score responses display the current `users.username`, not the snapshot. Period totals join users and group by stable user ID and current name. Daily/global/result responses resolve current names through a bounded projection; this does not load user entities or avatars. Ordering uses stable IDs rather than mutable names.

No historical snapshot rewrite or username-column removal is needed. Existing foreign-key account deletion behavior remains unchanged; this change does not introduce orphan scores or a new retention policy. Integration coverage renames a user after scoring and verifies current-name display, one aggregate row, and unchanged historical snapshot. Removing the redundant snapshot is a separate compatibility/migration decision, not required for ranking correctness.
