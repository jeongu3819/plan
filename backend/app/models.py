from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    BigInteger,
    UniqueConstraint,
    Index,
)
from sqlalchemy.sql import func
from sqlalchemy.types import JSON

from app.db_connections.sqlalchemy import Base
from app.environment import KST

# =========================================================
# Core Tables (기존)
# =========================================================

# ── Space (workspace) ──
class Space(Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    warned_at = Column(DateTime, nullable=True)  # 빈 공간 경고 발송 시점

    # ✅ v3.0 공간 목적 프리셋
    purpose = Column(String(50), nullable=True, default="project_management")
    # project_management / equipment_ops / process_change / sw_dev / integrated_ops / custom


class SpaceMember(Base):
    __tablename__ = "space_members"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(30), nullable=False, default="member")  # owner / admin / member
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("space_id", "user_id", name="uq_space_member"),
    )


class SpaceJoinRequest(Base):
    __tablename__ = "space_join_requests"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending")  # pending / approved / rejected
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint("space_id", "user_id", "status", name="uq_space_join_request"),
    )


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # ✅ 새 사이트 기능용 확장 컬럼 (DB에 추가해두었다면 사용)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    visibility = Column(String(20), nullable=False, default="private")   # private / public
    require_approval = Column(Boolean, nullable=False, default=False)
    permissions = Column(JSON, nullable=True)  # {"post_write":"all", ...}

    # ✅ v1.2 조직 기반 확장
    part_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # ✅ v2.0 Space 소속
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=True, index=True)

    created_at = Column(DateTime, server_default=func.now())
    archived_at = Column(DateTime, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    loginid = Column(String(128), unique=True, nullable=False, index=True)
    username = Column(String(120), nullable=False)
    deptname = Column(String(120), nullable=True)
    mail = Column(String(255), nullable=True)

    role = Column(String(50), nullable=False, default="member")  # member / admin
    avatar_color = Column(String(20), nullable=False, default="#2955FF")

    # ✅ 실제 DB 컬럼명이 is_active면 그대로 사용
    is_active = Column(Boolean, nullable=False, default=True)

    # ✅ 그룹 기능(관리자 그룹 적용)에서 사용할 수 있음
    group_name = Column(String(120), nullable=True, index=True)

    # ✅ v1.2 조직 기반 확장
    primary_team_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    primary_part_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)

    created_at = Column(DateTime, server_default=func.now())
    last_login_at = Column(DateTime, nullable=True)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)

    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)

    status = Column(String(30), nullable=False, default="todo")      # todo / in_progress / done / hold
    priority = Column(String(30), nullable=False, default="medium")  # low / medium / high

    start_date = Column(String(20), nullable=True)  # YYYY-MM-DD 문자열 유지
    due_date = Column(String(20), nullable=True)

    assignee_ids = Column(JSON, nullable=False, default=list)
    tags = Column(JSON, nullable=False, default=list)

    # ✅ 새 사이트 기능용 확장 컬럼
    sub_project_id = Column(Integer, ForeignKey("sub_projects.id"), nullable=True, index=True)
    progress = Column(Integer, nullable=False, default=0)  # 0~100

    remarks = Column(Text, nullable=True)  # 비고

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    archived_at = Column(DateTime, nullable=True)


from sqlalchemy.dialects.mysql import LONGTEXT

class TaskActivity(Base):
    __tablename__ = "task_activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    block_type = Column(String(20), nullable=False, default="checkbox")  # checkbox / text
    order_index = Column(Integer, nullable=False, default=0)
    content = Column(LONGTEXT().with_variant(Text, "sqlite").with_variant(Text, "postgresql"), nullable=False, default="")
    checked = Column(Boolean, nullable=False, default=False)
    checked_at = Column(DateTime, nullable=True)  # 체크 완료 시각
    style = Column(JSON, nullable=True)  # {"bold": true, "color": "#EF4444"}
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    layout = Column(JSON, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class VisitLog(Base):
    __tablename__ = "visit_log"

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(50), nullable=False)
    deptname = Column(String(100), nullable=True)
    username = Column(String(100), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    visit_date = Column(String(10), nullable=True, index=True)  # YYYY-MM-DD
    timestamp = Column(DateTime, default=lambda: datetime.now(KST))


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    action = Column(String(100), nullable=False)        # ex) CREATE_TASK
    entity_type = Column(String(50), nullable=False)    # ex) task / project
    entity_id = Column(Integer, nullable=True, index=True)

    message = Column(Text, nullable=True)
    meta = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now())


# =========================================================
# New Site Features (data.json -> DB 전환용)
# =========================================================

class SubProject(Base):
    __tablename__ = "sub_projects"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # 서브프로젝트 트리 구조를 원하면 사용 (없어도 됨)
    parent_id = Column(Integer, ForeignKey("sub_projects.id"), nullable=True, index=True)

    created_at = Column(DateTime, server_default=func.now())


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    content = Column(Text, nullable=False)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class NoteMention(Base):
    __tablename__ = "note_mentions"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("note_id", "user_id", name="uq_note_mention"),
    )


