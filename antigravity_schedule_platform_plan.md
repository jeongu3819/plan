# 일정관리 플랫폼 개발 계획서 (FastAPI + React + MySQL)  
**목표:** 협업툴 Flow(https://flow.team/kr/index) 수준의 “프로젝트/업무 중심” 사용성을 참고하되, **입력·수정·삭제가 단순하고 빠른** 일정관리 플랫폼을 구축한다.
**핵심 가치:** *“찾지 말고 보이게, 입력은 10초 안에, 수정은 즉시, 삭제는 되돌리기(Undo)로 안전하게.”*

> ✅ 이번 버전 반영 사항  
> - **우선순위 변경:** **권한/DB는 나중에**, 먼저 **사이트(React UI) 구조/화면/플로우**를 완성  
> - 백엔드는 FastAPI를 쓰되, 초기에는 **DB 없이 Mock/In-Memory/JSON 파일 저장**으로 동작 확인  
> - “관리자”는 최종 단계에서 **사이트 사용 승인/차단** 용도로만 단순화 (현재 단계에서는 미적용)  
> - 프로젝트/워크스페이스 권한(role)은 membership 테이블로 분리(현재 단계에서는 미적용)

---

## 0. 제품 목표와 성공 기준

### 0.1 제품 목표 (한 문장)
**주/월 단위로 ‘누가 무엇을 언제까지 어떤 상태로’ 진행하는지**를 한눈에 보며, **업무 등록/수정/삭제가 빠르고 스트레스 없는** 협업 일정 플랫폼.

### 0.2 성공 기준 (정량/정성)
- **업무 1개 생성**: 제목 입력 → Enter 기준 **5초 내**  
- **상태 변경**: 드래그 또는 1클릭 **즉시 반영**  
- **수정/삭제**: 인라인 수정 + 삭제 후 **Undo 5초 제공**  
- **히스토리**: “왜 이렇게 됐지?” 질문에 **로그로 즉시 설명 가능**  
- **필터/검색**: 담당자/상태/태그/기간 필터가 항상 노출되고 빠름

---

## 1. UX 원칙 (모든 화면이 통과해야 할 10가지 규칙)

1. **추가(Add)는 항상 보이고 동일한 방식**: 어디서든 `+ 업무 추가` 또는 단축키로 생성  
2. **상세 편집은 Drawer(우측 패널)로 통일**: 화면 이동 없이 편집  
3. **기본 입력은 3개만 강제**: 제목 / 담당자 / 날짜(또는 주차)  
4. **나머지는 “필요할 때만 펼치기”**: 우선순위/태그/설명/첨부는 접힘  
5. **수정은 인라인**: 더블클릭 → Enter 저장, Esc 취소  
6. **삭제는 안전장치**: Soft delete + Undo 5초 + 휴지통에서 영구삭제  
7. **상태는 드래그로 이동**: 진행전/진행중/완료/보류 기본 + 커스텀 가능  
8. **필터는 찾는 기능이 아니라 보는 기능**: 상단 고정 FilterBar  
9. **히스토리는 자동 기록**: 상태/담당자/날짜/내용 변경은 ActivityLog에 남김  
10. **빈 화면(Empty state)이 곧 가이드**: “무엇을 해야 하는지” 안내 문구/버튼 제공

---

### UX 원칙 구현 현황 (2026-02-12 업데이트)

| # | 원칙 | 상태 | 구현 내용 |
|---|------|------|-----------|
| 1 | 추가(Add)는 항상 보이고 동일한 방식 | ✅ | QuickAdd 버튼이 탭 바 옆에 항상 노출 |
| 2 | 상세 편집은 Drawer(우측 패널)로 통일 | ✅ | TaskDrawer로 모든 태스크 상세 편집 |
| 3 | 기본 입력은 3개만 강제 | ✅ | QuickAdd: 제목/담당자/날짜만 입력 |
| 4 | 나머지는 "필요할 때만 펼치기" | ✅ | TaskDrawer에서 설명/체크리스트/상세 접기 |
| 5 | 수정은 인라인 | 🔲 | 더블클릭 인라인 편집 미구현 |
| 6 | 삭제는 안전장치 | ✅ | Soft delete + Undo 5초 토스트 + 휴지통 |
| 7 | 상태는 드래그로 이동 | ✅ | Board 뷰에서 DnD로 상태 변경 |
| 8 | 필터는 찾는 기능이 아니라 보는 기능 | ✅ | 상단 고정 FilterBar (검색+필터) |
| 9 | 히스토리는 자동 기록 | 🔲 | ActivityLog UI 미구현 |
| 10 | 빈 화면이 곧 가이드 | ✅ | 휴지통/필터 결과 없음 등 안내 문구 |

---

## 2. 개발 단계(중요): "UI 먼저 → API 골격 → DB/권한은 마지막"

### Phase 0 (집에서 먼저): UI/플로우 프로토타입 (DB/권한 없음) ✅ 지금 여기
**목표:** 화면 구조, 사용자 플로우, 컴포넌트 재사용성, 입력 UX(QuickAdd/Drawer/Undo) 완성
**특징:**
- 로그인/권한/관리자/role **모두 무시**
- DB(MySQL) **미사용**
- 데이터는 아래 중 하나로 임시 저장/재현
  1) **React LocalStorage** (가장 빠름)
  2) **FastAPI In-Memory**(서버 재시작 시 초기화)
  3) **FastAPI JSON 파일 저장**(재시작해도 유지) ← 추천 (집에서 테스트 편함)

