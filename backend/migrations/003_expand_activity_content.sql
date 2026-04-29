-- 003_expand_activity_content.sql
-- Work Note(TaskActivity)의 content 컬럼을 LONGTEXT로 확장합니다. (최대 4GB)
-- 이미지가 base64로 직접 저장되는 경우뿐만 아니라, 향후 복잡한 HTML 구조 저장 시에도 용량 제한 문제를 방지합니다.

ALTER TABLE task_activities MODIFY content LONGTEXT;
