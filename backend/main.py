from fastapi import (
    FastAPI,
    HTTPException,
    Depends,
    Request,
    Query,
    Body,
    UploadFile,
    File as FastAPIFile,
)
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
import os
import json
import uuid
import threading
import httpx
import re
from zoneinfo import ZoneInfo

# =========================
# DB / ENV / AUTH
# =========================
from app.db_connections.sqlalchemy import SessionLocal, engine, Base
from app.models import (
    Project, User, Task, UserPreference, VisitLog, GroupMembership, Group,
    ProjectAiReport, ProjectAiQuery, AiSetting, SubProject as SubProjectModel, Note as NoteModel,
    NoteMention, ProjectMember as ProjectMemberModel, UserShortcut,
    MemberGroup, MemberGroupUser,
    TaskActivity as TaskActivityModel, Attachment as AttachmentModel,
    Space, SpaceMember, SpaceJoinRequest,
)
from app.environment import CORS_ORIGINS, SUPER_ADMIN_LOGINIDS, KST
from app.llm.dsllm_adapter import chat as dsllm_chat
from app.llm.dsllm_adapter import chat_stream as dsllm_chat_stream
from app.llm.dsllm_adapter import list_model_keys
from app.llm.dsllm_adapter import MODEL_CONFIGS
from app.utils.text import sanitize_llm_text, sanitize_llm_text_ai, normalize_task_blocks
from app.routers import auth, knox

# ✅ 새 테이블 자동 생성 (member_groups, member_group_users 등)
Base.metadata.create_all(bind=engine)

# ✅ 기존 테이블에 새 컬럼 추가 (ALTER TABLE)
def _run_migrations():
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    # task_activities.block_type
    if "task_activities" in insp.get_table_names():
        cols = [c["name"] for c in insp.get_columns("task_activities")]
        if "block_type" not in cols:
            with engine.begin() as conn:
                conn.execute(text('ALTER TABLE task_activities ADD COLUMN block_type VARCHAR(20) NOT NULL DEFAULT "checkbox"'))
        if "checked_at" not in cols:
            with engine.begin() as conn:
                conn.execute(text('ALTER TABLE task_activities ADD COLUMN checked_at DATETIME'))

    # ── Space system tables + migration ──
    if "spaces" not in insp.get_table_names():
        Base.metadata.create_all(bind=engine, tables=[
            Base.metadata.tables.get("spaces"),
            Base.metadata.tables.get("space_members"),
        ])
    if "space_join_requests" not in insp.get_table_names():
        t = Base.metadata.tables.get("space_join_requests")
        if t is not None:
            Base.metadata.create_all(bind=engine, tables=[t])
    if "projects" in insp.get_table_names():
        cols = [c["name"] for c in insp.get_columns("projects")]
        if "space_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text('ALTER TABLE projects ADD COLUMN space_id INTEGER'))

    # (General/기본공간 자동 생성 제거 — 사용자가 만든 공간만 존재)
    # 기존 General 공간이 있으면 비활성화하고 소속 프로젝트의 space_id를 NULL로 복원
    if "spaces" in insp.get_table_names():
        with engine.begin() as conn:
            row = conn.execute(text("SELECT id FROM spaces WHERE slug = 'general' AND is_active = 1 LIMIT 1")).fetchone()
            if row:
                general_id = row[0]
                conn.execute(text(f"UPDATE projects SET space_id = NULL WHERE space_id = {general_id}"))
                conn.execute(text(f"UPDATE spaces SET is_active = 0 WHERE id = {general_id}"))
                conn.execute(text(f"DELETE FROM space_members WHERE space_id = {general_id}"))

    # warned_at 컬럼 추가 (빈 공간 경고/삭제용)
    if "spaces" in insp.get_table_names():
        cols = [c["name"] for c in insp.get_columns("spaces")]
        if "warned_at" not in cols:
            with engine.begin() as conn:
                conn.execute(text('ALTER TABLE spaces ADD COLUMN warned_at DATETIME'))

_run_migrations()

app = FastAPI(title="Antigravity Schedule Platform API")

# SSO 라우터 (/api/auth/*)
app.include_router(auth.router)
app.include_router(knox.router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=False,  # Authorization Bearer 방식이면 보통 False로 충분
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Visit Log Middleware
# =========================
SKIP_LOG_PREFIXES = ("/docs", "/openapi.json", "/favicon", "/static", "/health")
SKIP_LOG_PATHS = {"/", "/api/health", "/api/docs"}

@app.middleware("http")
async def visit_log_middleware(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path

    # 정적/healthcheck/favicon 등 제외
    if path in SKIP_LOG_PATHS or any(path.startswith(p) for p in SKIP_LOG_PREFIXES):
        return response

    # GET /api/* 요청만 로깅 (쓰기 요청은 제외해 로그 폭증 방지)
    if request.method != "GET" or not path.startswith("/api/"):
        return response

    try:
        ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.client.host if request.client else "unknown"
        today_str = datetime.now(KST).strftime("%Y-%m-%d")

        user_id = None
        username = None
        deptname = None

        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            from app.routers.auth import load_session
            token = auth.replace("Bearer ", "").strip()
            user_info = load_session(token)
            if user_info:
                loginid = user_info.get("loginid", "")
                db = SessionLocal()
                try:
                    u = db.query(User).filter(User.loginid == loginid).first()
                    if u:
                        user_id = u.id
                        username = u.username
                        deptname = u.deptname
                    # 동일 IP는 하루 1회만 기록
                    existing = db.query(VisitLog).filter(
                        VisitLog.ip_address == ip[:50],
                        VisitLog.visit_date == today_str,
                    ).first()
                    if not existing:
                        log_entry = VisitLog(
                            ip_address=ip[:50],
                            user_id=user_id,
                            username=username,
                            deptname=deptname,
                            visit_date=today_str,
                        )
                        db.add(log_entry)
                        db.commit()
                finally:
                    db.close()
    except Exception:
        pass  # 로깅 실패가 서비스에 영향주지 않도록

    return response

@app.on_event("startup")
def startup_ensure_super_admin():
    # user_shortcuts 테이블 자동 생성 (없으면)
    from app.models import UserShortcut as _UserShortcut
    _UserShortcut.__table__.create(bind=engine, checkfirst=True)

    db = SessionLocal()
    try:
        ensure_super_owner(db)
        # v1.2: backfill deptname -> TEAM node
        _backfill_team_nodes(db)
        # 3일 지난 삭제 항목 영구 제거
        _purge_expired_trash(db)
        # 빈 공간 경고 및 자동 삭제
        _cleanup_empty_spaces(db)
    finally:
        db.close()

def _backfill_team_nodes(db: Session):
    """deptname 값을 기반으로 groups 테이블에 TEAM 타입 노드를 자동 생성하고 users.primary_team_id를 매핑"""
    try:
        from app.models import Group as GroupModel
        all_users = db.query(User).filter(User.deptname.isnot(None), User.deptname != "").all()
        dept_names = set(u.deptname.strip() for u in all_users if u.deptname and u.deptname.strip())

        for dept in dept_names:
            existing = db.query(GroupModel).filter(GroupModel.name == dept).first()
            if not existing:
                new_group = GroupModel(name=dept, group_type="TEAM", is_active=True)
                db.add(new_group)
                db.flush()
                existing = new_group

            # Map users with this deptname to the team group
            for u in all_users:
                if u.deptname and u.deptname.strip() == dept:
                    if not u.primary_team_id:
                        u.primary_team_id = existing.id

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[WARN] backfill team nodes failed: {e}")

# =========================
# DB Dependency
# =========================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_active_user(request: Request, db: Session = Depends(get_db)):
    """등록된 활성 사용자만 통과. 미등록/비활성이면 403."""
    from app.routers.auth import load_session
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = auth.replace("Bearer ", "").strip()
    user_info = load_session(token)
    if not user_info:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    loginid = (user_info or {}).get("loginid", "")
    user = db.query(User).filter(User.loginid == loginid).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="접근 권한이 없습니다. 관리자에게 등록을 요청하세요."
        )
    return user

# 시간
KST = ZoneInfo("Asia/Seoul")

def _today_kst() -> date:
    return datetime.now(KST).date()

def _add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    return date(y, m, 1)

def _month_window(year: int, month: int) -> tuple[date, date]:
    start = date(year, month, 1)
    end = _add_months(start, 1)
    return start, end  # [start, end)

def _parse_iso_or_ymd(s: str) -> date | None:
    if not s:
        return None
    s = str(s).strip()
    if not s:
        return None
    # "2026-02-15" or "2026-02-15T00:00:00"
    try:
        if "T" in s:
            return datetime.fromisoformat(s.replace("Z", "")).date()
        return date.fromisoformat(s[:10])
    except Exception:
        return None

def _parse_time_window_from_query(q: str, today: date) -> tuple[date, date] | None:
    q = (q or "").strip()
    if not q:
        return None

    # 상대 표현
    if re.search(r"(이번\s*달|이번달)", q):
        return _month_window(today.year, today.month)
    if re.search(r"(다음\s*달|다음달)", q):
        d = _add_months(date(today.year, today.month, 1), 1)
        return _month_window(d.year, d.month)
    if re.search(r"(지난\s*달|지난달|저번\s*달|저번달)", q):
        d = _add_months(date(today.year, today.month, 1), -1)
        return _month_window(d.year, d.month)

    # "2026년 2월"
    m = re.search(r"(\d{4})\s*년\s*(\d{1,2})\s*월", q)
    if m:
        y = int(m.group(1))
        mo = int(m.group(2))
        if 1 <= mo <= 12:
            return _month_window(y, mo)

    # "2월" (연도 없으면 올해로 가정)
    m2 = re.search(r"(\d{1,2})\s*월", q)
    if m2:
        mo = int(m2.group(1))
        if 1 <= mo <= 12:
            y = today.year
            # "내년 2월" 같은 케이스
            if "내년" in q:
                y += 1
            elif "작년" in q:
                y -= 1
            return _month_window(y, mo)

    # "2026-02-15" / "2026/02/15" / "2/15"
    m3 = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", q)
    if m3:
        y, mo, d = map(int, m3.groups())
        try:
            start = date(y, mo, d)
            return start, start + timedelta(days=1)
        except Exception:
            return None

    m4 = re.search(r"(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)", q)
    if m4:
        mo, d = map(int, m4.groups())
        y = today.year
        try:
            start = date(y, mo, d)
            return start, start + timedelta(days=1)
        except Exception:
            return None

    return None

def _task_overlaps_window(task: dict, start: date, end: date) -> bool:
    sd = _parse_iso_or_ymd(task.get("start_date"))
    dd = _parse_iso_or_ymd(task.get("due_date"))

    # 둘 다 있으면 overlap 기준(기간이 걸친 Task도 포함)
    if sd and dd:
        return (sd < end) and (dd >= start)

    # 하나만 있으면 그 날짜가 window 안에 들어오면 포함
    if dd:
        return (start <= dd < end)
    if sd:
        return (start <= sd < end)

    return False

def _extract_task_ids_from_related_text(text: str) -> set[int]:
    if not text:
        return set()
    ids = set()

    # "123 / ..." 형태
    for m in re.finditer(r"^\s*(\d+)\s*/", text, flags=re.MULTILINE):
        ids.add(int(m.group(1)))

    # "ID:123" 형태
    for m in re.finditer(r"\bID\s*[:#]?\s*(\d+)\b", text, flags=re.IGNORECASE):
        ids.add(int(m.group(1)))

    return ids

# =========================
# Sidecar JSON State (추가 기능 저장소)
# - DB 스키마를 안 바꾸고도 새 기능 붙이기 위한 구조
# =========================
DATA_FILE = "data.json"
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

STATE_LOCK = threading.Lock()

DEFAULT_PERMISSIONS = {
    "post_write": "all",
    "post_edit": "all",
    "post_view": "all",
    "comment_write": "all",
    "file_view": "all",
    "file_download": "all",
}

DEFAULT_STATE = {
    # DB 보완용 메타
    "project_meta": {},   # { "project_id": {owner_id, visibility, require_approval, permissions} }
    "task_meta": {},      # { "task_id": {sub_project_id, progress} }
    "user_meta": {},      # { "user_id": {group_name} }

    # 새 기능 저장
    "sub_projects": [],   # [{id, project_id, name, description, parent_id, created_at}]
    "notes": [],          # [{id, project_id, author_id, content, created_at, updated_at}]
    "attachments": [],    # task attachments (URL 형태) [{id, task_id, url, filename, type, created_at}]
    "project_members": [],# [{project_id, user_id, role}]
    "project_files": [],  # [{id, project_id, filename, stored_name, size, uploader_id, created_at}]
    "join_requests": [],  # [{id, project_id, user_id, role, status, created_at}]
    "groups": [],         # [{id, name, created_at, description?, is_active?}]
    "shortcuts": [],      # [{...}]
    "ai_settings": {"api_url": "", "model_name": ""},
    "project_ai_queries": [],
    "ai_summaries": [],
    "search_feedback": [],
    "list_orders": {},
}

def _deepcopy_state(obj: dict) -> dict:
    return json.loads(json.dumps(obj))

def load_state() -> Dict[str, Any]:
    with STATE_LOCK:
        if not os.path.exists(DATA_FILE):
            return _deepcopy_state(DEFAULT_STATE)

        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)

            # 마이그레이션: 누락 키 보강
            for k, v in DEFAULT_STATE.items():
                if k not in data:
                    data[k] = _deepcopy_state(v) if isinstance(v, (dict, list)) else v

            # 타입 방어
            if not isinstance(data.get("project_meta"), dict):
                data["project_meta"] = {}
            if not isinstance(data.get("task_meta"), dict):
                data["task_meta"] = {}
            if not isinstance(data.get("user_meta"), dict):
                data["user_meta"] = {}
            if not isinstance(data.get("ai_settings"), dict):
                data["ai_settings"] = {"api_url": "", "model_name": ""}

            return data
        except json.JSONDecodeError:
            return _deepcopy_state(DEFAULT_STATE)

def save_state(state: Dict[str, Any]):
    with STATE_LOCK:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)

def next_id(items: list) -> int:
    if not items:
        return 1
    return max(int(item.get("id", 0)) for item in items) + 1

# 최초 파일 없으면 생성
if not os.path.exists(DATA_FILE):
    save_state(load_state())

# =========================
# Pydantic Models
# =========================
class TaskBase(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = None
    status: str = "todo"
    priority: Optional[str] = "medium"
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    assignee_ids: List[int] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

    # ✅ DB Task 테이블엔 없어서 sidecar(task_meta)에 저장
    sub_project_id: Optional[int] = None
    progress: Optional[int] = 0

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    assignee_ids: Optional[List[int]] = None
    tags: Optional[List[str]] = None
    sub_project_id: Optional[int] = None
    progress: Optional[int] = None

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

    # ✅ DB Project 테이블엔 없어서 sidecar(project_meta)에 저장
    owner_id: Optional[int] = 1
    visibility: Optional[str] = "private"
    require_approval: Optional[bool] = False
    permissions: Optional[Dict[str, str]] = None
    member_ids: Optional[List[int]] = None
    space_id: Optional[int] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

    # ✅ sidecar
    visibility: Optional[str] = None
    require_approval: Optional[bool] = None
    permissions: Optional[Dict[str, str]] = None
    owner_id: Optional[int] = None

class UserCreate(BaseModel):
    username: str
    loginid: str
    role: Optional[str] = "member"
    avatar_color: Optional[str] = "#2955FF"
    deptname: Optional[str] = None
    mail: Optional[str] = None

class UserUpdate(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    avatar_color: Optional[str] = None
    is_active: Optional[bool] = None

    # ✅ DB 컬럼 없음 → sidecar user_meta에 저장
    group_name: Optional[str] = None

class LayoutUpdate(BaseModel):
    layout: Dict[str, Any]

class ListOrderUpdate(BaseModel):
    order: List[int]

class SubProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None

class SubProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None

class NoteCreate(BaseModel):
    content: str

class AttachmentCreate(BaseModel):
    url: str
    filename: Optional[str] = None
    type: Optional[str] = "url"

class MemberAdd(BaseModel):
    user_id: int
    role: Optional[str] = "member"

class MemberApproval(BaseModel):
    user_id: int
    action: str  # approve / reject

class AiSettingsUpdate(BaseModel):
    api_url: str
    model_name: str

class ReportRequest(BaseModel):
    project_id: int

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class MemberGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    member_user_ids: Optional[List[int]] = None

class MemberGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    member_user_ids: Optional[List[int]] = None

class ShortcutCreate(BaseModel):
    name: str
    url: str
    icon_text: Optional[str] = None
    icon_color: Optional[str] = "#2955FF"
    order: Optional[int] = 0
    open_new_tab: Optional[bool] = True

class ShortcutUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    icon_text: Optional[str] = None
    icon_color: Optional[str] = None
    order: Optional[int] = None
    open_new_tab: Optional[bool] = None
    active: Optional[bool] = None

# 26일 추가됨
class ProjectAiQueryRequest(BaseModel):
    query: str

class SummaryFeedback(BaseModel):
    summary_id: int
    rating: int
    comment: Optional[str] = None

class SummaryCorrectionSave(BaseModel):
    summary_id: int
    corrected_text: str

# =========================
# Serializer / Helper
# =========================
def iso(dt):
    return dt.isoformat() if dt else None

def get_project_meta(state: dict, project_id: int) -> dict:
    meta = state.get("project_meta", {}).get(str(project_id), {})
    return {
        "owner_id": meta.get("owner_id", 1),
        "visibility": meta.get("visibility", "private"),
        "require_approval": bool(meta.get("require_approval", False)),
        "permissions": meta.get("permissions") or dict(DEFAULT_PERMISSIONS),
    }

def set_project_meta(state: dict, project_id: int, values: dict):
    if "project_meta" not in state or not isinstance(state["project_meta"], dict):
        state["project_meta"] = {}
    curr = state["project_meta"].get(str(project_id), {})
    curr.update(values)
    if "permissions" in curr and curr["permissions"] is None:
        curr["permissions"] = dict(DEFAULT_PERMISSIONS)
    state["project_meta"][str(project_id)] = curr

def get_task_meta(state: dict, task_id: int) -> dict:
    meta = state.get("task_meta", {}).get(str(task_id), {})
    return {
        "sub_project_id": meta.get("sub_project_id"),
        "progress": int(meta.get("progress", 0) or 0),
    }

def set_task_meta(state: dict, task_id: int, values: dict):
    if "task_meta" not in state or not isinstance(state["task_meta"], dict):
        state["task_meta"] = {}
    curr = state["task_meta"].get(str(task_id), {})
    curr.update(values)
    # 방어
    if "progress" in curr and curr["progress"] is not None:
        try:
            curr["progress"] = max(0, min(100, int(curr["progress"])))
        except Exception:
            curr["progress"] = 0
    state["task_meta"][str(task_id)] = curr

def get_user_meta(state: dict, user_id: int) -> dict:
    return state.get("user_meta", {}).get(str(user_id), {})

def set_user_meta(state: dict, user_id: int, values: dict):
    if "user_meta" not in state or not isinstance(state["user_meta"], dict):
        state["user_meta"] = {}
    curr = state["user_meta"].get(str(user_id), {})
    curr.update(values)
    state["user_meta"][str(user_id)] = curr

def project_dict(p: Project, state: dict):
    meta = get_project_meta(state, p.id)
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "created_at": iso(p.created_at),
        "archived_at": iso(p.archived_at),
        "owner_id": meta["owner_id"],
        "visibility": meta["visibility"],
        "require_approval": meta["require_approval"],
        "permissions": meta["permissions"],
        "space_id": p.space_id,
    }

def user_dict(u: User, state: dict):
    meta = get_user_meta(state, u.id)
    return {
        "id": u.id,
        "loginid": u.loginid,
        "username": u.username,
        "role": u.role,
        "avatar_color": u.avatar_color,
        "is_active": u.is_active,
        "deptname": getattr(u, "deptname", None),
        "mail": getattr(u, "mail", None),
        "created_at": iso(u.created_at),
        "last_login_at": iso(u.last_login_at),
        "group_name": getattr(u, "group_name", None) or meta.get("group_name"),
    }

def task_dict(t: Task, state: dict):
    meta = get_task_meta(state, t.id)
    return {
        "id": t.id,
        "project_id": t.project_id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "start_date": t.start_date,
        "due_date": t.due_date,
        "assignee_ids": t.assignee_ids or [],
        "tags": t.tags or [],
        "sub_project_id": meta.get("sub_project_id"),
        "progress": meta.get("progress", 0),
        "created_at": iso(t.created_at),
        "remarks": t.remarks,
        "updated_at": iso(t.updated_at),
        "archived_at": iso(t.archived_at),
    }

def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"

def try_get_user_from_token(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "").strip()
        from app.routers.auth import load_session  # 지연 import
        user_info = load_session(token)
        if user_info:
            return user_info
    return {}

def resolve_user_id_from_token(request: Request, db: Session) -> Optional[int]:
    user_info = try_get_user_from_token(request)
    loginid = user_info.get("loginid")
    if not loginid:
        return None
    row = db.query(User).filter(User.loginid == loginid).first()
    return row.id if row else None

def get_subprojects_from_db(db: Session, project_id: Optional[int] = None) -> List[dict]:
    """C-2: Get subprojects from DB as dicts (replaces state.get('sub_projects'))"""
    q = db.query(SubProjectModel)
    if project_id:
        q = q.filter(SubProjectModel.project_id == project_id)
    return [{
        "id": sp.id,
        "project_id": sp.project_id,
        "name": sp.name,
        "description": sp.description,
        "parent_id": sp.parent_id,
        "created_at": iso(sp.created_at),
    } for sp in q.all()]

def get_members_for_project(state: dict, project_id: int, db: Session = None) -> List[dict]:
    """C-3: Try DB first, fallback to sidecar"""
    if db:
        rows = db.query(ProjectMemberModel).filter(ProjectMemberModel.project_id == int(project_id)).all()
        if rows:
            return [{"project_id": r.project_id, "user_id": r.user_id, "role": r.role, "loginid": r.loginid, "deptname": r.deptname} for r in rows]
    return [m for m in state.get("project_members", []) if int(m.get("project_id")) == int(project_id)]

def ensure_owner_membership(state: dict, project_id: int, owner_id: Optional[int], db: Session = None):
    if not owner_id:
        return
    if db:
        existing = db.query(ProjectMemberModel).filter(
            ProjectMemberModel.project_id == int(project_id),
            ProjectMemberModel.user_id == int(owner_id),
        ).first()
        if not existing:
            owner_user = db.query(User).filter(User.id == int(owner_id)).first()
            pm = ProjectMemberModel(
                project_id=project_id, user_id=owner_id, role="owner",
                loginid=owner_user.loginid if owner_user else None,
                deptname=getattr(owner_user, "deptname", None) if owner_user else None,
            )
            db.add(pm)
            db.flush()
        return
    # Fallback: sidecar
    members = state.get("project_members", [])
    exists = any(int(m.get("project_id")) == int(project_id) and int(m.get("user_id")) == int(owner_id) for m in members)
    if not exists:
        members.append({"project_id": project_id, "user_id": owner_id, "role": "owner"})
        state["project_members"] = members

def get_user_role(db: Session, user_id: int) -> Optional[str]:
    u = db.query(User).filter(User.id == user_id).first()
    return u.role if u else None

def is_admin_like_role(role: Optional[str]) -> bool:
    return role in {"admin", "super_admin"}  # 점진 전환용

def is_super_admin_user(db: Session, user_id: int) -> bool:
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return False
    return bool(u.is_active) and u.role == "super_admin" and is_super_owner_loginid(u.loginid)

def check_task_edit_permission(db: Session, state: dict, project_id: int, user_id: int):
    """owner/담당자만 task 수정 가능. viewer는 불가."""
    if is_admin_like_role(get_user_role(db, user_id)):
        return True

    meta = get_project_meta(state, project_id)
    if int(meta.get("owner_id") or 0) == int(user_id):
        return True

    pm = db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == int(project_id),
        ProjectMemberModel.user_id == int(user_id),
    ).first()
    if pm and pm.role in ("owner", "manager", "member"):
        return True

    raise HTTPException(status_code=403, detail="Task 수정 권한이 없습니다. (viewer는 수정 불가)")