**Phase 0 산출물(완성 기준)**
- 프로젝트 화면 3종(View): **Board / Calendar / List** 동작
- Task CRUD + Drawer 편집 + Undo 삭제 + 필터/검색 동작
- "데이터가 실제로 저장되는 것처럼" 보여야 함(최소 LocalStorage/JSON 파일)

**Phase 0 프론트엔드 구현 현황** (2026-02-12 업데이트)

| 항목 | 상태 | 비고 |
|------|------|------|
| **라우팅** | ✅ 완료 | Home / Projects / ProjectDetail / Trash |
| **사이드바(Sidebar)** | ✅ 완료 | 네비게이션 + 프로젝트 목록 + 사용자 프로필 |
| **Board View (칸반)** | ✅ 완료 | 4컬럼(Not Started/In Progress/Blocked/Done), 드래그앤드롭 |
| **List View (리스트)** | ✅ 완료 | 6컬럼 정렬 가능 테이블(제목/상태/우선순위/진행률/마감일/담당자) |
| **Calendar View (캘린더)** | ✅ 완료 | 월간 그리드, 날짜별 태스크 표시, 월 이동 |
| **Overview (프로젝트 개요)** | ✅ 완료 | 통계 카드 + 프로젝트 상세 + 하위 프로젝트 |
| **TaskDrawer (우측 패널)** | ✅ 완료 | 보기/수정 모드, 접기 섹션(설명/체크리스트/상세), 상태·우선순위 변경 |
| **QuickAdd (빠른 추가)** | ✅ 완료 | 인라인 폼(제목+담당자+날짜), Enter 제출 |
| **FilterBar (필터/검색)** | ✅ 완료 | 검색 + 상태/우선순위/담당자 필터, 활성 필터 뱃지 |
| **Soft Delete + Undo** | ✅ 완료 | 삭제 → 5초 Undo 토스트 → 휴지통 이동 |
| **Trash (휴지통)** | ✅ 완료 | 복구/영구삭제, 빈 상태 안내 |
| **ToastProvider** | ✅ 완료 | 글로벌 토스트 시스템, 액션 버튼(Undo) 지원 |
| **빈 화면(Empty State)** | ✅ 완료 | 휴지통 빈 상태, 필터 결과 없음 등 |
| **프로젝트 생성 모달** | ✅ 완료 | 사이드바에서 새 프로젝트 생성 |
| **인라인 수정** | 🔲 미구현 | 더블클릭 → 인라인 편집 (Phase 0 후반 예정) |
| **ActivityLog (히스토리)** | 🔲 미구현 | 변경 로그 UI (Phase 1에서 API 연동 예정) |
| **FastAPI 연동** | 🔲 미구현 | 현재 Zustand Mock 데이터로 동작 중 |

**기술 스택 (현재 적용)**
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui (커스텀 구현, Radix 미사용)
- Zustand (상태 관리)
- @dnd-kit (드래그앤드롭)
- date-fns (날짜 처리)
- lucide-react (아이콘)

