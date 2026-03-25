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

# ── 환경변수 ──
BACKUP_HOUR = int(os.getenv("BACKUP_HOUR", "3"))       # 백업 실행 시각 (KST, 0-23)
BACKUP_MINUTE = int(os.getenv("BACKUP_MINUTE", "0"))    # 백업 실행 분 (0-59)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

# 백업 로그 디렉토리
BACKUP_LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backup_logs")
os.makedirs(BACKUP_LOG_DIR, exist_ok=True)

_scheduler: Optional[BackgroundScheduler] = None


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
    from app.services.s3_service import upload_file_to_s3, is_s3_configured

    now = _now_kst()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H%M%S")

    backup_dir = os.path.join(BACKUP_LOG_DIR, "db", date_str)
    os.makedirs(backup_dir, exist_ok=True)

    local_path = ""
    success = False

    try:
        if "sqlite" in DATABASE_URL:
            # SQLite: 파일 복사
            db_file = DATABASE_URL.replace("sqlite:///", "").replace("sqlite://", "")
            if db_file.startswith("./"):
                db_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), db_file[2:])

            if not os.path.exists(db_file):
                _log_backup_result("DB", False, f"SQLite 파일 없음: {db_file}")
                return {"success": False, "local_path": "", "s3_result": None, "error": f"DB file not found: {db_file}"}

            backup_filename = f"dev_backup_{date_str}_{time_str}.db"
            local_path = os.path.join(backup_dir, backup_filename)
            shutil.copy2(db_file, local_path)
            success = True

        elif "mysql" in DATABASE_URL:
            # MySQL: mysqldump
            # mysql+pymysql://user:pass@host:port/dbname
            from urllib.parse import urlparse
            parsed = urlparse(DATABASE_URL.replace("mysql+pymysql://", "mysql://"))
            user = parsed.username or "root"
            password = parsed.password or ""
            host = parsed.hostname or "localhost"
            port = parsed.port or 3306
            dbname = parsed.path.lstrip("/")

            backup_filename = f"mysql_backup_{date_str}_{time_str}.sql"
            local_path = os.path.join(backup_dir, backup_filename)

            cmd = [
                "mysqldump",
                f"-u{user}",
                f"-h{host}",
                f"-P{port}",
                "--single-transaction",
                "--quick",
                dbname,
            ]
            env = os.environ.copy()
            if password:
                env["MYSQL_PWD"] = password

            with open(local_path, "w") as f:
                result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, env=env, timeout=300)
                if result.returncode != 0:
                    _log_backup_result("DB", False, f"mysqldump 실패: {result.stderr.decode()}")
                    return {"success": False, "local_path": local_path, "s3_result": None, "error": result.stderr.decode()}
            success = True

        else:
            _log_backup_result("DB", False, f"지원하지 않는 DB 타입: {DATABASE_URL[:30]}")
            return {"success": False, "local_path": "", "s3_result": None, "error": "Unsupported DB type"}

    except Exception as e:
        _log_backup_result("DB", False, f"DB 백업 예외: {e}")
        return {"success": False, "local_path": local_path, "s3_result": None, "error": str(e)}

    # S3 업로드
    s3_result = None
    if success and is_s3_configured():
        s3_sub_path = f"db/{date_str}/{os.path.basename(local_path)}"
        s3_result = upload_file_to_s3(
            local_path=local_path,
            s3_sub_path=s3_sub_path,
            filename=os.path.basename(local_path),
            metadata={"backup-type": "database", "backup-date": date_str},
        )
        _log_backup_result("DB", s3_result["success"], f"DB → S3 업로드", s3_key=s3_result.get("s3_key", ""))
    else:
        _log_backup_result("DB", success, f"DB 로컬 백업 완료: {local_path}")

    return {"success": success, "local_path": local_path, "s3_result": s3_result, "error": None}


def sync_uploads_to_s3() -> dict:
    """
    로컬 uploads/ 디렉토리의 모든 파일을 S3에 동기화.
    이미 업로드된 파일은 건너뜀 (S3 key 존재 여부로 판단).
    """
    from app.services.s3_service import upload_attachment_to_s3, is_s3_configured, list_s3_files

    if not is_s3_configured():
        _log_backup_result("FILES", False, "S3 미설정, 파일 동기화 스킵")
        return {"success": False, "uploaded": 0, "skipped": 0, "failed": 0, "error": "S3 not configured"}

    base_upload_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), UPLOAD_DIR)
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
            from app.services.s3_service import _get_file_category, _build_s3_key
            category = _get_file_category(fname)
            expected_sub = f"files/{category}/{context_type}_{context_id}/{stored_name}"
            expected_key = _build_s3_key(expected_sub)

            if expected_key in existing_keys:
                skipped += 1
                continue

            result = upload_attachment_to_s3(
                local_path=local_path,
                original_filename=fname,
                stored_name=stored_name,
                context_type=context_type,
                context_id=context_id,
            )
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

    from app.services.s3_service import is_s3_configured

    if not is_s3_configured():
        logger.warning("S3 미설정 → 백업 스케줄러 시작하지 않음")
        return

    if _scheduler and _scheduler.running:
        logger.info("백업 스케줄러 이미 실행 중")
        return

    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")

    # 매일 지정 시각에 백업 실행
    _scheduler.add_job(
        _scheduled_backup_job,
        "cron",
        hour=BACKUP_HOUR,
        minute=BACKUP_MINUTE,
        id="daily_backup",
        replace_existing=True,
        misfire_grace_time=3600,  # 1시간 grace time
    )

    _scheduler.start()
    logger.info(f"백업 스케줄러 시작됨 (매일 {BACKUP_HOUR:02d}:{BACKUP_MINUTE:02d} KST)")


def stop_backup_scheduler():
    """APScheduler 중지 (FastAPI shutdown에서 호출)"""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("백업 스케줄러 중지됨")
