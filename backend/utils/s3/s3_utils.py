"""
S3 유틸리티 (s3fs 기반)
- 사내 S3/MinIO 환경에서 검증된 방식
- DB 백업 파일 업로드, 이미지 업로드/다운로드 등
"""

import os
import logging
from typing import Optional

import s3fs
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("s3_utils")

# ===============================
# 환경변수
# ===============================
BASE_S3_PATH = os.getenv("BASE_S3_PATH", "s3://fdc-portal/FDC/plan-a")
IMAGE_BASE_PATH = f"{BASE_S3_PATH.rstrip('/')}/images"

# ===============================
# S3 인증 옵션 (사내 환경 검증 완료)
# ===============================
S3_STORAGE_OPTIONS = {
    "key": os.getenv("AWS_ACCESS_KEY_ID"),
    "secret": os.getenv("AWS_SECRET_ACCESS_KEY"),
    "client_kwargs": {
        "endpoint_url": os.getenv("S3_ENDPOINT_URL"),
        "region_name": os.getenv("S3_REGION_NAME", "us-east-1"),
    },
    "config_kwargs": {
        "signature_version": "s3v4",
        "s3": {"addressing_style": "path"},
    },
}

# ===============================
# S3 FileSystem 객체
# ===============================
S3_FS = s3fs.S3FileSystem(**S3_STORAGE_OPTIONS)


# ===============================
# 공통 Path 생성 함수
# ===============================
def make_s3_path(base: str, sub: str) -> str:
    """S3 경로 안전하게 합치기 (슬래시 중복 방지)"""
    return f"{base.rstrip('/')}/{sub.lstrip('/')}"


def is_s3_configured() -> bool:
    """S3 설정이 완료되었는지 확인"""
    return bool(
        os.getenv("AWS_ACCESS_KEY_ID")
        and os.getenv("AWS_SECRET_ACCESS_KEY")
        and os.getenv("S3_ENDPOINT_URL")
    )


# ===============================
# 로컬 파일 업로드 (DB 백업용)
# ===============================
def upload_local_file_to_s3(local_path: str, sub_path: str) -> str:
    """
    로컬 파일을 S3에 업로드 (s3fs 기반).

    Args:
        local_path: 로컬 파일 경로 (e.g., /backup/mysql_backup_2026-04-17.sql)
        sub_path: BASE_S3_PATH 이후 하위 경로 (e.g., db-backups/2026-04-17/backup.sql)

    Returns:
        업로드된 전체 S3 경로

    Raises:
        FileNotFoundError: 로컬 파일이 없을 때
        Exception: S3 업로드 실패 시
    """
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"로컬 파일 없음: {local_path}")

    full_path = make_s3_path(BASE_S3_PATH, sub_path)

    with open(local_path, "rb") as local_f:
        with S3_FS.open(full_path, "wb") as s3_f:
            s3_f.write(local_f.read())

    logger.info(f"S3 업로드 성공: {local_path} -> {full_path}")
    return full_path


# ===============================
# Image 업로드
# ===============================
def upload_image_to_s3(image_bytes: bytes, sub_path: str) -> str:
    """이미지 바이트를 S3에 업로드"""
    full_path = make_s3_path(IMAGE_BASE_PATH, sub_path)

    with S3_FS.open(full_path, "wb") as f:
        f.write(image_bytes)

    logger.info(f"이미지 업로드 성공: {full_path}")
    return full_path


# ===============================
# Image 다운로드
# ===============================
def download_image_from_s3(sub_path: str) -> Optional[bytes]:
    """이미지를 S3에서 다운로드"""
    full_path = make_s3_path(IMAGE_BASE_PATH, sub_path)

    try:
        with S3_FS.open(full_path, "rb") as f:
            data = f.read()
        logger.info(f"이미지 다운로드 성공: {full_path}")
        return data
    except FileNotFoundError:
        logger.warning(f"파일 없음: {full_path}")
        return None
    except Exception as e:
        logger.error(f"다운로드 실패: {e}")
        return None