### Phase 1: FastAPI API 안정화(권한 없음) + 프런트 연동 고정
- React → FastAPI 호출로 CRUD 전환 (Mock을 실제 API로 교체)
- ActivityLog까지 API로 제공(로그는 우선 메모리/JSON 파일)

### Phase 2: MySQL 연동
- SQLAlchemy + Alembic 적용
- Repository 계층 교체: JSON/Memory → MySQL
- 인덱스/성능 최적화

### Phase 3: 사이트 접근 승인(관리자) + 권한(role) 적용
- `users.is_active`로 “사이트 사용 가능/차단” 적용
- workspace/project membership(role)로 권한 적용

---

## 3. 범위 정의 (MVP → V1 → V2)
> 아래 기능은 “최종 목표 범위”이며, **Phase 0에서는 DB/권한만 제외하고 UI/플로우를 우선 구현**한다.

### 3.1 MVP (가장 먼저 ‘써지는’ 단계)
- 워크스페이스/프로젝트 생성, 멤버 초대(Phase 0에서는 멤버는 더미)
- 업무(Task) CRUD: 생성/수정/삭제/복제
- 보기(View) 3종
  - **주간(Weekly) 보드**: 상태 칼럼 + 드래그 이동
  - **월간(Monthly) 캘린더**: 날짜 배치 + 드래그 이동
  - **리스트(List)**: 필터/정렬 최적
- 업무 상세 Drawer (단일 UX)
  - 설명(메모), 체크리스트(서브태스크), 참고 링크/파일, 댓글
- 자동 히스토리(ActivityLog) 기록
- 검색/필터: 담당자/상태/태그/기간 + 키워드 검색

### 3.2 V1 (협업 ‘맛’이 나는 단계)
- 실시간 반영(WebSocket)
- 알림(멘션/마감/상태변경)
- 템플릿
- 타임라인/간트
- 역할/권한 강화

### 3.3 V2 (운영/인사이트)
- 지표/인사이트, 자동화, 외부 협업자 초대, 감사 강화

---

## 4. Phase 0 구현 가이드 (DB/권한 없이 “사이트 구조 먼저”)

### 4.1 Phase 0에서 구현할 화면(최소)
1) 홈(Home): “내 업무(더미)” + “프로젝트 목록”  
2) 프로젝트 상세(ProjectPage): 탭/토글로 View 전환  
   - BoardView(상태 칼럼 드래그)  
   - CalendarView(월간 드래그/날짜 이동)  
   - ListView(표 형태 + 필터/정렬)  
3) TaskDrawer: 상세 편집(설명/체크/링크/댓글)  
4) Trash(휴지통): 삭제된 Task 복구/영구삭제(Phase 0에서는 영구삭제만 UI로)

### 4.2 Phase 0 데이터 저장 전략(추천: JSON 파일)
- FastAPI에서 `data.json` 같은 파일을 두고 아래 형태로 저장
```json
{
  "projects": [{ "id": 1, "name": "Demo Project" }],
  "users": [{ "id": 1, "loginid": "demo", "username": "Demo User" }],
  "tasks": [
    {
      "id": 100,
      "project_id": 1,
      "title": "첫 업무",
      "status": "todo",
      "start_date": null,
      "due_date": "2026-02-15",
      "assignee_ids": [1],
      "archived_at": null
    }
  ],
  "activity_logs": []
}
```

**장점**
- DB 없이도 “저장되는 것처럼” 테스트 가능(서버 재시작해도 유지)
- Phase 2에서 Repository만 교체하면 됨

### 4.3 Phase 0 API(최소 Mock 스펙)
> **권한 없음** / **로그인 없음** / CORS만 허용하면 됨

- `GET  /api/projects`
- `POST /api/projects`
- `GET  /api/tasks?project_id=...&status=...&q=...&from=...&to=...`
- `POST /api/tasks`
- `PATCH /api/tasks/{task_id}`
- `DELETE /api/tasks/{task_id}`  (soft delete: archived_at set)
- `POST /api/tasks/{task_id}/restore`
- `GET  /api/tasks/{task_id}/activity`

> Phase 0에서 빠른 개발을 위해 **서버는 “정합성 엄격 검증”보다** “UI 구현을 위한 최소 검증”만 한다.

### 4.4 Phase 0 프런트 연동 전략(2가지 중 택1)
#### 옵션 A (가장 추천): API는 FastAPI(Mock 저장)로, React는 실제 호출
- 장점: 나중에 DB만 갈아끼우면 됨
- 단점: 백엔드도 최소 구현 필요

