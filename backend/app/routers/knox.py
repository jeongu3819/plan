# app/routers/knox.py
import logging
import re
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.knox_client import knox_search_employees

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api", tags=["KNOX"])

@router.get("/employees")
async def get_employees(
    fullName: Optional[str] = Query(default=None),
    userIds: Optional[str] = Query(default=None),
    query: Optional[str] = Query(default=None),
    companyCode: str = Query(default="C10"),
):
    if not fullName and not userIds and not query:
        raise HTTPException(status_code=400, detail="fullName, userIds, 또는 query 중 하나는 입력해야 합니다.")

    try:
        if query:
            q = query.strip()
            # ID 패턴: 공백 없고 영숫자 위주 (한글 없음)
            is_id_like = bool(re.match(r'^[a-zA-Z0-9._\-]+$', q))

            if is_id_like:
                # ID로 먼저 시도
                employees = await knox_search_employees(userIds=q, companyCode=companyCode)
                if not employees:
                    # fallback: 이름 검색
                    employees = await knox_search_employees(fullName=q, companyCode=companyCode)
            else:
                # 이름으로 먼저 시도
                employees = await knox_search_employees(fullName=q, companyCode=companyCode)
                if not employees:
                    # fallback: ID 검색
                    employees = await knox_search_employees(userIds=q, companyCode=companyCode)

            # userId 기준 dedupe
            seen = set()
            deduped = []
            for e in employees:
                uid = e.get("userId")
                if uid not in seen:
                    seen.add(uid)
                    deduped.append(e)
            employees = deduped
        else:
            employees = await knox_search_employees(fullName=fullName, userIds=userIds, companyCode=companyCode)

        return {"result": "ok", "employees": employees}

    except RuntimeError as e:
        logger.warning("KNOX runtime error: %s", str(e))
        raise HTTPException(status_code=502, detail=str(e))

    except Exception as e:
        logger.exception("Unknown /employees error")
        raise HTTPException(status_code=500, detail="Unknown server error")