class TaskActivityMention(Base):
    __tablename__ = "task_activity_mentions"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("task_activities.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("activity_id", "user_id", name="uq_activity_mention"),
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)

    # URL 첨부 / 외부 링크 첨부
    url = Column(Text, nullable=True)
    filename = Column(String(255), nullable=True)
    type = Column(String(30), nullable=False, default="url")  # url / file / etc

    created_at = Column(DateTime, server_default=func.now())


class ProjectMember(Base):
    __tablename__ = "project_members"

    # 복합 PK: 한 프로젝트에 같은 유저 중복 방지
    project_id = Column(Integer, ForeignKey("projects.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)

    role = Column(String(30), nullable=False, default="member")  # owner / admin / member
    loginid = Column(String(128), nullable=True)
    deptname = Column(String(120), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )


class JoinRequest(Base):
    __tablename__ = "join_requests"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    role = Column(String(30), nullable=False, default="member")
    status = Column(String(30), nullable=False, default="pending")  # pending/approved/rejected

    created_at = Column(DateTime, server_default=func.now())


class ProjectFile(Base):
    __tablename__ = "project_files"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    filename = Column(String(255), nullable=False)      # 원본 파일명
    stored_name = Column(String(255), nullable=False)   # 서버 저장 파일명(uuid)
    size = Column(BigInteger, nullable=False, default=0)

    created_at = Column(DateTime, server_default=func.now())


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, unique=True, index=True)

    # 이전/향후 관리자 그룹 기능 호환용
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    # ✅ v1.2 조직 계층 확장
    parent_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    group_type = Column(String(20), nullable=True, default="TEAM")  # CENTER / TEAM / GROUP / PART
    sort_order = Column(Integer, nullable=True, default=0)

    created_at = Column(DateTime, server_default=func.now())


class GroupMembership(Base):
    """v1.2 조직 내 사용자 역할 매핑"""
    __tablename__ = "group_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)

    org_role = Column(String(30), nullable=False, default="MEMBER")  # CENTER_HEAD / TEAM_HEAD / GROUP_HEAD / PART_HEAD / MEMBER
    detail_level = Column(String(20), nullable=False, default="FULL_DETAIL")  # SUMMARY_ONLY / FULL_DETAIL
    is_primary = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "group_id", name="uq_group_membership"),
    )


class Shortcut(Base):
    __tablename__ = "shortcuts"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(100), nullable=False)
    url = Column(Text, nullable=False)

    icon_text = Column(String(20), nullable=True)
    icon_color = Column(String(20), nullable=False, default="#2955FF")

    order = Column(Integer, nullable=False, default=0)
    open_new_tab = Column(Boolean, nullable=False, default=True)
    active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, server_default=func.now())


class UserShortcut(Base):
    __tablename__ = "user_shortcuts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    url = Column(Text, nullable=False)
    icon_text = Column(String(20), nullable=True)
    icon_color = Column(String(20), nullable=False, default="#2955FF")
    order = Column(Integer, nullable=False, default=0)
    open_new_tab = Column(Boolean, nullable=False, default=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())


class MemberGroup(Base):
    __tablename__ = "member_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())


class MemberGroupUser(Base):
    __tablename__ = "member_group_users"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("member_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_member_group_user"),
    )


class AiSetting(Base):
    __tablename__ = "ai_settings"

    # 단일 row로 써도 되고, 환경별 row로 확장해도 됨
    id = Column(Integer, primary_key=True, index=True)

    api_url = Column(Text, nullable=False)
    model_name = Column(String(255), nullable=False)
    api_key = Column(Text, nullable=True)

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ProjectAiReport(Base):
    __tablename__ = "project_ai_reports"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)

    overview = Column(Text, nullable=True)
    task_analysis = Column(Text, nullable=True)
    status_analysis = Column(Text, nullable=True)
    next_steps = Column(Text, nullable=True)

    raw_response = Column(Text, nullable=True)
    structured_snapshot = Column(JSON, nullable=True)

    model = Column(String(255), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_project_ai_reports_project_created", "project_id", "created_at"),
    )


class ProjectAiQuery(Base):
    __tablename__ = "project_ai_queries"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    query = Column(Text, nullable=False)

    one_liner = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    key_schedule = Column(Text, nullable=True)
    next_actions = Column(Text, nullable=True)

    # (선택) 사용자에게 보여줄 최종 텍스트
    response = Column(Text, nullable=True)

    # LLM 원문(디버깅/파싱 실패 대비)
    raw_response = Column(Text, nullable=True)

    context_snapshot = Column(JSON, nullable=True)

    model = Column(String(255), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_project_ai_queries_project_created", "project_id", "created_at"),
        Index("ix_project_ai_queries_user_created", "user_id", "created_at"),
    )