#### 옵션 B (가장 빠름): React에서 LocalStorage로 먼저 UI 완성 → 이후 FastAPI로 교체
- 장점: UI를 초고속으로 뽑을 수 있음
- 단점: 나중에 API 교체 작업이 추가됨

---

## 5. 프런트엔드 아키텍처 (React) — Phase 0 중심

### 5.1 기술 스택
- React + TypeScript + Vite
- 서버 상태: TanStack Query (추천)
- 전역 UI 상태: Zustand (Drawer open, filters, selection 등)
- UI 컴포넌트: MUI 또는 AntD
- Drag & Drop:
  - 보드: dnd-kit
  - 캘린더: FullCalendar 또는 react-big-calendar

### 5.2 프런트 폴더 구조(예시)
```
frontend/
  src/
    api/
      client.ts
      endpoints.ts
    app/
      routes.tsx
      providers.tsx
    features/
      project/
      task/
      ui/
    components/
      TaskDrawer/
      QuickAdd/
      FilterBar/
      EmptyState/
      ToastUndo/
    pages/
      HomePage.tsx
      ProjectPage.tsx
      TrashPage.tsx
    styles/
      global.css
```

### 5.3 UX 구현 디테일(필수)
- Optimistic UI(드래그 이동 즉시 반영 → 실패 시 롤백)
- Undo 삭제(삭제 후 5초 토스트 → 복구)
- 인라인 수정(제목 더블클릭 → Enter 저장)
- 단축키(선택): `N` 새 업무 / `/` 검색 / `Esc` Drawer 닫기

---

## 6. 백엔드 아키텍처 (FastAPI) — Phase 0 중심

### 6.1 Phase 0 백엔드 목표
- **DB 없이도** CRUD가 되도록 최소 API 제공
- 저장은 **In-Memory 또는 JSON 파일**로 처리

### 6.2 Repository 패턴(Phase 2 대비용)
- `TaskRepository` 인터페이스를 만들고 구현을 교체하는 방식 권장
  - `JsonTaskRepository` (Phase 0~1)
  - `MysqlTaskRepository` (Phase 2)

---

## 7. 데이터 모델 (MySQL) 설계 — “나중에 구현” (Phase 2)
> Phase 0에서는 DB를 쓰지 않지만, **최종 스키마는 미리 합의**해두면 교체가 편하다.

### 7.1 User 테이블 (최종안)
- `users`: `area`, `loginid`, `deptname`, `username`, `mail`, `is_active`, `is_site_admin`, audit timestamps
- “관리자”는 최종 단계에서 **사이트 사용 승인/차단** 역할만 수행(현재 단계에서는 미적용)

### 7.2 권한(role)
- workspace/project membership 테이블로 분리(최종 단계 적용)

---

## 8. 개발 일정(권장): “Phase 0을 1~2주 안에 완성”

### Week 0~1: Phase 0 UI 프로토타입 (권한/DB 없음)
- Board/List/Calendar 뷰 구현
- QuickAdd + TaskDrawer + Undo 삭제
- FilterBar + 검색
- (옵션) FastAPI JSON 저장 API까지 연결

### Week 2: Phase 1 API 고정(권한 없음)
- React 연동을 FastAPI로 통일
- ActivityLog API까지 포함
- 에러 처리/토스트/로딩 UX 정리

### Week 3~4: Phase 2 MySQL 연동
- SQLAlchemy/Alembic
- Repository 교체(JSON → MySQL)

### Week 5+: Phase 3 권한/관리자(승인) 적용
- users.is_active 적용
- membership(role) 적용

---

## 부록 A. ActivityLog(최종 목표)
- Task 수정/상태 변경/담당자 변경은 before/after diff 저장
- Phase 0에서는 “로그 UI”만 먼저 만들고 데이터는 단순 기록으로 시작해도 됨

---

## 부록 B. Phase 0 착수 체크리스트
- [x] React 라우팅(Home/Project/Trash)
- [x] Board/List/Calendar 스켈레톤
- [x] TaskDrawer 컴포넌트 우선 완성
- [x] QuickAdd + Undo 토스트
- [ ] (선택) FastAPI Mock API + JSON 저장
- [x] 빈 화면(Empty state) 안내 문구/버튼

