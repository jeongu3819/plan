-- 003_expand_activity_content.sql
-- Work Note(TaskActivity)에 이미지가 포함된 경우 64KB 제한을 넘어가는 문제를 해결하기 위해
-- content 컬럼을 MEDIUMTEXT 로 확장합니다. (최대 16MB)
-- 만약 이미 LONGTEXT나 그 이상을 사용하는 SQLite/PostgreSQL 환경이라면 오류 없이 스킵될 수 있습니다.

ALTER TABLE task_activities MODIFY content MEDIUMTEXT;
