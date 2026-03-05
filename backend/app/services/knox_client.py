# app/services/knox_client.py
import os
from typing import Optional, Any, Dict, List
import httpx

REQUEST_BODY = {
    "resultType": "optional",
    "attributes": [
        "userId",
        "fullName",
        "employeeNumber",
        "departmentCode",
        "departmentName",
        "description",
        "mail",
    ],
}

def _extract_employees(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, dict):
        for key in ("employees", "data", "result", "items", "results", "value"):
            v = raw.get(key)
            if isinstance(v, list):
                return v
        for v in raw.values():
            if isinstance(v, list):
                return v
    if isinstance(raw, list):
        return raw
    return []

async def knox_search_employees(
    *,
    fullName: Optional[str] = None,
    userIds: Optional[str] = None,
    companyCode: str = "C10",
) -> List[Dict[str, Any]]:
    # ✅ 매 호출마다 env를 읽어서 “import 타이밍” 문제 제거
    knox_url = os.getenv("KNOX_API_URL")
    knox_token = os.getenv("KNOX_AUTH_TOKEN")
    knox_system_id = os.getenv("KNOX_SYSTEM_ID")

    if not knox_url or not knox_token or not knox_system_id:
        raise RuntimeError("KNOX env 설정이 누락되었습니다. (KNOX_API_URL / KNOX_AUTH_TOKEN / KNOX_SYSTEM_ID)")

    if not fullName and not userIds:
        return []

    headers = {
        "accept": "*/*",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {knox_token}",
        "System-ID": knox_system_id,
    }

    params = {"companyCode": companyCode}
    if fullName:
        params["fullName"] = fullName
    if userIds:
        params["userIds"] = userIds

    timeout = httpx.Timeout(10.0, connect=5.0)

    try:
        async with httpx.AsyncClient(trust_env=False, verify=False, timeout=10.0) as client:
            resp = await client.post(
                knox_url,
                headers=headers,
                json=REQUEST_BODY,
                params=params,
            )
    except httpx.RequestError as e:
        # ✅ 여기로 오면 운영망에서 KNOX 접근 자체가 실패한 것
        raise RuntimeError(f"KNOX 요청 실패: {type(e).__name__}: {str(e)}")

    if resp.status_code != 200:
        raise RuntimeError(f"KNOX error {resp.status_code}: {resp.text}")

    try:
        raw = resp.json()
    except ValueError:
        raise RuntimeError(f"KNOX 응답이 JSON이 아님: {resp.text[:300]}")

    employees = _extract_employees(raw)

    normalized: List[Dict[str, Any]] = []
    for e in employees:
        if not isinstance(e, dict):
            continue
        normalized.append(
            {
                "userId": e.get("userId"),
                "fullName": e.get("fullName"),
                "departmentName": e.get("departmentName"),
                "departmentCode": e.get("departmentCode"),
                "employeeNumber": e.get("employeeNumber"),
                # ---- alias 추가 (프론트 호환) ----
                "loginid": e.get("userId"),
                "deptname": e.get("departmentName"),
                "email": e.get("mail") or e.get("email"),
            }
        )
    return normalized



async def knox_lookup_user(loginid: str) -> Optional[Dict[str, Any]]:
    """loginid로 정확히 1명 찾기"""
    q = (loginid or "").strip()
    if not q:
        return None

    # KNOX가 부분검색을 돌려줄 수 있으니, exact match를 우선
    lst = await knox_search_employees(userIds=q)
    for e in lst:
        if e.get("userId") == q:
            return e

    # 없으면 첫 번째를 쓰고 싶다면(정책): return lst[0] if lst else None
    return None
