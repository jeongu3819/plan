# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Task/project management platform (일정관리 플랫폼) with a Python FastAPI backend and React TypeScript frontend.

**Note:** README.md and DEVELOPMENT.md describe an aspirational Node.js/Express/Prisma stack. The actual implementation uses Python/FastAPI/SQLAlchemy — always refer to the actual code, not those docs.

## Development Commands

### Frontend (in `frontend/`)
```bash
npm run dev          # Vite dev server on port 5173
npm run build        # tsc && vite build
npm run lint         # ESLint (ts,tsx)
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier
npm run type-check   # tsc --noEmit
```

### Backend (in `backend/`)
```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8085
```

### Infrastructure
```bash
docker-compose up -d   # PostgreSQL 16 (port 5432) + Redis 7 (port 6379)
```

## Architecture

### Frontend (`frontend/src/`)
- **React 18 + TypeScript + Vite** with `@` path alias → `./src`
- **UI**: MUI 7 + Tailwind CSS (dual styling)
- **State**: Zustand (`stores/useAppStore.ts`) for client state, TanStack Query for server state
- **API client**: Axios with interceptors (`api/client.ts`) — auto-attaches Bearer token from localStorage
- **Routing**: React Router v6 (`App.tsx`)
- **Key libraries**: @dnd-kit (drag-drop), TipTap (rich text), React Flow + dagre (node graph), Recharts (charts), React Grid Layout (dashboard widgets), React Hook Form + Zod (forms)

#### Frontend structure
- `pages/` — route-level components (HomePage, ProjectPage, AdminPage, GlobalRoadmapPage, etc.)
- `features/project/` — project view modes: BoardView, ListView, RoadmapView, CalendarView, NodeGraphView, WeeklyProgressView, ProjectReportView, ProjectFilesView, ProjectSettingsView, NotesPanel
- `components/` — shared UI components
- `context/UserContext.tsx` — user context provider
- `types/index.ts` — shared TypeScript types

### Backend (`backend/`)
- **FastAPI** with almost all routes in `main.py` (3000+ lines monolith)
- **SQLAlchemy ORM** with models in `app/models.py`
- **Database**: MySQL (prod via PyMySQL) or SQLite (dev) — configured by `DATABASE_URL` env var
- **Auth**: ADFS/OAuth SSO via `app/routers/auth.py`, with `BYPASS_SSO=true` for local dev
- **Migrations**: Inline in `main.py` `_run_migrations()` — uses `ALTER TABLE` via SQLAlchemy inspect, plus `Base.metadata.create_all()` for new tables
- **LLM integration**: `app/llm/dsllm_adapter.py` — multiple model support for AI project summaries

#### Backend structure
- `main.py` — FastAPI app + all core API endpoints (~118 routes)
- `app/models.py` — SQLAlchemy ORM models (Space, Project, Task, User, Note, Attachment, etc.)
- `app/schemas.py` — Pydantic schemas
- `app/environment.py` — env var loading (.env.local → .env → .env.production)
- `app/routers/auth.py` — SSO/ADFS authentication
- `app/routers/knox.py` — Knox integration
- `app/services/` — business logic layer
- `app/db_connections/sqlalchemy.py` — engine + session setup

### API
- Base URL: `/api` (backend port 8085)
- Frontend default: `VITE_API_URL` or `http://{hostname}:8085/api`
- Auth: JWT Bearer token in localStorage key `session_token`

## Key Patterns

- **Session management**: In-memory dict with 24h TTL (not DB-backed)
- **Super admins**: Hardcoded loginids in `environment.py` `SUPER_ADMIN_LOGINIDS`
- **Soft deletes**: `archived_at` timestamp pattern on projects/tasks
- **Space system**: Spaces → Projects → Tasks hierarchy with role-based access (owner/admin/member)
- **DB migrations**: No migration framework — handled by code-level inspect + ALTER TABLE in `_run_migrations()`

## Commit Convention

Korean commit messages are common. Format: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
