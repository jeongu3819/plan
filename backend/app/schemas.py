from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

# -------------------
# Project
# -------------------
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

# -------------------
# User
# -------------------
class UserCreate(BaseModel):
    username: str
    loginid: str
    role: str = "member"
    avatar_color: str = "#2955FF"

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    loginid: str
    role: str
    avatar_color: str
    is_active: bool
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None  # ✅ DB에 넣기로 했으면 추가

# -------------------
# Task
# -------------------
class TaskCreate(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = None
    status: str = "todo"
    priority: str = "medium"
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    assignee_ids: List[int] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    assignee_ids: Optional[List[int]] = None
    tags: Optional[List[str]] = None

class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    assignee_ids: List[int] = Field(default_factory=list)
    tags: List[int] = Field(default_factory=list)  # ⚠️ 아래 주의 참고
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