def require_admin(db: Session, state: dict, user_id: int):
    """super_admin 또는 admin만 허용"""
    u = db.query(User).filter(User.id == user_id).first()
    if not u or not bool(u.is_active):
        raise HTTPException(status_code=403, detail="Admin access required")

    if u.role not in ("super_admin", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

def require_super_admin(db: Session, user_id: int):
    """super_admin만 허용 (AI settings 등)"""
    u = db.query(User).filter(User.id == user_id).first()
    if not u or not bool(u.is_active):
        raise HTTPException(status_code=403, detail="Super admin access required")
    if u.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")

def get_user_project_ids(db: Session, state: dict, user_id: int) -> set:
    pids = set()

    # C-3: DB members first
    db_memberships = db.query(ProjectMemberModel).filter(ProjectMemberModel.user_id == int(user_id)).all()
    for m in db_memberships:
        pids.add(m.project_id)

    # Fallback: sidecar members
    for m in state.get("project_members", []):
        if int(m.get("user_id")) == int(user_id):
            pids.add(int(m.get("project_id")))

    # owner
    projects = db.query(Project).filter(Project.archived_at.is_(None)).all()
    for p in projects:
        meta = get_project_meta(state, p.id)
        if int(meta.get("owner_id") or 0) == int(user_id):
            pids.add(p.id)

    return pids

def check_project_access(db: Session, state: dict, project_id: int, user_id: int):
    # admin pass
    if is_admin_like_role(get_user_role(db, user_id)):
        return True

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    meta = get_project_meta(state, p.id)

    if int(meta.get("owner_id") or 0) == int(user_id):
        return True

    # C-3: Check DB members
    db_member = db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == int(project_id),
        ProjectMemberModel.user_id == int(user_id),
    ).first()
    if db_member:
        return True

    if any(int(m.get("project_id")) == int(project_id) and int(m.get("user_id")) == int(user_id) for m in state.get("project_members", [])):
        return True

    if meta.get("visibility") == "public":
        return True

    raise HTTPException(status_code=403, detail="Access denied: you are not a member of this project")

def check_project_permission(db: Session, state: dict, project_id: int, user_id: int, permission_key: str):
    if is_admin_like_role(get_user_role(db, user_id)):
        return True

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    meta = get_project_meta(state, p.id)
    permissions = meta.get("permissions") or dict(DEFAULT_PERMISSIONS)
    perm_value = permissions.get(permission_key, "all")

    # owner pass
    if int(meta.get("owner_id") or 0) == int(user_id):
        return True

    if perm_value == "all":
        return True
    elif perm_value == "admin":
        raise HTTPException(status_code=403, detail=f"권한이 없습니다: {permission_key} 은(는) 관리자만 가능합니다")
    elif perm_value == "members_only":
        # C-3: Check DB members first
        db_member = db.query(ProjectMemberModel).filter(
            ProjectMemberModel.project_id == int(project_id),
            ProjectMemberModel.user_id == int(user_id),
        ).first()
        is_member = bool(db_member) or any(int(m.get("project_id")) == int(project_id) and int(m.get("user_id")) == int(user_id) for m in state.get("project_members", []))
        if is_member:
            return True
        raise HTTPException(status_code=403, detail=f"권한이 없습니다: {permission_key} 은(는) 프로젝트 담당자만 가능합니다")

    return True

# =========================
# Role / Super Admin Helpers
# =========================
ADMIN_ROLES = {"super_admin"}
SUPER_OWNER_LOGINID = SUPER_ADMIN_LOGINIDS  # from environment.py (env var)

def normalize_loginid(loginid: Optional[str]) -> str:
    return (loginid or "").strip().lower()

def is_admin_role(role: Optional[str]) -> bool:
    return (role or "").strip().lower() in ADMIN_ROLES

def is_super_owner_loginid(loginid: Optional[str]) -> bool:
    # NOTE: 원본 코드에 논리 오류가 있었는데(리스트 비교),
    # 사용자가 "그대로"를 원하므로 안전하게 문자열/리스트 모두 대응하도록 작성.
    if isinstance(SUPER_OWNER_LOGINID, list):
        return normalize_loginid(loginid) in [normalize_loginid(x) for x in SUPER_OWNER_LOGINID]
    return normalize_loginid(loginid) == normalize_loginid(SUPER_OWNER_LOGINID)

def get_user_role(db: Session, user_id: int) -> Optional[str]:
    u = db.query(User).filter(User.id == user_id).first()
    return u.role if u else None

def get_super_owner_user(db: Session) -> Optional[User]:
    # DB에 loginid가 소문자로 저장된다고 가정
    return db.query(User).filter(User.loginid.in_(SUPER_OWNER_LOGINID)).first()

def get_super_owner_id(db: Session) -> Optional[int]:
    u = get_super_owner_user(db)
    return u.id if u else None

def ensure_super_owner(db: Session) -> Optional[User]:
    """SUPER_ADMIN_LOGINIDS에 해당하는 계정이 있으면 super_admin + 활성 상태를 강제 보장."""
    u = db.query(User).filter(
        User.loginid.in_(SUPER_OWNER_LOGINID)
    ).first()
    if not u:
        return None

    changed = False

    if (u.role or "").strip().lower() != "super_admin":
        u.role = "super_admin"
        changed = True

    if not bool(u.is_active):
        u.is_active = True
        changed = True

    if changed:
        db.commit()
        db.refresh(u)

    return u

# =========================
# Root / Health
# =========================
@app.get("/")
def read_root():
    return {"message": "Welcome to Antigravity Schedule Platform API"}

@app.get("/health")
def health_check():
    return {"ok": True}

# =========================
# Combined Data Endpoint
# =========================
@app.get("/api/data")
def get_all_data(user_id: Optional[int] = None, db: Session = Depends(get_db)):
    state = load_state()

    projects_db = db.query(Project).filter(Project.archived_at.is_(None)).all()
    users_db = db.query(User).all()
    tasks_db = db.query(Task).filter(Task.archived_at.is_(None)).all()
    prefs_rows = db.query(UserPreference).all()

    projects = [project_dict(p, state) for p in projects_db]
    users = [user_dict(u, state) for u in users_db]
    tasks = [task_dict(t, state) for t in tasks_db]

    # user_id 필터 (새 프론트 호환)
    if user_id:
        role = get_user_role(db, user_id)
        is_admin = is_admin_like_role(role)
        if not is_admin:
            authorized_pids = get_user_project_ids(db, state, user_id)
            # public 프로젝트도 허용
            public_pids = {p["id"] for p in projects if p.get("visibility") == "public"}
            authorized_pids |= public_pids

            projects = [p for p in projects if p["id"] in authorized_pids]
            tasks = [
                t for t in tasks
                if t.get("project_id") in authorized_pids and (
                    not t.get("assignee_ids") or user_id in (t.get("assignee_ids") or [])
                )
            ]

    prefs = {}
    for pr in prefs_rows:
        prefs[str(pr.user_id)] = {"layout": pr.layout}

    return {
        # DB core
        "projects": projects,
        "users": users,
        "tasks": tasks,
        "activity_logs": [],  # 미구현 유지
        "user_preferences": prefs,

        # C-2: sub_projects from DB
        "sub_projects": get_subprojects_from_db(db),
        "notes": state.get("notes", []),
        "attachments": state.get("attachments", []),
        "project_members": state.get("project_members", []),
        "project_files": state.get("project_files", []),
        "join_requests": state.get("join_requests", []),
        "groups": state.get("groups", []),
        "shortcuts": state.get("shortcuts", []),

        # 레거시 호환용 (예전 main.py에서 쓰던 키)
        "roadmap_items": [],
    }

# =========================
# User Endpoints (DB + user_meta)
# =========================
@app.get("/api/users")
def get_users(db: Session = Depends(get_db)):
    state = load_state()
    users = db.query(User).all()
    return {"users": [user_dict(u, state) for u in users]}

@app.post("/api/users")
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    state = load_state()

    exists = db.query(User).filter(User.loginid == user.loginid).first()
    if exists:
        raise HTTPException(status_code=400, detail="Login ID already exists")

    # mail이 없으면 loginid@samsung.com으로 자동 생성
    mail = user.mail or f"{user.loginid}@samsung.com"

    u = User(
        loginid=user.loginid,
        username=user.username,
        role=user.role or "member",
        avatar_color=user.avatar_color or "#2955FF",
        deptname=user.deptname,
        mail=mail,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    return user_dict(u, state)

@app.patch("/api/users/{user_id}")
def update_user(user_id: int, updates: UserUpdate, db: Session = Depends(get_db)):
    state = load_state()
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    data = updates.model_dump(exclude_unset=True)

    # DB fields
    for k in ["username", "role", "avatar_color", "is_active"]:
        if k in data:
            setattr(u, k, data[k])

    # sidecar field
    if "group_name" in data:
        set_user_meta(state, user_id, {"group_name": data["group_name"]})
        save_state(state)

    db.commit()
    db.refresh(u)
    return user_dict(u, state)

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    state = load_state()

    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if (u.loginid or "").lower() in [x.lower() for x in SUPER_OWNER_LOGINID]:
        raise HTTPException(status_code=400, detail="Super owner 계정은 삭제할 수 없습니다.")

    # tasks.assignee_ids(JSON)에서 제거
    tasks = db.query(Task).filter(Task.archived_at.is_(None)).all()
    for t in tasks:
        ids = list(t.assignee_ids or [])
        if user_id in ids:
            ids.remove(user_id)
            t.assignee_ids = ids

    # preferences 삭제
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if pref:
        db.delete(pref)

    # sidecar 정리
    state["project_members"] = [m for m in state.get("project_members", []) if int(m.get("user_id")) != user_id]
    state["join_requests"] = [jr for jr in state.get("join_requests", []) if int(jr.get("user_id")) != user_id]
    state["notes"] = [n for n in state.get("notes", []) if int(n.get("author_id", -1)) != user_id]
    state.get("user_meta", {}).pop(str(user_id), None)

    db.delete(u)
    db.commit()
    save_state(state)
    return {"message": "User deleted"}

@app.post("/api/visit")
def write_visit_log(request: Request, db: Session = Depends(get_db)):
    user = try_get_user_from_token(request)
    ip = get_client_ip(request)
    uid = resolve_user_id_from_token(request, db)
    today_str = datetime.now(KST).strftime("%Y-%m-%d")

    # 동일 IP는 하루 1회만 기록
    existing = db.query(VisitLog).filter(
        VisitLog.ip_address == ip,
        VisitLog.visit_date == today_str,
    ).first()
    if existing:
        return {"message": "already logged today", "ip": ip}

    row = VisitLog(
        ip_address=ip,
        deptname=user.get("deptname"),
        username=user.get("username"),
        user_id=uid,
        visit_date=today_str,
    )
    db.add(row)
    db.commit()
    return {"message": "logged", "ip": ip}

# =========================
# User Preferences (DB)
# =========================
@app.get("/api/users/{user_id}/preferences")
def get_user_preferences(user_id: int, db: Session = Depends(get_db)):
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if not pref:
        return {"layout": None}
    return {"layout": pref.layout}

@app.put("/api/users/{user_id}/preferences/layout")
def save_user_layout(user_id: int, body: LayoutUpdate, db: Session = Depends(get_db)):
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if not pref:
        pref = UserPreference(user_id=user_id, layout=body.layout)
        db.add(pref)
    else:
        pref.layout = body.layout

    db.commit()
    return {"message": "Layout saved", "layout": body.layout}

@app.post("/api/users/{user_id}/hidden-projects/{project_id}")
def toggle_hidden_project(user_id: int, project_id: int, db: Session = Depends(get_db)):
    """사용자별 프로젝트 숨기기/보이기 토글"""
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if not pref:
        pref = UserPreference(user_id=user_id, layout={})
        db.add(pref)
        db.flush()

    layout = dict(pref.layout or {})
    hidden = list(layout.get("hidden_projects", []))

    if project_id in hidden:
        hidden.remove(project_id)
        action = "shown"
    else:
        hidden.append(project_id)
        action = "hidden"

    layout["hidden_projects"] = hidden
    pref.layout = layout
    db.commit()
    return {"action": action, "hidden_projects": hidden}

@app.get("/api/users/{user_id}/hidden-projects")
def get_hidden_projects(user_id: int, db: Session = Depends(get_db)):
    """사용자별 숨긴 프로젝트 목록"""
    pref = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    hidden = (pref.layout or {}).get("hidden_projects", []) if pref else []
    return {"hidden_projects": hidden}

# =========================
# Project Endpoints (DB + project_meta + members sidecar)
# =========================
@app.get("/api/projects")
def get_projects(user_id: Optional[int] = None, space_id: Optional[int] = None, db: Session = Depends(get_db), _active: User = Depends(get_active_user)):
    state = load_state()
    q = db.query(Project).filter(Project.archived_at.is_(None))
    # Filter by space if provided
    if space_id:
        q = q.filter(Project.space_id == space_id)
    rows = q.all()
    projects = [project_dict(p, state) for p in rows]

    if user_id:
        accessible_project_ids = get_user_project_ids(db, state, user_id)
        projects = [
            p for p in projects
            if p["id"] in accessible_project_ids or p.get("visibility") == "public"
        ]

    return {"projects": projects}

@app.post("/api/projects")
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    state = load_state()

    # 프로젝트는 반드시 유효한 공간에 소속되어야 함
    if not project.space_id:
        raise HTTPException(400, "프로젝트를 생성하려면 먼저 공간이 필요합니다.")
    space = db.query(Space).filter(Space.id == project.space_id, Space.is_active == True).first()
    if not space:
        raise HTTPException(400, "유효하지 않은 공간입니다. 프로젝트를 생성하려면 먼저 공간이 필요합니다.")

    # C-4: Calculate owner before creating project
    default_owner_id = project.owner_id
    if not default_owner_id:
        default_owner_id = get_super_owner_id(db) or 1

    p = Project(
        name=project.name,
        description=project.description,
        owner_id=default_owner_id,
        created_by=default_owner_id,
        space_id=project.space_id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    set_project_meta(state, p.id, {
        "owner_id": default_owner_id,
        "visibility": project.visibility or "private",
        "require_approval": bool(project.require_approval or False),
        "permissions": project.permissions or dict(DEFAULT_PERMISSIONS),
    })

    # C-3: Owner membership via DB
    ensure_owner_membership(state, p.id, default_owner_id, db=db)

    for mid in (project.member_ids or []):
        if mid == default_owner_id:
            continue
        existing = db.query(ProjectMemberModel).filter(
            ProjectMemberModel.project_id == p.id,
            ProjectMemberModel.user_id == int(mid),
        ).first()
        if not existing:
            mu = db.query(User).filter(User.id == int(mid)).first()
            pm = ProjectMemberModel(
                project_id=p.id, user_id=mid, role="member",
                loginid=mu.loginid if mu else None,
                deptname=getattr(mu, "deptname", None) if mu else None,
            )
            db.add(pm)
    db.commit()

    save_state(state)
    return project_dict(p, state)

@app.patch("/api/projects/{project_id}")
def update_project(
    project_id: int,
    updates: ProjectUpdate,
    caller_user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    state = load_state()
    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    data = updates.model_dump(exclude_unset=True)

    # Owner-only check for name changes
    if "name" in data:
        meta = get_project_meta(state, project_id)
        caller = db.query(User).filter(User.id == caller_user_id).first() if caller_user_id else None
        is_super_admin = caller and caller.role == "super_admin"
        if not is_super_admin and meta.get("owner_id") != caller_user_id:
            raise HTTPException(status_code=403, detail="프로젝트 이름은 소유자만 변경할 수 있습니다.")
        p.name = data["name"]
    if "description" in data:
        p.description = data["description"]

    # sidecar meta
    meta_updates = {}
    for k in ["visibility", "require_approval", "permissions", "owner_id"]:
        if k in data:
            meta_updates[k] = data[k]
    if meta_updates:
        set_project_meta(state, project_id, meta_updates)
        if "owner_id" in meta_updates:
            ensure_owner_membership(state, project_id, meta_updates["owner_id"], db=db)

    db.commit()
    db.refresh(p)
    save_state(state)
    return project_dict(p, state)

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, request: Request, db: Session = Depends(get_db)):
    state = load_state()
    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    # owner 체크: owner_id가 있으면 owner 또는 admin만 삭제 가능
    caller_info = try_get_user_from_token(request)
    if caller_info:
        caller_loginid = caller_info.get("loginid", "")
        caller = db.query(User).filter(User.loginid == caller_loginid).first()
        meta = get_project_meta(state, project_id)
        owner_id = p.owner_id or meta.get("owner_id")
        if owner_id and caller:
            caller_is_admin = caller.role in ("admin", "super_admin")
            if not caller_is_admin and caller.id != owner_id:
                raise HTTPException(status_code=403, detail="프로젝트 삭제 권한이 없습니다. (owner만 가능)")

    now = datetime.now()
    p.archived_at = now

    # 관련 task soft delete
    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    for t in tasks:
        if not t.archived_at:
            t.archived_at = now

    db.commit()
    return {"message": "Project deleted"}

@app.post("/api/projects/{project_id}/restore")
def restore_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p or not p.archived_at:
        raise HTTPException(status_code=404, detail="Archived project not found")
    p.archived_at = None
    # 관련 task도 함께 복원
    for t in db.query(Task).filter(Task.project_id == project_id).all():
        if t.archived_at:
            t.archived_at = None
    db.commit()
    return {"message": "Project restored"}

@app.get("/api/trash")
def get_trash(db: Session = Depends(get_db)):
    state = load_state()
    archived_projects = db.query(Project).filter(Project.archived_at.isnot(None)).all()
    archived_tasks = db.query(Task).filter(Task.archived_at.isnot(None)).all()

    projects_out = []
    for p in archived_projects:
        task_count = db.query(Task).filter(Task.project_id == p.id).count()
        meta = get_project_meta(state, p.id)
        projects_out.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "archived_at": iso(p.archived_at),
            "task_count": task_count,
            "owner_id": meta.get("owner_id"),
        })

    # 개별 삭제된 task (프로젝트 자체는 살아있는 경우)
    active_project_ids = {p.id for p in db.query(Project).filter(Project.archived_at.is_(None)).all()}
    tasks_out = []
    for t in archived_tasks:
        if t.project_id in active_project_ids:
            tasks_out.append({
                "id": t.id,
                "title": t.title,
                "project_id": t.project_id,
                "archived_at": iso(t.archived_at),
            })

    return {"projects": projects_out, "tasks": tasks_out}