# =========================================================
# v3.0 Sheet 운영 기능 (Excel 기반 Check Sheet / 운영 Sheet)
# =========================================================

class SheetTemplate(Base):
    """업로드된 Excel 원본 구조 (템플릿)"""
    __tablename__ = "sheet_templates"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=True, default="general")
    # check_sheet / chemical_mgmt / equipment_inspect / work_log / standard_form / general

    original_filename = Column(String(255), nullable=True)
    sheet_name = Column(String(100), nullable=True)  # 엑셀 시트 이름

    sheet_type = Column(String(50), nullable=False, default="inspection")
    # inspection / assignment_mapping

    # 파싱된 구조 (셀 데이터 + 병합/색상/수식 정보)
    structure = Column(JSON, nullable=False, default=dict)
    # {
    #   "rows": [...], "cols": [...],
    #   "merges": [...], "col_widths": [...], "row_heights": [...],
    #   "header_rows": [...], "checkable_cells": [...]
    # }

    row_count = Column(Integer, nullable=False, default=0)
    col_count = Column(Integer, nullable=False, default=0)
    checkable_count = Column(Integer, nullable=False, default=0)  # 체크 가능 항목 수

    # v3.1: 자동 인식된 컬럼 역할 매핑 (사용자 확인 후 저장)
    column_role_mapping = Column(JSON, nullable=True)
    structure_hash = Column(String(32), nullable=True, index=True)  # 같은 양식 인식용 해시

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_sheet_templates_space", "space_id", "created_at"),
    )


class SheetExecution(Base):
    """시트 실행본 (누가, 언제, 어떤 프로젝트에서 실행했는지)"""
    __tablename__ = "sheet_executions"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("sheet_templates.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)

    title = Column(String(300), nullable=True)  # 실행 제목 (예: "2026-04-17 PM Check")
    equipment_name = Column(String(200), nullable=True)  # 관련 설비명 (선택)

    sheet_type = Column(String(50), nullable=False, default="inspection")

    status = Column(String(30), nullable=False, default="in_progress")
    # in_progress / completed / cancelled

    total_items = Column(Integer, nullable=False, default=0)
    checked_items = Column(Integer, nullable=False, default=0)
    progress = Column(Integer, nullable=False, default=0)  # 0~100

    started_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # 사용자가 실행본에서 숨긴 컬럼 인덱스 배열 (template.structure는 그대로 유지)
    hidden_cols = Column(JSON, nullable=True)
    # 사용자가 실행본에서 숨긴 행 인덱스 배열 (template.structure는 그대로 유지)
    hidden_rows = Column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_sheet_exec_template", "template_id", "started_at"),
        Index("ix_sheet_exec_project", "project_id", "started_at"),
        Index("ix_sheet_exec_task", "task_id", "started_at"),
        Index("ix_sheet_exec_space", "space_id", "started_at"),
    )


class SheetExecutionItem(Base):
    """실행본의 항목별 체크 상태/메모"""
    __tablename__ = "sheet_execution_items"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("sheet_executions.id", ondelete="CASCADE"), nullable=False, index=True)

    cell_ref = Column(String(20), nullable=False)  # 셀 좌표 (예: "C5", "D12")
    row_idx = Column(Integer, nullable=False, default=0)
    col_idx = Column(Integer, nullable=False, default=0)

    label = Column(Text, nullable=True)  # 항목 라벨 (인접 셀 텍스트)
    checked = Column(Boolean, nullable=False, default=False)
    value = Column(String(100), nullable=True)  # O / X / 수치 등 체크값
    memo = Column(Text, nullable=True)  # 특이사항/메모

    checked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    checked_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_sheet_exec_item_exec", "execution_id", "row_idx", "col_idx"),
    )


class SheetExecutionLog(Base):
    """항목별 체크/변경 이력 (감사 로그)"""
    __tablename__ = "sheet_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("sheet_executions.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("sheet_execution_items.id", ondelete="CASCADE"), nullable=True, index=True)

    action = Column(String(50), nullable=False)  # check / uncheck / memo / complete / start
    old_value = Column(String(200), nullable=True)
    new_value = Column(String(200), nullable=True)
    memo = Column(Text, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_sheet_exec_log_exec", "execution_id", "created_at"),
    )

class SheetExecutionMapping(Base):
    """assignment_mapping 유형 시트의 매핑 관계 저장"""
    __tablename__ = "sheet_execution_mappings"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(Integer, ForeignKey("sheet_executions.id", ondelete="CASCADE"), nullable=False, index=True)

    master_name = Column(String(200), nullable=False)  # 예: 약품명, 마스터 항목
    master_code = Column(String(100), nullable=True)   # 예: 약품코드
    assigned_entity = Column(String(200), nullable=False)  # 예: 설비명, 연결될 항목
    
    manager = Column(String(100), nullable=True)
    last_checked_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_sheet_exec_mapping_exec", "execution_id", "master_name"),
    )