"""
S3 유틸리티 (s3fs 기반)
- 사내 S3/MinIO 환경에서 검증된 방식 (proxy 우회)
- 이미지 업로드/다운로드
- 첨부파일 업로드/다운로드/삭제
- DB 백업 파일 업로드
- S3 파일 목록 조회
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
# 내부 헬퍼
# ===============================
def _get_bucket() -> str:
    """BASE_S3_PATH에서 bucket 이름 추출: 's3://bucket/...' → 'bucket'"""
    path = BASE_S3_PATH
    if path.startswith("s3://"):
        path = path[5:]
    return path.split("/")[0]


def _get_prefix() -> str:
    """BASE_S3_PATH에서 bucket 이후 prefix 추출: 's3://bucket/prefix' → 'prefix'"""
    path = BASE_S3_PATH
    if path.startswith("s3://"):
        path = path[5:]
    parts = path.split("/", 1)
    return parts[1].rstrip("/") if len(parts) > 1 else ""


def _build_s3_key(sub_path: str) -> str:
    """boto3 호환 S3 key 생성 (bucket 미포함): {prefix}/{sub_path}"""
    prefix = _get_prefix()
    sub = sub_path.lstrip("/")
    return f"{prefix}/{sub}" if prefix else sub


def _s3_key_to_full_path(s3_key: str) -> str:
    """boto3 key → s3fs full path: 'FDC/plan-a/...' → 's3://bucket/FDC/plan-a/...'"""
    return f"s3://{_get_bucket()}/{s3_key}"


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
# 파일 타입별 카테고리
# ===============================
FILE_TYPE_MAP = {
    ".pdf": "pdf",
    ".doc": "documents", ".docx": "documents",
    ".ppt": "presentations", ".pptx": "presentations",
    ".xls": "spreadsheets", ".xlsx": "spreadsheets",
    ".png": "images", ".jpg": "images", ".jpeg": "images",
    ".gif": "images", ".bmp": "images", ".svg": "images", ".webp": "images",
    ".zip": "archives", ".tar": "archives", ".gz": "archives", ".7z": "archives", ".rar": "archives",
    ".txt": "text", ".csv": "text", ".log": "text",
    ".mp4": "media", ".mp3": "media", ".avi": "media", ".mov": "media",
}


def _get_file_category(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return FILE_TYPE_MAP.get(ext, "others")


# ===============================
# 로컬 파일 업로드 (DB 백업용)
# ===============================
def upload_local_file_to_s3(local_path: str, sub_path: str) -> str:
    """
    로컬 파일을 S3에 업로드 (s3fs 기반).

    Args:
        local_path: 로컬 파일 경로
        sub_path: BASE_S3_PATH 이후 하위 경로 (e.g., db-backups/2026-04-17/backup.sql)

    Returns:
        업로드된 전체 S3 경로 (s3://...)

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
# 첨부파일 업로드 (bytes)
# ===============================
def upload_attachment_bytes_to_s3(
    data: bytes,
    original_filename: str,
    stored_name: str,
    context_type: str = "task",
    context_id: int = 0,
) -> dict:
    """
    첨부파일(bytes)을 S3에 업로드.

    Returns:
        {"success": bool, "s3_key": str, "error": str|None}
        s3_key는 boto3 호환 key (DB 저장용)
    """
    category = _get_file_category(original_filename)
    sub_path = f"files/{category}/{context_type}_{context_id}/{stored_name}"
    s3_key = _build_s3_key(sub_path)
    full_path = _s3_key_to_full_path(s3_key)

    try:
        with S3_FS.open(full_path, "wb") as f:
            f.write(data)
        logger.info(f"첨부파일 업로드 성공: {full_path}")
        return {"success": True, "s3_key": s3_key, "error": None}
    except Exception as e:
        logger.error(f"첨부파일 업로드 실패: {full_path} - {e}")
        return {"success": False, "s3_key": s3_key, "error": str(e)}


# ===============================
# 첨부파일 S3 key 조회
# ===============================
def get_attachment_s3_key(
    original_filename: str,
    stored_name: str,
    context_type: str = "task",
    context_id: int = 0,
) -> str:
    """첨부파일의 S3 key 반환 (업로드 시와 동일한 규칙, boto3 호환 key)"""
    category = _get_file_category(original_filename)
    sub_path = f"files/{category}/{context_type}_{context_id}/{stored_name}"
    return _build_s3_key(sub_path)


# ===============================
# 파일 다운로드
# ===============================
def download_from_s3(s3_key: str) -> Optional[bytes]:
    """
    S3에서 파일을 다운로드해서 bytes로 반환.

    Args:
        s3_key: boto3 호환 key (DB에 저장된 값, e.g., 'FDC/plan-a/files/pdf/task_1/abc.pdf')
    """
    full_path = _s3_key_to_full_path(s3_key)

    try:
        with S3_FS.open(full_path, "rb") as f:
            data = f.read()
        logger.info(f"다운로드 성공: {full_path}")
        return data
    except FileNotFoundError:
        logger.warning(f"S3 파일 없음: {full_path}")
        return None
    except Exception as e:
        logger.error(f"다운로드 실패: {full_path} - {e}")
        return None


# ===============================
# 파일 삭제
# ===============================
def delete_from_s3(s3_key: str) -> dict:
    """
    S3에서 파일 삭제.

    Args:
        s3_key: boto3 호환 key (DB에 저장된 값)
    """
    full_path = _s3_key_to_full_path(s3_key)

    try:
        S3_FS.rm(full_path)
        logger.info(f"S3 삭제 성공: {full_path}")
        return {"success": True, "error": None}
    except FileNotFoundError:
        logger.warning(f"S3 삭제 대상 없음 (이미 없음): {full_path}")
        return {"success": True, "error": None}
    except Exception as e:
        logger.error(f"S3 삭제 실패: {full_path} - {e}")
        return {"success": False, "error": str(e)}


# ===============================
# 파일 목록 조회
# ===============================
def list_s3_files(prefix: str = "") -> list:
    """
    S3 prefix 아래 파일 목록 재귀 조회.

    Args:
        prefix: BASE_S3_PATH 이후 하위 경로 (e.g., 'db-backups/', 'files/')
    """
    if prefix:
        search_path = make_s3_path(BASE_S3_PATH, prefix)
    else:
        search_path = BASE_S3_PATH

    try:
        # S3_FS.find()는 재귀적으로 모든 파일을 반환
        paths = S3_FS.find(search_path, detail=True)
        result = []
        for path, info in paths.items():
            if info.get("type") == "file" or info.get("Size") is not None:
                result.append({
                    "key": path.replace(f"{_get_bucket()}/", "", 1),  # boto3 호환 key
                    "size": info.get("size", info.get("Size", 0)),
                    "last_modified": str(info.get("LastModified", info.get("last_modified", ""))),
                })
        return result
    except FileNotFoundError:
        return []
    except Exception as e:
        logger.error(f"S3 목록 조회 실패: {e}")
        return []


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