def _purge_expired_trash(db: Session):
    """3일 지난 archived 항목 영구 삭제."""
    cutoff = datetime.now() - timedelta(days=3)
    state = load_state()
    changed = False

    # 프로젝트 영구 삭제
    expired_projects = db.query(Project).filter(
        Project.archived_at.isnot(None), Project.archived_at < cutoff
    ).all()
    for p in expired_projects:
        pid = p.id
        # 관련 task 영구 삭제
        db.query(TaskActivityModel).filter(
            TaskActivityModel.task_id.in_(
                db.query(Task.id).filter(Task.project_id == pid)
            )
        ).delete(synchronize_session=False)
        db.query(AttachmentModel).filter(
            AttachmentModel.task_id.in_(
                db.query(Task.id).filter(Task.project_id == pid)
            )
        ).delete(synchronize_session=False)
        db.query(Task).filter(Task.project_id == pid).delete(synchronize_session=False)
        db.query(SubProjectModel).filter(SubProjectModel.project_id == pid).delete()
        project_notes = db.query(NoteModel).filter(NoteModel.project_id == pid).all()
        for pn in project_notes:
            db.query(NoteMention).filter(NoteMention.note_id == pn.id).delete()
        db.query(NoteModel).filter(NoteModel.project_id == pid).delete()
        db.query(ProjectMemberModel).filter(ProjectMemberModel.project_id == pid).delete()

        # sidecar cleanup
        for key in ["sub_projects", "notes", "project_members", "join_requests"]:
            state[key] = [x for x in state.get(key, []) if int(x.get("project_id", 0)) != pid]
        for pf in [f for f in state.get("project_files", []) if int(f.get("project_id", 0)) == pid]:
            fp = os.path.join(UPLOAD_DIR, str(pid), pf.get("stored_name", ""))
            if os.path.exists(fp):
                try: os.remove(fp)
                except Exception: pass
        state["project_files"] = [f for f in state.get("project_files", []) if int(f.get("project_id", 0)) != pid]
        state.get("project_meta", {}).pop(str(pid), None)

        db.delete(p)
        changed = True

    # 개별 task 영구 삭제 (프로젝트는 살아있지만 task만 삭제된 경우)
    expired_tasks = db.query(Task).filter(
        Task.archived_at.isnot(None), Task.archived_at < cutoff
    ).all()
    for t in expired_tasks:
        db.query(TaskActivityModel).filter(TaskActivityModel.task_id == t.id).delete()
        db.query(AttachmentModel).filter(AttachmentModel.task_id == t.id).delete()
        db.delete(t)
        changed = True

    db.commit()
    if changed:
        save_state(state)


def _cleanup_empty_spaces(db: Session):
    """빈 공간(프로젝트 0개) 경고 및 자동 삭제.
    - 생성 후 7일 경과 + 프로젝트 0개 → warned_at 기록
    - warned_at 기록 후 7일(생성 후 총 14일) 경과 + 여전히 프로젝트 0개 → 삭제
    """
    now = datetime.utcnow()
    warn_cutoff = now - timedelta(days=7)   # 7일 전 생성된 공간
    delete_cutoff = now - timedelta(days=7)  # warned_at 기준 7일 경과

    active_spaces = db.query(Space).filter(Space.is_active == True, Space.slug != "general").all()
    for space in active_spaces:
        # 해당 공간에 속한 프로젝트 수 확인
        project_count = db.query(Project).filter(
            Project.space_id == space.id,
            Project.archived_at.is_(None),
        ).count()

        if project_count > 0:
            # 프로젝트가 있으면 경고 해제
            if space.warned_at is not None:
                space.warned_at = None
            continue

        # 프로젝트가 0개인 공간
        if space.created_at and space.created_at < warn_cutoff:
            if space.warned_at is None:
                # 7일 경과, 아직 경고 안 함 → 경고 기록
                space.warned_at = now
            elif space.warned_at < delete_cutoff:
                # 경고 후 7일 경과 → 삭제
                space.is_active = False
                db.query(SpaceMember).filter(SpaceMember.space_id == space.id).delete()

    db.commit()

# =========================
# Project Members / Join Requests (C-3: DB + sidecar fallback)
# =========================
@app.get("/api/projects/{project_id}/members")
def get_project_members(project_id: int, assignable_only: bool = False, db: Session = Depends(get_db)):
    state = load_state()
    members = get_members_for_project(state, project_id, db=db)
    users_map = {u.id: u for u in db.query(User).all()}

    enriched = []
    for m in members:
        uid = int(m.get("user_id"))
        u = users_map.get(uid)
        # assignable_only: viewer cannot be assigned to tasks
        if assignable_only and m.get("role") == "viewer":
            continue
        enriched.append({
            **m,
            "username": u.username if u else "Unknown",
            "avatar_color": (u.avatar_color if u else "#ccc"),
            "deptname": u.deptname if u else None,
            "mail": u.mail if u else None,
            "loginid": u.loginid if u else None,
        })
    return {"members": enriched}

@app.post("/api/projects/{project_id}/members")
def add_project_member(project_id: int, member: MemberAdd, db: Session = Depends(get_db)):
    state = load_state()

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    u = db.query(User).filter(User.id == member.user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    # C-3: Check DB for existing membership
    existing = db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == project_id,
        ProjectMemberModel.user_id == member.user_id,
    ).first()
    if existing:
        return {"message": "Already a member", "status": "exists"}

    meta = get_project_meta(state, project_id)
    if meta.get("require_approval", False):
        join_requests = state.get("join_requests", [])
        if any(
            int(jr.get("project_id")) == project_id and
            int(jr.get("user_id")) == member.user_id and
            jr.get("status") == "pending"
            for jr in join_requests
        ):
            raise HTTPException(status_code=400, detail="이미 참여 요청이 있습니다")

        new_request = {
            "id": next_id(join_requests),
            "project_id": project_id,
            "user_id": member.user_id,
            "role": member.role or "member",
            "status": "pending",
            "created_at": datetime.now().isoformat(),
        }
        join_requests.append(new_request)
        state["join_requests"] = join_requests
        save_state(state)
        return {"message": "참여 요청이 등록되었습니다. 관리자 승인 후 참여 가능합니다.", "status": "pending"}

    # C-3: Add to DB (denormalize loginid/deptname from user)
    pm = ProjectMemberModel(
        project_id=project_id,
        user_id=member.user_id,
        role=member.role or "member",
        loginid=u.loginid,
        deptname=getattr(u, "deptname", None),
    )
    db.add(pm)
    db.commit()
    # Also keep sidecar in sync for backward compat
    sidecar_members = state.get("project_members", [])
    already_in_sidecar = any(
        int(m.get("project_id")) == project_id and int(m.get("user_id")) == member.user_id
        for m in sidecar_members
    )
    if not already_in_sidecar:
        sidecar_members.append({"project_id": project_id, "user_id": member.user_id, "role": member.role or "member"})
        state["project_members"] = sidecar_members
        save_state(state)
    return {"message": "Member added"}

@app.patch("/api/projects/{project_id}/members/{target_user_id}/role")
def update_project_member_role(
    project_id: int, target_user_id: int,
    body: dict, user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """프로젝트 내 멤버 역할(manager/member) 변경. owner 또는 super_admin만 가능."""
    state = load_state()
    meta = get_project_meta(state, project_id)
    caller = db.query(User).filter(User.id == user_id).first()
    if not caller:
        raise HTTPException(status_code=403, detail="권한 없음")
    is_owner = int(meta.get("owner_id", 0)) == user_id
    is_sa = caller.role == "super_admin"
    # manager도 다른 멤버 역할 변경 가능
    caller_pm = db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == project_id,
        ProjectMemberModel.user_id == user_id,
    ).first()
    is_manager = caller_pm and caller_pm.role == "manager"
    if not (is_owner or is_sa or is_manager):
        raise HTTPException(status_code=403, detail="프로젝트 역할 변경 권한이 없습니다.")

    new_role = body.get("role", "member")
    if new_role not in ("member", "manager", "viewer"):
        raise HTTPException(status_code=400, detail="유효하지 않은 역할입니다.")

    pm = db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == project_id,
        ProjectMemberModel.user_id == target_user_id,
    ).first()
    if not pm:
        raise HTTPException(status_code=404, detail="프로젝트 멤버가 아닙니다.")
    if pm.role == "owner":
        raise HTTPException(status_code=400, detail="Owner 역할은 변경할 수 없습니다.")
    pm.role = new_role
    db.commit()
    return {"message": f"역할이 {new_role}로 변경되었습니다."}

@app.delete("/api/projects/{project_id}/members/{user_id}")
def remove_project_member(project_id: int, user_id: int, db: Session = Depends(get_db)):
    # C-3: Remove from DB
    db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == project_id,
        ProjectMemberModel.user_id == user_id,
    ).delete()
    db.commit()
    # Also remove from sidecar
    state = load_state()
    state["project_members"] = [
        m for m in state.get("project_members", [])
        if not (int(m.get("project_id")) == project_id and int(m.get("user_id")) == user_id)
    ]
    save_state(state)
    return {"message": "Member removed"}

@app.post("/api/projects/{project_id}/join-request")
def request_join(project_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    if any(int(m.get("project_id")) == project_id and int(m.get("user_id")) == user_id for m in state.get("project_members", [])):
        raise HTTPException(status_code=400, detail="이미 프로젝트 멤버입니다")

    join_requests = state.get("join_requests", [])
    if any(int(jr.get("project_id")) == project_id and int(jr.get("user_id")) == user_id and jr.get("status") == "pending" for jr in join_requests):
        raise HTTPException(status_code=400, detail="이미 참여 요청이 있습니다")

    new_request = {
        "id": next_id(join_requests),
        "project_id": project_id,
        "user_id": user_id,
        "role": "member",
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    }
    join_requests.append(new_request)
    state["join_requests"] = join_requests
    save_state(state)
    return {"message": "참여 요청이 등록되었습니다", "request": new_request}

@app.get("/api/projects/{project_id}/join-requests")
def get_join_requests(project_id: int, db: Session = Depends(get_db)):
    state = load_state()
    reqs = [jr.copy() for jr in state.get("join_requests", []) if int(jr.get("project_id")) == project_id]
    users_map = {u.id: u for u in db.query(User).all()}
    for jr in reqs:
        u = users_map.get(int(jr.get("user_id")))
        jr["username"] = u.username if u else "Unknown"
        jr["avatar_color"] = u.avatar_color if u else "#ccc"
    return {"join_requests": reqs}

@app.post("/api/projects/{project_id}/join-requests/approve")
def approve_join_request(project_id: int, body: MemberApproval):
    state = load_state()
    join_requests = state.get("join_requests", [])

    target = None
    for jr in join_requests:
        if int(jr.get("project_id")) == project_id and int(jr.get("user_id")) == body.user_id and jr.get("status") == "pending":
            target = jr
            break

    if not target:
        raise HTTPException(status_code=404, detail="참여 요청을 찾을 수 없습니다")

    if body.action == "approve":
        target["status"] = "approved"
        members = state.get("project_members", [])
        exists = any(int(m.get("project_id")) == project_id and int(m.get("user_id")) == body.user_id for m in members)
        if not exists:
            members.append({
                "project_id": project_id,
                "user_id": body.user_id,
                "role": target.get("role", "member"),
            })
        state["project_members"] = members
        state["join_requests"] = join_requests
        save_state(state)
        return {"message": "참여가 승인되었습니다"}

    elif body.action == "reject":
        target["status"] = "rejected"
        state["join_requests"] = join_requests
        save_state(state)
        return {"message": "참여가 거부되었습니다"}

    raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

# =========================
# Task Endpoints (DB + task_meta)
# =========================
@app.get("/api/tasks")
def get_tasks(
    project_id: Optional[int] = None,
    assignee_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _active: User = Depends(get_active_user),
):
    state = load_state()

    q = db.query(Task).filter(Task.archived_at.is_(None))
    if project_id:
        q = q.filter(Task.project_id == project_id)

    rows = q.all()
    tasks = [task_dict(t, state) for t in rows]

    if assignee_id:
        tasks = [t for t in tasks if assignee_id in (t.get("assignee_ids") or [])]

    # user 권한 기반 필터: 멤버인 프로젝트의 모든 task + public 프로젝트 task
    if user_id:
        user_project_ids = get_user_project_ids(db, state, user_id)
        public_pids = {
            p.id
            for p in db.query(Project).filter(Project.archived_at.is_(None)).all()
            if get_project_meta(state, p.id).get("visibility") == "public"
        }
        user_project_ids |= public_pids

        tasks = [
            t for t in tasks
            if t.get("project_id") in user_project_ids
        ]

    # Add attachment_count from DB
    task_ids = [t["id"] for t in tasks]
    if task_ids:
        att_counts = dict(
            db.query(AttachmentModel.task_id, func.count(AttachmentModel.id))
            .filter(AttachmentModel.task_id.in_(task_ids))
            .group_by(AttachmentModel.task_id)
            .all()
        )
        for t in tasks:
            t["attachment_count"] = att_counts.get(t["id"], 0)
    else:
        for t in tasks:
            t["attachment_count"] = 0

    return {"tasks": tasks}

@app.post("/api/tasks")
def create_task(task: TaskCreate, request: Request = None, db: Session = Depends(get_db)):
    state = load_state()

    p = db.query(Project).filter(Project.id == task.project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=400, detail="Project not found")

    # viewer cannot create tasks
    caller_id = resolve_user_id_from_token(request, db) if request else None
    if caller_id:
        check_task_edit_permission(db, state, task.project_id, caller_id)

    t = Task(
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority or "medium",
        start_date=task.start_date,
        due_date=task.due_date,
        assignee_ids=task.assignee_ids or [],
        tags=task.tags or [],
        archived_at=None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    set_task_meta(state, t.id, {
        "sub_project_id": task.sub_project_id,
        "progress": task.progress if task.progress is not None else 0,
    })
    save_state(state)

    return task_dict(t, state)

@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, updates: TaskUpdate, request: Request = None, db: Session = Depends(get_db)):
    state = load_state()
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    # viewer cannot update tasks
    caller_id = resolve_user_id_from_token(request, db) if request else None
    if caller_id:
        check_task_edit_permission(db, state, t.project_id, caller_id)

    data = updates.model_dump(exclude_unset=True)

    # DB fields
    for k in ["title", "description", "status", "priority", "start_date", "due_date", "assignee_ids", "tags", "remarks"]:
        if k in data:
            setattr(t, k, data[k])

    t.updated_at = datetime.now()

    # sidecar fields
    meta_updates = {}
    if "sub_project_id" in data:
        meta_updates["sub_project_id"] = data["sub_project_id"]
    if "progress" in data:
        meta_updates["progress"] = data["progress"]
    if meta_updates:
        set_task_meta(state, task_id, meta_updates)
        save_state(state)

    db.commit()
    db.refresh(t)
    return task_dict(t, state)

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, request: Request = None, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    # viewer cannot delete tasks
    caller_id = resolve_user_id_from_token(request, db) if request else None
    if caller_id:
        check_task_edit_permission(db, load_state(), t.project_id, caller_id)

    t.archived_at = datetime.now()
    db.commit()
    return {"message": "Task deleted"}

@app.post("/api/tasks/{task_id}/restore")
def restore_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    t.archived_at = None
    db.commit()
    return {"message": "Task restored"}

# =========================
# Task Attachments (URL attachment / sidecar)
# =========================
@app.get("/api/tasks/{task_id}/attachments")
def get_task_attachments(task_id: int):
    state = load_state()
    attachments = [a for a in state.get("attachments", []) if int(a.get("task_id")) == task_id]
    return {"attachments": attachments}

@app.post("/api/tasks/{task_id}/attachments")
def create_attachment(task_id: int, attachment: AttachmentCreate, db: Session = Depends(get_db)):
    state = load_state()

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    attachments = state.get("attachments", [])
    new_att = attachment.model_dump()
    new_att["id"] = next_id(attachments)
    new_att["task_id"] = task_id
    new_att["created_at"] = datetime.now().isoformat()

    attachments.append(new_att)
    state["attachments"] = attachments
    save_state(state)
    return new_att

@app.delete("/api/attachments/{attachment_id}")
def delete_attachment(attachment_id: int):
    state = load_state()
    # If it's a file attachment, delete the physical file too
    att = next((a for a in state.get("attachments", []) if int(a.get("id")) == attachment_id), None)
    if att and att.get("type") == "file" and att.get("stored_name"):
        task_id = att.get("task_id")
        if task_id:
            file_path = os.path.join(UPLOAD_DIR, f"tasks/{task_id}", att["stored_name"])
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
    state["attachments"] = [a for a in state.get("attachments", []) if int(a.get("id")) != attachment_id]
    save_state(state)
    return {"message": "Attachment deleted"}


@app.post("/api/tasks/{task_id}/files")
async def upload_task_file(
    task_id: int,
    file: UploadFile = FastAPIFile(...),
    user_id: int = Query(default=1),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """Upload a file attachment to a task."""
    state = load_state()
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    # Permission check: viewer cannot upload
    if user_id and user_id > 0:
        check_task_edit_permission(db, state, t.project_id, user_id)

    task_dir = os.path.join(UPLOAD_DIR, "tasks", str(task_id))
    os.makedirs(task_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(task_dir, stored_name)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    attachments = state.get("attachments", [])
    new_att = {
        "id": next_id(attachments),
        "task_id": task_id,
        "url": f"/api/tasks/{task_id}/files/{stored_name}/download",
        "filename": file.filename or stored_name,
        "stored_name": stored_name,
        "type": "file",
        "size": len(contents),
        "created_at": datetime.now().isoformat(),
    }
    attachments.append(new_att)
    state["attachments"] = attachments
    save_state(state)
    return new_att


@app.get("/api/tasks/{task_id}/files/{stored_name}/download")
def download_task_file(task_id: int, stored_name: str):
    """Download a file attachment from a task."""
    state = load_state()
    att = next(
        (a for a in state.get("attachments", [])
         if int(a.get("task_id")) == task_id and a.get("stored_name") == stored_name),
        None
    )
    if not att:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, "tasks", str(task_id), stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=file_path,
        filename=att.get("filename", stored_name),
        media_type="application/octet-stream",
    )

# =========================
# Project Files (실파일 업로드 / sidecar metadata)
# =========================
@app.get("/api/projects/{project_id}/files")
def get_project_files(project_id: int, user_id: Optional[int] = None, db: Session = Depends(get_db)):
    state = load_state()

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    if user_id:
        check_project_permission(db, state, project_id, user_id, "file_view")

    files = [f for f in state.get("project_files", []) if int(f.get("project_id")) == project_id]
    files.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"files": files}

@app.post("/api/projects/{project_id}/files")
async def upload_project_file(
    project_id: int,
    file: UploadFile = FastAPIFile(...),
    user_id: int = Query(default=1),
    db: Session = Depends(get_db),
):
    state = load_state()

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    project_dir = os.path.join(UPLOAD_DIR, str(project_id))
    os.makedirs(project_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(project_dir, stored_name)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    project_files = state.get("project_files", [])
    new_file = {
        "id": next_id(project_files),
        "project_id": project_id,
        "filename": file.filename or stored_name,
        "stored_name": stored_name,
        "size": len(contents),
        "uploader_id": user_id,
        "created_at": datetime.now().isoformat(),
    }
    project_files.append(new_file)
    state["project_files"] = project_files
    save_state(state)

    return new_file

@app.get("/api/projects/{project_id}/files/{file_id}/download")
def download_project_file(project_id: int, file_id: int, user_id: Optional[int] = None, db: Session = Depends(get_db)):
    state = load_state()

    if user_id:
        check_project_permission(db, state, project_id, user_id, "file_download")

    pf = next(
        (f for f in state.get("project_files", []) if int(f.get("id")) == file_id and int(f.get("project_id")) == project_id),
        None
    )
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, str(project_id), pf["stored_name"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=file_path,
        filename=pf["filename"],
        media_type="application/octet-stream",
    )

@app.delete("/api/projects/{project_id}/files/{file_id}")
def delete_project_file(project_id: int, file_id: int):
    state = load_state()
    project_files = state.get("project_files", [])

    pf = next((f for f in project_files if int(f.get("id")) == file_id and int(f.get("project_id")) == project_id), None)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = os.path.join(UPLOAD_DIR, str(project_id), pf["stored_name"])
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    state["project_files"] = [f for f in project_files if int(f.get("id")) != file_id]
    save_state(state)
    return {"message": "File deleted"}

# =========================
# List Order (B-1)
# =========================
@app.get("/api/projects/{project_id}/list/order")
def get_list_order(project_id: int):
    state = load_state()
    orders = state.get("list_orders", {})
    return {"order": orders.get(str(project_id), [])}

@app.get("/api/projects/{project_id}/list/all-orders")
def get_all_list_orders(project_id: int):
    """Return all order keys for a project (root tasks, subproject order, sp task orders)"""
    state = load_state()
    orders = state.get("list_orders", {})
    result = {
        "root": orders.get(str(project_id), []),
        "sp_order": orders.get(f"sp_{project_id}", []),
    }
    # Collect all sptask_* orders
    for key, val in orders.items():
        if key.startswith("sptask_"):
            result[key] = val
    return result

@app.put("/api/projects/{project_id}/list/order")
def save_list_order(project_id: int, body: ListOrderUpdate):
    state = load_state()
    if "list_orders" not in state:
        state["list_orders"] = {}
    state["list_orders"][str(project_id)] = body.order
    save_state(state)
    return {"message": "Order saved"}

@app.get("/api/projects/{project_id}/subprojects/order")
def get_subproject_order(project_id: int):
    state = load_state()
    orders = state.get("list_orders", {})
    return {"order": orders.get(f"sp_{project_id}", [])}

@app.put("/api/projects/{project_id}/subprojects/order")
def save_subproject_order(project_id: int, body: ListOrderUpdate):
    state = load_state()
    if "list_orders" not in state:
        state["list_orders"] = {}
    state["list_orders"][f"sp_{project_id}"] = body.order
    save_state(state)
    return {"message": "Subproject order saved"}

@app.get("/api/subprojects/{sub_id}/tasks/order")
def get_sp_task_order(sub_id: int):
    state = load_state()
    orders = state.get("list_orders", {})
    return {"order": orders.get(f"sptask_{sub_id}", [])}

@app.put("/api/subprojects/{sub_id}/tasks/order")
def save_sp_task_order(sub_id: int, body: ListOrderUpdate):
    state = load_state()
    if "list_orders" not in state:
        state["list_orders"] = {}
    state["list_orders"][f"sptask_{sub_id}"] = body.order
    save_state(state)
    return {"message": "SP task order saved"}

# =========================
# SubProjects (C-2: DB)
# =========================
def _subproject_dict(sp: SubProjectModel) -> dict:
    return {
        "id": sp.id,
        "project_id": sp.project_id,
        "name": sp.name,
        "description": sp.description,
        "parent_id": sp.parent_id,
        "created_at": iso(sp.created_at),
    }

@app.get("/api/projects/{project_id}/subprojects")
def get_subprojects(project_id: int, db: Session = Depends(get_db)):
    subs = db.query(SubProjectModel).filter(SubProjectModel.project_id == project_id).all()
    return {"sub_projects": [_subproject_dict(s) for s in subs]}

@app.post("/api/projects/{project_id}/subprojects")
def create_subproject(project_id: int, sub: SubProjectCreate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    new_sub = SubProjectModel(
        project_id=project_id,
        name=sub.name,
        description=sub.description,
        parent_id=sub.parent_id,
    )
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)
    return _subproject_dict(new_sub)

@app.patch("/api/subprojects/{sub_id}")
def update_subproject(sub_id: int, updates: SubProjectUpdate, db: Session = Depends(get_db)):
    sp = db.query(SubProjectModel).filter(SubProjectModel.id == sub_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="SubProject not found")

    data = updates.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(sp, k, v)
    db.commit()
    db.refresh(sp)
    return _subproject_dict(sp)

@app.delete("/api/subprojects/{sub_id}")
def delete_subproject(sub_id: int, db: Session = Depends(get_db)):
    sp = db.query(SubProjectModel).filter(SubProjectModel.id == sub_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="SubProject not found")

    # Unassign tasks from this subproject
    tasks = db.query(Task).filter(Task.sub_project_id == sub_id).all()
    for t in tasks:
        t.sub_project_id = None

    # Also clear sidecar task_meta references
    state = load_state()
    for key, meta in state.get("task_meta", {}).items():
        if meta.get("sub_project_id") == sub_id:
            meta["sub_project_id"] = None
    save_state(state)

    db.delete(sp)
    db.commit()
    return {"message": "SubProject deleted"}

# =========================
# Notes (C-5: DB + NoteMention)
# =========================
def _note_dict(n: NoteModel, mentioned_user_ids: List[int] = None) -> dict:
    return {
        "id": n.id,
        "project_id": n.project_id,
        "author_id": n.author_id,
        "content": n.content,
        "created_at": iso(n.created_at),
        "updated_at": iso(n.updated_at),
        "mentioned_user_ids": mentioned_user_ids or [],
    }

@app.get("/api/projects/{project_id}/notes")
def get_notes(project_id: int, user_id: Optional[int] = None, db: Session = Depends(get_db)):
    state = load_state()

    if user_id:
        check_project_access(db, state, project_id, user_id)

    # Auto-cleanup: delete notes older than 7 days
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=7)
    old_notes = db.query(NoteModel).filter(
        NoteModel.project_id == project_id,
        NoteModel.created_at < cutoff,
    ).all()
    if old_notes:
        old_ids = [n.id for n in old_notes]
        db.query(NoteMention).filter(NoteMention.note_id.in_(old_ids)).delete(synchronize_session=False)
        db.query(NoteModel).filter(NoteModel.id.in_(old_ids)).delete(synchronize_session=False)
        db.commit()
        # Also clean sidecar
        state = load_state()
        state["notes"] = [n for n in state.get("notes", []) if int(n.get("id")) not in set(old_ids)]
        save_state(state)

    db_notes = db.query(NoteModel).filter(NoteModel.project_id == project_id).order_by(NoteModel.created_at.desc()).all()

    users_map = {u.id: u for u in db.query(User).all()}
    result = []
    for n in db_notes:
        mentions = db.query(NoteMention).filter(NoteMention.note_id == n.id).all()
        d = _note_dict(n, [m.user_id for m in mentions])
        author = users_map.get(n.author_id or 0)
        d["author_name"] = author.username if author else "Unknown"
        d["author_color"] = author.avatar_color if author else "#ccc"
        result.append(d)

    # Also include legacy sidecar notes
    sidecar_notes = [nc.copy() for nc in state.get("notes", []) if int(nc.get("project_id")) == project_id]
    sidecar_ids = {n["id"] for n in result}
    for sn in sidecar_notes:
        if sn.get("id") not in sidecar_ids:
            author = users_map.get(int(sn.get("author_id", 0)))
            sn["author_name"] = author.username if author else "Unknown"
            sn["author_color"] = author.avatar_color if author else "#ccc"
            result.append(sn)

    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"notes": result}

