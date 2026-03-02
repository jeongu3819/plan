# app/routers/knox.py
import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.knox_client import knox_search_employees

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api", tags=["KNOX"])

@router.get("/employees")
async def get_employees(
    fullName: Optional[str] = Query(default=None),
    userIds: Optional[str] = Query(default=None),
    companyCode: str = Query(default="C10"),
):
    if not fullName and not userIds:
        raise HTTPException(status_code=400, detail="fullName 또는 userIds 중 하나는 입력해야 합니다.")

    try:
        employees = await knox_search_employees(fullName=fullName, userIds=userIds, companyCode=companyCode)
        return {"result": "ok", "employees": employees}

    except RuntimeError as e:
        logger.warning("KNOX runtime error: %s", str(e))
        raise HTTPException(status_code=502, detail=str(e))

    except Exception as e:
        logger.exception("Unknown /employees error")
        raise HTTPException(status_code=500, detail="Unknown server error")
