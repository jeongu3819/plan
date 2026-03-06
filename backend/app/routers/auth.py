# app/routers/auth.py
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
import requests, jwt, traceback, secrets
from urllib.parse import urlencode
from datetime import datetime, timedelta
from typing import Optional

from app.dependencies import get_db
from app.environment import (
    ADFS_TOKEN_URL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI,
    ADFS_AUTH_URL, BYPASS_SSO, BYPASS_USER_INFO, FRONTEND_REDIRECT_URI
)
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 🔐 super_admin 로그인ID (소문자 관리)
SUPER_ADMIN_LOGINIDS = {"jimi.lee", "juhui07.kim", "zoltas.roh"}

def is_super_admin_loginid(loginid: Optional[str]) -> bool:
    return (loginid or "").strip().lower() in SUPER_ADMIN_LOGINIDS


# ──────────────────────────────
# Session 관리
# ──────────────────────────────

SESSIONS = {}  # token -> {"user": {...}, "created_at": datetime}
SESSION_TTL_HOURS = 24

def create_session_token() -> str:
    return secrets.token_urlsafe(32)

def save_session(token: str, user_info: dict):
    SESSIONS[token] = {"user": user_info, "created_at": datetime.now()}

def load_session(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None

    data = SESSIONS.get(token)
    if not data:
        return None

    if datetime.now() - data["created_at"] > timedelta(hours=SESSION_TTL_HOURS):
        SESSIONS.pop(token, None)
        return None

    return data["user"]


# ──────────────────────────────
# SSO 토큰 디코딩
# ──────────────────────────────

def get_user_info_from_token(id_token: str):
    decoded = jwt.decode(id_token, options={"verify_signature": False})
    return {
        "deptname": decoded.get("deptname", "") or "",
        "username": decoded.get("username", "") or "",
        "loginid": decoded.get("loginid", "") or "",
        "mail": decoded.get("mail", "") or "",
    }


# ──────────────────────────────
# 로그인 시작
# ──────────────────────────────

@router.get("/login")
async def auth_login():
    if BYPASS_SSO:
        return RedirectResponse(url="/api/auth/bypass")

    if not CLIENT_ID or not REDIRECT_URI or not ADFS_AUTH_URL:
        raise HTTPException(status_code=500, detail="SSO env not configured")

    qs = urlencode({
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
    })

    base = ADFS_AUTH_URL.rstrip("?")
    sep = "&" if "?" in base else "?"
    return RedirectResponse(url=f"{base}{sep}{qs}")


# ──────────────────────────────
# 개발용 BYPASS
# ──────────────────────────────

@router.get("/bypass")
async def auth_bypass(db: Session = Depends(get_db)):
    if not BYPASS_SSO:
        raise HTTPException(status_code=400)

    loginid = BYPASS_USER_INFO["loginid"].lower()

    row = db.query(User).filter(User.loginid == loginid).first()

    # 🔥 없으면 자동 생성
    if not row:
        row = User(
            loginid=loginid,
            username=BYPASS_USER_INFO["username"],
            deptname=BYPASS_USER_INFO["deptname"],
            mail=BYPASS_USER_INFO.get("mail"),
            role="super_admin",  # 개발환경이면 super_admin 줘도 됨
            is_active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

    token = create_session_token()

    session_user_info = {
        "loginid": row.loginid,
        "username": row.username,
        "deptname": row.deptname,
        "mail": row.mail,
        "user_id": row.id,
        "role": row.role,
        "is_active": row.is_active,
    }

    save_session(token, session_user_info)

    return RedirectResponse(
        url=f"{FRONTEND_REDIRECT_URI}/sso-callback#token={token}"
    )


# ──────────────────────────────
# SSO Callback
# ──────────────────────────────

@router.get("/callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    auth_code = request.query_params.get("code")
    if not auth_code:
        raise HTTPException(status_code=400, detail="인증 코드가 없습니다.")

    if not (ADFS_TOKEN_URL and CLIENT_ID and CLIENT_SECRET and REDIRECT_URI):
        raise HTTPException(status_code=500, detail="SSO env not configured")

    token_data = {
        "grant_type": "authorization_code",
        "code": auth_code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
    }

    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        response = requests.post(
            ADFS_TOKEN_URL,
            data=token_data,
            headers=headers,
            verify=False,
            proxies={"http": None, "https": None},
        )
        response.raise_for_status()

        token_json = response.json()
        id_token = token_json.get("id_token")
        if not id_token:
            raise HTTPException(status_code=400, detail="id_token missing")

        user_info = get_user_info_from_token(id_token)
        loginid = user_info["loginid"]

        row = db.query(User).filter(User.loginid == loginid).first()

        # DB에 없으면: 허용 부서 체크 후 자동 등록 OR 접근 불가
        if not row:
            # 부서 기반 접근 허용 체크
            sso_deptname = (user_info.get("deptname") or "").strip()
            allowed = False
            if sso_deptname:
                from main import load_state as _load_state
                try:
                    _state = _load_state()
                    allowed_groups = _state.get("groups", [])
                    allowed = any(
                        (g.get("name") or "").strip() == sso_deptname and g.get("is_active", True)
                        for g in allowed_groups
                    )
                except Exception:
                    allowed = False

            if not allowed:
                raise HTTPException(
                    status_code=403,
                    detail="사이트 접근 권한이 없습니다. 관리자에게 문의하세요."
                )

            # 허용 부서 사용자: 자동 등록
            row = User(
                loginid=loginid,
                username=user_info.get("username") or loginid,
                deptname=sso_deptname,
                mail=user_info.get("mail") or None,
                role="member",
                is_active=True,
                avatar_color="#2955FF",
                group_name=sso_deptname,
            )
            db.add(row)
            db.commit()
            db.refresh(row)

        # 🔐 super_admin 강제 유지
        if is_super_admin_loginid(loginid):
            row.role = "super_admin"
            row.is_active = True

        # 🔒 비활성 사용자 차단
        if not row.is_active:
            raise HTTPException(
                status_code=403,
                detail="관리자 승인 후 이용 가능합니다."
            )

        # 로그인 시간 갱신 + SSO에서 받은 deptname/mail로 DB 동기화
        row.last_login_at = datetime.now()
        if user_info.get("deptname"):
            row.deptname = user_info["deptname"]
        if user_info.get("mail"):
            row.mail = user_info["mail"]
        db.commit()
        db.refresh(row)

        session_user_info = {
            **user_info,
            "user_id": row.id,
            "role": row.role,
            "is_active": row.is_active,
        }

        session_token = create_session_token()
        save_session(session_token, session_user_info)

        return RedirectResponse(
            url=f"{FRONTEND_REDIRECT_URI}/sso-callback#token={session_token}"
        )

    except HTTPException:
        raise
    except Exception as e:
        print("🔴 Auth callback error:", e)
        traceback.print_exc()
        raise HTTPException(status_code=400, detail="인증 처리 실패")


# ──────────────────────────────
# 현재 사용자 조회
# ──────────────────────────────

@router.get("/user/me")
async def auth_user_me(request: Request, db: Session = Depends(get_db)):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No authorization token")

    token = auth_header.replace("Bearer ", "").strip()
    user_info = load_session(token)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    loginid = user_info.get("loginid")
    row = db.query(User).filter(User.loginid == loginid).first()

    if not row:
        raise HTTPException(status_code=403, detail="사이트 접근 권한이 없습니다.")

    if not row.is_active:
        raise HTTPException(status_code=403, detail="관리자 승인 후 이용 가능합니다.")

    return {
        **user_info,
        "user_id": row.id,
        "role": row.role,
        "is_active": row.is_active,
        "username": row.username,
        "deptname": row.deptname,
        "mail": row.mail,
    }

@router.post("/admin/users")
def create_user(data: dict, current_user_id: int, db: Session = Depends(get_db)):
    loginid = (data.get("loginid") or "").strip().lower()
    if not loginid:
        raise HTTPException(status_code=400, detail="loginid required")

    existing = db.query(User).filter(User.loginid == loginid).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 등록된 사용자입니다.")

    new_user = User(
        loginid=loginid,
        username=data.get("username") or loginid,
        deptname=data.get("deptname") or None,
        mail=data.get("mail") or None,
        role="member",
        is_active=False,
        avatar_color="#2955FF",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user