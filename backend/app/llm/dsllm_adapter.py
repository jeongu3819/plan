import os
import uuid
import requests
from urllib.parse import urlparse

# =========================
# DSLLM Model Registry (DSLLM.py 방식)
# - model_name에 아래 key를 넣으면 자동으로 base_url/실모델명/티켓/헤더를 선택
# =========================
MODEL_CONFIGS = {
    # ✅ 예시: DSLLM.py의 model_configs를 "그대로" 옮기되,
    # credential_key_dsllm 값 대신 ticket_env만 넣어라.
    "GPT-OSS": {
        "model": "openai/gpt-oss-120b",
        "base_url": "http://~:8000/gpt-oss/1/gpt-oss-120b/v1",
        "ticket_env": "CREDENTIAL_KEY_DSLLM_PROD",
        "send_headers": True,
    },
    "LLAMA4_Maverick": {
        "model": "meta-llama/llama-4-maverick-17b-128e-instruct",
        "base_url": "http://~:8000/llama4/1/llama/aiserving/llama-4/maverick/v1",
        "ticket_env": "CREDENTIAL_KEY_DSLLM_PROD",
        "send_headers": True,
    },
    "LLAMA4_Scout": {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "base_url": "http://~:8000/llama4/1/llama/aiserving/llama-4/scout/v1",
        "ticket_env": "CREDENTIAL_KEY_DSLLM_PROD",
        "send_headers": True,
    },
    "GAUSS2": {
        "model": "Gauss2-37b-instruct-v2.0",
        "base_url": "http://~:8000/gauss2/1/gauss2/37b/v2",
        "ticket_env": "CREDENTIAL_KEY_DSLLM_PROD",
        "send_headers": True,
    },
    "GaussO": {
        "model": "GaussO-Owl-Ultra-Think",
        "base_url": "http://~:8000/gauss/1/gauss_o_think/aiserving/gauss/o/think/v2",
        "ticket_env": "CREDENTIAL_KEY_DSLLM_PROD",
        "send_headers": True,
    },
    "GEMMA3": {
        "model": "google/gemma-3-27b-it",
        "base_url": "http://~:8000/gemma3/1/gemma/aiserving/gemma3/v1",
        "ticket_env": "CREDENTIAL_KEY_DSLLM_PROD",
        "send_headers": True,
    },
    "SAM": {
        "model": "uc2:sam-2505-RL-Reasoning",
        "base_url": "http://ip주소:10001/v1",
        "ticket_env": "CREDENTIAL_KEY_DSLLM_PROD",
        "send_headers": False,  # ✅ DSLLM.py에서 SAM/GPT/Qwen3는 custom_headers={}
    },
    "GPT": {
        "model": "gpt-oss:20b",
        "base_url": "http://ip주소:30002/v1",
        "ticket_env": "CREDENTIAL_KEY_DSLLM",
        "send_headers": False,
    },
    "Qwen3_Coder": {
        "model": "qwen3-coder",
        "base_url": "http://ip주소:30002/v1",
        "ticket_env": "CREDENTIAL_KEY_DSLLM",
        "send_headers": False,
    },
}


def list_model_keys() -> list[str]:
    """프론트 드롭다운용 (원하면 엔드포인트로 노출 가능)"""
    return sorted(MODEL_CONFIGS.keys())


def _select_ticket_by_host(base_url: str) -> str:
    """(fallback) host 규칙으로 dev/prod ticket 선택"""
    dev = (os.getenv("CREDENTIAL_KEY_DSLLM") or "").strip()
    prod = (os.getenv("CREDENTIAL_KEY_DSLLM_PROD") or "").strip()

    host = urlparse(base_url).hostname or ""
    if host.startswith("10.166."):
        return dev or prod
    if host.endswith(".net"):
        return prod or dev
    return prod or dev


def _ticket_from_env(ticket_env: str | None, base_url: str) -> str:
    """config가 있으면 지정된 env에서, 없으면 host 규칙으로"""
    if ticket_env:
        return (os.getenv(ticket_env) or "").strip()
    return _select_ticket_by_host(base_url)


