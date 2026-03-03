-- 001_schema_updates.sql
-- C-1: visit_log user_id 추가
-- C-5: note_mentions 테이블 생성
--
-- 실행 방법: mysql -u root -p < 001_schema_updates.sql
-- 또는 SQLite: sqlite3 your_db.sqlite < 001_schema_updates.sql

-- ============================================================
-- C-1: visit_log에 user_id 컬럼 추가
-- ============================================================
-- MySQL:
-- ALTER TABLE visit_log ADD COLUMN user_id INT NULL;
-- ALTER TABLE visit_log ADD INDEX ix_visit_log_user_id (user_id);
-- ALTER TABLE visit_log ADD CONSTRAINT fk_visit_log_user FOREIGN KEY (user_id) REFERENCES users(id);

-- SQLite (FK 없이):
ALTER TABLE visit_log ADD COLUMN user_id INTEGER NULL;

-- ============================================================
-- C-5: note_mentions 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS note_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (note_id, user_id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS ix_note_mentions_note ON note_mentions(note_id);
CREATE INDEX IF NOT EXISTS ix_note_mentions_user ON note_mentions(user_id);

-- ============================================================
-- Verify
-- ============================================================
-- SELECT sql FROM sqlite_master WHERE name = 'visit_log';
-- SELECT sql FROM sqlite_master WHERE name = 'note_mentions';
