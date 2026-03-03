"""
002_migrate_sidecar_to_db.py

Migrates data from data.json sidecar to database tables:
- sub_projects → sub_projects table
- project_members → project_members table
- notes → notes table + note_mentions table

Usage:
    cd backend
    python -m migrations.002_migrate_sidecar_to_db

Or:
    python migrations/002_migrate_sidecar_to_db.py
"""

import json
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime
from app.db_connections.sqlalchemy import SessionLocal
from app.models import SubProject, Note, NoteMention, ProjectMember


DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data.json")


def load_sidecar():
    if not os.path.exists(DATA_FILE):
        print(f"[WARN] data.json not found at {DATA_FILE}")
        return {}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_dt(s):
    """Parse ISO datetime string"""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", ""))
    except Exception:
        return None


def migrate_sub_projects(db, state):
    sidecar = state.get("sub_projects", [])
    migrated = 0
    skipped = 0

    for sp in sidecar:
        sp_id = int(sp.get("id", 0))
        if not sp_id:
            continue

        existing = db.query(SubProject).filter(SubProject.id == sp_id).first()
        if existing:
            skipped += 1
            continue

        row = SubProject(
            id=sp_id,
            project_id=int(sp.get("project_id", 0)),
            name=sp.get("name", ""),
            description=sp.get("description"),
            parent_id=sp.get("parent_id"),
            created_at=parse_dt(sp.get("created_at")),
        )
        db.add(row)
        migrated += 1

    db.commit()
    print(f"[sub_projects] migrated={migrated}, skipped={skipped}")


def migrate_project_members(db, state):
    sidecar = state.get("project_members", [])
    migrated = 0
    skipped = 0

    for m in sidecar:
        pid = int(m.get("project_id", 0))
        uid = int(m.get("user_id", 0))
        if not pid or not uid:
            continue

        existing = db.query(ProjectMember).filter(
            ProjectMember.project_id == pid,
            ProjectMember.user_id == uid,
        ).first()
        if existing:
            skipped += 1
            continue

        row = ProjectMember(
            project_id=pid,
            user_id=uid,
            role=m.get("role", "member"),
        )
        db.add(row)
        migrated += 1

    db.commit()
    print(f"[project_members] migrated={migrated}, skipped={skipped}")


def migrate_notes(db, state):
    sidecar = state.get("notes", [])
    notes_migrated = 0
    mentions_migrated = 0
    skipped = 0

    for n in sidecar:
        note_id = int(n.get("id", 0))
        if not note_id:
            continue

        existing = db.query(Note).filter(Note.id == note_id).first()
        if existing:
            skipped += 1
            continue

        row = Note(
            id=note_id,
            project_id=int(n.get("project_id", 0)),
            author_id=int(n.get("author_id", 0)) or None,
            content=n.get("content", ""),
            created_at=parse_dt(n.get("created_at")),
            updated_at=parse_dt(n.get("updated_at")),
        )
        db.add(row)
        notes_migrated += 1

        # Migrate mentions
        for uid in n.get("mentioned_user_ids", []):
            mention = NoteMention(
                note_id=note_id,
                user_id=int(uid),
            )
            db.add(mention)
            mentions_migrated += 1

    db.commit()
    print(f"[notes] migrated={notes_migrated}, skipped={skipped}")
    print(f"[note_mentions] migrated={mentions_migrated}")


def main():
    print("=" * 60)
    print("Sidecar → DB Migration Script")
    print("=" * 60)

    state = load_sidecar()
    if not state:
        print("[ERROR] No data to migrate")
        return

    db = SessionLocal()
    try:
        migrate_sub_projects(db, state)
        migrate_project_members(db, state)
        migrate_notes(db, state)
        print("\n[DONE] Migration complete!")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
