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

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    archived_at = Column(DateTime, nullable=True)


class TaskActivity(Base):
    __tablename__ = "task_activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    block_type = Column(String(20), nullable=False, default="checkbox")  # checkbox / text
    order_index = Column(Integer, nullable=False, default=0)
    content = Column(Text, nullable=False, default="")
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