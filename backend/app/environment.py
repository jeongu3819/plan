# app/environment.py
import os
from dotenv import load_dotenv
from datetime import timedelta, timezone

BASE_DIR = os.path.dirname(__file__)

def env_path(name: str) -> str:
    return os.path.join(BASE_DIR, name)

ENV_MODE = os.getenv("ENV_MODE", "development").lower()

if ENV_MODE == "development":
    if os.path.isfile(env_path(".env.local")):
        print("🔧 [ENV] Loading app/.env.local (development)")
        load_dotenv(env_path(".env.local"), override=True)
    else:
        print("🔧 [ENV] Loading app/.env (development fallback)")
        load_dotenv(env_path(".env"), override=True)
else:
    env_file = f".env.{ENV_MODE}"
    if os.path.isfile(env_path(env_file)):
        print(f"🔧 [ENV] Loading app/{env_file} (ENV_MODE={ENV_MODE})")
        load_dotenv(env_path(env_file), override=True)
    elif os.path.isfile(env_path(".env.production")):
        print("🔧 [ENV] Loading app/.env.production (fallback)")
        load_dotenv(env_path(".env.production"), override=True)
    else:
        print("⚠️ [ENV] .env 파일을 찾지 못했습니다. OS 환경변수만 사용합니다.")

# ===== SSO / OAuth =====
ADFS_TOKEN_URL = os.getenv("ADFS_TOKEN_URL")
ADFS_AUTH_URL = os.getenv("ADFS_AUTH_URL", "https://stsds.secsso.net/adfs/oauth2/authorize/")

CLIENT_ID = os.getenv("CLIENT_ID") or os.getenv("SSO_CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET") or os.getenv("SSO_CLIENT_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8085/api/auth/callback")


# ===== DB 설정 =====
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://~~@localhost:3306/schedule" 
)

# ===== Timezone =====
KST = timezone(timedelta(hours=9))

# ===== BYPASS =====
BYPASS_SSO = os.getenv("BYPASS_SSO", "False").lower() == "true"
BYPASS_USER_INFO = {
    "loginid": os.getenv("BYPASS_LOGINID") or os.getenv("LOGIN_ID", "local.dev"),
    "username": os.getenv("BYPASS_USERNAME") or os.getenv("USER_NAME", "Local DEV"),
    "deptname": os.getenv("BYPASS_DEPTNAME") or os.getenv("USER_DEPARTMENT", "데분 파트"),
    "mail": os.getenv("BYPASS_MAIL") or os.getenv("USER_MAIL", "local.dev@example.com"),
}

# ===== Front redirect =====
FRONTEND_REDIRECT_URI = (
    os.getenv("FRONTEND_REDIRECT_URI")
    or os.getenv("REDIRECT_URI_LOCAL")
    or "http://localhost:5173"
)

# ===== CORS =====
def _parse_origins(v: str):
    return [x.strip() for x in (v or "").split(",") if x.strip()]

CORS_ORIGINS = _parse_origins(
    os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
)


