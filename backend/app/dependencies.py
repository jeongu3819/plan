# app/dependencies.py
from fastapi import Request, HTTPException
from app.db_connections.sqlalchemy import SessionLocal

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_user_info(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "").strip()

        # 지연 import (순환 import 방지)
        from app.routers.auth import load_session

        user_info = load_session(token)
        if user_info:
            return user_info

    raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

def get_user_info_optional(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.replace("Bearer ", "").strip()
        from app.routers.auth import load_session
        return load_session(token)
    return None