@app.post("/api/projects/{project_id}/notes")
def create_note(project_id: int, note: NoteCreate, user_id: int = Query(default=1), db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    # C-5: Parse @mentions from content
    mentioned_user_ids = []
    mentioned_usernames = []
    mention_matches = re.findall(r'@(\S+)', note.content)
    if mention_matches:
        all_db_users = db.query(User).filter(User.is_active == True).all()
        for mention_text in mention_matches:
            mention_lower = mention_text.lower()
            for u in all_db_users:
                if (u.loginid and u.loginid.lower() == mention_lower) or \
                   (u.username and u.username.lower() == mention_lower):
                    if u.id not in mentioned_user_ids:
                        mentioned_user_ids.append(u.id)
                        mentioned_usernames.append(u.username or u.loginid)
                    break

    # C-5: Save note to DB
    new_note = NoteModel(
        project_id=project_id,
        author_id=user_id,
        content=note.content,
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    # C-5: Save mentions to DB
    for uid in mentioned_user_ids:
        mention = NoteMention(note_id=new_note.id, user_id=uid)
        db.add(mention)
    if mentioned_user_ids:
        db.commit()

    result = _note_dict(new_note, mentioned_user_ids)
    result["mentioned_usernames"] = mentioned_usernames

    # Also save to sidecar for backward compat
    state = load_state()
    sidecar_note = {
        "id": new_note.id,
        "project_id": project_id,
        "author_id": user_id,
        "content": note.content,
        "created_at": iso(new_note.created_at),
        "updated_at": iso(new_note.updated_at),
        "mentioned_user_ids": mentioned_user_ids,
        "mentioned_usernames": mentioned_usernames,
    }
    notes_list = state.get("notes", [])
    notes_list.append(sidecar_note)
    state["notes"] = notes_list
    save_state(state)

    return {**result, "message": "메모가 등록되었습니다"}

@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int, user_id: Optional[int] = None, db: Session = Depends(get_db)):
    note = db.query(NoteModel).filter(NoteModel.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Permission: only the author or project member can delete
    if user_id and note.author_id != user_id:
        state = load_state()
        try:
            check_project_access(db, state, note.project_id, user_id)
        except HTTPException:
            raise HTTPException(status_code=403, detail="삭제 권한이 없습니다")

    db.query(NoteMention).filter(NoteMention.note_id == note_id).delete()
    db.query(NoteModel).filter(NoteModel.id == note_id).delete()
    db.commit()
    # Also clean sidecar
    state = load_state()
    state["notes"] = [n for n in state.get("notes", []) if int(n.get("id")) != note_id]
    save_state(state)
    return {"message": "메시지가 삭제되었습니다"}

# =========================
# Mentions (C-5: DB + sidecar fallback)
# =========================
@app.get("/api/mentions")
def get_mentions(user_id: int = Query(...), db: Session = Depends(get_db)):
    """사용자가 멘션된 모든 notes를 반환"""
    state = load_state()

    current_user = db.query(User).filter(User.id == user_id).first()
    if not current_user:
        return {"mentions": []}

    current_username_lower = (current_user.username or "").lower()
    current_loginid_lower = (current_user.loginid or "").lower()

    users_map = {u.id: u for u in db.query(User).all()}
    projects_map = {}
    for p in db.query(Project).filter(Project.archived_at.is_(None)).all():
        projects_map[p.id] = p

    result = []
    seen_ids = set()

    # C-5: Check DB NoteMention first
    db_mentions = db.query(NoteMention).filter(NoteMention.user_id == user_id).all()
    for nm in db_mentions:
        note = db.query(NoteModel).filter(NoteModel.id == nm.note_id).first()
        if not note:
            continue
        seen_ids.add(note.id)
        all_mentions = db.query(NoteMention).filter(NoteMention.note_id == note.id).all()
        d = _note_dict(note, [m.user_id for m in all_mentions])
        author = users_map.get(note.author_id or 0)
        project = projects_map.get(note.project_id)
        d["author_name"] = author.username if author else "Unknown"
        d["author_color"] = author.avatar_color if author else "#ccc"
        d["project_name"] = project.name if project else "Unknown"
        result.append(d)

    # Fallback: sidecar notes
    all_notes = state.get("notes", [])
    for n in all_notes:
        if n.get("id") in seen_ids:
            continue

        mentioned_ids = n.get("mentioned_user_ids", [])
        mentioned_names = n.get("mentioned_usernames", [])

        is_mentioned = user_id in mentioned_ids

        if not is_mentioned and mentioned_names:
            for name in mentioned_names:
                if name.lower() == current_username_lower or name.lower() == current_loginid_lower:
                    is_mentioned = True
                    break

        if not is_mentioned and not mentioned_ids and not mentioned_names:
            content = n.get("content", "")
            mentions_in_content = re.findall(r'@(\S+)', content)
            for m in mentions_in_content:
                if m.lower() == current_username_lower or m.lower() == current_loginid_lower:
                    is_mentioned = True
                    break

        if is_mentioned:
            author = users_map.get(int(n.get("author_id", 0)))
            pid = int(n.get("project_id", 0))
            project = projects_map.get(pid)
            result.append({
                **n,
                "author_name": author.username if author else "Unknown",
                "author_color": author.avatar_color if author else "#ccc",
                "project_name": project.name if project else "Unknown",
            })

    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"mentions": result}

# =========================
# Roadmap APIs (DB tasks + sidecar sub_projects/task_meta)
# =========================
@app.get("/api/roadmap")
def get_roadmap(
    project_id: int = Query(...),
    view: str = Query(default="month"),
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    assignee_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    state = load_state()
    today_str = date.today().isoformat()

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    project = project_dict(p, state)
    sub_projects = get_subprojects_from_db(db, project_id)

    all_task_rows = db.query(Task).filter(Task.project_id == project_id, Task.archived_at.is_(None)).all()
    all_tasks = [task_dict(t, state) for t in all_task_rows]
    tasks = list(all_tasks)

    if assignee_id:
        tasks = [t for t in tasks if assignee_id in (t.get("assignee_ids") or [])]
    if status:
        tasks = [t for t in tasks if t.get("status") == status]
    if from_date:
        tasks = [
            t for t in tasks
            if (t.get("due_date") or "9999") >= from_date or (t.get("start_date") or "9999") >= from_date
        ]
    if to_date:
        tasks = [t for t in tasks if (t.get("start_date") or "0000") <= to_date]

    # 프로젝트 진행률
    active_tasks = [t for t in all_tasks if t.get("status") != "hold"]
    total = len(active_tasks)
    done = len([t for t in active_tasks if t.get("status") == "done"])
    if total > 0:
        progress_sum = sum(100 if t.get("status") == "done" else (t.get("progress", 0) or 0) for t in active_tasks)
        project_progress = round(progress_sum / total)
    else:
        project_progress = 0

    start_dates = [t["start_date"] for t in all_tasks if t.get("start_date")]
    due_dates = [t["due_date"] for t in all_tasks if t.get("due_date")]

    project_item = {
        "id": f"project-{project_id}",
        "type": "project",
        "name": project.get("name", ""),
        "start_date": min(start_dates) if start_dates else None,
        "due_date": max(due_dates) if due_dates else None,
        "status": "done" if project_progress == 100 and total > 0 else ("in_progress" if done > 0 else "todo"),
        "progress": project_progress,
        "overdue": bool(due_dates and max(due_dates) < today_str and project_progress < 100),
        "children": [],
    }

    for sp in sub_projects:
        sp_tasks_filtered = [t for t in tasks if t.get("sub_project_id") == sp["id"]]
        sp_all_tasks = [t for t in all_tasks if t.get("sub_project_id") == sp["id"]]

        sp_active = [t for t in sp_all_tasks if t.get("status") != "hold"]
        sp_total = len(sp_active)
        sp_done = len([t for t in sp_active if t.get("status") == "done"])
        if sp_total > 0:
            sp_progress_sum = sum(100 if t.get("status") == "done" else (t.get("progress", 0) or 0) for t in sp_active)
            sp_progress = round(sp_progress_sum / sp_total)
        else:
            sp_progress = 0

        sp_starts = [t["start_date"] for t in sp_all_tasks if t.get("start_date")]
        sp_dues = [t["due_date"] for t in sp_all_tasks if t.get("due_date")]

        sp_item = {
            "id": f"subproject-{sp['id']}",
            "type": "subproject",
            "name": sp.get("name", ""),
            "start_date": min(sp_starts) if sp_starts else None,
            "due_date": max(sp_dues) if sp_dues else None,
            "status": "done" if sp_progress == 100 and sp_total > 0 else ("in_progress" if sp_done > 0 else "todo"),
            "progress": sp_progress,
            "overdue": bool(sp_dues and max(sp_dues) < today_str and sp_progress < 100),
            "children": [],
        }

        for t in sp_tasks_filtered:
            t_overdue = bool(t.get("due_date") and t["due_date"] < today_str and t.get("status") != "done")
            sp_item["children"].append({
                "id": f"task-{t['id']}",
                "type": "task",
                "name": t.get("title", ""),
                "start_date": t.get("start_date"),
                "due_date": t.get("due_date"),
                "status": t.get("status", "todo"),
                "progress": t.get("progress", 0),
                "overdue": t_overdue,
                "assignee_ids": t.get("assignee_ids", []),
            })

        project_item["children"].append(sp_item)

    root_tasks = [t for t in tasks if not t.get("sub_project_id")]
    for t in root_tasks:
        t_overdue = bool(t.get("due_date") and t["due_date"] < today_str and t.get("status") != "done")
        project_item["children"].append({
            "id": f"task-{t['id']}",
            "type": "task",
            "name": t.get("title", ""),
            "start_date": t.get("start_date"),
            "due_date": t.get("due_date"),
            "status": t.get("status", "todo"),
            "progress": t.get("progress", 0),
            "overdue": t_overdue,
            "assignee_ids": t.get("assignee_ids", []),
        })

    return {
        "view": view,
        "from": from_date,
        "to": to_date,
        "items": [project_item],
    }

@app.get("/api/roadmap/global")
def get_global_roadmap(
    user_id: int = Query(...),
    view: str = Query(default="month"),
    space_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    state = load_state()
    today_str = date.today().isoformat()

    # 현재 공간 기준으로 프로젝트 필터링
    pq = db.query(Project).filter(Project.archived_at.is_(None))
    if space_id:
        pq = pq.filter(Project.space_id == space_id)
    rows = pq.all()
    all_projects = [project_dict(p, state) for p in rows]

    # 사용자가 멤버인 프로젝트만 표시 (admin이어도 멤버 기준)
    authorized_pids = get_user_project_ids(db, state, user_id)
    public_pids = {p["id"] for p in all_projects if p.get("visibility") == "public"}
    accessible = authorized_pids | public_pids
    projects = [p for p in all_projects if p["id"] in accessible]

    task_rows = db.query(Task).filter(Task.archived_at.is_(None)).all()
    all_tasks = [task_dict(t, state) for t in task_rows]
    all_sub_projects = get_subprojects_from_db(db)

    items = []

    for project in projects:
        pid = project["id"]
        p_tasks = [t for t in all_tasks if t.get("project_id") == pid]
        p_subs = [s for s in all_sub_projects if int(s.get("project_id")) == pid]

        active_tasks = [t for t in p_tasks if t.get("status") != "hold"]
        total = len(active_tasks)
        done = len([t for t in active_tasks if t.get("status") == "done"])
        if total > 0:
            progress_sum = sum(
                100 if t.get("status") == "done" else (t.get("progress", 0) or 0)
                for t in active_tasks
            )
            project_progress = round(progress_sum / total)
        else:
            project_progress = 0

        start_dates = [t["start_date"] for t in p_tasks if t.get("start_date")]
        due_dates = [t["due_date"] for t in p_tasks if t.get("due_date")]

        project_item = {
            "id": f"project-{pid}",
            "type": "project",
            "name": project.get("name", ""),
            "start_date": min(start_dates) if start_dates else None,
            "due_date": max(due_dates) if due_dates else None,
            "status": "done" if project_progress == 100 and total > 0 else ("in_progress" if done > 0 else "todo"),
            "progress": project_progress,
            "overdue": bool(due_dates and max(due_dates) < today_str and project_progress < 100),
            "children": [],
        }

        for sp in p_subs:
            sp_tasks = [t for t in p_tasks if t.get("sub_project_id") == sp["id"]]
            sp_active = [t for t in sp_tasks if t.get("status") != "hold"]
            sp_total = len(sp_active)
            sp_done = len([t for t in sp_active if t.get("status") == "done"])

            if sp_total > 0:
                sp_progress = round(
                    sum(100 if t.get("status") == "done" else (t.get("progress", 0) or 0) for t in sp_active) / sp_total
                )
            else:
                sp_progress = 0

            sp_starts = [t["start_date"] for t in sp_tasks if t.get("start_date")]
            sp_dues = [t["due_date"] for t in sp_tasks if t.get("due_date")]

            sp_item = {
                "id": f"subproject-{sp['id']}",
                "type": "subproject",
                "name": sp.get("name", ""),
                "start_date": min(sp_starts) if sp_starts else None,
                "due_date": max(sp_dues) if sp_dues else None,
                "status": "done" if sp_progress == 100 and sp_total > 0 else ("in_progress" if sp_done > 0 else "todo"),
                "progress": sp_progress,
                "overdue": bool(sp_dues and max(sp_dues) < today_str and sp_progress < 100),
                "children": [],
            }

            for t in sp_tasks:
                t_overdue = bool(t.get("due_date") and t["due_date"] < today_str and t.get("status") != "done")
                sp_item["children"].append({
                    "id": f"task-{t['id']}",
                    "type": "task",
                    "name": t.get("title", ""),
                    "start_date": t.get("start_date"),
                    "due_date": t.get("due_date"),
                    "status": t.get("status", "todo"),
                    "progress": t.get("progress", 0),
                    "overdue": t_overdue,
                    "assignee_ids": t.get("assignee_ids", []),
                })

            project_item["children"].append(sp_item)

        root_tasks = [t for t in p_tasks if not t.get("sub_project_id")]
        for t in root_tasks:
            t_overdue = bool(t.get("due_date") and t["due_date"] < today_str and t.get("status") != "done")
            project_item["children"].append({
                "id": f"task-{t['id']}",
                "type": "task",
                "name": t.get("title", ""),
                "start_date": t.get("start_date"),
                "due_date": t.get("due_date"),
                "status": t.get("status", "todo"),
                "progress": t.get("progress", 0),
                "overdue": t_overdue,
                "assignee_ids": t.get("assignee_ids", []),
            })

        items.append(project_item)

    return {"view": view, "items": items}

# =========================
# Dashboard Stats (DB + task_meta)
# =========================
@app.get("/api/stats")
def get_stats(user_id: Optional[int] = None, space_id: Optional[int] = None, db: Session = Depends(get_db)):
    state = load_state()

    pq = db.query(Project).filter(Project.archived_at.is_(None))
    if space_id:
        pq = pq.filter(Project.space_id == space_id)
    project_rows = pq.all()
    project_ids_in_scope = {p.id for p in project_rows}
    projects = [project_dict(p, state) for p in project_rows]

    tq = db.query(Task).filter(Task.archived_at.is_(None))
    if space_id:
        tq = tq.filter(Task.project_id.in_(project_ids_in_scope))
    all_task_rows = tq.all()
    tasks = [task_dict(t, state) for t in all_task_rows]

    # 권한 필터: 프로젝트 멤버(viewer 제외)인 경우만 표시
    if user_id:
        if is_admin_like_role(get_user_role(db, user_id)):
            # admin은 전체 접근
            pass
        else:
            # viewer가 아닌 멤버 역할의 프로젝트만 필터
            member_pids = set()
            db_memberships = db.query(ProjectMemberModel).filter(
                ProjectMemberModel.user_id == int(user_id),
                ProjectMemberModel.role != 'viewer'
            ).all()
            for m in db_memberships:
                member_pids.add(m.project_id)
            # sidecar fallback
            for m in state.get("project_members", []):
                if int(m.get("user_id")) == int(user_id) and m.get("role") != "viewer":
                    member_pids.add(int(m.get("project_id")))
            # owner
            for p in projects:
                meta = get_project_meta(state, p["id"])
                if int(meta.get("owner_id") or 0) == int(user_id):
                    member_pids.add(p["id"])
            tasks = [t for t in tasks if t.get("project_id") in member_pids]
            projects = [p for p in projects if p["id"] in member_pids]

    total = len(tasks)
    in_progress = len([t for t in tasks if t.get("status") == "in_progress"])
    done = len([t for t in tasks if t.get("status") == "done"])
    todo = len([t for t in tasks if t.get("status") == "todo"])
    hold = len([t for t in tasks if t.get("status") == "hold"])

    project_stats = []
    for p in projects:
        p_tasks = [t for t in tasks if t.get("project_id") == p["id"]]
        p_total = len(p_tasks)
        p_done = len([t for t in p_tasks if t.get("status") == "done"])
        progress = round((p_done / p_total * 100) if p_total > 0 else 0)
        project_stats.append({
            "id": p["id"],
            "name": p.get("name", ""),
            "total": p_total,
            "done": p_done,
            "in_progress": len([t for t in p_tasks if t.get("status") == "in_progress"]),
            "todo": len([t for t in p_tasks if t.get("status") == "todo"]),
            "progress": progress,
        })

    today_str = date.today().isoformat()

    overdue = [t for t in tasks if t.get("due_date") and t["due_date"] < today_str and t.get("status") != "done"]
    upcoming = [t for t in tasks if t.get("due_date") and t["due_date"] >= today_str and t.get("status") != "done"]
    if user_id:
        upcoming = [t for t in upcoming if user_id in (t.get("assignee_ids") or [])]
    upcoming.sort(key=lambda x: x.get("due_date", ""))

    my_tasks = []
    if user_id:
        my_tasks = [t for t in tasks if user_id in (t.get("assignee_ids") or [])]

    return {
        "total": total,
        "in_progress": in_progress,
        "done": done,
        "todo": todo,
        "hold": hold,
        "project_stats": project_stats,
        "all_tasks": tasks,
        "overdue": overdue[:10],
        "upcoming": upcoming[:10],
        "my_tasks": my_tasks,
    }

# =========================
# Task Activities (Checklist)
# =========================
@app.get("/api/tasks/{task_id}/activities")
def get_task_activities(task_id: int, db: Session = Depends(get_db)):
    activities = db.query(TaskActivityModel).filter(
        TaskActivityModel.task_id == task_id
    ).order_by(TaskActivityModel.order_index.asc(), TaskActivityModel.id.asc()).all()
    return {"activities": [
        {
            "id": a.id,
            "task_id": a.task_id,
            "block_type": a.block_type or "checkbox",
            "order_index": a.order_index,
            "content": a.content,
            "checked": a.checked,
            "checked_at": a.checked_at.isoformat() if a.checked_at else None,
            "style": a.style,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in activities
    ]}

@app.post("/api/tasks/{task_id}/activities")
def create_task_activity(task_id: int, body: dict = Body(...), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    max_order = db.query(func.max(TaskActivityModel.order_index)).filter(
        TaskActivityModel.task_id == task_id
    ).scalar() or 0
    insert_order = body.get("order_index")
    if insert_order is not None:
        # Shift existing items down to make room
        db.query(TaskActivityModel).filter(
            TaskActivityModel.task_id == task_id,
            TaskActivityModel.order_index >= insert_order,
        ).update({TaskActivityModel.order_index: TaskActivityModel.order_index + 1})
        db.flush()
    activity = TaskActivityModel(
        task_id=task_id,
        block_type=body.get("block_type", "checkbox"),
        order_index=insert_order if insert_order is not None else max_order + 1,
        content=body.get("content", ""),
        checked=body.get("checked", False),
        style=body.get("style"),
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    _sync_task_progress(db, task_id)
    return {
        "id": activity.id,
        "task_id": activity.task_id,
        "block_type": activity.block_type or "checkbox",
        "order_index": activity.order_index,
        "content": activity.content,
        "checked": activity.checked,
        "checked_at": activity.checked_at.isoformat() if activity.checked_at else None,
        "style": activity.style,
        "created_at": activity.created_at.isoformat() if activity.created_at else None,
    }

@app.patch("/api/activities/{activity_id}")
def update_task_activity(activity_id: int, body: dict = Body(...), db: Session = Depends(get_db)):
    activity = db.query(TaskActivityModel).filter(TaskActivityModel.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if "content" in body:
        activity.content = body["content"]
    if "block_type" in body:
        activity.block_type = body["block_type"]
    if "checked" in body:
        activity.checked = body["checked"]
        if body["checked"]:
            activity.checked_at = datetime.now(KST)
        else:
            activity.checked_at = None
    if "style" in body:
        activity.style = body["style"]
    if "order_index" in body:
        activity.order_index = body["order_index"]
    db.commit()
    db.refresh(activity)
    _sync_task_progress(db, activity.task_id)
    return {
        "id": activity.id,
        "task_id": activity.task_id,
        "block_type": activity.block_type or "checkbox",
        "order_index": activity.order_index,
        "content": activity.content,
        "checked": activity.checked,
        "checked_at": activity.checked_at.isoformat() if activity.checked_at else None,
        "style": activity.style,
    }

@app.put("/api/tasks/{task_id}/activities/reorder")
def reorder_task_activities(task_id: int, body: dict = Body(...), db: Session = Depends(get_db)):
    order = body.get("order", [])  # list of activity IDs in new order
    for idx, activity_id in enumerate(order):
        db.query(TaskActivityModel).filter(
            TaskActivityModel.id == activity_id,
            TaskActivityModel.task_id == task_id,
        ).update({"order_index": idx})
    db.commit()
    return {"ok": True}

@app.delete("/api/activities/{activity_id}")
def delete_task_activity(activity_id: int, db: Session = Depends(get_db)):
    activity = db.query(TaskActivityModel).filter(TaskActivityModel.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    task_id = activity.task_id
    db.delete(activity)
    db.commit()
    _sync_task_progress(db, task_id)
    return {"ok": True}

def _sync_task_progress(db: Session, task_id: int):
    """Recalculate task progress from checkbox activities only."""
    activities = db.query(TaskActivityModel).filter(TaskActivityModel.task_id == task_id).all()
    checkboxes = [a for a in activities if (a.block_type or "checkbox") == "checkbox"]
    if not checkboxes:
        return
    total = len(checkboxes)
    checked = sum(1 for a in checkboxes if a.checked)
    progress = round(checked / total * 100) if total > 0 else 0
    db.query(Task).filter(Task.id == task_id).update({"progress": progress})
    db.commit()
    # Also sync to sidecar task_meta
    state = load_state()
    set_task_meta(state, task_id, {"progress": progress})
    save_state(state)

# =========================
# Graph
# =========================
@app.get("/api/projects/{project_id}/graph")
def get_project_graph(project_id: int, db: Session = Depends(get_db)):
    state = load_state()

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    project = project_dict(p, state)
    nodes = []
    edges = []

    nodes.append({"id": f"project-{project_id}", "type": "project", "label": project["name"]})

    for sp in get_subprojects_from_db(db, project_id):
        sp_id = f"subproject-{sp['id']}"
        nodes.append({"id": sp_id, "type": "subproject", "label": sp.get("name", "")})
        edges.append({"source": f"project-{project_id}", "target": sp_id})

    task_rows = db.query(Task).filter(Task.project_id == project_id, Task.archived_at.is_(None)).all()
    tasks = [task_dict(t, state) for t in task_rows]

    for t in tasks:
        t_id = f"task-{t['id']}"
        nodes.append({"id": t_id, "type": "task", "label": t["title"], "status": t.get("status")})

        if t.get("sub_project_id"):
            edges.append({"source": f"subproject-{t['sub_project_id']}", "target": t_id})
        else:
            edges.append({"source": f"project-{project_id}", "target": t_id})

        # Attachments from DB
        db_attachments = db.query(AttachmentModel).filter(AttachmentModel.task_id == t["id"]).all()
        for a in db_attachments:
            a_id = f"attachment-{a.id}"
            nodes.append({
                "id": a_id,
                "type": "attachment",
                "label": a.filename or a.url or "",
                "attachment_type": a.type or "url",
                "url": a.url or "",
            })
            edges.append({"source": t_id, "target": a_id})

        # Fallback: sidecar attachments
        seen_att_ids = {a.id for a in db_attachments}
        for a in state.get("attachments", []):
            if int(a.get("task_id")) == t["id"] and a.get("id") not in seen_att_ids:
                a_id = f"attachment-{a['id']}"
                nodes.append({
                    "id": a_id,
                    "type": "attachment",
                    "label": a.get("filename") or a.get("url", ""),
                    "attachment_type": a.get("type", "url"),
                    "url": a.get("url", ""),
                })
                edges.append({"source": t_id, "target": a_id})

    # C-5: Notes from DB
    db_notes = db.query(NoteModel).filter(NoteModel.project_id == project_id).all()
    seen_note_ids = set()
    for n in db_notes:
        content = n.content or ""
        label = content[:30] + ("..." if len(content) > 30 else "")
        n_id = f"note-{n.id}"
        nodes.append({"id": n_id, "type": "note", "label": label})
        edges.append({"source": f"project-{project_id}", "target": n_id})
        seen_note_ids.add(n.id)

    # Fallback: sidecar notes
    for n in state.get("notes", []):
        if int(n.get("project_id")) == project_id and n.get("id") not in seen_note_ids:
            content = n.get("content", "")
            label = content[:30] + ("..." if len(content) > 30 else "")
            n_id = f"note-{n['id']}"
            nodes.append({"id": n_id, "type": "note", "label": label})
            edges.append({"source": f"project-{project_id}", "target": n_id})

    return {"nodes": nodes, "edges": edges}

# =========================
# AI LLM Helper
# =========================
def call_llm_api(api_url: str, model_name: str, system_prompt: str, user_prompt: str) -> str:
    return dsllm_chat(
        base_url=api_url,
        model_name=model_name,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.3,
        max_tokens=4096,
    )

# =========================
# AI Settings & Report Generation (sidecar + DB data)
# =========================
def get_or_create_ai_setting(db: Session) -> AiSetting:
    row = db.query(AiSetting).order_by(AiSetting.id.asc()).first()
    if not row:
        row = AiSetting(api_url="", model_name="", api_key=None)  # api_key는 이제 사용 안 함
        db.add(row)
        db.commit()
        db.refresh(row)
    return row

@app.get("/api/settings/ai/models")
def get_ai_models():
    return {"models": list_model_keys()}

@app.get("/api/settings/ai")
def get_ai_settings(db: Session = Depends(get_db)):
    row = get_or_create_ai_setting(db)
    return {"api_url": row.api_url or "", "model_name": row.model_name or ""}

@app.put("/api/settings/ai")
def save_ai_settings(body: AiSettingsUpdate, user_id: int = Query(...), db: Session = Depends(get_db)):
    require_super_admin(db, user_id)
    row = get_or_create_ai_setting(db)
    row.api_url = body.api_url.strip()
    row.model_name = body.model_name.strip()
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"message": "AI settings saved", "settings": {"api_url": row.api_url, "model_name": row.model_name}}

@app.post("/api/report/generate")
def generate_report(body: ReportRequest, db: Session = Depends(get_db)):
    # ✅ dsllm_chat 내부에서 requests를 쓰므로, 예외 매핑용으로만 import
    import requests

    # ✅ sidecar 데이터(sub_projects, notes 등)는 기존처럼 유지
    state = load_state()

    # ✅ DB에서 AI 설정(api_url, model_name) 읽기
    row = get_or_create_ai_setting(db)
    api_url = (row.api_url or "").strip()
    model_name = (row.model_name or "").strip()

    is_preset = model_name in MODEL_CONFIGS

    if not model_name:
        raise HTTPException(400, "AI settings not configured. Please set model name in Settings.")
    if (not api_url) and (not is_preset):
        raise HTTPException(400, "AI settings not configured. Please set API URL or choose a preset model.")

    # ✅ 프로젝트 로드
    p = db.query(Project).filter(Project.id == body.project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    project = project_dict(p, state)

    # ✅ 데이터 수집 (기존 그대로)
    task_rows = db.query(Task).filter(Task.project_id == body.project_id, Task.archived_at.is_(None)).all()
    tasks = [task_dict(t, state) for t in task_rows]

    sub_projects = get_subprojects_from_db(db, body.project_id)
    all_attachments = state.get("attachments", [])
    # DB 기준 멤버 (viewer 제외)
    db_members = db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == body.project_id,
        ProjectMemberModel.role != 'viewer'
    ).all()
    members = [{"user_id": m.user_id, "role": m.role, "project_id": m.project_id} for m in db_members]
    notes = [n for n in state.get("notes", []) if int(n.get("project_id")) == body.project_id]
    project_files = [f for f in state.get("project_files", []) if int(f.get("project_id")) == body.project_id]

    users_map = {u.id: user_dict(u, state) for u in db.query(User).all()}

    # ✅ 진행률 계산 (Hold 제외)
    active_tasks = [t for t in tasks if t.get("status") != "hold"]
    hold_tasks = [t for t in tasks if t.get("status") == "hold"]
    done_tasks = [t for t in tasks if t.get("status") == "done"]
    in_progress_tasks = [t for t in tasks if t.get("status") == "in_progress"]
    todo_tasks = [t for t in tasks if t.get("status") == "todo"]

    if len(active_tasks) > 0:
        progress_sum = sum(
            100 if t.get("status") == "done" else (t.get("progress", 0) or 0)
            for t in active_tasks
        )
        overall_progress = round(progress_sum / len(active_tasks), 1)
    else:
        overall_progress = 0.0

    # ✅ task details (작업노트 포함)
    task_details = []
    for t in tasks:
        assignees = [users_map.get(a, {}).get("username", f"User {a}") for a in (t.get("assignee_ids") or [])]
        sp_name = ""
        if t.get("sub_project_id"):
            sp = next((s for s in sub_projects if s["id"] == t["sub_project_id"]), None)
            sp_name = sp["name"] if sp else ""

        task_attachments = [a for a in all_attachments if int(a.get("task_id")) == t["id"]]

        # 작업노트(activity) 요약 정보
        activities = db.query(TaskActivityModel).filter(TaskActivityModel.task_id == t["id"]).order_by(TaskActivityModel.order_index).all()
        checkbox_activities = [a for a in activities if (a.block_type or "checkbox") == "checkbox"]
        checked_count = sum(1 for a in checkbox_activities if a.checked)
        total_checkboxes = len(checkbox_activities)
        activity_progress = round(checked_count / total_checkboxes * 100) if total_checkboxes > 0 else 0
        activity_summary = f"{total_checkboxes}개 항목 중 {checked_count}개 완료 ({activity_progress}%)" if total_checkboxes > 0 else ""

        task_details.append({
            "id": t["id"],
            "title": t.get("title", ""),
            "description": t.get("description", ""),
            "status": t.get("status", "todo"),
            "priority": t.get("priority", "medium"),
            "progress": t.get("progress", 0) or 0,
            "start_date": t.get("start_date"),
            "due_date": t.get("due_date"),
            "assignees": assignees,
            "sub_project": sp_name,
            "tags": t.get("tags", []),
            "attachments": [
                {
                    "id": a["id"],
                    "filename": a.get("filename", ""),
                    "url": a.get("url", ""),
                    "type": a.get("type", "url"),
                }
                for a in task_attachments
            ],
            "activity_summary": activity_summary,
        })

    # ✅ 멤버명 (viewer 제외, 담당자만)
    member_names = []
    for m in members:
        role = m.get("role", "member")
        if role == "viewer":
            continue
        uid = int(m.get("user_id"))
        u = users_map.get(uid)
        if u:
            member_names.append(f'{u["username"]} ({role})')

    status_breakdown = {
        "total": len(tasks),
        "active": len(active_tasks),
        "done": len(done_tasks),
        "in_progress": len(in_progress_tasks),
        "todo": len(todo_tasks),
        "hold": len(hold_tasks),
        "overall_progress": overall_progress,
    }

    structured = {
        "project": {
            "name": project.get("name", ""),
            "description": project.get("description", ""),
            "created_at": project.get("created_at", ""),
        },
        "status_breakdown": status_breakdown,
        "tasks": task_details,
        "sub_projects": [{"name": sp.get("name", ""), "description": sp.get("description", "")} for sp in sub_projects],
        "members": member_names,
        "project_files": [
            {"id": pf["id"], "filename": pf.get("filename", ""), "size": pf.get("size", 0), "created_at": pf.get("created_at", "")}
            for pf in project_files
        ],
    }

    # ✅ Prompt (기존 그대로)
    task_lines = []
    for t in task_details:
        att_info = ""
        if t["attachments"]:
            att_names = ", ".join([a["filename"] or a["url"] for a in t["attachments"]])
            att_info = f" | 첨부파일: {att_names}"
        note_info = f' | 작업노트: {t["activity_summary"]}' if t.get("activity_summary") else ""
        task_lines.append(
            f'- {t["title"]} | 상태: {t["status"]} | 우선순위: {t["priority"]} '
            f'| 진행률: {t["progress"]}% | 마감일: {t["due_date"] or "미정"} '
            f'| 담당자: {", ".join(t["assignees"]) if t["assignees"] else "미배정"}'
            f'| 설명: {t["description"] or "없음"}{att_info}{note_info}'
        )

    prompt = f"""당신은 전문 프로젝트 매니저 보조 AI입니다. 아래 프로젝트 데이터를 분석하여 종합 보고서를 작성해주세요.

## 프로젝트 정보
- 이름: {project["name"]}
- 설명: {project.get("description", "없음")}
- 생성일: {project.get("created_at", "N/A")}
- 팀원: {", ".join(member_names) if member_names else "미배정"}

## 진행 현황
- 전체 Task 수: {len(tasks)}개
- 활성 Task(Hold 제외): {len(active_tasks)}개
- 완료: {len(done_tasks)}개 | 진행 중: {len(in_progress_tasks)}개 | 대기: {len(todo_tasks)}개 | 보류: {len(hold_tasks)}개
- 전체 진행률(Hold 제외): {overall_progress}%

## Task 상세 목록
{chr(10).join(task_lines) if task_lines else "Task 없음"}

## 서브프로젝트
{chr(10).join([f'- {sp["name"]}: {sp.get("description", "")}' for sp in sub_projects]) if sub_projects else "없음"}

## 프로젝트 첨부파일
{chr(10).join([f'- {pf.get("filename", "")} (크기: {round(pf.get("size", 0)/1024, 1)}KB, 업로드일: {pf.get("created_at", "N/A")})' for pf in project_files]) if project_files else "첨부파일 없음"}

---
아래 4개 섹션으로 나눠서 분석 보고서를 작성해주세요. 마크다운 문법(#, **, -, ```)을 사용하지 마세요. 일반 텍스트로만 작성하세요.

[작성 스타일 가이드라인 - 매우 중요]
단순히 "1. 제목, 1) 내용" 같은 나열식(List) 구조로 작성하지 마세요.
보고서를 '이야기(서술)' 형식으로 작성하세요.
각 Task의 체크박스 항목(완료/미완료)과 텍스트 박스 내용(작업노트, 메모)은 서로 밀접하게 연관된 정보입니다.
이들을 분리하지 말고, 인과관계와 흐름이 보이도록 문장형으로 연결하세요.
예시: "A 작업을 수행하면서 B라는 특이사항이 발견되어 C 방식으로 처리하였다."
정돈되지 않은 작업 내용이라도, 프로젝트의 '과제(Task)'와 '성과' 관점으로 재해석하여 전문 보고서 느낌이 나도록 다듬으세요.
소제목과 설명 문단을 적절히 섞어서 가독성을 높이세요.

[섹션1: 프로젝트 개요]
프로젝트의 전체 목적을 한 문장으로 요약하고, 현재 전체 진행률과 상태를 서술하세요.
단순 수치 나열이 아니라, 프로젝트가 어느 단계에 와 있고 어떤 맥락인지 한 문단으로 설명하세요.

[섹션2: Task별 분석]
각 Task에 대해 현재 상태, 진행률, 그리고 현재까지 어떤 단계까지 진행되었는지를 설명하세요.
작업노트의 체크박스 항목과 텍스트 메모를 맥락적으로 통합하여, 해당 Task에서 무엇이 수행되었고 어떤 결과가 나왔는지를 하나의 흐름으로 서술하세요.
첨부 자료가 있는 경우, 해당 자료가 Task 진행에서 어떤 역할을 하는지도 설명하세요.

반드시 아래 형식 규칙을 지켜서 작성하세요:
- 각 Task의 첫 줄은 반드시 [Task: Task제목] 만 단독 줄로 출력하세요. 같은 줄에 다른 텍스트를 이어서 쓰지 마세요.
- 각 Task 블록 사이에는 반드시 빈 줄 1줄을 넣으세요.
- 하나의 Task 분석이 끝나면 줄바꿈 2번 후 다음 [Task: ...]를 시작하세요.

올바른 예시:
[Task: Data 확보]
이 작업은 현재 진행 중이며...
작업노트에 따르면...

[Task: 회의 대응]
이 작업은 1차 협업 회의를 통해...

잘못된 예시 (절대 이렇게 쓰지 마세요):
[Task: Data 확보] 이 작업은 현재 진행 중이며...
[Task: 회의 대응] 다음 작업은...

순서는 반드시 진행 중(in_progress) -> 대기(todo) -> 보류(hold) -> 완료(done) 순으로 작성하세요.
완료된 Task는 맨 마지막에 간략하게만 작성하세요.

[섹션3: 종합 현황 분석]
현재 프로젝트가 어떤 단계에 있는지를 서술형으로 정리하세요.
핵심 진행 작업, 완료 작업, 지연/보류 작업을 맥락적으로 연결하여 프로젝트 전체 흐름이 보이도록 작성하세요.
프로젝트에 첨부파일이 있으면, 어떤 파일이 포함되어 있는지 간략히 안내하세요.

[섹션4: 다음 단계 추천]
다음으로 가장 중요한 작업이 무엇인지, 어떤 순서로 진행하면 좋을지 제안하세요.
현재 진행 상황과 연계하여 왜 그 순서가 적절한지 맥락을 설명하세요.

각 섹션은 [섹션1], [섹션2] 등의 태그로 시작해주세요. 반드시 한국어로 작성하세요."""

    # ✅ DSLLM 호출 (ENV: CREDENTIAL_KEY_* / SYSTEM_NAME / USER_ID 를 dsllm_adapter가 사용)
    try:
        content = dsllm_chat(
            base_url=api_url,
            model_name=model_name,
            system_prompt=(
                "당신은 전문 프로젝트 매니저 보조 AI입니다. 반드시 한국어로 작성하세요. "
                "마크다운 문법(#, **, ```, 표)을 사용하지 마세요. "
                "단순 나열식 리스트가 아닌, 맥락이 연결된 서술형 보고서를 작성하세요. "
                "체크박스 항목과 작업노트 내용은 분리하지 말고, 인과관계와 흐름이 보이도록 문장형으로 연결하세요. "
                "정돈되지 않은 작업 내용이라도, 프로젝트의 과제와 성과 관점으로 재해석하여 전문 보고서 느낌이 나도록 다듬으세요."
            ),
            user_prompt=prompt,
            temperature=0.3,
            max_tokens=4096,
        )

        content = sanitize_llm_text(content)

        # ✅ 섹션 파싱 (기존 로직 유지)
        sections = {"overview": "", "task_analysis": "", "status_analysis": "", "next_steps": ""}
        current_section = ""
        for line in content.split("\n"):
            stripped = line.strip()
            if "[섹션1" in stripped:
                current_section = "overview"
                continue
            elif "[섹션2" in stripped:
                current_section = "task_analysis"
                continue
            elif "[섹션3" in stripped:
                current_section = "status_analysis"
                continue
            elif "[섹션4" in stripped:
                current_section = "next_steps"
                continue

            if current_section:
                sections[current_section] += line + "\n"

        if not any(sections.values()):
            sections["overview"] = content

        # ✅ Task 블록 정규화 (task_analysis만)
        if sections.get("task_analysis"):
            sections["task_analysis"] = normalize_task_blocks(sections["task_analysis"])

        # ✅ DB에 저장
        db_report = ProjectAiReport(
            project_id=body.project_id,
            overview=sections.get("overview", ""),
            task_analysis=sections.get("task_analysis", ""),
            status_analysis=sections.get("status_analysis", ""),
            next_steps=sections.get("next_steps", ""),
            raw_response=content,
            structured_snapshot=structured,
            model=model_name,
            created_at=datetime.utcnow(),
        )
        db.add(db_report)
        db.commit()
        db.refresh(db_report)

        return {
            "project_id": body.project_id,
            "report": content,
            "sections": sections,
            "structured": structured,
            "model": model_name,
            "updated_at": db_report.created_at.isoformat() if db_report.created_at else None,
        }

    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=502, detail=f"Cannot connect to DSLLM at {api_url}. Please check the API URL.")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="DSLLM request timed out.")
    except requests.exceptions.HTTPError as e:
        # DSLLM 응답이 4xx/5xx로 온 경우
        raise HTTPException(status_code=502, detail=f"DSLLM returned HTTP error: {str(e)}")
    except Exception as e:
        # 예: ENV 누락(RuntimeError), 파싱 실패 등
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

@app.get("/api/report/data/{project_id}")
def get_report_data(
    project_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    state = load_state()
    check_project_access(db, state, project_id, user_id)

    # DB에서 최신 보고서 조회
    row = (
        db.query(ProjectAiReport)
        .filter(ProjectAiReport.project_id == project_id)
        .order_by(ProjectAiReport.created_at.desc())
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Report not found. Please generate report first.")

    return {
        "project_id": row.project_id,
        "sections": {
            "overview": row.overview or "",
            "task_analysis": row.task_analysis or "",
            "status_analysis": row.status_analysis or "",
            "next_steps": row.next_steps or "",
        },
        "structured": row.structured_snapshot,
        "model": row.model or "",
        "updated_at": row.created_at.isoformat() if row.created_at else None,
    }


@app.delete("/api/report/data/{project_id}")
def delete_report_data(
    project_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    state = load_state()
    check_project_access(db, state, project_id, user_id)

    db.query(ProjectAiReport).filter(ProjectAiReport.project_id == project_id).delete()
    db.commit()

    return {"message": "Report deleted"}

# =========================
# AI Project Q&A
# =========================
# ═══════════════════════════════════════════════════════════════
# AI 자유 질문 - Structured Data Query + LLM Formatting
# ═══════════════════════════════════════════════════════════════

def _resolve_question_scope(query: str, task_details: list, today) -> dict:
    """질문 대상(scope) 판별: project / task / assignee / schedule / notes"""
    query_lower = query.lower().strip()

    _stopwords = {'의', '에', '는', '은', '을', '를', '이', '가', '과', '와', '도', '로', '으로',
                  '에서', '까지', '부터', '대해', '관해', '관련', '어떻게', '얼마나', '언제',
                  '현황', '상태', '진행', '알려줘', '보여줘', '뭐야', '뭔가요', '있어', '없어',
                  '해줘', '할', '한', '하는', '된', '되는', '좀', '다', '그', '저', '이', '것'}

    # 1) Task 이름 매칭
    query_matched_tasks = []
    for t in task_details:
        title = (t.get("title") or "").strip()
        if not title:
            continue
        title_lower = title.lower()
        if title_lower in query_lower or title in query:
            query_matched_tasks.append(t)
            continue
        query_words = [w for w in query_lower.split() if len(w) >= 2 and w not in _stopwords]
        if query_words and any(w in title_lower for w in query_words):
            query_matched_tasks.append(t)

    # 2) 기간 매칭
    window = _parse_time_window_from_query(query, today)

    # 3) 전체 현황 키워드
    is_full_overview = any(kw in query_lower for kw in [
        "전체 현황", "프로젝트 현황", "전체 요약", "전체 상태", "전체 진행",
        "프로젝트 상태", "프로젝트 진행", "프로젝트 요약", "전반적",
    ])

    # 4) 담당자 관련 키워드
    is_assignee_query = any(kw in query_lower for kw in [
        "담당자", "담당", "누가", "맡고", "배정", "할당",
    ])

    # scope 결정
    if query_matched_tasks:
        scope_type = "task"
    elif window:
        scope_type = "schedule"
    elif is_full_overview:
        scope_type = "project"
    elif is_assignee_query:
        scope_type = "assignee"
    else:
        scope_type = "general"

    return {
        "scope_type": scope_type,
        "matched_tasks": query_matched_tasks,
        "window": window,
        "is_full_overview": is_full_overview,
        "is_assignee_query": is_assignee_query,
        "query_lower": query_lower,
    }


def _fetch_project_context(db, project, sub_projects, members, users_map, task_details, project_notes):
    """프로젝트 수준 컨텍스트: 프로젝트 전체 정보 수집"""
    member_lines = []
    for m in members:
        role = m.get("role", "member")
        if role == "viewer":
            continue
        uid = int(m.get("user_id"))
        u = users_map.get(uid)
        if u:
            dept = u.get("deptname", "") or ""
            dept_str = f" ({dept})" if dept else ""
            member_lines.append(f"  - {u['username']}{dept_str} [{role}]")

    sp_lines = []
    for sp in sub_projects:
        sp_name = sp.get("name", "")
        sp_desc = sp.get("description", "")
        sp_tasks = [t for t in task_details if t.get("sub_project") == sp_name]
        done_count = sum(1 for t in sp_tasks if t.get("status") == "done")
        sp_lines.append(f"  - {sp_name}: {len(sp_tasks)}개 task ({done_count}개 완료)")
        if sp_desc:
            sp_lines.append(f"    설명: {sp_desc}")

    note_lines = []
    for n in project_notes[:10]:
        author = n.get("author_name", "")
        content = (n.get("content", "") or "")[:300]
        created = n.get("created_at", "")[:10] if n.get("created_at") else ""
        note_lines.append(f"  - [{created}] {author}: {content}")

    # Task 요약 (전체 현황용)
    total = len(task_details)
    done = sum(1 for t in task_details if t.get("status") == "done")
    in_prog = sum(1 for t in task_details if t.get("status") == "in_progress")
    todo = sum(1 for t in task_details if t.get("status") == "todo")
    hold = sum(1 for t in task_details if t.get("status") == "hold")

    ctx = f"""[프로젝트 정보]
프로젝트명: {project.name}
설명: {project.description or "없음"}
전체 Task: {total}개 (완료 {done}, 진행중 {in_prog}, 대기 {todo}, 보류 {hold})

[팀원 ({len(member_lines)}명)]
{chr(10).join(member_lines) if member_lines else "  없음"}
"""
    if sp_lines:
        ctx += f"\n[서브프로젝트]\n{chr(10).join(sp_lines)}\n"
    if note_lines:
        ctx += f"\n[프로젝트 노트 (최근 10개)]\n{chr(10).join(note_lines)}\n"
    return ctx


def _fetch_task_context_detail(t: dict, users_map: dict, db, include_full_text=True) -> str:
    """개별 Task 상세 컨텍스트 (자유 질문용 - 풍부한 텍스트 포함)"""
    lines = []
    lines.append(f"[Task: {t['title']}]")
    lines.append(f"  상태: {t['status']}")
    lines.append(f"  우선순위: {t['priority']}")
    lines.append(f"  진행률: {t['progress']}%")
    lines.append(f"  시작일: {t.get('start_date') or '미정'}")
    lines.append(f"  마감일: {t.get('due_date') or '미정'}")

    # 담당자 (assignee 기준)
    if t.get("assignees"):
        lines.append(f"  담당자: {', '.join(t['assignees'])}")
    else:
        lines.append(f"  담당자: 미배정")

    # 서브프로젝트
    if t.get("sub_project"):
        lines.append(f"  서브프로젝트: {t['sub_project']}")

    # 태그
    if t.get("tags"):
        lines.append(f"  태그: {', '.join(t['tags'])}")

    # 설명 (description) - 전문 포함
    desc = (t.get("description") or "").strip()
    if desc:
        if include_full_text:
            lines.append(f"  설명:\n    {desc}")
        else:
            lines.append(f"  설명: {desc[:200]}{'...' if len(desc) > 200 else ''}")

    # 작업노트 (activity) - 전문 포함
    activity_items = t.get("activity_items", [])
    if activity_items:
        total_cb = t.get("activity_total", 0)
        checked_cb = t.get("activity_checked", 0)
        lines.append(f"  작업노트: 체크리스트 {total_cb}개 중 {checked_cb}개 완료")
        cb_idx = 0
        for item in activity_items:
            if item["type"] == "checkbox":
                cb_idx += 1
                mark = "완료" if item["checked"] else "미완료"
                content = (item.get("content") or "").strip()
                # HTML 태그 제거 (간단)
                import re
                content = re.sub(r'<[^>]+>', '', content)
                lines.append(f"    {cb_idx}. {content} ({mark})")
            else:
                content = (item.get("content") or "").strip()
                if content:
                    import re
                    content = re.sub(r'<[^>]+>', '', content)
                    if include_full_text:
                        lines.append(f"    (메모) {content}")
                    else:
                        lines.append(f"    (메모) {content[:200]}{'...' if len(content) > 200 else ''}")

    # 첨부파일/URL
    attachments = t.get("attachments", [])
    if attachments:
        lines.append(f"  첨부/참조자료:")
        for a in attachments:
            fname = a.get("filename") or a.get("url", "")
            url = a.get("url", "")
            if url:
                lines.append(f"    - {fname}: {url}")
            else:
                lines.append(f"    - {fname}")

    return "\n".join(lines)


def _build_ai_free_question_context(
    scope: dict, db, project, sub_projects, members, users_map,
    task_details, project_notes, today
) -> tuple:
    """질문 scope에 따라 컨텍스트 문자열, scope_hint, prompt_tasks, context_members 생성"""
    import re
    scope_type = scope["scope_type"]
    matched_tasks = scope["matched_tasks"]
    window = scope["window"]
    is_full_overview = scope["is_full_overview"]
    ws = we = None

    # ── scope별 prompt_tasks / context 결정 ──
    if scope_type == "task" and matched_tasks:
        prompt_tasks = matched_tasks
        scope_hint = (
            f"\n[범위 제약]\n"
            f"사용자가 특정 Task({', '.join(t['title'] for t in matched_tasks)})에 대해 질문했습니다.\n"
            f"해당 Task 중심으로만 상세하게 답변하세요. 다른 Task는 언급하지 마세요.\n"
            f"제목만 말하지 말고, 아래 컨텍스트에 포함된 설명/작업노트/메모/일정/담당자/참조자료를 최대한 활용해서 풍부하게 설명하세요.\n"
        )
        # Task 질문: 해당 task assignees만
        task_assignee_ids = set()
        for t in matched_tasks:
            for aid in (t.get("assignee_ids") or []):
                task_assignee_ids.add(int(aid))
        if task_assignee_ids:
            context_members = []
            for uid in task_assignee_ids:
                u = users_map.get(uid)
                if u:
                    dept = u.get("deptname", "") or ""
                    dept_str = f" ({dept})" if dept else ""
                    context_members.append(f"{u['username']}{dept_str}")
        else:
            context_members = ["미배정"]

        # 상세 컨텍스트 빌드
        task_ctx_lines = []
        for t in matched_tasks:
            task_ctx_lines.append(_fetch_task_context_detail(t, users_map, db, include_full_text=True))

        context_str = f"""프로젝트명: {project.name}
프로젝트 설명: {project.description or "없음"}

[질문 대상 Task 상세 정보]
{chr(10).join(task_ctx_lines)}

[담당자]
{', '.join(context_members)}
"""

    elif scope_type == "schedule" and window:
        ws, we = window
        filtered_by_time = [t for t in task_details if _task_overlaps_window(t, ws, we)]
        prompt_tasks = filtered_by_time
        scope_hint = (
            f"\n[기간 제약]\n"
            f"사용자 질문이 요청한 기간은 {ws.isoformat()} ~ {(we - timedelta(days=1)).isoformat()} 입니다.\n"
            f"이 기간에 해당하는 Task만 관련 Task로 다루고, 기간 밖 Task는 절대 언급하지 마세요.\n"
            f"각 Task의 설명/작업노트/일정/담당자를 상세하게 답변하세요.\n"
        )
        # 기간 질문: project members
        context_members = _get_project_member_names(members, users_map)

        task_ctx_lines = []
        for t in filtered_by_time[:30]:
            task_ctx_lines.append(_fetch_task_context_detail(t, users_map, db, include_full_text=True))

        proj_ctx = _fetch_project_context(db, project, sub_projects, members, users_map, task_details, project_notes)
        context_str = f"""{proj_ctx}

[기간 내 Task 상세 정보 ({ws.isoformat()} ~ {(we - timedelta(days=1)).isoformat()})]
{chr(10).join(task_ctx_lines) if task_ctx_lines else "해당 기간에 Task 없음"}
"""

    elif scope_type == "project" or is_full_overview:
        prompt_tasks = task_details
        scope_hint = (
            "\n[범위]\n"
            "사용자가 프로젝트 전체 현황을 요청했습니다.\n"
            "핵심 항목(진행 중, 임박, 지연)을 중심으로 요약하되, 각 주요 Task에 대해서는 설명/작업내용도 간략히 포함하세요.\n"
        )
        context_members = _get_project_member_names(members, users_map)

        proj_ctx = _fetch_project_context(db, project, sub_projects, members, users_map, task_details, project_notes)

        # 전체 현황: 모든 task를 간략 상세로
        task_ctx_lines = []
        for t in task_details[:40]:
            task_ctx_lines.append(_fetch_task_context_detail(t, users_map, db, include_full_text=False))

        context_str = f"""{proj_ctx}

[전체 Task 상세]
{chr(10).join(task_ctx_lines) if task_ctx_lines else "Task 없음"}
"""

    elif scope_type == "assignee":
        prompt_tasks = task_details
        scope_hint = (
            "\n[범위]\n"
            "사용자가 담당자 관련 질문을 했습니다.\n"
            "질문에서 언급된 담당자와 관련된 Task만 선별해서 답변하세요.\n"
            "각 Task의 담당자는 task.assignee 기준으로 판단하세요.\n"
        )
        context_members = _get_project_member_names(members, users_map)

        task_ctx_lines = []
        for t in task_details[:40]:
            task_ctx_lines.append(_fetch_task_context_detail(t, users_map, db, include_full_text=False))

        proj_ctx = _fetch_project_context(db, project, sub_projects, members, users_map, task_details, project_notes)
        context_str = f"""{proj_ctx}

[전체 Task 상세 (담당자 포함)]
{chr(10).join(task_ctx_lines) if task_ctx_lines else "Task 없음"}
"""

    else:
        # general: 질문과 관련된 Task를 선별
        prompt_tasks = task_details
        scope_hint = (
            "\n[범위]\n"
            "질문과 관련된 Task만 선별해서 답변하세요. 전체 Task를 나열하지 마세요.\n"
            "답변할 때 관련 Task의 설명/작업노트/메모/일정/담당자를 최대한 활용해서 상세하게 설명하세요.\n"
        )
        context_members = _get_project_member_names(members, users_map)

        proj_ctx = _fetch_project_context(db, project, sub_projects, members, users_map, task_details, project_notes)

        task_ctx_lines = []
        for t in task_details[:40]:
            task_ctx_lines.append(_fetch_task_context_detail(t, users_map, db, include_full_text=True))

        context_str = f"""{proj_ctx}

[전체 Task 상세]
{chr(10).join(task_ctx_lines) if task_ctx_lines else "Task 없음"}
"""

    return context_str, scope_hint, prompt_tasks, context_members, ws, we


def _get_project_member_names(members: list, users_map: dict) -> list:
    """프로젝트 멤버 이름 목록 (viewer 제외)"""
    names = []
    for m in members:
        role = m.get("role", "member")
        if role == "viewer":
            continue
        uid = int(m.get("user_id"))
        u = users_map.get(uid)
        if u:
            names.append(f'{u["username"]} ({role})')
    return names


@app.post("/api/projects/{project_id}/ai-query")
def generate_project_ai_query(
    project_id: int,
    req: ProjectAiQueryRequest,
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    import requests
    import re

    state = load_state()
    check_project_access(db, state, project_id, user_id)

    row = get_or_create_ai_setting(db)
    api_url = (row.api_url or "").strip()
    model_name = (row.model_name or "").strip()

    is_preset = model_name in MODEL_CONFIGS

    if not model_name:
        raise HTTPException(400, "AI settings not configured. Please set model name in Settings.")
    if (not api_url) and (not is_preset):
        raise HTTPException(400, "AI settings not configured. Please set API URL or choose a preset model.")

    p = db.query(Project).filter(Project.id == project_id, Project.archived_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    # ── 1. 전체 데이터 수집 ──
    task_rows = db.query(Task).filter(Task.project_id == project_id, Task.archived_at.is_(None)).all()
    tasks = [task_dict(t, state) for t in task_rows]

    db_members = db.query(ProjectMemberModel).filter(
        ProjectMemberModel.project_id == project_id,
        ProjectMemberModel.role != 'viewer'
    ).all()
    members = [{"user_id": m.user_id, "role": m.role, "project_id": m.project_id} for m in db_members]
    sub_projects = get_subprojects_from_db(db, project_id)

    users_map = {u.id: user_dict(u, state) for u in db.query(User).all()}

    # Task 상세 수집 (assignee_ids 포함)
    task_details = []
    for t in tasks:
        assignee_ids_raw = t.get("assignee_ids") or []
        assignees = [users_map.get(a, {}).get("username", f"User {a}") for a in assignee_ids_raw]

        sp_name = ""
        if t.get("sub_project_id"):
            sp = next((s for s in sub_projects if int(s["id"]) == int(t["sub_project_id"])), None)
            sp_name = sp["name"] if sp else ""

        # DB 기반 첨부파일 조회
        db_attachments = db.query(AttachmentModel).filter(AttachmentModel.task_id == int(t["id"])).all()
        task_attachments = [
            {"id": a.id, "filename": a.filename or "", "url": a.url or "", "type": a.type or "url"}
            for a in db_attachments
        ]

        # 작업노트(activity) 상세 정보
        activities = db.query(TaskActivityModel).filter(
            TaskActivityModel.task_id == int(t["id"])
        ).order_by(TaskActivityModel.order_index).all()
        activity_items = []
        for act in activities:
            block_type = act.block_type or "checkbox"
            if block_type == "checkbox":
                activity_items.append({"type": "checkbox", "content": act.content or "", "checked": bool(act.checked)})
            else:
                activity_items.append({"type": "text", "content": act.content or ""})
        checkbox_acts = [a for a in activity_items if a["type"] == "checkbox"]
        checked_count = sum(1 for a in checkbox_acts if a["checked"])
        total_checkboxes = len(checkbox_acts)

        task_details.append({
            "id": int(t["id"]),
            "title": t.get("title", "") or "",
            "description": t.get("description", "") or "",
            "status": t.get("status", "todo") or "todo",
            "priority": t.get("priority", "medium") or "medium",
            "progress": t.get("progress", 0) or 0,
            "start_date": t.get("start_date"),
            "due_date": t.get("due_date"),
            "assignee_ids": assignee_ids_raw,
            "assignees": assignees or [],
            "sub_project": sp_name or "",
            "tags": t.get("tags", []) or [],
            "attachments": task_attachments,
            "activity_items": activity_items,
            "activity_checked": checked_count,
            "activity_total": total_checkboxes,
        })

    # 프로젝트 노트 수집
    db_notes = db.query(NoteModel).filter(NoteModel.project_id == project_id).order_by(NoteModel.created_at.desc()).all()
    project_notes = []
    for n in db_notes:
        author = users_map.get(n.author_id)
        project_notes.append({
            "id": n.id,
            "content": n.content or "",
            "author_name": author["username"] if author else "",
            "created_at": n.created_at.isoformat() if n.created_at else "",
        })

    # ── 2. 질문 scope 판별 ──
    today = _today_kst()
    scope = _resolve_question_scope(req.query, task_details, today)

    # ── 3. scope별 컨텍스트 빌드 ──
    context_str, scope_hint, prompt_tasks, context_members, ws, we = _build_ai_free_question_context(
        scope, db, p, sub_projects, members, users_map, task_details, project_notes, today
    )

    # ── 4. LLM 프롬프트 구성 ──
    is_task_scope = scope["scope_type"] == "task" and scope["matched_tasks"]

    if is_task_scope:
        detail_instruction = (
            "이 질문은 특정 Task에 대한 질문입니다.\n"
            "제목만 말하지 말고, 컨텍스트에 있는 설명/작업노트/메모/일정/담당자/참조자료를 모두 활용해서 최대한 상세하게 답변하세요.\n"
            "사용자가 작성해둔 텍스트(설명, 작업노트, 메모)가 있으면 그 내용을 그대로 활용해서 풍부하게 설명하세요.\n"
        )
    else:
        detail_instruction = (
            "컨텍스트에 있는 설명/작업노트/메모/일정/담당자 정보를 활용해서 답변하세요.\n"
            "제목만 나열하지 말고, 관련 상세 내용을 함께 설명하세요.\n"
        )

    prompt = f"""당신은 전문 프로젝트 매니저 보조 AI입니다.
아래 컨텍스트를 바탕으로 사용자의 질문에 답변해주세요.
{scope_hint}
[핵심 원칙]
- 질문 범위를 먼저 파악하고, 그 범위 안에서만 답변하세요.
- 전체 Task 나열은 금지입니다. 질문과 관련된 Task만 선별하세요.
- {detail_instruction}
- 특정 Task 질문이면 해당 Task의 상태/일정/담당자/작업노트/설명/첨부자료를 중심으로 답변하세요.
- Task 질문일 때 담당자는 해당 Task의 assignee만 언급하세요. 프로젝트 전체 팀원을 보여주지 마세요.

[컨텍스트]
{context_str}

[질문]
{req.query}

[출력 규칙]
- 반드시 4개 섹션을 순서대로 작성
- 각 섹션 태그는 반드시 '단독 줄'로 출력 (예: [섹션1: 한줄요약])
- 섹션 내용은 줄바꿈으로 구분 (가급적 '한 줄 = 한 문장')
- 문장은 중간에 끊지 말고 반드시 마침표(또는 '다.')로 끝내기
- 마크다운 금지: #, **, ```, 표(|---|) 금지
- 작업이나 항목을 나열할 때는 반드시 숫자 번호(1. 2. 3.)를 사용하세요.
- 절대 "첫 번째", "두 번째" 같은 서수 표현을 사용하지 마세요.

[섹션1: 한줄요약]
결론을 한 문장으로만 작성.

[섹션2: 상세설명]
질문 대상에 대한 상세 정보를 아래 항목별로 구분해서 작성하세요.
각 항목은 "항목명:" 형식으로 시작하고, 해당 내용이 없으면 그 항목을 생략하세요.
텍스트를 그냥 이어붙이지 말고, 항목별로 명확히 나눠서 작성하세요.

과제: 질문 대상이 되는 Task명만 간결하게 작성하세요. 불필요하게 긴 설명을 붙이지 마세요.
기간: 시작일 ~ 마감일 정보.
담당자: 해당 Task의 assignee 또는 프로젝트 팀원 (질문 범위에 맞게).
작업노트: 사용자가 작성한 작업 내용, 메모를 충분히 반영. 각 항목을 개별적으로 나열하되, 쉼표(,)로 이어붙이지 말고 각 항목을 별도 줄에 작성하세요.
완료 항목: 완료된 체크리스트 항목들. 각 항목을 별도 줄에 하나씩 작성하세요. 쉼표(,)로 이어붙이지 마세요.
미완료 항목: 아직 완료되지 않은 체크리스트 항목들. 각 항목을 별도 줄에 하나씩 작성하세요. 쉼표(,)로 이어붙이지 마세요.
참고자료: 연결된 URL, 첨부파일, 참조 정보. 각 항목을 별도 줄에 작성하세요.
주의사항: 리스크, 지연, 주의해야 할 사항. 각 항목을 별도 줄에 작성하세요.

컨텍스트에 없는 정보는 추측하지 말고 해당 항목을 생략하세요.

[섹션3: 핵심 일정]
질문과 직접 관련된 Task만 최대 8개.
각 Task를 아래 형식으로 작성 (슬래시(/) 구분자를 쓰지 마세요):
Task명: OOO
담당자: OOO (해당 Task의 assignee만 표시)
진행률: OO%
일정: YYYY-MM-DD ~ YYYY-MM-DD (시작일이나 마감일이 없으면 "미정"으로 표시)
상태: 진행 중/대기/보류/완료
세부 작업이 있으면 번호를 매겨서 표시:
1. 항목명 (완료)
2. 항목명 (미완료)
Task 간에는 빈 줄로 구분하세요.
없으면 "없음" 한 줄.

[섹션4: 다음 액션]
다음 액션 3~6개.
각 액션은 번호를 매겨서 한 줄씩 작성. 예) 1. 액션 내용
"""

    system_prompt = """
당신은 전문 프로젝트 매니저 보조 AI입니다.
반드시 한국어로 답변하세요.
마크다운(##, **, 표, 코드블록)을 절대 사용하지 마세요.
각 섹션 태그([섹션1], [섹션2], [섹션3], [섹션4])는 반드시 단독 줄로 출력하세요.
섹션 내용은 줄바꿈으로 구분하며, 가급적 한 줄 = 한 문장으로 작성하세요.
문장 중간에 끊지 말고 반드시 마침표(또는 '다.')로 끝내세요.

[가장 중요한 규칙]
- 사용자의 질문 범위를 먼저 파악하세요.
- 질문 범위 밖의 Task는 절대 언급하지 마세요.
- 전체 Task를 나열하지 마세요. 질문과 관련된 것만 선별하세요.
- 특정 Task 질문에는 해당 Task만 답하세요.
- Task를 언급할 때는 반드시 [Task: Task제목] 형식으로 제목을 단독 줄에 작성하고, 그 아래에 분석 내용을 작성하세요.
- Task 질문에서 담당자는 해당 Task의 assignee만 표시하세요. 프로젝트 전체 팀원을 담당자로 보여주면 안 됩니다.
- Viewer는 절대 담당자로 표시하지 마세요.
- 제목만 말하지 말고, 컨텍스트에 있는 상세 내용(설명, 작업노트, 메모, 첨부자료)을 적극 활용해서 풍부하게 답변하세요.
- 사용자가 작성해둔 텍스트가 있으면 반드시 그 내용을 답변에 반영하세요.
""".strip()

    try:
        content = dsllm_chat(
            base_url=api_url,
            model_name=model_name,
            system_prompt=system_prompt,
            user_prompt=prompt,
            temperature=0.2,
            max_tokens=4096,
        )

        content = sanitize_llm_text_ai(content)

        # ── 섹션 파싱 ──
        parsed = {"one_liner": "", "details": "", "key_schedule": "", "next_actions": ""}
        current = ""
        for line in content.split("\n"):
            sline = line.strip()
            if "[섹션1" in sline:
                current = "one_liner"; continue
            if "[섹션2" in sline:
                current = "details"; continue
            if "[섹션3" in sline:
                current = "key_schedule"; continue
            if "[섹션4" in sline:
                current = "next_actions"; continue
            if current:
                parsed[current] += line + "\n"

        parsed = {k: (v.strip() if v else "") for k, v in parsed.items()}
        if not parsed["one_liner"]:
            parsed["one_liner"] = (content[:200].strip() + ("…" if len(content) > 200 else "")) if content else ""
            parsed["details"] = content

        # ── context_tasks 선별 ──
        matched_tasks = scope["matched_tasks"]
        window = scope["window"]

        schedule_text = parsed.get("key_schedule", "") or ""
        response_matched = []
        if schedule_text:
            for t in task_details:
                if t["title"] and t["title"] in schedule_text:
                    response_matched.append(t)

        if matched_tasks:
            context_tasks = matched_tasks
        elif window:
            filtered_by_time = [t for t in task_details if _task_overlaps_window(t, ws, we)] if ws and we else []
            context_tasks = filtered_by_time
        elif response_matched:
            context_tasks = response_matched
        elif scope["is_full_overview"]:
            context_tasks = prompt_tasks[:15]
        else:
            context_tasks = response_matched if response_matched else prompt_tasks[:8]

        active_tasks = [t for t in context_tasks if t.get("status") != "hold"]
        hold_tasks = [t for t in context_tasks if t.get("status") == "hold"]
        done_tasks = [t for t in context_tasks if t.get("status") == "done"]
        in_progress_tasks = [t for t in context_tasks if t.get("status") == "in_progress"]
        todo_tasks = [t for t in context_tasks if t.get("status") == "todo"]

        if len(active_tasks) > 0:
            progress_sum = sum(
                100 if t.get("status") == "done" else (t.get("progress", 0) or 0)
                for t in active_tasks
            )
            overall_progress = round(progress_sum / len(active_tasks), 1)
        else:
            overall_progress = 0.0

        db_record = ProjectAiQuery(
            project_id=project_id,
            user_id=user_id,
            query=req.query,
            raw_response=content,
            model=model_name,
            created_at=datetime.utcnow(),
        )
        db.add(db_record)
        db.commit()
        db.refresh(db_record)

        context = {
            "status_breakdown": {
                "total": len(context_tasks),
                "active": len(active_tasks),
                "done": len(done_tasks),
                "in_progress": len(in_progress_tasks),
                "todo": len(todo_tasks),
                "hold": len(hold_tasks),
                "overall_progress": overall_progress,
            },
            "members": context_members,
            "tasks": context_tasks,
            "filter": {
                "mode": scope["scope_type"],
                "window_start": ws.isoformat() if ws else None,
                "window_end": we.isoformat() if we else None,
            },
        }

        return {
            "id": db_record.id,
            "project_id": db_record.project_id,
            "user_id": db_record.user_id,
            "query": db_record.query,
            "raw_response": db_record.raw_response,
            "model": db_record.model,
            "created_at": db_record.created_at.isoformat() if db_record.created_at else None,
            "parsed_response": parsed,
            "context": context,
        }

    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=502, detail=f"Cannot connect to DSLLM at {api_url}. Please check the API URL.")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="DSLLM request timed out.")
    except requests.exceptions.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"DSLLM returned HTTP error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI query failed: {str(e)}")

# AI Query History 조회
@app.get("/api/projects/{project_id}/ai-queries")
def get_project_ai_queries(
    project_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db),
):
    state = load_state()
    check_project_access(db, state, project_id, user_id)

    rows = (
        db.query(ProjectAiQuery)
        .filter(ProjectAiQuery.project_id == project_id)
        .order_by(ProjectAiQuery.created_at.desc())
        .all()
    )

    queries = []
    for r in rows:
        raw = getattr(r, "raw_response", None) or ""
        one_liner = getattr(r, "one_liner", None)
        details = getattr(r, "details", None)
        key_schedule = getattr(r, "key_schedule", None)
        next_actions = getattr(r, "next_actions", None)

        # ✅ parsed_response를 프론트가 기대하는 형태로 생성 (없으면 raw_response로 fallback)
        parsed_response = {
            "one_liner": one_liner or (raw[:200].strip() + ("…" if len(raw) > 200 else "")) if raw else "",
            "details": details or raw or "",
            "key_schedule": key_schedule or "",
            "next_actions": next_actions or "",
        }

        queries.append(
            {
                "id": r.id,
                "project_id": r.project_id,
                "user_id": r.user_id,
                "query": r.query,

                # ✅ 기존 호환 필드들 유지
                "response": getattr(r, "response", None),
                "raw_response": raw,
                "model": getattr(r, "model", None),
                "created_at": r.created_at.isoformat() if r.created_at else None,

                # ✅ 확장 컬럼(있을 때만)
                "one_liner": one_liner,
                "details": details,
                "key_schedule": key_schedule,
                "next_actions": next_actions,
                "context_snapshot": getattr(r, "context_snapshot", None),

                # ✅ 프론트에서 바로 쓰게 추가
                "parsed_response": parsed_response,
            }
        )

    return {"queries": queries}

# =========================
# Admin APIs
# =========================
@app.get("/api/admin/users")
def admin_get_users(user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)
    users = db.query(User).all()
    return {"users": [user_dict(u, state) for u in users]}

@app.patch("/api/admin/users/{target_id}/toggle-active")
def admin_toggle_user_active(target_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)

    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # 슈퍼운영자 비활성화 방지
    if is_super_owner_loginid(target.loginid):
        raise HTTPException(status_code=400, detail="Super owner 계정은 비활성화할 수 없습니다.")

    target.is_active = not bool(target.is_active)
    db.commit()
    db.refresh(target)
    return user_dict(target, state)

@app.delete("/api/admin/users/{target_id}")
def admin_delete_user(target_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """관리자: 사용자 완전 삭제 (hard delete)"""
    state = load_state()
    require_admin(db, state, user_id)
    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_super_owner_loginid(target.loginid):
        raise HTTPException(status_code=400, detail="Super owner 계정은 삭제할 수 없습니다.")

    # tasks.assignee_ids(JSON)에서 제거
    tasks = db.query(Task).filter(Task.archived_at.is_(None)).all()
    for t in tasks:
        ids = list(t.assignee_ids or [])
        if target_id in ids:
            ids.remove(target_id)
            t.assignee_ids = ids

    # preferences / user_shortcuts 삭제
    db.query(UserPreference).filter(UserPreference.user_id == target_id).delete()
    db.query(UserShortcut).filter(UserShortcut.user_id == target_id).delete()

    # group memberships 삭제
    db.query(GroupMembership).filter(GroupMembership.user_id == target_id).delete()

    # project memberships 삭제
    db.query(ProjectMemberModel).filter(ProjectMemberModel.user_id == target_id).delete()

    # sidecar 정리
    state["project_members"] = [m for m in state.get("project_members", []) if int(m.get("user_id", 0)) != target_id]
    state["join_requests"] = [jr for jr in state.get("join_requests", []) if int(jr.get("user_id", 0)) != target_id]
    state["notes"] = [n for n in state.get("notes", []) if int(n.get("author_id", -1)) != target_id]
    state.get("user_meta", {}).pop(str(target_id), None)

    db.delete(target)
    db.commit()
    save_state(state)
    return {"message": "사용자가 삭제되었습니다."}

@app.patch("/api/admin/users/{target_id}/role")
def admin_update_user_role(target_id: int, body: dict, user_id: int = Query(...), db: Session = Depends(get_db)):
    """v1.2: 프론트엔드에서 호출하던 누락 엔드포인트"""
    state = load_state()
    require_admin(db, state, user_id)

    target = db.query(User).filter(User.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    new_role = body.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="role is required")

    valid_roles = {"super_admin", "admin", "manager", "member", "viewer"}
    if new_role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"role must be one of {valid_roles}")

    target.role = new_role
    db.commit()
    db.refresh(target)
    return user_dict(target, state)

# =========================
# Org Admin APIs (v1.2)
# =========================
@app.get("/api/admin/org/tree")
def admin_get_org_tree(user_id: int = Query(...), db: Session = Depends(get_db)):
    """조직 트리 조회"""
    state = load_state()
    require_admin(db, state, user_id)

    from app.models import Group as GroupModel
    groups = db.query(GroupModel).filter(GroupModel.is_active == True).order_by(GroupModel.sort_order, GroupModel.id).all()
    result = []
    for g in groups:
        members = db.query(GroupMembership).filter(GroupMembership.group_id == g.id).all()
        member_list = []
        for m in members:
            u = db.query(User).filter(User.id == m.user_id).first()
            if u:
                member_list.append({
                    "user_id": u.id,
                    "username": u.username,
                    "loginid": u.loginid,
                    "org_role": m.org_role,
                    "detail_level": m.detail_level,
                    "is_primary": m.is_primary,
                })
        result.append({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "group_type": g.group_type,
            "parent_id": g.parent_id,
            "sort_order": g.sort_order,
            "is_active": g.is_active,
            "members": member_list,
        })
    return {"tree": result}

@app.post("/api/admin/org/groups")
def admin_create_org_group(body: dict, user_id: int = Query(...), db: Session = Depends(get_db)):
    """조직 그룹 노드 생성"""
    state = load_state()
    require_admin(db, state, user_id)

    from app.models import Group as GroupModel
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    existing = db.query(GroupModel).filter(GroupModel.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 존재하는 그룹명입니다")

    new_group = GroupModel(
        name=name,
        description=body.get("description"),
        group_type=body.get("group_type", "PART"),
        parent_id=body.get("parent_id"),
        sort_order=body.get("sort_order", 0),
        is_active=True,
    )
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return {"id": new_group.id, "name": new_group.name, "group_type": new_group.group_type}

@app.patch("/api/admin/org/groups/{group_id}")
def admin_update_org_group(group_id: int, body: dict, user_id: int = Query(...), db: Session = Depends(get_db)):
    """조직 그룹 수정"""
    state = load_state()
    require_admin(db, state, user_id)

    from app.models import Group as GroupModel
    g = db.query(GroupModel).filter(GroupModel.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")

    for k in ["name", "description", "group_type", "parent_id", "sort_order", "is_active"]:
        if k in body:
            setattr(g, k, body[k])
    db.commit()
    db.refresh(g)
    return {"id": g.id, "name": g.name, "group_type": g.group_type}

@app.delete("/api/admin/org/groups/{group_id}")
def admin_delete_org_group(group_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """조직 그룹 비활성화"""
    state = load_state()
    require_admin(db, state, user_id)

    from app.models import Group as GroupModel
    g = db.query(GroupModel).filter(GroupModel.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    g.is_active = False
    db.commit()
    return {"message": "Group deactivated"}

@app.post("/api/admin/org/users/{target_user_id}/assign")
def admin_assign_user_part(target_user_id: int, body: dict, user_id: int = Query(...), db: Session = Depends(get_db)):
    """사용자 파트 배정 (group_id, org_role, detail_level)"""
    state = load_state()
    require_admin(db, state, user_id)

    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    group_id = body.get("group_id")
    org_role = body.get("org_role", "MEMBER")
    detail_level = body.get("detail_level", "FULL_DETAIL")

    if group_id:
        existing = db.query(GroupMembership).filter(
            GroupMembership.user_id == target_user_id,
            GroupMembership.group_id == group_id
        ).first()

        if existing:
            existing.org_role = org_role
            existing.detail_level = detail_level
        else:
            new_membership = GroupMembership(
                user_id=target_user_id,
                group_id=group_id,
                org_role=org_role,
                detail_level=detail_level,
                is_primary=True,
            )
            db.add(new_membership)

        # Update user's primary_part_id
        from app.models import Group as GroupModel
        grp = db.query(GroupModel).filter(GroupModel.id == group_id).first()
        if grp and grp.group_type == "PART":
            target.primary_part_id = group_id
        elif grp and grp.group_type == "TEAM":
            target.primary_team_id = group_id

    db.commit()
    return {"message": "User assigned", "user_id": target_user_id, "group_id": group_id}

@app.post("/api/admin/org/projects/{project_id}/assign-part")
def admin_assign_project_part(project_id: int, body: dict, user_id: int = Query(...), db: Session = Depends(get_db)):
    """프로젝트 파트 배정"""
    state = load_state()
    require_admin(db, state, user_id)

    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    part_id = body.get("part_id")
    p.part_id = part_id
    db.commit()
    return {"message": "Project part assigned", "project_id": project_id, "part_id": part_id}

@app.get("/api/admin/org/unassigned-users")
def admin_get_unassigned_users(user_id: int = Query(...), db: Session = Depends(get_db)):
    """PART 배정 안 된 사용자 목록"""
    state = load_state()
    require_admin(db, state, user_id)

    all_users = db.query(User).filter(User.is_active == True).all()
    assigned_user_ids = set(
        m.user_id for m in db.query(GroupMembership).all()
    )
    unassigned = [user_dict(u, state) for u in all_users if u.id not in assigned_user_ids]
    return {"users": unassigned}


# =========================
# Groups (sidecar)
# - 레거시 /api/groups + 신규 /api/admin/groups 둘 다 지원
# =========================
def _group_to_out(g: dict, db: Session, state: dict) -> dict:
    all_users = db.query(User).all()
    group_name = g.get("name", "")
    # Match by group_name (user_meta) OR deptname
    matched_count = 0
    for u in all_users:
        umeta = get_user_meta(state, u.id)
        if umeta.get("group_name") == group_name or (u.deptname and u.deptname.strip() == group_name):
            matched_count += 1
    return {**g, "matched_count": matched_count}

@app.get("/api/groups")
def get_groups(db: Session = Depends(get_db)):
    state = load_state()
    groups = state.get("groups", [])
    return {"groups": [_group_to_out(g, db, state) for g in groups]}

@app.post("/api/groups")
def create_group_legacy(group: GroupCreate, db: Session = Depends(get_db)):
    state = load_state()
    groups = state.get("groups", [])
    if any(g.get("name") == group.name for g in groups):
        raise HTTPException(status_code=400, detail="Group name already exists")

    new_group = {
        "id": next_id(groups),
        "name": group.name,
        "description": group.description,
        "is_active": True,
        "created_at": datetime.now().isoformat(),
    }
    groups.append(new_group)
    state["groups"] = groups
    save_state(state)
    return _group_to_out(new_group, db, state)

@app.patch("/api/groups/{group_id}")
def update_group_legacy(group_id: int, body: GroupUpdate, db: Session = Depends(get_db)):
    state = load_state()
    groups = state.get("groups", [])
    for i, g in enumerate(groups):
        if int(g.get("id")) == group_id:
            groups[i].update(body.model_dump(exclude_unset=True))
            state["groups"] = groups
            save_state(state)
            return _group_to_out(groups[i], db, state)
    raise HTTPException(status_code=404, detail="Group not found")

@app.get("/api/admin/groups")
def admin_get_groups(user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)
    return get_groups(db)

@app.post("/api/admin/groups")
def admin_create_group(group: GroupCreate, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)

    groups = state.get("groups", [])
    if any(g.get("name") == group.name for g in groups):
        raise HTTPException(status_code=400, detail=f"그룹명 '{group.name}'이(가) 이미 등록되어 있습니다.")

    new_group = {
        "id": next_id(groups),
        "name": group.name,
        "description": group.description,
        "is_active": True,
        "created_at": datetime.now().isoformat(),
    }
    groups.append(new_group)
    state["groups"] = groups
    save_state(state)
    return _group_to_out(new_group, db, state)

@app.delete("/api/admin/groups/{group_id}")
def admin_delete_group(group_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)
    state["groups"] = [g for g in state.get("groups", []) if int(g.get("id")) != group_id]
    save_state(state)
    return {"message": "Group deleted"}

@app.post("/api/admin/groups/{group_id}/apply")
def admin_apply_group(group_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)

    groups = state.get("groups", [])
    group = next((g for g in groups if int(g.get("id")) == group_id), None)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    target_group_name = group.get("name")
    activated = 0

    users = db.query(User).all()
    for u in users:
        umeta = get_user_meta(state, u.id)
        # Match by group_name (user_meta) OR deptname
        if umeta.get("group_name") == target_group_name or (u.deptname and u.deptname.strip() == target_group_name):
            if not bool(u.is_active):
                u.is_active = True
                activated += 1

    db.commit()

    total_matched = 0
    for u in users:
        umeta = get_user_meta(state, u.id)
        if umeta.get("group_name") == target_group_name or (u.deptname and u.deptname.strip() == target_group_name):
            total_matched += 1

    return {
        "message": f"Activated {activated} users (total matched: {total_matched})",
        "activated": activated,
        "total_matched": total_matched,
    }


# =========================
# Member Groups (DB)
# =========================
def _member_group_dict(g: MemberGroup, db: Session) -> dict:
    members = db.query(MemberGroupUser).filter(MemberGroupUser.group_id == g.id).all()
    user_ids = [m.user_id for m in members]
    users = db.query(User).filter(User.id.in_(user_ids)).all() if user_ids else []
    return {
        "id": g.id,
        "name": g.name,
        "description": g.description,
        "created_by": g.created_by,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "member_count": len(user_ids),
        "members": [
            {
                "user_id": u.id,
                "username": u.username,
                "loginid": u.loginid,
                "avatar_color": u.avatar_color,
                "deptname": getattr(u, "deptname", None) or getattr(u, "group_name", None),
            }
            for u in users
        ],
    }

@app.get("/api/member-groups")
def get_member_groups(user_id: int = Query(...), db: Session = Depends(get_db)):
    groups = db.query(MemberGroup).filter(MemberGroup.created_by == user_id).order_by(MemberGroup.created_at.desc()).all()
    return {"groups": [_member_group_dict(g, db) for g in groups]}

@app.post("/api/member-groups")
def create_member_group(body: MemberGroupCreate, user_id: int = Query(...), db: Session = Depends(get_db)):
    g = MemberGroup(name=body.name, description=body.description, created_by=user_id)
    db.add(g)
    db.flush()
    for uid in (body.member_user_ids or []):
        db.add(MemberGroupUser(group_id=g.id, user_id=uid))
    db.commit()
    db.refresh(g)
    return _member_group_dict(g, db)

@app.patch("/api/member-groups/{group_id}")
def update_member_group(group_id: int, body: MemberGroupUpdate, user_id: int = Query(...), db: Session = Depends(get_db)):
    g = db.query(MemberGroup).filter(MemberGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    if body.name is not None:
        g.name = body.name
    if body.description is not None:
        g.description = body.description
    if body.member_user_ids is not None:
        db.query(MemberGroupUser).filter(MemberGroupUser.group_id == group_id).delete()
        for uid in body.member_user_ids:
            db.add(MemberGroupUser(group_id=group_id, user_id=uid))
    db.commit()
    db.refresh(g)
    return _member_group_dict(g, db)

@app.delete("/api/member-groups/{group_id}")
def delete_member_group(group_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    g = db.query(MemberGroup).filter(MemberGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found")
    db.query(MemberGroupUser).filter(MemberGroupUser.group_id == group_id).delete()
    db.delete(g)
    db.commit()
    return {"message": "Group deleted"}


# =========================
# Spaces
# =========================

class SpaceCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    member_user_ids: Optional[List[int]] = None

class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

def _space_dict(s, db: Session) -> dict:
    members = db.query(SpaceMember, User).join(User, SpaceMember.user_id == User.id).filter(SpaceMember.space_id == s.id).all()
    project_count = db.query(Project).filter(Project.space_id == s.id, Project.archived_at.is_(None)).count()
    return {
        "id": s.id,
        "name": s.name,
        "slug": s.slug,
        "description": s.description,
        "created_by": s.created_by,
        "is_active": s.is_active,
        "created_at": iso(s.created_at) if s.created_at else None,
        "warned_at": iso(s.warned_at) if s.warned_at else None,
        "project_count": project_count,
        "member_count": len(members),
        "members": [
            {"user_id": m.user_id, "role": m.role, "username": u.username, "loginid": u.loginid, "avatar_color": u.avatar_color}
            for m, u in members
        ],
    }

import re as _re_slug

@app.get("/api/spaces")
def get_spaces(user_id: int = Query(...), db: Session = Depends(get_db)):
    """List spaces the user is a member of."""
    member_space_ids = [sm.space_id for sm in db.query(SpaceMember).filter(SpaceMember.user_id == user_id).all()]
    spaces = db.query(Space).filter(Space.id.in_(member_space_ids), Space.is_active == True).order_by(Space.created_at).all()
    return {"spaces": [_space_dict(s, db) for s in spaces]}

@app.get("/api/spaces/all")
def get_all_spaces(user_id: int = Query(...), db: Session = Depends(get_db)):
    """List ALL active spaces with is_member flag for the user."""
    all_spaces = db.query(Space).filter(Space.is_active == True).order_by(Space.created_at).all()
    member_space_ids = set(sm.space_id for sm in db.query(SpaceMember).filter(SpaceMember.user_id == user_id).all())
    # Get user's role in each space
    user_memberships = {sm.space_id: sm.role for sm in db.query(SpaceMember).filter(SpaceMember.user_id == user_id).all()}
    result = []
    for s in all_spaces:
        d = _space_dict(s, db)
        d["is_member"] = s.id in member_space_ids
        d["my_role"] = user_memberships.get(s.id)
        result.append(d)
    return {"spaces": result}

@app.get("/api/users/search")
def search_users(q: str = Query(..., min_length=1), user_id: int = Query(...), db: Session = Depends(get_db)):
    """Search users by name or loginid (for space member addition)."""
    search_q = f"%{q}%"
    users_found = db.query(User).filter(
        User.is_active == True,
        (User.username.ilike(search_q) | User.loginid.ilike(search_q))
    ).limit(20).all()
    return {"users": [
        {"id": u.id, "username": u.username, "loginid": u.loginid, "avatar_color": u.avatar_color, "deptname": u.deptname, "role": u.role}
        for u in users_found
    ]}

@app.post("/api/spaces")
def create_space(body: SpaceCreate, user_id: int = Query(...), db: Session = Depends(get_db)):
    # Use name as slug directly (supports Korean), or custom slug if provided
    slug = body.slug or _re_slug.sub(r'\s+', '-', body.name.strip())[:100]
    # Ensure unique slug
    existing = db.query(Space).filter(Space.slug == slug).first()
    if existing:
        slug = f"{slug}-{int(datetime.utcnow().timestamp()) % 10000}"
    space = Space(name=body.name, slug=slug, description=body.description, created_by=user_id)
    db.add(space)
    db.commit()
    db.refresh(space)
    # Add creator as owner
    db.add(SpaceMember(space_id=space.id, user_id=user_id, role="owner"))
    # Add additional members
    if body.member_user_ids:
        for uid in body.member_user_ids:
            if uid != user_id:
                db.add(SpaceMember(space_id=space.id, user_id=uid, role="member"))
    db.commit()
    return _space_dict(space, db)

@app.get("/api/spaces/{space_id}")
def get_space(space_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id, Space.is_active == True).first()
    if not space:
        raise HTTPException(404, "Space not found")
    member = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id).first()
    if not member:
        raise HTTPException(403, "이 공간에 접근 권한이 없습니다")
    return _space_dict(space, db)

def _require_space_admin(db: Session, space_id: int, user_id: int):
    """Check that user is owner, admin, or operator of the space."""
    m = db.query(SpaceMember).filter(
        SpaceMember.space_id == space_id,
        SpaceMember.user_id == user_id,
        SpaceMember.role.in_(["owner", "admin", "operator"]),
    ).first()
    if not m:
        raise HTTPException(403, "공간 소유자 또는 관리자만 이 작업을 수행할 수 있습니다")
    return m

@app.patch("/api/spaces/{space_id}")
def update_space(space_id: int, body: SpaceUpdate, user_id: int = Query(...), db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(404, "Space not found")
    _require_space_admin(db, space_id, user_id)
    if body.name is not None:
        space.name = body.name
        # Sync slug with name change
        new_slug = _re_slug.sub(r'\s+', '-', body.name.strip())[:100]
        existing = db.query(Space).filter(Space.slug == new_slug, Space.id != space_id).first()
        if existing:
            new_slug = f"{new_slug}-{int(datetime.utcnow().timestamp()) % 10000}"
        space.slug = new_slug
    if body.description is not None:
        space.description = body.description
    db.commit()
    return _space_dict(space, db)

@app.delete("/api/spaces/{space_id}")
def delete_space(space_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    """Delete (deactivate) a space. Only owner can delete."""
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(404, "Space not found")
    owner = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id, SpaceMember.role == "owner").first()
    if not owner:
        raise HTTPException(403, "공간 소유자만 삭제할 수 있습니다")
    space.is_active = False
    db.commit()
    return {"message": "공간이 삭제되었습니다"}

@app.get("/api/projects/unassigned")
def get_unassigned_projects(user_id: int = Query(...), db: Session = Depends(get_db)):
    """Get projects not assigned to any active space."""
    state = load_state()
    rows = db.query(Project).filter(
        Project.archived_at.is_(None),
        Project.space_id.is_(None),
    ).all()
    projects = [project_dict(p, state) for p in rows]
    if user_id:
        accessible = get_user_project_ids(db, state, user_id)
        projects = [p for p in projects if p["id"] in accessible or p.get("visibility") == "public"]
    return {"projects": projects}

@app.post("/api/spaces/{space_id}/members")
def add_space_member(space_id: int, user_id: int = Query(...), target_user_id: int = Query(...), role: str = Query(default="member"), db: Session = Depends(get_db)):
    _require_space_admin(db, space_id, user_id)
    existing = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == target_user_id).first()
    if existing:
        return {"message": "이미 멤버입니다"}
    db.add(SpaceMember(space_id=space_id, user_id=target_user_id, role=role))
    db.commit()
    return {"message": "멤버가 추가되었습니다"}

@app.delete("/api/spaces/{space_id}/members/{target_user_id}")
def remove_space_member(space_id: int, target_user_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    _require_space_admin(db, space_id, user_id)
    db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == target_user_id).delete()
    db.commit()
    return {"message": "멤버가 제거되었습니다"}

@app.patch("/api/spaces/{space_id}/members/{target_user_id}/role")
def update_space_member_role(space_id: int, target_user_id: int, role: str = Query(...), user_id: int = Query(...), db: Session = Depends(get_db)):
    """Change a member's role. Only owner can promote to admin/operator; owner/admin/operator can set member."""
    caller = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id).first()
    if not caller or caller.role not in ("owner", "admin", "operator"):
        raise HTTPException(403, "권한이 없습니다")
    if role in ("admin", "operator") and caller.role != "owner":
        raise HTTPException(403, "관리자/공간운영 지정은 소유자만 가능합니다")
    if role not in ("owner", "admin", "operator", "member"):
        raise HTTPException(400, "유효하지 않은 역할입니다")
    target = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == target_user_id).first()
    if not target:
        raise HTTPException(404, "해당 멤버를 찾을 수 없습니다")
    if target.role == "owner":
        raise HTTPException(403, "소유자의 역할은 변경할 수 없습니다")
    target.role = role
    db.commit()
    return {"message": f"역할이 {role}로 변경되었습니다"}

@app.patch("/api/projects/{project_id}/move-space")
def move_project_space(project_id: int, space_id: int = Query(...), user_id: int = Query(...), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    member = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id).first()
    if not member:
        raise HTTPException(403, "대상 공간의 멤버가 아닙니다")
    project.space_id = space_id
    db.commit()
    return {"message": "프로젝트가 이동되었습니다", "project_id": project_id, "space_id": space_id}

# ── Space Join Requests ──
@app.get("/api/spaces/by-slug/{slug}")
def get_space_by_slug(slug: str, user_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Public lookup by slug. Returns basic info + whether user is a member."""
    space = db.query(Space).filter(Space.slug == slug, Space.is_active == True).first()
    if not space:
        raise HTTPException(404, "공간을 찾을 수 없습니다")
    is_member = False
    if user_id:
        m = db.query(SpaceMember).filter(SpaceMember.space_id == space.id, SpaceMember.user_id == user_id).first()
        is_member = m is not None
    pending = False
    if user_id and not is_member:
        pr = db.query(SpaceJoinRequest).filter(
            SpaceJoinRequest.space_id == space.id, SpaceJoinRequest.user_id == user_id, SpaceJoinRequest.status == "pending"
        ).first()
        pending = pr is not None
    return {"id": space.id, "name": space.name, "slug": space.slug, "description": space.description, "is_member": is_member, "pending_request": pending}

@app.post("/api/spaces/{space_id}/join-request")
def request_join_space(space_id: int, user_id: int = Query(...), message: Optional[str] = None, db: Session = Depends(get_db)):
    existing = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == user_id).first()
    if existing:
        return {"message": "이미 멤버입니다"}
    pending = db.query(SpaceJoinRequest).filter(
        SpaceJoinRequest.space_id == space_id, SpaceJoinRequest.user_id == user_id, SpaceJoinRequest.status == "pending"
    ).first()
    if pending:
        return {"message": "이미 신청 대기 중입니다"}
    req = SpaceJoinRequest(space_id=space_id, user_id=user_id, message=message)
    db.add(req)
    db.commit()
    return {"message": "접속 권한이 신청되었습니다"}

@app.get("/api/spaces/{space_id}/join-requests")
def get_space_join_requests(space_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    _require_space_admin(db, space_id, user_id)
    reqs = db.query(SpaceJoinRequest, User).join(User, SpaceJoinRequest.user_id == User.id).filter(
        SpaceJoinRequest.space_id == space_id, SpaceJoinRequest.status == "pending"
    ).all()
    return {"requests": [
        {"id": r.id, "user_id": r.user_id, "username": u.username, "loginid": u.loginid, "message": r.message, "created_at": iso(r.created_at)}
        for r, u in reqs
    ]}

@app.post("/api/spaces/{space_id}/join-requests/{request_id}/approve")
def approve_join_request(space_id: int, request_id: int, action: str = Query(...), user_id: int = Query(...), db: Session = Depends(get_db)):
    """action: 'approve' or 'reject'"""
    _require_space_admin(db, space_id, user_id)
    req = db.query(SpaceJoinRequest).filter(SpaceJoinRequest.id == request_id, SpaceJoinRequest.space_id == space_id).first()
    if not req:
        raise HTTPException(404, "요청을 찾을 수 없습니다")
    if action == "approve":
        req.status = "approved"
        req.resolved_by = user_id
        req.resolved_at = datetime.utcnow()
        existing = db.query(SpaceMember).filter(SpaceMember.space_id == space_id, SpaceMember.user_id == req.user_id).first()
        if not existing:
            db.add(SpaceMember(space_id=space_id, user_id=req.user_id, role="member"))
        db.commit()
        return {"message": "승인되었습니다"}
    elif action == "reject":
        req.status = "rejected"
        req.resolved_by = user_id
        req.resolved_at = datetime.utcnow()
        db.commit()
        return {"message": "거절되었습니다"}
    raise HTTPException(400, "action은 approve 또는 reject여야 합니다")


# =========================
# Backfill: project_members loginid/deptname
# =========================
@app.post("/api/admin/backfill-project-members")
def backfill_project_members(user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)
    rows = db.query(ProjectMemberModel).filter(
        (ProjectMemberModel.loginid.is_(None)) | (ProjectMemberModel.deptname.is_(None))
    ).all()
    updated = 0
    for pm in rows:
        u = db.query(User).filter(User.id == pm.user_id).first()
        if u:
            pm.loginid = u.loginid
            pm.deptname = getattr(u, "deptname", None)
            updated += 1
    db.commit()
    return {"message": f"Backfilled {updated} project_member rows"}


# =========================
# Shortcuts (sidecar)
# =========================
@app.get("/api/shortcuts")
def get_shortcuts():
    state = load_state()
    return {"shortcuts": state.get("shortcuts", [])}

@app.post("/api/shortcuts")
def create_shortcut(shortcut: ShortcutCreate, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)

    shortcuts = state.get("shortcuts", [])
    new_sc = {
        "id": next_id(shortcuts),
        "name": shortcut.name,
        "url": shortcut.url,
        "icon_text": shortcut.icon_text or (shortcut.name[:1].upper() if shortcut.name else "S"),
        "icon_color": shortcut.icon_color or "#2955FF",
        "order": shortcut.order if shortcut.order is not None else len(shortcuts),
        "open_new_tab": bool(shortcut.open_new_tab),
        "active": True,
        "created_at": datetime.now().isoformat(),
    }
    shortcuts.append(new_sc)
    state["shortcuts"] = shortcuts
    save_state(state)
    return new_sc

@app.patch("/api/shortcuts/{shortcut_id}")
def update_shortcut(shortcut_id: int, updates: ShortcutUpdate, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)

    shortcuts = state.get("shortcuts", [])
    sc = next((s for s in shortcuts if int(s.get("id")) == shortcut_id), None)
    if not sc:
        raise HTTPException(status_code=404, detail="Shortcut not found")

    for key, val in updates.model_dump(exclude_unset=True).items():
        sc[key] = val

    save_state(state)
    return sc

@app.delete("/api/shortcuts/{shortcut_id}")
def delete_shortcut(shortcut_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    state = load_state()
    require_admin(db, state, user_id)

    state["shortcuts"] = [s for s in state.get("shortcuts", []) if int(s.get("id")) != shortcut_id]
    save_state(state)
    return {"message": "Shortcut deleted"}


# =========================
# User Shortcuts (per-user, DB)
# =========================
class UserShortcutCreate(BaseModel):
    name: str
    url: str
    icon_text: Optional[str] = None
    icon_color: str = "#2955FF"
    order: int = 0
    open_new_tab: bool = True

class UserShortcutUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    icon_text: Optional[str] = None
    icon_color: Optional[str] = None
    order: Optional[int] = None
    open_new_tab: Optional[bool] = None
    active: Optional[bool] = None

def user_shortcut_dict(s: UserShortcut) -> dict:
    return {
        "id": s.id,
        "user_id": s.user_id,
        "name": s.name,
        "url": s.url,
        "icon_text": s.icon_text,
        "icon_color": s.icon_color,
        "order": s.order,
        "open_new_tab": s.open_new_tab,
        "active": s.active,
        "created_at": iso(s.created_at),
    }

@app.get("/api/user-shortcuts")
def get_user_shortcuts(user_id: int = Query(...), db: Session = Depends(get_db)):
    shortcuts = db.query(UserShortcut).filter(
        UserShortcut.user_id == user_id,
        UserShortcut.active == True,
    ).order_by(UserShortcut.order).all()
    return {"shortcuts": [user_shortcut_dict(s) for s in shortcuts]}

@app.post("/api/user-shortcuts")
def create_user_shortcut(body: UserShortcutCreate, user_id: int = Query(...), db: Session = Depends(get_db)):
    s = UserShortcut(
        user_id=user_id,
        name=body.name,
        url=body.url,
        icon_text=body.icon_text,
        icon_color=body.icon_color,
        order=body.order,
        open_new_tab=body.open_new_tab,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return user_shortcut_dict(s)

@app.patch("/api/user-shortcuts/{shortcut_id}")
def update_user_shortcut(shortcut_id: int, body: UserShortcutUpdate, user_id: int = Query(...), db: Session = Depends(get_db)):
    s = db.query(UserShortcut).filter(UserShortcut.id == shortcut_id, UserShortcut.user_id == user_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Shortcut not found")
    if body.name is not None:
        s.name = body.name
    if body.url is not None:
        s.url = body.url
    if body.icon_text is not None:
        s.icon_text = body.icon_text
    if body.icon_color is not None:
        s.icon_color = body.icon_color
    if body.order is not None:
        s.order = body.order
    if body.open_new_tab is not None:
        s.open_new_tab = body.open_new_tab
    if body.active is not None:
        s.active = body.active
    db.commit()
    db.refresh(s)
    return user_shortcut_dict(s)

@app.delete("/api/user-shortcuts/{shortcut_id}")
def delete_user_shortcut(shortcut_id: int, user_id: int = Query(...), db: Session = Depends(get_db)):
    s = db.query(UserShortcut).filter(UserShortcut.id == shortcut_id, UserShortcut.user_id == user_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Shortcut not found")
    db.delete(s)
    db.commit()
    return {"message": "Shortcut deleted"}


# =========================
# Run
# =========================
if __name__ == "__main__":
    import uvicorn

    # ✅ 네 기존 사내 포트 유지(8085)
    uvicorn.run("main:app", host="0.0.0.0", port=8085, reload=True)