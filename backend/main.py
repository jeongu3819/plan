from fastapi import FastAPI, HTTPException, Query, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse
import shutil
import uuid
from fastapi.middleware.cors import CORSMiddleware
import os
import json
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, date

app = FastAPI(title="Antigravity Schedule Platform API")

# CORS Setup — allow all origins for dev / internal network
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "data.json"

# ─── Models ───

class TaskBase(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = None
    status: str = "todo"
    priority: Optional[str] = "medium"
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    assignee_ids: List[int] = []
    tags: List[str] = []
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

# Default permissions for new projects
DEFAULT_PERMISSIONS = {
    "post_write": "all",
    "post_edit": "all",
    "post_view": "all",
    "comment_write": "all",
    "file_view": "all",
    "file_download": "all",
}

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    owner_id: Optional[int] = 1
    visibility: Optional[str] = "private"
    require_approval: Optional[bool] = False
    permissions: Optional[Dict[str, str]] = None
    member_ids: Optional[List[int]] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None
    require_approval: Optional[bool] = None
    permissions: Optional[Dict[str, str]] = None

class UserCreate(BaseModel):
    username: str
    loginid: str
    role: Optional[str] = "member"
    avatar_color: Optional[str] = "#2955FF"

class UserUpdate(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    avatar_color: Optional[str] = None

class LayoutUpdate(BaseModel):
    layout: Dict[str, Any]

class SubProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_id: Optional[int] = None

class SubProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

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
    action: str  # "approve" or "reject"

# ─── Data Helpers ───

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

DEFAULT_DATA = {
    "projects": [{"id": 1, "name": "Demo Project", "created_at": "2026-01-01T00:00:00", "owner_id": 1, "visibility": "private", "description": "", "require_approval": False, "permissions": DEFAULT_PERMISSIONS}],
    "users": [
        {"id": 1, "loginid": "admin", "username": "Admin", "role": "admin", "avatar_color": "#2955FF", "is_active": True},
    ],
    "tasks": [],
    "activity_logs": [],
    "user_preferences": {},
    "sub_projects": [],
    "notes": [],
    "attachments": [],
    "project_members": [{"project_id": 1, "user_id": 1, "role": "owner"}],
    "project_files": [],
    "join_requests": [],
}

def load_data() -> Dict[str, Any]:
    if not os.path.exists(DATA_FILE):
        return json.loads(json.dumps(DEFAULT_DATA))
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        # ─── Migration: ensure all keys exist ───
        for key in DEFAULT_DATA:
            if key not in data:
                data[key] = DEFAULT_DATA[key] if not isinstance(DEFAULT_DATA[key], list) else []

        # Migrate projects: add owner_id, visibility, description, require_approval, permissions
        for p in data.get("projects", []):
            if "owner_id" not in p:
                p["owner_id"] = 1
            if "visibility" not in p:
                p["visibility"] = "private"
            if "description" not in p:
                p["description"] = ""
            if "require_approval" not in p:
                p["require_approval"] = False
            if "permissions" not in p:
                p["permissions"] = dict(DEFAULT_PERMISSIONS)

        # Migrate tasks: add sub_project_id, progress
        for t in data.get("tasks", []):
            if "sub_project_id" not in t:
                t["sub_project_id"] = None
            if "progress" not in t:
                t["progress"] = 0

        # Ensure project_members has at least owner for project 1
        if not data.get("project_members"):
            data["project_members"] = [{"project_id": 1, "user_id": 1, "role": "owner"}]

        # Ensure project_files and join_requests exist
        if "project_files" not in data:
            data["project_files"] = []
        if "join_requests" not in data:
            data["join_requests"] = []

        return data
    except json.JSONDecodeError:
        return json.loads(json.dumps(DEFAULT_DATA))

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def next_id(items: list) -> int:
    if not items:
        return 1
    return max(item["id"] for item in items) + 1

# ─── Permission Helpers ───

def check_project_access(data: dict, project_id: int, user_id: int):
    """Check if user has access to project. Raises 403 if not."""
    # Admin users always have access
    users = data.get("users", [])
    user = next((u for u in users if u["id"] == user_id), None)
    if user and user.get("role") == "admin":
        return True

    # Check project visibility
    projects = data.get("projects", [])
    project = next((p for p in projects if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Owner always has access
    if project.get("owner_id") == user_id:
        return True

    # Check membership
    members = data.get("project_members", [])
    is_member = any(m["project_id"] == project_id and m["user_id"] == user_id for m in members)
    if is_member:
        return True

    if project.get("visibility") == "public":
        return True

    raise HTTPException(status_code=403, detail="Access denied: you are not a member of this project")


def check_project_permission(data: dict, project_id: int, user_id: int, permission_key: str):
    """Check if user has a specific permission on a project. Raises 403 if not."""
    users = data.get("users", [])
    user = next((u for u in users if u["id"] == user_id), None)
    # Admin always passes
    if user and user.get("role") == "admin":
        return True

    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    permissions = project.get("permissions", DEFAULT_PERMISSIONS)
    perm_value = permissions.get(permission_key, "all")

    if perm_value == "all":
        return True

    # Check if user is project owner
    if project.get("owner_id") == user_id:
        return True

    if perm_value == "admin":
        if user and user.get("role") == "admin":
            return True
        raise HTTPException(status_code=403, detail=f"권한이 없습니다: {permission_key} 은(는) 관리자만 가능합니다")

    if perm_value == "members_only":
        members = data.get("project_members", [])
        is_member = any(m["project_id"] == project_id and m["user_id"] == user_id for m in members)
        if is_member:
            return True
        raise HTTPException(status_code=403, detail=f"권한이 없습니다: {permission_key} 은(는) 프로젝트 담당자만 가능합니다")

    return True

# ─── Root ───

@app.get("/")
def read_root():
    return {"message": "Welcome to Antigravity Schedule Platform API"}

@app.get("/api/data")
def get_all_data(user_id: Optional[int] = None):
    data = load_data()
    if user_id:
        # Filter tasks: only tasks where user is assignee or is member of the project
        users = data.get("users", [])
        user = next((u for u in users if u["id"] == user_id), None)
        is_admin = user and user.get("role") == "admin"
        if not is_admin:
            members = data.get("project_members", [])
            user_project_ids = set(m["project_id"] for m in members if m["user_id"] == user_id)
            # Also include projects owned by user
            for p in data.get("projects", []):
                if p.get("owner_id") == user_id:
                    user_project_ids.add(p["id"])
            data["tasks"] = [
                t for t in data.get("tasks", [])
                if t.get("project_id") in user_project_ids and (
                    not t.get("assignee_ids") or user_id in t.get("assignee_ids", [])
                )
            ]
    return data

# ─── User Endpoints ───

@app.get("/api/users")
def get_users():
    data = load_data()
    return {"users": data.get("users", [])}

@app.post("/api/users")
def create_user(user: UserCreate):
    data = load_data()
    users = data.get("users", [])

    if any(u.get("loginid") == user.loginid for u in users):
        raise HTTPException(status_code=400, detail="Login ID already exists")

    new_user = user.model_dump()
    new_user["id"] = next_id(users)
    new_user["is_active"] = True
    new_user["created_at"] = datetime.now().isoformat()

    users.append(new_user)
    data["users"] = users
    save_data(data)
    return new_user

@app.patch("/api/users/{user_id}")
def update_user(user_id: int, updates: UserUpdate):
    data = load_data()
    users = data.get("users", [])

    for i, u in enumerate(users):
        if u["id"] == user_id:
            update_data = updates.model_dump(exclude_unset=True)
            users[i].update(update_data)
            save_data(data)
            return users[i]

    raise HTTPException(status_code=404, detail="User not found")

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int):
    data = load_data()
    users = data.get("users", [])
    data["users"] = [u for u in users if u["id"] != user_id]
    for t in data.get("tasks", []):
        if user_id in t.get("assignee_ids", []):
            t["assignee_ids"].remove(user_id)
    save_data(data)
    return {"message": "User deleted"}

# ─── User Preferences / Dashboard Layout ───

@app.get("/api/users/{user_id}/preferences")
def get_user_preferences(user_id: int):
    data = load_data()
    prefs = data.get("user_preferences", {})
    return prefs.get(str(user_id), {"layout": None})

@app.put("/api/users/{user_id}/preferences/layout")
def save_user_layout(user_id: int, body: LayoutUpdate):
    data = load_data()
    if "user_preferences" not in data:
        data["user_preferences"] = {}

    user_key = str(user_id)
    if user_key not in data["user_preferences"]:
        data["user_preferences"][user_key] = {}

    data["user_preferences"][user_key]["layout"] = body.layout
    save_data(data)
    return {"message": "Layout saved", "layout": body.layout}

# ─── Task Endpoints ───

@app.get("/api/tasks")
def get_tasks(project_id: Optional[int] = None, assignee_id: Optional[int] = None, user_id: Optional[int] = None):
    data = load_data()
    tasks = data.get("tasks", [])
    if project_id:
        tasks = [t for t in tasks if t.get("project_id") == project_id]
    if assignee_id:
        tasks = [t for t in tasks if assignee_id in t.get("assignee_ids", [])]
    # Filter by user permissions: only tasks where user is assignee or task has no assignees
    if user_id:
        users = data.get("users", [])
        user = next((u for u in users if u["id"] == user_id), None)
        is_admin = user and user.get("role") == "admin"
        if not is_admin:
            # Check project membership
            members = data.get("project_members", [])
            user_project_ids = set(m["project_id"] for m in members if m["user_id"] == user_id)
            for p in data.get("projects", []):
                if p.get("owner_id") == user_id:
                    user_project_ids.add(p["id"])
            tasks = [
                t for t in tasks
                if t.get("project_id") in user_project_ids and (
                    not t.get("assignee_ids") or user_id in t.get("assignee_ids", [])
                )
            ]
    return {"tasks": tasks}

@app.post("/api/tasks")
def create_task(task: TaskCreate):
    data = load_data()
    tasks = data.get("tasks", [])

    new_task = task.model_dump()
    new_task["id"] = next_id(tasks)
    new_task["created_at"] = datetime.now().isoformat()
    new_task["updated_at"] = datetime.now().isoformat()
    new_task["archived_at"] = None

    tasks.append(new_task)
    data["tasks"] = tasks
    save_data(data)
    return new_task

@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, updates: TaskUpdate):
    data = load_data()
    tasks = data.get("tasks", [])

    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            update_data = updates.model_dump(exclude_unset=True)
            tasks[i].update(update_data)
            tasks[i]["updated_at"] = datetime.now().isoformat()
            save_data(data)
            return tasks[i]

    raise HTTPException(status_code=404, detail="Task not found")

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    data = load_data()
    tasks = data.get("tasks", [])

    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            tasks[i]["archived_at"] = datetime.now().isoformat()
            save_data(data)
            return {"message": "Task deleted"}

    raise HTTPException(status_code=404, detail="Task not found")

@app.post("/api/tasks/{task_id}/restore")
def restore_task(task_id: int):
    data = load_data()
    tasks = data.get("tasks", [])

    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            tasks[i]["archived_at"] = None
            save_data(data)
            return {"message": "Task restored"}

    raise HTTPException(status_code=404, detail="Task not found")

# ─── Task Attachments ───

@app.get("/api/tasks/{task_id}/attachments")
def get_task_attachments(task_id: int):
    data = load_data()
    attachments = [a for a in data.get("attachments", []) if a.get("task_id") == task_id]
    return {"attachments": attachments}

@app.post("/api/tasks/{task_id}/attachments")
def create_attachment(task_id: int, attachment: AttachmentCreate):
    data = load_data()
    # Verify task exists
    task = next((t for t in data.get("tasks", []) if t["id"] == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    attachments = data.get("attachments", [])
    new_att = attachment.model_dump()
    new_att["id"] = next_id(attachments) if attachments else 1
    new_att["task_id"] = task_id
    new_att["created_at"] = datetime.now().isoformat()

    attachments.append(new_att)
    data["attachments"] = attachments
    save_data(data)
    return new_att

@app.delete("/api/attachments/{attachment_id}")
def delete_attachment(attachment_id: int):
    data = load_data()
    attachments = data.get("attachments", [])
    data["attachments"] = [a for a in attachments if a["id"] != attachment_id]
    save_data(data)
    return {"message": "Attachment deleted"}

# ─── Project Endpoints ───

@app.get("/api/projects")
def get_projects(user_id: Optional[int] = None):
    data = load_data()
    projects = data.get("projects", [])
    if user_id:
        members = data.get("project_members", [])
        accessible_project_ids = set()
        for m in members:
            if m["user_id"] == user_id:
                accessible_project_ids.add(m["project_id"])
        # Also include projects owned by user
        for p in projects:
            if p.get("owner_id") == user_id:
                accessible_project_ids.add(p["id"])
        # Admin sees all
        user = next((u for u in data.get("users", []) if u["id"] == user_id), None)
        if user and user.get("role") == "admin":
            return {"projects": projects}
        projects = [p for p in projects if p["id"] in accessible_project_ids or p.get("visibility") == "public"]
    return {"projects": projects}

@app.post("/api/projects")
def create_project(project: ProjectCreate):
    data = load_data()
    projects = data.get("projects", [])

    new_project = project.model_dump()
    new_project["id"] = next_id(projects)
    new_project["created_at"] = datetime.now().isoformat()

    # Set default permissions if not provided
    if new_project.get("permissions") is None:
        new_project["permissions"] = dict(DEFAULT_PERMISSIONS)

    projects.append(new_project)
    data["projects"] = projects

    # Auto-add owner as member
    members = data.get("project_members", [])
    members.append({"project_id": new_project["id"], "user_id": new_project["owner_id"], "role": "owner"})

    # Add additional members from member_ids
    member_ids = new_project.pop("member_ids", None) or []
    for mid in member_ids:
        if mid != new_project["owner_id"]:
            if not any(m["project_id"] == new_project["id"] and m["user_id"] == mid for m in members):
                members.append({"project_id": new_project["id"], "user_id": mid, "role": "member"})

    data["project_members"] = members

    save_data(data)
    return new_project

@app.patch("/api/projects/{project_id}")
def update_project(project_id: int, updates: ProjectUpdate):
    data = load_data()
    projects = data.get("projects", [])

    for i, p in enumerate(projects):
        if p["id"] == project_id:
            update_data = updates.model_dump(exclude_unset=True)
            projects[i].update(update_data)
            save_data(data)
            return projects[i]

    raise HTTPException(status_code=404, detail="Project not found")

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int):
    data = load_data()
    projects = data.get("projects", [])
    data["projects"] = [p for p in projects if p["id"] != project_id]
    tasks = data.get("tasks", [])
    for i, t in enumerate(tasks):
        if t.get("project_id") == project_id:
            tasks[i]["archived_at"] = datetime.now().isoformat()
    # Clean up sub_projects, notes, members
    data["sub_projects"] = [s for s in data.get("sub_projects", []) if s.get("project_id") != project_id]
    data["notes"] = [n for n in data.get("notes", []) if n.get("project_id") != project_id]
    data["project_members"] = [m for m in data.get("project_members", []) if m.get("project_id") != project_id]
    save_data(data)
    return {"message": "Project deleted"}

# ─── Project Members ───

@app.get("/api/projects/{project_id}/members")
def get_project_members(project_id: int):
    data = load_data()
    members = [m for m in data.get("project_members", []) if m["project_id"] == project_id]
    # Enrich with user info
    users = {u["id"]: u for u in data.get("users", [])}
    enriched = []
    for m in members:
        user = users.get(m["user_id"], {})
        enriched.append({**m, "username": user.get("username", "Unknown"), "avatar_color": user.get("avatar_color", "#ccc")})
    return {"members": enriched}

@app.post("/api/projects/{project_id}/members")
def add_project_member(project_id: int, member: MemberAdd):
    data = load_data()
    # Check project exists
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    members = data.get("project_members", [])
    # Check duplicate
    if any(m["project_id"] == project_id and m["user_id"] == member.user_id for m in members):
        raise HTTPException(status_code=400, detail="User is already a member")

    # Check if project requires approval
    if project.get("require_approval", False):
        join_requests = data.get("join_requests", [])
        # Check if already requested
        if any(jr["project_id"] == project_id and jr["user_id"] == member.user_id and jr["status"] == "pending" for jr in join_requests):
            raise HTTPException(status_code=400, detail="이미 참여 요청이 있습니다")
        new_request = {
            "id": next_id(join_requests) if join_requests else 1,
            "project_id": project_id,
            "user_id": member.user_id,
            "role": member.role,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
        }
        join_requests.append(new_request)
        data["join_requests"] = join_requests
        save_data(data)
        return {"message": "참여 요청이 등록되었습니다. 관리자 승인 후 참여 가능합니다.", "status": "pending"}

    members.append({"project_id": project_id, "user_id": member.user_id, "role": member.role})
    data["project_members"] = members
    save_data(data)
    return {"message": "Member added"}

@app.delete("/api/projects/{project_id}/members/{user_id}")
def remove_project_member(project_id: int, user_id: int):
    data = load_data()
    members = data.get("project_members", [])
    data["project_members"] = [m for m in members if not (m["project_id"] == project_id and m["user_id"] == user_id)]
    save_data(data)
    return {"message": "Member removed"}

# ─── Join Requests ───

@app.post("/api/projects/{project_id}/join-request")
def request_join(project_id: int, user_id: int = Query(...)):
    """Request to join a project (when require_approval is ON)."""
    data = load_data()
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    members = data.get("project_members", [])
    if any(m["project_id"] == project_id and m["user_id"] == user_id for m in members):
        raise HTTPException(status_code=400, detail="이미 프로젝트 멤버입니다")

    join_requests = data.get("join_requests", [])
    if any(jr["project_id"] == project_id and jr["user_id"] == user_id and jr["status"] == "pending" for jr in join_requests):
        raise HTTPException(status_code=400, detail="이미 참여 요청이 있습니다")

    new_request = {
        "id": next_id(join_requests) if join_requests else 1,
        "project_id": project_id,
        "user_id": user_id,
        "role": "member",
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    }
    join_requests.append(new_request)
    data["join_requests"] = join_requests
    save_data(data)
    return {"message": "참여 요청이 등록되었습니다", "request": new_request}

@app.get("/api/projects/{project_id}/join-requests")
def get_join_requests(project_id: int):
    data = load_data()
    requests = [jr for jr in data.get("join_requests", []) if jr["project_id"] == project_id]
    # Enrich with user info
    users = {u["id"]: u for u in data.get("users", [])}
    for jr in requests:
        user = users.get(jr["user_id"], {})
        jr["username"] = user.get("username", "Unknown")
        jr["avatar_color"] = user.get("avatar_color", "#ccc")
    return {"join_requests": requests}

@app.post("/api/projects/{project_id}/join-requests/approve")
def approve_join_request(project_id: int, body: MemberApproval):
    """Approve or reject a join request."""
    data = load_data()
    join_requests = data.get("join_requests", [])

    target = None
    for jr in join_requests:
        if jr["project_id"] == project_id and jr["user_id"] == body.user_id and jr["status"] == "pending":
            target = jr
            break

    if not target:
        raise HTTPException(status_code=404, detail="참여 요청을 찾을 수 없습니다")

    if body.action == "approve":
        target["status"] = "approved"
        # Add as member
        members = data.get("project_members", [])
        members.append({"project_id": project_id, "user_id": body.user_id, "role": target.get("role", "member")})
        data["project_members"] = members
        data["join_requests"] = join_requests
        save_data(data)
        return {"message": "참여가 승인되었습니다"}
    elif body.action == "reject":
        target["status"] = "rejected"
        data["join_requests"] = join_requests
        save_data(data)
        return {"message": "참여가 거부되었습니다"}
    else:
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

# ─── Project Files ───

@app.get("/api/projects/{project_id}/files")
def get_project_files(project_id: int, user_id: Optional[int] = None):
    data = load_data()
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Permission check
    if user_id:
        check_project_permission(data, project_id, user_id, "file_view")

    files = [f for f in data.get("project_files", []) if f.get("project_id") == project_id]
    files.sort(key=lambda f: f.get("created_at", ""), reverse=True)
    return {"files": files}

@app.post("/api/projects/{project_id}/files")
async def upload_project_file(project_id: int, file: UploadFile = FastAPIFile(...), user_id: int = Query(default=1)):
    data = load_data()
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create project folder
    project_dir = os.path.join(UPLOAD_DIR, str(project_id))
    os.makedirs(project_dir, exist_ok=True)

    # Generate unique filename
    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(project_dir, stored_name)

    # Save file
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    file_size = len(contents)

    project_files = data.get("project_files", [])
    new_file = {
        "id": next_id(project_files) if project_files else 1,
        "project_id": project_id,
        "filename": file.filename or stored_name,
        "stored_name": stored_name,
        "size": file_size,
        "uploader_id": user_id,
        "created_at": datetime.now().isoformat(),
    }
    project_files.append(new_file)
    data["project_files"] = project_files
    save_data(data)
    return new_file

@app.get("/api/projects/{project_id}/files/{file_id}/download")
def download_project_file(project_id: int, file_id: int, user_id: Optional[int] = None):
    data = load_data()

    # Permission check
    if user_id:
        check_project_permission(data, project_id, user_id, "file_download")

    pf = next((f for f in data.get("project_files", []) if f["id"] == file_id and f["project_id"] == project_id), None)
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
    data = load_data()
    project_files = data.get("project_files", [])

    pf = next((f for f in project_files if f["id"] == file_id and f["project_id"] == project_id), None)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")

    # Remove from disk
    file_path = os.path.join(UPLOAD_DIR, str(project_id), pf["stored_name"])
    if os.path.exists(file_path):
        os.remove(file_path)

    data["project_files"] = [f for f in project_files if f["id"] != file_id]
    save_data(data)
    return {"message": "File deleted"}

# ─── SubProjects ───

@app.get("/api/projects/{project_id}/subprojects")
def get_subprojects(project_id: int):
    data = load_data()
    subs = [s for s in data.get("sub_projects", []) if s.get("project_id") == project_id]
    return {"sub_projects": subs}

@app.post("/api/projects/{project_id}/subprojects")
def create_subproject(project_id: int, sub: SubProjectCreate):
    data = load_data()
    # Check project exists
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    subs = data.get("sub_projects", [])
    new_sub = sub.model_dump()
    new_sub["id"] = next_id(subs) if subs else 1
    new_sub["project_id"] = project_id
    new_sub["created_at"] = datetime.now().isoformat()

    subs.append(new_sub)
    data["sub_projects"] = subs
    save_data(data)
    return new_sub

@app.patch("/api/subprojects/{sub_id}")
def update_subproject(sub_id: int, updates: SubProjectUpdate):
    data = load_data()
    subs = data.get("sub_projects", [])

    for i, s in enumerate(subs):
        if s["id"] == sub_id:
            update_data = updates.model_dump(exclude_unset=True)
            subs[i].update(update_data)
            save_data(data)
            return subs[i]

    raise HTTPException(status_code=404, detail="SubProject not found")

@app.delete("/api/subprojects/{sub_id}")
def delete_subproject(sub_id: int):
    data = load_data()
    subs = data.get("sub_projects", [])
    data["sub_projects"] = [s for s in subs if s["id"] != sub_id]
    # Archive tasks under this sub_project
    for t in data.get("tasks", []):
        if t.get("sub_project_id") == sub_id:
            t["sub_project_id"] = None
    save_data(data)
    return {"message": "SubProject deleted"}

# ─── Notes ───

@app.get("/api/projects/{project_id}/notes")
def get_notes(project_id: int, user_id: Optional[int] = None):
    data = load_data()
    # Permission check (optional, soft)
    if user_id:
        try:
            check_project_access(data, project_id, user_id)
        except HTTPException:
            raise
    notes = [n for n in data.get("notes", []) if n.get("project_id") == project_id]
    notes.sort(key=lambda n: n.get("created_at", ""), reverse=True)
    # Enrich with author info
    users = {u["id"]: u for u in data.get("users", [])}
    for n in notes:
        author = users.get(n.get("author_id"), {})
        n["author_name"] = author.get("username", "Unknown")
        n["author_color"] = author.get("avatar_color", "#ccc")
    return {"notes": notes}

@app.post("/api/projects/{project_id}/notes")
def create_note(project_id: int, note: NoteCreate, user_id: int = Query(default=1)):
    data = load_data()
    # Check project exists
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    notes = data.get("notes", [])
    new_note = note.model_dump()
    new_note["id"] = next_id(notes) if notes else 1
    new_note["project_id"] = project_id
    new_note["author_id"] = user_id
    new_note["created_at"] = datetime.now().isoformat()
    new_note["updated_at"] = datetime.now().isoformat()

    notes.append(new_note)
    data["notes"] = notes
    save_data(data)
    return {**new_note, "message": "메모가 등록되었습니다"}

@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int):
    data = load_data()
    notes = data.get("notes", [])
    data["notes"] = [n for n in notes if n["id"] != note_id]
    save_data(data)
    return {"message": "Note deleted"}

# ─── Roadmap (Gantt) API ───

@app.get("/api/roadmap")
def get_roadmap(
    project_id: int = Query(...),
    view: str = Query(default="month"),
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    assignee_id: Optional[int] = None,
    status: Optional[str] = None,
):
    data = load_data()
    today_str = date.today().isoformat()

    # Get project
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get sub_projects for this project
    sub_projects = [s for s in data.get("sub_projects", []) if s.get("project_id") == project_id]

    # Get tasks for this project (non-archived)
    tasks = [t for t in data.get("tasks", []) if t.get("project_id") == project_id and not t.get("archived_at")]

    # Apply filters
    if assignee_id:
        tasks = [t for t in tasks if assignee_id in t.get("assignee_ids", [])]
    if status:
        tasks = [t for t in tasks if t.get("status") == status]
    if from_date:
        tasks = [t for t in tasks if (t.get("due_date") or "9999") >= from_date or (t.get("start_date") or "9999") >= from_date]
    if to_date:
        tasks = [t for t in tasks if (t.get("start_date") or "0000") <= to_date]

    # Build tree
    items = []

    # Top-level project item
    all_project_tasks = [t for t in data.get("tasks", []) if t.get("project_id") == project_id and not t.get("archived_at")]
    # Weighted average progress excluding Hold tasks
    active_tasks = [t for t in all_project_tasks if t.get("status") != "hold"]
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

    # Min start, max due for project
    start_dates = [t["start_date"] for t in all_project_tasks if t.get("start_date")]
    due_dates = [t["due_date"] for t in all_project_tasks if t.get("due_date")]

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

    # SubProject items
    for sp in sub_projects:
        sp_tasks = [t for t in tasks if t.get("sub_project_id") == sp["id"]]
        sp_all_tasks = [t for t in all_project_tasks if t.get("sub_project_id") == sp["id"]]
        # Weighted average progress excluding Hold tasks
        sp_active = [t for t in sp_all_tasks if t.get("status") != "hold"]
        sp_total = len(sp_active)
        sp_done = len([t for t in sp_active if t.get("status") == "done"])
        if sp_total > 0:
            sp_progress_sum = sum(
                100 if t.get("status") == "done" else (t.get("progress", 0) or 0)
                for t in sp_active
            )
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

    # Tasks without sub_project
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

# ─── Dashboard Stats ───

@app.get("/api/stats")
def get_stats(user_id: Optional[int] = None):
    data = load_data()
    tasks = [t for t in data.get("tasks", []) if not t.get("archived_at")]
    projects = data.get("projects", [])
    users = data.get("users", [])

    total = len(tasks)
    in_progress = len([t for t in tasks if t.get("status") == "in_progress"])
    done = len([t for t in tasks if t.get("status") == "done"])
    todo = len([t for t in tasks if t.get("status") == "todo"])
    hold = len([t for t in tasks if t.get("status") == "hold"])

    # Per-project stats
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
    upcoming.sort(key=lambda x: x.get("due_date", ""))

    my_tasks = []
    if user_id:
        my_tasks = [t for t in tasks if user_id in t.get("assignee_ids", [])]

    return {
        "total": total,
        "in_progress": in_progress,
        "done": done,
        "todo": todo,
        "hold": hold,
        "project_stats": project_stats,
        "overdue": overdue[:10],
        "upcoming": upcoming[:10],
        "my_tasks": my_tasks,
    }

# ─── Node Graph Data ───

@app.get("/api/projects/{project_id}/graph")
def get_project_graph(project_id: int):
    """Returns nodes and edges for graph visualization."""
    data = load_data()
    project = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    nodes = []
    edges = []

    # Project node
    nodes.append({"id": f"project-{project_id}", "type": "project", "label": project["name"]})

    # SubProjects
    for sp in data.get("sub_projects", []):
        if sp.get("project_id") == project_id:
            sp_id = f"subproject-{sp['id']}"
            nodes.append({"id": sp_id, "type": "subproject", "label": sp["name"]})
            edges.append({"source": f"project-{project_id}", "target": sp_id})

    # Tasks
    for t in data.get("tasks", []):
        if t.get("project_id") == project_id and not t.get("archived_at"):
            t_id = f"task-{t['id']}"
            nodes.append({"id": t_id, "type": "task", "label": t["title"], "status": t.get("status")})
            if t.get("sub_project_id"):
                edges.append({"source": f"subproject-{t['sub_project_id']}", "target": t_id})
            else:
                edges.append({"source": f"project-{project_id}", "target": t_id})

            # Attachments for this task
            for a in data.get("attachments", []):
                if a.get("task_id") == t["id"]:
                    a_id = f"attachment-{a['id']}"
                    nodes.append({"id": a_id, "type": "attachment", "label": a.get("filename", a.get("url", ""))})
                    edges.append({"source": t_id, "target": a_id})

    # Notes
    for n in data.get("notes", []):
        if n.get("project_id") == project_id:
            n_id = f"note-{n['id']}"
            label = n.get("content", "")[:30] + ("..." if len(n.get("content", "")) > 30 else "")
            nodes.append({"id": n_id, "type": "note", "label": label})
            edges.append({"source": f"project-{project_id}", "target": n_id})

    return {"nodes": nodes, "edges": edges}

# ─── AI Settings & Report Generation ───

class AiSettingsUpdate(BaseModel):
    api_url: str
    model_name: str
    api_key: Optional[str] = None

class ReportRequest(BaseModel):
    project_id: int

@app.get("/api/settings/ai")
def get_ai_settings():
    data = load_data()
    return data.get("ai_settings", {"api_url": "", "model_name": "", "api_key": ""})

@app.put("/api/settings/ai")
def save_ai_settings(body: AiSettingsUpdate):
    data = load_data()
    data["ai_settings"] = {
        "api_url": body.api_url,
        "model_name": body.model_name,
        "api_key": body.api_key or "",
    }
    save_data(data)
    return {"message": "AI settings saved", "settings": data["ai_settings"]}

@app.post("/api/report/generate")
def generate_report(body: ReportRequest):
    import httpx

    data = load_data()
    ai_settings = data.get("ai_settings", {})
    api_url = ai_settings.get("api_url", "")
    model_name = ai_settings.get("model_name", "")
    api_key = ai_settings.get("api_key", "")

    if not api_url or not model_name:
        raise HTTPException(status_code=400, detail="AI settings not configured. Please set API URL and model name in Settings.")

    # ── Collect project data ──
    project = None
    for p in data.get("projects", []):
        if p["id"] == body.project_id:
            project = p
            break
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tasks = [t for t in data.get("tasks", []) if t.get("project_id") == body.project_id and not t.get("archived_at")]
    sub_projects = [sp for sp in data.get("sub_projects", []) if sp.get("project_id") == body.project_id]
    all_attachments = data.get("attachments", [])
    raw_members = data.get("project_members", [])
    if isinstance(raw_members, list):
        members = [m for m in raw_members if m.get("project_id") == body.project_id]
    elif isinstance(raw_members, dict):
        members = raw_members.get(str(body.project_id), [])
    else:
        members = []
    users = {u["id"]: u for u in data.get("users", [])}
    notes = [n for n in data.get("notes", []) if n.get("project_id") == body.project_id]
    project_files = [f for f in data.get("project_files", []) if f.get("project_id") == body.project_id]

    # ── Calculate progress (Hold excluded, 1 decimal) ──
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

    # ── Build structured task data ──
    task_details = []
    for t in tasks:
        assignees = [users.get(a, {}).get("username", f"User {a}") for a in t.get("assignee_ids", [])]
        sp_name = ""
        if t.get("sub_project_id"):
            sp = next((s for s in sub_projects if s["id"] == t["sub_project_id"]), None)
            sp_name = sp["name"] if sp else ""
        
        # Get attachments for this task
        task_attachments = [a for a in all_attachments if a.get("task_id") == t["id"]]
        
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
                {"id": a["id"], "filename": a.get("filename", ""), "url": a.get("url", ""), "type": a.get("type", "url")}
                for a in task_attachments
            ],
        })

    # ── Build member info ──
    member_names = []
    for m in members:
        uid = m.get("user_id", m) if isinstance(m, dict) else m
        user = users.get(uid)
        if user:
            member_names.append(f'{user["username"]} ({user.get("role", "member")})')

    # ── Status breakdown ──
    status_breakdown = {
        "total": len(tasks),
        "active": len(active_tasks),
        "done": len(done_tasks),
        "in_progress": len(in_progress_tasks),
        "todo": len(todo_tasks),
        "hold": len(hold_tasks),
        "overall_progress": overall_progress,
    }

    # ── Build structured data for frontend ──
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

    # ── Build AI prompt ──
    task_lines = []
    for t in task_details:
        att_info = ""
        if t["attachments"]:
            att_names = ", ".join([a["filename"] or a["url"] for a in t["attachments"]])
            att_info = f" | 첨부파일: {att_names}"
        task_lines.append(
            f'- {t["title"]} | 상태: {t["status"]} | 우선순위: {t["priority"]} '
            f'| 진행률: {t["progress"]}% | 마감일: {t["due_date"] or "미정"} '
            f'| 담당자: {", ".join(t["assignees"]) if t["assignees"] else "미배정"}'
            f'| 설명: {t["description"] or "없음"}{att_info}'
        )

    prompt = f"""당신은 전문 프로젝트 매니저 보조 AI입니다. 아래 프로젝트 데이터를 분석하여 스토리형 종합 보고서를 작성해주세요.

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

[섹션1: 프로젝트 개요]
프로젝트의 전체 목적을 한 문장으로 요약하고, 현재 전체 진행률과 상태를 설명하세요.

[섹션2: Task별 분석]
각 Task에 대해 현재 상태, 진행률, 그리고 현재까지 어떤 단계까지 진행되었는지를 설명하세요.
첨부 자료가 있는 경우, 해당 자료가 Task 진행에서 어떤 역할을 하는지도 설명하세요.

[섹션3: 종합 현황 분석]
현재 프로젝트가 어떤 단계에 있는지, 핵심 진행 작업, 완료 작업, 지연/보류 작업을 정리하세요.
프로젝트에 첨부파일이 있으면, 어떤 파일이 포함되어 있는지 간략히 안내하세요.

[섹션4: 다음 단계 제언]
다음으로 가장 중요한 작업이 무엇인지, 어떤 순서로 진행하면 좋을지 제안하세요.

각 섹션은 [섹션1], [섹션2] 등의 태그로 시작해주세요. 반드시 한국어로 작성하세요."""

    # ── Call external LLM API ──
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    endpoint = api_url.rstrip("/")
    is_huggingface = "huggingface.co" in endpoint or "hf.space" in endpoint

    if is_huggingface:
        payload = {
            "model": model_name,
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": 4096,
                "temperature": 0.3,
                "return_full_text": False,
            },
        }
    else:
        if not endpoint.endswith("/chat/completions"):
            if endpoint.endswith("/v1"):
                endpoint += "/chat/completions"
            elif not endpoint.endswith("/v1/chat/completions"):
                endpoint += "/v1/chat/completions"

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You are a professional project management report generator. Always respond in Korean. Do not use markdown syntax."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 4096,
        }

    try:
        with httpx.Client(timeout=120.0) as client:
            response = client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()

            if is_huggingface:
                if isinstance(result, list) and len(result) > 0:
                    content = result[0].get("generated_text", "Report generation failed.")
                else:
                    content = result.get("generated_text", str(result))
            else:
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "Report generation failed.")

            # ── Parse sections ──
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

            # If no sections detected, put everything in overview
            if not any(sections.values()):
                sections["overview"] = content

            return {
                "report": content,
                "sections": sections,
                "structured": structured,
                "model": model_name,
            }
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail=f"Cannot connect to AI model at {endpoint}. Please check the API URL.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"AI API returned error {e.response.status_code}: {e.response.text[:300]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")

# Initialize stub data if file doesn't exist
if not os.path.exists(DATA_FILE):
    save_data(load_data())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
