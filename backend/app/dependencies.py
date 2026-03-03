# app/dependencies.py
from fastapi import Request, HTTPException, Depends
from sqlalchemy.orm import Session
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

def get_active_user(request: Request, db: Session = Depends(get_db)):
    """등록된 활성 사용자만 통과. 미등록/비활성이면 403."""
    user_info = get_user_info(request)  # 401 if no session
    loginid = (user_info or {}).get("loginid", "")
    from app.models import User
    user = db.query(User).filter(User.loginid == loginid).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="접근 권한이 없습니다. 관리자에게 등록을 요청하세요."
        )
    return user
