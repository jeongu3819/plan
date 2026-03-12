import re


def sanitize_llm_text(text: str) -> str:
    """
    기본 LLM 응답 정리
    - 코드블록 제거
    - 마크다운 헤딩 제거
    - 불필요한 공백 정리
    """
    if not text:
        return ""

    # 1. 코드블록 제거 ``` ```
    text = re.sub(r"```[\s\S]*?```", "", text)

    # 2. 마크다운 헤딩 제거 (##, ### 등)
    text = re.sub(r"^\s*#{1,6}\s+", "", text, flags=re.MULTILINE)

    # 3. 여러 줄 공백 정리
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def normalize_task_blocks(text: str) -> str:
    """
    [Task: ...] 블록을 강제로 정리하여 각 Task가 독립 블록이 되도록 한다.
    - [Task: ...] 앞에 항상 빈 줄 확보
    - [Task: ...] 뒤에 같은 줄에 본문이 붙어 있으면 줄바꿈 강제
    - 개행 과다 정리
    """
    if not text:
        return ""

    s = text.replace("\r\n", "\n").replace("\r", "\n")

    # [Task: ...] 앞은 항상 빈 줄 확보
    s = re.sub(r"\n*(\[Task:\s*)", r"\n\n\1", s)

    # 문서 시작 부분 개행 제거
    s = s.lstrip()

    # [Task: ...] 뒤에 같은 줄 본문이 붙어 있으면 줄바꿈 강제
    s = re.sub(r"(\[Task:\s*[^\]\n]+\])[ \t]+(\S)", r"\1\n\2", s)

    # 개행 과다 정리
    s = re.sub(r"\n{3,}", "\n\n", s)

    return s.strip()


def sanitize_llm_text_ai(text: str) -> str:
    """
    좀 더 강한 정리 버전
    - 표 제거
    - 코드블록 제거
    - 헤딩 제거
    - 과도한 기호 제거
    """
    if not text:
        return ""

    # 1. 코드블록 제거
    text = re.sub(r"```[\s\S]*?```", "", text)

    lines = text.splitlines()
    cleaned_lines = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # 2. 마크다운 표 제거
        if "|" in line:
            # 다음 줄이 --- 형태면 표로 판단
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if re.match(r"^\s*\|?\s*[:\-\s|]+\|?\s*$", nxt):
                i += 2
                while i < len(lines) and "|" in lines[i]:
                    i += 1
                continue

        # 3. 헤딩 제거
        line = re.sub(r"^\s*#{1,6}\s+", "", line)

        cleaned_lines.append(line)
        i += 1

    text = "\n".join(cleaned_lines)

    # 4. 과도한 공백 정리
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()