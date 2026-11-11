package com.ariforhanus.wordle.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditService {
    private final JdbcTemplate db;

    public AuditService(JdbcTemplate db) {
        this.db = db;
    }

    public java.util.List<java.util.Map<String, Object>> recent(int page) {
        return db.queryForList(
                "SELECT id,actor_id,action,target_id,occurred_at FROM security_audit ORDER BY id"
                    + " DESC LIMIT 50 OFFSET ?",
                Math.max(0, page) * 50L);
    }

    public void record(Long actor, String action, Long target) {
        db.update(
                "INSERT INTO security_audit(actor_id, action, target_id) VALUES (?, ?, ?)",
                actor,
                action,
                target);
    }
}
