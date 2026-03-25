"""
S3/MinIO 호환 스토리지 서비스
- 첨부파일 업로드/다운로드
- DB 백업 파일 업로드
- 파일 타입별 경로 분류 (pdf, ppt, png 등)
"""

import os
import logging
from datetime import datetime
from typing import Optional
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, EndpointConnectionError

logger = logging.getLogger("s3_service")

# ── 환경변수 ──
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "")
S3_REGION_NAME = os.getenv("S3_REGION_NAME", "us-east-1")
BUCKET_NAME = os.getenv("BUCKET_NAME", "fdc-portal")
BASE_S3_PATH = os.getenv("BASE_S3_PATH", "s3://fdc-portal/FDC/plan-a")

# BASE_S3_PATH에서 prefix 추출: "s3://bucket/prefix" → "prefix"
def _parse_base_path() -> str:
    path = BASE_S3_PATH
    if path.startswith("s3://"):
        path = path[5:]
    # bucket 이름 이후의 경로만 추출
    parts = path.split("/", 1)
    if len(parts) > 1:
        return parts[1].rstrip("/")
    return ""

S3_PREFIX = _parse_base_path()  # e.g., "FDC/plan-a"


def _get_s3_client():
    """S3/MinIO 호환 클라이언트 생성"""
    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY or not S3_ENDPOINT_URL:
        logger.warning("S3 환경변수 미설정 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_ENDPOINT_URL)")
        return None

    try:
        client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT_URL,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=S3_REGION_NAME,
        )
        return client
    except Exception as e:
        logger.error(f"S3 클라이언트 생성 실패: {e}")
        return None


def is_s3_configured() -> bool:
    """S3 설정이 완료되었는지 확인"""
    return bool(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and S3_ENDPOINT_URL)


# ── 파일 타입별 하위 경로 분류 ──
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
    """파일 확장자로 카테고리 분류"""
    ext = os.path.splitext(filename)[1].lower()
    return FILE_TYPE_MAP.get(ext, "others")


def _build_s3_key(sub_path: str) -> str:
    """S3 key 생성: {S3_PREFIX}/{sub_path}"""
    if S3_PREFIX:
        return f"{S3_PREFIX}/{sub_path}"
    return sub_path


