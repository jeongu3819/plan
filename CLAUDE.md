# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Task & project management platform (inspired by Flow.team) with a React frontend and FastAPI backend. Currently in Phase 0 (UI/Flow Prototype) with JSON file storage — database integration (PostgreSQL) is planned for Phase 1.

## Development Commands

### Frontend (`/frontend/`)
```bash
pnpm install              # Install dependencies (requires pnpm 8.15+)
pnpm dev                  # Dev server on http://localhost:5173
pnpm build                # Production build
pnpm lint                 # ESLint check
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Prettier format
pnpm type-check           # TypeScript type checking
```

### Backend (`/backend/`)
```bash
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000  # Dev server on :8000
```

### Infrastructure
```bash
docker-compose up -d      # Start PostgreSQL 16 + Redis 7
docker-compose down       # Stop services
```

## Architecture

### Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- **State**: Zustand store (`src/stores/useAppStore.ts`) with localStorage persistence key `antigravity-app-store`
- **API layer**: All backend calls centralized in `src/api/client.ts` (Axios instance)
- **Routing**: React Router v6 in `src/App.tsx`
- **UI**: Tailwind CSS + MUI components + Lucide icons
- **Drag & drop**: @dnd-kit for kanban board
- **Rich text**: TipTap editor
- **Graphs**: React Flow + Recharts + Dagre

### Backend: FastAPI (single file)
- **Entire backend lives in `backend/main.py`** (~1700 lines) — models, endpoints, persistence all in one file
- **Data persistence**: JSON file (`backend/data.json`) loaded/saved via `load_data()`/`save_data()`
- **Permissions**: `check_project_access()` and `check_project_permission()` helper functions
- **File uploads**: Stored in `backend/uploads/`
- **CORS**: Wide-open (`*`) for development
- **No authentication yet** — user IDs passed via query params

### API Pattern
Base URL: `http://localhost:8000/api` — RESTful endpoints (`/api/projects`, `/api/tasks`, `/api/users`, etc.)

### Key Frontend Pages & Views
- `ProjectPage.tsx` is the main feature page, hosting multiple view tabs: BoardView (kanban), ListView (table), CalendarView, RoadmapView, NodeGraphView
- `TaskDrawer.tsx` is the right-side detail panel (no modal navigation — drawer pattern)
- `QuickAdd.tsx` provides inline task creation (3 fields: title, assignee, date)

## UX Conventions
- Details edited in a right drawer, never modal navigation
- Soft delete with 5-second undo toast, then trash bin
- Status changes via drag & drop on kanban board
- Filter bar always visible (not a search modal popup)
- Empty states should guide users

## Commit Convention
`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` prefixes.

---

## 필수 작업 원칙 (반드시 준수)

1. **기존 기능 삭제 금지** — 동작하는 코드를 제거하지 않는다
2. **기존 API/화면/라우팅 동작 유지** — 기존 엔드포인트 시그니처, 화면 흐름, 라우팅 경로를 변경하지 않는다
3. **필요한 부분만 최소 수정 + 추가 기능 확장** — 전체 리팩토링 금지, 구조 갈아엎기 금지
4. **기존 권한 로직을 대체하지 말고 조건 추가 방식으로 확장** — 기존 조건은 그대로 두고 OR 조건을 추가하는 방식
5. **구현 전에 수정 파일/영향 범위 계획 먼저 제시** — 코드 수정 전에 반드시 수정 대상 파일 목록과 영향 범위를 보여주고 승인 후 작업

### 비파괴적 개발 원칙

- 백엔드: 기존 API/모델을 대체하지 말고 필요한 조건/필드/엔드포인트만 확장
- 프론트엔드: 기존 UI 스타일/레이아웃 유지, 새 기능은 기존 구조 위에 추가
- 권한 로직: 기존 조건 유지 + 새 조건 추가 방식 (예: `Assignee OR Project Owner`)

### 작업 후 결과 보고 형식

1. 원인 분석 / 현재 동작 정리
2. 수정 파일 목록 (추가/수정 구분)
3. 변경 내용 요약 (권한, UI, API 등 영역별)
4. 테스트 시나리오 / 검증 결과

---

## 현재 개선 작업 목록

### 1) Task 가시성 권한 확장 (프로젝트 소유자 전체 Task 조회)

**현재**: Dashboard에서 assignee로 지정된 task만 표시
**목표**: `Assignee인 경우 OR 해당 프로젝트 소유자인 경우` 모두 조회 가능

반영 대상 화면:
- Dashboard > My Tasks, Overdue Tasks, Upcoming Tasks, Calendar
- Roadmap (해당 프로젝트 task 표시)

**중요**: UI뿐 아니라 API 조회/집계 로직에도 동일하게 반영. 프로젝트 소유자도 assignee도 아닌 사용자는 기존대로 해당 task가 보이면 안 됨.

### 2) Roadmap Task Name 표시 개선 (긴 이름 잘림 개선)

**현재**: 긴 이름이 한 줄 잘림(`...`)으로 표시되어 가독성/조작성 불편
**목표**:
- 적당한 최대 너비에서 줄바꿈(wrap), 2~3줄까지 표시 허용
- 지나치게 길면 말줄임 + 툴팁으로 전체 이름 표시
- Task bar 드래그/리사이즈 영역과 겹치지 않도록 레이아웃 정리
- 행 높이/정렬 깨지지 않게 유지

### 3) Kanban Board 리스트 항목 정렬 기능 추가

**현재**: 수동 drag & drop 배치만 가능
**목표**:
- 각 컬럼(리스트) 안의 카드를 정렬하는 UI 제공
- 정렬 기준: 생성일순, 마감일순, 우선순위순, 이름순
- 오름차순/내림차순 선택
- "기본순서(수동순서)"로 돌아가는 옵션 제공
- 기존 drag & drop 기능이 깨지지 않도록 유지

### 4) Graph 기능 개선 (Subproject 생성/연결)

**현재**: Graph에서 project-task 연결만 가능, subproject 생성/연결 불명확
**목표**:
- Graph에서 노드 추가 시 타입 선택 가능: `Task` / `Subproject`
- 연결 관계: `Project → Subproject`, `Subproject → Task` (기존 `Project → Task`도 유지)
- 생성/수정/연결 결과가 실제 데이터에 저장되어 재조회 시 유지
- 노드 타입별 시각적 구분 (색/아이콘/라벨)
- 잘못된 연결 방지 (예: Task 아래 Project 연결 제한)

### 검증 기준

- 프로젝트 소유자가 assignee가 아니어도 해당 프로젝트 task가 Dashboard/Roadmap/Calendar에서 보임
- 소유자도 assignee도 아닌 사용자에게는 기존대로 task 비노출
- 긴 Task Name이 roadmap에서 줄바꿈되어 읽을 수 있음
- Kanban 정렬 후 기본순서 복귀 가능
- Graph에서 Subproject 생성 후 Project→Subproject→Task 연결이 저장/유지됨
