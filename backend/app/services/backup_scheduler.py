"""
DB 백업 + 첨부파일 동기화 스케줄러

- APScheduler 기반 (uvicorn 재시작 시 자동 복구)
- DB 백업: 하루 1회 (SQLite → 파일 복사, MySQL → mysqldump)
- 첨부파일 동기화: 하루 1회 로컬 uploads/ → S3
- 수동 실행 API도 제공

선택 이유 (APScheduler):
- Python 프로세스 내장 → 별도 cron 설정 불필요
- uvicorn 재시작 시 자동으로 다시 시작
- 환경변수로 시간 설정 가능
- Linux cron은 서버 설정 의존성이 높아 이 프로젝트 구조에서는 APScheduler가 더 안정적

⚠️ 환경변수는 실행 시점(함수 호출 시)에 읽어야 합니다.
   모듈 import 시점에 os.getenv()를 호출하면
   environment.py가 아직 .env를 로드하지 않았을 때 기본값이 고정될 수 있습니다.
"""

import os
import shutil
import logging
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger("backup_scheduler")

KST = timezone(timedelta(hours=9))

# 백업 로그 디렉토리
BACKUP_LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backup_logs")
os.makedirs(BACKUP_LOG_DIR, exist_ok=True)

_scheduler: Optional[BackgroundScheduler] = None


# ── 실행 시점에 환경변수를 안전하게 읽는 헬퍼 ──

def _get_backup_hour() -> int:
    return int(os.getenv("BACKUP_HOUR", "3"))

def _get_backup_minute() -> int:
    return int(os.getenv("BACKUP_MINUTE", "0"))

def _get_database_url() -> str:
    return os.getenv("DATABASE_URL", "sqlite:///./dev.db")

def _get_upload_dir() -> str:
    return os.getenv("UPLOAD_DIR", "uploads")

def _get_mysqldump_path() -> str:
    """mysqldump 실행 경로. Windows에서 PATH에 없으면 전체 경로 지정 가능."""
    return os.getenv("MYSQLDUMP_PATH", "mysqldump")

def _should_delete_local() -> bool:
    """백업 성공 후 로컬 dump 파일 삭제 여부"""
    return os.getenv("BACKUP_DELETE_LOCAL", "true").lower() in ("true", "1", "yes")


# ── export (main.py의 backup/status API에서 참조) ──
# BACKUP_HOUR, BACKUP_MINUTE는 main.py에서 import해서 쓰므로
# 모듈 레벨 변수로 유지. environment.py가 이미 로드된 후 이 모듈이
# lazy import 되므로 이 시점에서는 값이 정상적으로 읽힙니다.
BACKUP_HOUR = _get_backup_hour()
BACKUP_MINUTE = _get_backup_minute()


def _now_kst() -> datetime:
    return datetime.now(KST)


def _log_backup_result(backup_type: str, success: bool, details: str, s3_key: str = ""):
    """백업 결과를 로그 파일에 기록"""
    timestamp = _now_kst().isoformat()
    status = "SUCCESS" if success else "FAILED"
    log_line = f"[{timestamp}] [{status}] [{backup_type}] {details}"
    if s3_key:
        log_line += f" | s3_key={s3_key}"
    log_line += "\n"

    log_file = os.path.join(BACKUP_LOG_DIR, f"backup_{_now_kst().strftime('%Y-%m')}.log")
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception as e:
        logger.error(f"백업 로그 기록 실패: {e}")

    if success:
        logger.info(log_line.strip())
    else:
        logger.error(log_line.strip())