def _headers(base_url: str, *, ticket_env: str | None, send_headers: bool) -> dict:
    """
    DSLLM.py 헤더 맞춤:
      x-dep-ticket
      Send-System-Name
      User-Id / User-Type
      Prompt-Msg-Id / Completion-Msg-Id
    """
    headers = {"Content-Type": "application/json"}

    if not send_headers:
        # ✅ DSLLM.py에서 SAM/GPT/Qwen3는 custom_headers={}
        return headers

    system_name = (os.getenv("SYSTEM_NAME") or "").strip()
    user_id = (os.getenv("USER_ID") or "").strip()
    ticket = _ticket_from_env(ticket_env, base_url)

    missing = []
    if not system_name:
        missing.append("SYSTEM_NAME")
    if not user_id:
        missing.append("USER_ID")
    if not ticket:
        missing.append(ticket_env or "CREDENTIAL_KEY_DSLLM / CREDENTIAL_KEY_DSLLM_PROD")
    if missing:
        raise RuntimeError(f"DSLLM ENV missing: {', '.join(missing)}")

    headers.update({
        "x-dep-ticket": ticket,
        "Send-System-Name": system_name,
        "User-Id": user_id,
        "User-Type": user_id,
        "Prompt-Msg-Id": str(uuid.uuid4()),
        "Completion-Msg-Id": str(uuid.uuid4()),
    })
    return headers


def _normalize_chat_endpoint(base_url: str) -> str:
    """
    base_url가
      - .../v1  -> .../v1/chat/completions
      - .../v2  -> .../v2/chat/completions
      - .../chat/completions -> 그대로
      - 그 외  -> .../v1/chat/completions (openai 호환 일반 케이스)
    """
    u = base_url.rstrip("/")
    if u.endswith("/chat/completions"):
        return u
    if u.endswith("/v1") or u.endswith("/v2"):
        return u + "/chat/completions"
    return u + "/v1/chat/completions"


def _resolve(base_url: str, model_name: str):
    """
    model_name이 MODEL_CONFIGS key면 DSLLM.py처럼 자동 해석
    아니면 base_url/model_name 그대로 사용(fallback)
    """
    if model_name in MODEL_CONFIGS:
        cfg = MODEL_CONFIGS[model_name]
        return cfg["base_url"], cfg["model"], cfg.get("ticket_env"), bool(cfg.get("send_headers", True))

    # fallback: 사용자가 실제 model id를 넣는 경우
    return base_url, model_name, None, True


def chat(
    base_url: str,
    model_name: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> str:
    resolved_base_url, resolved_model, ticket_env, send_headers = _resolve(base_url, model_name)

    endpoint = _normalize_chat_endpoint(resolved_base_url)
    payload = {
        "model": resolved_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    timeout = float(os.getenv("DSLLM_TIMEOUT") or "120")
    verify_ssl = (os.getenv("DSLLM_VERIFY_SSL") or "false").lower() in ("1", "true", "yes")

    r = requests.post(
        endpoint,
        json=payload,
        headers=_headers(resolved_base_url, ticket_env=ticket_env, send_headers=send_headers),
        timeout=timeout,
        verify=verify_ssl,  # 내부망이면 보통 false(기본값 false)
    )
    r.raise_for_status()
    data = r.json()

    # OpenAI 호환 파싱
    choice0 = (data.get("choices") or [{}])[0]
    msg = choice0.get("message") or {}
    return (msg.get("content") or choice0.get("text") or "").strip()


def chat_stream(
    base_url: str,
    model_name: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 4096,
):
    """
    Generator 방식 스트리밍 chat.
    FastAPI StreamingResponse와 호환:
      return StreamingResponse(chat_stream(...), media_type="text/plain")

    각 yield는 LLM이 생성한 텍스트 토큰(chunk) 단위.
    """
    import json as _json

    resolved_base_url, resolved_model, ticket_env, send_headers = _resolve(base_url, model_name)

    endpoint = _normalize_chat_endpoint(resolved_base_url)
    payload = {
        "model": resolved_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }

    timeout = float(os.getenv("DSLLM_TIMEOUT") or "120")
    verify_ssl = (os.getenv("DSLLM_VERIFY_SSL") or "false").lower() in ("1", "true", "yes")

    with requests.post(
        endpoint,
        json=payload,
        headers=_headers(resolved_base_url, ticket_env=ticket_env, send_headers=send_headers),
        timeout=timeout,
        verify=verify_ssl,
        stream=True,
    ) as r:
        r.raise_for_status()
        for raw_line in r.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            data_str = line[len("data:"):].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = _json.loads(data_str)
                delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
                token = delta.get("content") or ""
                if token:
                    yield token
            except (_json.JSONDecodeError, KeyError, IndexError):
                continue