def upload_file_to_s3(
    local_path: str,
    s3_sub_path: str,
    filename: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    """
    로컬 파일을 S3에 업로드.

    Args:
        local_path: 로컬 파일 경로
        s3_sub_path: S3 prefix 이후 하위 경로 (e.g., "files/images/abc.png")
        filename: 원본 파일명 (메타데이터용)
        metadata: 추가 메타데이터

    Returns:
        {"success": bool, "s3_key": str, "error": str|None}
    """
    client = _get_s3_client()
    if not client:
        return {"success": False, "s3_key": "", "error": "S3 not configured"}

    s3_key = _build_s3_key(s3_sub_path)

    extra_args = {}
    s3_metadata = metadata or {}
    if filename:
        s3_metadata["original-filename"] = filename
    s3_metadata["upload-timestamp"] = datetime.now().isoformat()
    if s3_metadata:
        extra_args["Metadata"] = s3_metadata

    try:
        client.upload_file(local_path, BUCKET_NAME, s3_key, ExtraArgs=extra_args if extra_args else None)
        logger.info(f"S3 업로드 성공: {s3_key} (bucket={BUCKET_NAME})")
        return {"success": True, "s3_key": s3_key, "error": None}
    except (ClientError, EndpointConnectionError) as e:
        logger.error(f"S3 업로드 실패: {s3_key} - {e}")
        return {"success": False, "s3_key": s3_key, "error": str(e)}
    except Exception as e:
        logger.error(f"S3 업로드 예외: {s3_key} - {e}")
        return {"success": False, "s3_key": s3_key, "error": str(e)}


def upload_bytes_to_s3(
    data: bytes,
    s3_sub_path: str,
    filename: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> dict:
    """
    바이트 데이터를 S3에 업로드 (메모리에서 직접).

    Returns:
        {"success": bool, "s3_key": str, "error": str|None}
    """
    import io
    client = _get_s3_client()
    if not client:
        return {"success": False, "s3_key": "", "error": "S3 not configured"}

    s3_key = _build_s3_key(s3_sub_path)

    extra_args = {}
    s3_metadata = metadata or {}
    if filename:
        s3_metadata["original-filename"] = filename
    s3_metadata["upload-timestamp"] = datetime.now().isoformat()
    if s3_metadata:
        extra_args["Metadata"] = s3_metadata

    try:
        client.upload_fileobj(io.BytesIO(data), BUCKET_NAME, s3_key, ExtraArgs=extra_args if extra_args else None)
        logger.info(f"S3 업로드 성공 (bytes): {s3_key}")
        return {"success": True, "s3_key": s3_key, "error": None}
    except (ClientError, EndpointConnectionError) as e:
        logger.error(f"S3 업로드 실패 (bytes): {s3_key} - {e}")
        return {"success": False, "s3_key": s3_key, "error": str(e)}
    except Exception as e:
        logger.error(f"S3 업로드 예외 (bytes): {s3_key} - {e}")
        return {"success": False, "s3_key": s3_key, "error": str(e)}


def upload_attachment_to_s3(
    local_path: str,
    original_filename: str,
    stored_name: str,
    context_type: str = "task",
    context_id: int = 0,
) -> dict:
    """
    첨부파일을 S3에 업로드 (파일 타입별 분류, 로컬 파일 기반).

    S3 경로: {PREFIX}/files/{category}/{context_type}_{context_id}/{stored_name}
    예: FDC/plan-a/files/pdf/task_42/abc123.pdf
    """
    category = _get_file_category(original_filename)
    s3_sub_path = f"files/{category}/{context_type}_{context_id}/{stored_name}"

    return upload_file_to_s3(
        local_path=local_path,
        s3_sub_path=s3_sub_path,
        filename=original_filename,
        metadata={
            "context-type": context_type,
            "context-id": str(context_id),
            "file-category": category,
        },
    )


def upload_attachment_bytes_to_s3(
    data: bytes,
    original_filename: str,
    stored_name: str,
    context_type: str = "task",
    context_id: int = 0,
) -> dict:
    """
    첨부파일을 S3에 업로드 (메모리에서 직접, 로컬 저장 없이).

    S3 경로: {PREFIX}/files/{category}/{context_type}_{context_id}/{stored_name}
    """
    category = _get_file_category(original_filename)
    s3_sub_path = f"files/{category}/{context_type}_{context_id}/{stored_name}"

    return upload_bytes_to_s3(
        data=data,
        s3_sub_path=s3_sub_path,
        filename=original_filename,
        metadata={
            "context-type": context_type,
            "context-id": str(context_id),
            "file-category": category,
        },
    )


def get_attachment_s3_key(
    original_filename: str,
    stored_name: str,
    context_type: str = "task",
    context_id: int = 0,
) -> str:
    """첨부파일의 S3 key를 생성 (업로드 시와 동일한 규칙)"""
    category = _get_file_category(original_filename)
    s3_sub_path = f"files/{category}/{context_type}_{context_id}/{stored_name}"
    return _build_s3_key(s3_sub_path)


def download_from_s3(s3_key: str) -> bytes | None:
    """S3에서 파일을 다운로드해서 bytes로 반환"""
    import io
    client = _get_s3_client()
    if not client:
        return None

    try:
        buf = io.BytesIO()
        client.download_fileobj(BUCKET_NAME, s3_key, buf)
        buf.seek(0)
        return buf.read()
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code == "NoSuchKey" or error_code == "404":
            logger.warning(f"S3 파일 없음: {s3_key}")
        else:
            logger.error(f"S3 다운로드 실패: {s3_key} - {e}")
        return None
    except Exception as e:
        logger.error(f"S3 다운로드 예외: {s3_key} - {e}")
        return None


def delete_from_s3(s3_key: str) -> dict:
    """S3에서 파일 삭제"""
    client = _get_s3_client()
    if not client:
        return {"success": False, "error": "S3 not configured"}

    try:
        client.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        logger.info(f"S3 삭제 성공: {s3_key}")
        return {"success": True, "error": None}
    except Exception as e:
        logger.error(f"S3 삭제 실패: {s3_key} - {e}")
        return {"success": False, "error": str(e)}


def generate_presigned_url(s3_key: str, expiration: int = 3600, filename: str = "") -> str | None:
    """S3 presigned URL 생성 (다운로드용)"""
    client = _get_s3_client()
    if not client:
        return None

    try:
        params = {
            "Bucket": BUCKET_NAME,
            "Key": s3_key,
        }
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'

        url = client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expiration,
        )
        return url
    except Exception as e:
        logger.error(f"Presigned URL 생성 실패: {s3_key} - {e}")
        return None


def list_s3_files(prefix: str = "") -> list:
    """S3 prefix 아래 파일 목록 조회"""
    client = _get_s3_client()
    if not client:
        return []

    s3_prefix = _build_s3_key(prefix) if prefix else S3_PREFIX
    try:
        result = []
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=s3_prefix):
            for obj in page.get("Contents", []):
                result.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                })
        return result
    except Exception as e:
        logger.error(f"S3 목록 조회 실패: {e}")
        return []