def backup_database() -> dict:
    """
    DB 백업 실행.
    - SQLite: 파일 복사
    - MySQL: mysqldump 실행
    반환: {"success": bool, "local_path": str, "s3_result": dict}
    """
    from utils.s3_utils import upload_local_file_to_s3, is_s3_configured

    database_url = _get_database_url()
    now = _now_kst()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H%M%S")

    backup_dir = os.path.join(BACKUP_LOG_DIR, "db", date_str)
    os.makedirs(backup_dir, exist_ok=True)

    local_path = ""
    success = False
    dbname = ""

    try:
        if "sqlite" in database_url:
            # SQLite: 파일 복사
            db_file = database_url.replace("sqlite:///", "").replace("sqlite://", "")
            if db_file.startswith("./"):
                db_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), db_file[2:])

            if not os.path.exists(db_file):
                _log_backup_result("DB", False, f"SQLite 파일 없음: {db_file}")
                return {"success": False, "local_path": "", "s3_result": None, "error": f"DB file not found: {db_file}"}

            backup_filename = f"dev_backup_{date_str}_{time_str}.db"
            local_path = os.path.join(backup_dir, backup_filename)
            shutil.copy2(db_file, local_path)
            dbname = "dev"
            success = True

        elif "mysql" in database_url:
            # MySQL: mysqldump
            # mysql+pymysql://user:pass@host:port/dbname
            from urllib.parse import urlparse
            parsed = urlparse(database_url.replace("mysql+pymysql://", "mysql://"))
            user = parsed.username or "root"
            password = parsed.password or ""
            host = parsed.hostname or "localhost"
            port = parsed.port or 3306
            dbname = parsed.path.lstrip("/")

            # 파일명에 DB명 포함: schedule_2026-04-14_030000.sql
            backup_filename = f"{dbname}_{date_str}_{time_str}.sql"
            local_path = os.path.join(backup_dir, backup_filename)

            mysqldump_path = _get_mysqldump_path()

            cmd = [
                mysqldump_path,
                f"-u{user}",
                f"-h{host}",
                f"-P{port}",
                "--single-transaction",
                "--quick",
                "--routines",
                "--triggers",
                dbname,
            ]
            env = os.environ.copy()
            if password:
                env["MYSQL_PWD"] = password

            logger.info(f"mysqldump 실행: {mysqldump_path} -u{user} -h{host} -P{port} {dbname}")

            with open(local_path, "w", encoding="utf-8") as f:
                result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, env=env, timeout=300)
                if result.returncode != 0:
                    stderr_msg = result.stderr.decode("utf-8", errors="replace")
                    _log_backup_result("DB", False, f"mysqldump 실패 (returncode={result.returncode}): {stderr_msg}")
                    logger.error(f"mysqldump stderr: {stderr_msg}")
                    return {"success": False, "local_path": local_path, "s3_result": None, "error": stderr_msg}

            # dump 파일 크기 확인 (빈 파일 방지)
            file_size = os.path.getsize(local_path)
            if file_size == 0:
                _log_backup_result("DB", False, f"mysqldump 결과 파일이 비어있음: {local_path}")
                return {"success": False, "local_path": local_path, "s3_result": None, "error": "Empty dump file"}

            logger.info(f"[DB 전체 dump 성공] DB={dbname}, 파일={local_path} ({file_size:,} bytes)")
            success = True

        else:
            _log_backup_result("DB", False, f"지원하지 않는 DB 타입: {database_url[:30]}")
            return {"success": False, "local_path": "", "s3_result": None, "error": "Unsupported DB type"}

    except FileNotFoundError:
        _log_backup_result("DB", False, f"mysqldump 명령을 찾을 수 없음. MYSQLDUMP_PATH 환경변수를 확인하세요. 현재값: {_get_mysqldump_path()}")
        return {"success": False, "local_path": local_path, "s3_result": None, "error": f"mysqldump not found at: {_get_mysqldump_path()}"}
    except subprocess.TimeoutExpired:
        _log_backup_result("DB", False, "mysqldump 타임아웃 (300초 초과)")
        return {"success": False, "local_path": local_path, "s3_result": None, "error": "mysqldump timeout (300s)"}
    except Exception as e:
        _log_backup_result("DB", False, f"DB 백업 예외: {e}")
        return {"success": False, "local_path": local_path, "s3_result": None, "error": str(e)}

    # S3 업로드 (s3fs 기반 — 이미지 업로드와 동일한 방식)
    s3_result = None
    if success and is_s3_configured():
        # 경로: db-backups/2026-04-14/schedule_2026-04-14_030000.sql
        s3_sub_path = f"db-backups/{date_str}/{os.path.basename(local_path)}"
        try:
            s3_full_path = upload_local_file_to_s3(
                local_path=local_path,
                sub_path=s3_sub_path,
            )
            s3_result = {"success": True, "s3_path": s3_full_path, "error": None}
            _log_backup_result("DB", True, f"DB → S3 업로드 완료 ({os.path.getsize(local_path):,} bytes)", s3_key=s3_full_path)

            # 성공 시에만 로컬 파일 삭제 (설정에 따라)
            if _should_delete_local():
                try:
                    os.remove(local_path)
                    logger.info(f"로컬 백업 파일 삭제됨: {local_path}")
                except Exception as e:
                    logger.warning(f"로컬 백업 파일 삭제 실패 (무시): {e}")
        except Exception as e:
            s3_result = {"success": False, "s3_path": "", "error": str(e)}
            _log_backup_result("DB", False, f"DB → S3 업로드 실패: {e}")
            # 업로드 실패 시 로컬 파일은 삭제하지 않고 보존
            logger.error(f"DB 백업 S3 업로드 실패 (로컬 파일 보존: {local_path}): {e}")
    else:
        _log_backup_result("DB", success, f"DB 로컬 백업 완료: {local_path}")

    return {"success": success, "local_path": local_path, "s3_result": s3_result, "error": None}


def sync_uploads_to_s3() -> dict:
    """
    로컬 uploads/ 디렉토리의 모든 파일을 S3에 동기화.
    이미 업로드된 파일은 건너뜀 (S3 key 존재 여부로 판단).
    """
    from utils.s3_utils import is_s3_configured, list_s3_files, upload_attachment_bytes_to_s3, get_attachment_s3_key

    if not is_s3_configured():
        _log_backup_result("FILES", False, "S3 미설정, 파일 동기화 스킵")
        return {"success": False, "uploaded": 0, "skipped": 0, "failed": 0, "error": "S3 not configured"}

    upload_dir = _get_upload_dir()
    base_upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), upload_dir)
    if not os.path.exists(base_upload_dir):
        _log_backup_result("FILES", True, "uploads/ 디렉토리 없음, 동기화할 파일 없음")
        return {"success": True, "uploaded": 0, "skipped": 0, "failed": 0, "error": None}

    # 기존 S3 파일 목록 조회 (중복 방지)
    existing_keys = set()
    try:
        existing = list_s3_files("files/")
        existing_keys = {item["key"] for item in existing}
    except Exception:
        pass

    uploaded = 0
    skipped = 0
    failed = 0

    for root, dirs, files in os.walk(base_upload_dir):
        for fname in files:
            local_path = os.path.join(root, fname)
            # 상대 경로로 context 추출
            rel_path = os.path.relpath(local_path, base_upload_dir)
            parts = rel_path.split(os.sep)

            # uploads/tasks/{task_id}/{stored_name} 또는 uploads/{project_id}/{stored_name}
            if len(parts) >= 3 and parts[0] == "tasks":
                context_type = "task"
                try:
                    context_id = int(parts[1])
                except ValueError:
                    context_id = 0
                stored_name = parts[2]
            elif len(parts) >= 2:
                context_type = "project"
                try:
                    context_id = int(parts[0])
                except ValueError:
                    context_id = 0
                stored_name = parts[1]
            else:
                context_type = "unknown"
                context_id = 0
                stored_name = fname

            # S3 key 예측해서 이미 존재하면 스킵
            expected_key = get_attachment_s3_key(fname, stored_name, context_type, context_id)
            if expected_key in existing_keys:
                skipped += 1
                continue

            try:
                with open(local_path, "rb") as lf:
                    data = lf.read()
                result = upload_attachment_bytes_to_s3(
                    data=data,
                    original_filename=fname,
                    stored_name=stored_name,
                    context_type=context_type,
                    context_id=context_id,
                )
            except Exception as e:
                result = {"success": False, "error": str(e)}

            if result["success"]:
                uploaded += 1
            else:
                failed += 1
                _log_backup_result("FILES", False, f"파일 업로드 실패: {rel_path} - {result['error']}")

    _log_backup_result("FILES", True, f"파일 동기화 완료: 업로드 {uploaded}, 스킵 {skipped}, 실패 {failed}")
    return {"success": True, "uploaded": uploaded, "skipped": skipped, "failed": failed, "error": None}


def _scheduled_backup_job():
    """스케줄러에서 호출되는 백업 작업"""
    logger.info("=== 자동 백업 시작 ===")

    db_result = backup_database()
    logger.info(f"DB 백업 결과: {db_result['success']}")

    files_result = sync_uploads_to_s3()
    logger.info(f"파일 동기화 결과: 업로드 {files_result.get('uploaded', 0)}, 실패 {files_result.get('failed', 0)}")

    logger.info("=== 자동 백업 완료 ===")


def start_backup_scheduler():
    """APScheduler 시작 (FastAPI startup에서 호출)"""
    global _scheduler

    from utils.s3_utils import is_s3_configured

    if not is_s3_configured():
        logger.warning("S3 미설정 → 백업 스케줄러 시작하지 않음")
        return

    if _scheduler and _scheduler.running:
        logger.info("백업 스케줄러 이미 실행 중")
        return

    backup_hour = _get_backup_hour()
    backup_minute = _get_backup_minute()

    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")

    # 매일 지정 시각에 백업 실행
    _scheduler.add_job(
        _scheduled_backup_job,
        "cron",
        hour=backup_hour,
        minute=backup_minute,
        id="daily_backup",
        replace_existing=True,
        misfire_grace_time=3600,  # 1시간 grace time
    )

    _scheduler.start()
    logger.info(f"백업 스케줄러 시작됨 (매일 {backup_hour:02d}:{backup_minute:02d} KST)")


def stop_backup_scheduler():
    """APScheduler 중지 (FastAPI shutdown에서 호출)"""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("백업 스케줄러 중지됨")
