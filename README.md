# 일정관리 플랫폼 (Task Management Platform)

**Version**: 1.0.0
**Status**: Phase 1 (MVP Development)

A modern task and project management platform with hierarchical projects, kanban boards, roadmap views, and AI-powered summaries.

## 🎯 Overview

Full-stack project management platform featuring:
- **Hierarchical Projects**: Multi-level project organization with sub-projects
- **Multiple Views**: Kanban board, List view, Roadmap (Gantt-style), Node graph
- **Collaboration**: Team members, role-based permissions, real-time notifications
- **Rich Features**: Task attachments, project notes, comments with mentions, widgets dashboard
- **AI Integration**: LLM-powered project summaries (OpenAI/Anthropic/Ollama compatible)

## 🏗️ Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript 5 + Vite 5
- **UI**: Tailwind CSS + shadcn/ui (Radix UI)
- **State**: Zustand + TanStack Query (React Query)
- **Drag & Drop**: @dnd-kit
- **Rich Text**: TipTap (ProseMirror)
- **Graphs**: React Flow + Recharts

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: Express.js + TypeScript
- **Database**: PostgreSQL 16 + Prisma ORM
- **Cache**: Redis 7
- **Auth**: JWT (Access + Refresh tokens)
- **Real-time**: Socket.io

### DevOps
- **Package Manager**: pnpm 8+
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint + Prettier + Husky

## 📋 Prerequisites

- **Node.js**: 20 LTS or higher
- **pnpm**: 8.15+ (`npm install -g pnpm`)
- **Docker**: Latest with Docker Compose
- **Git**: Latest version

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone <repository-url>
cd schedulecode
```

### 2. Install Dependencies

```bash
# Backend
cd backend
pnpm install

# Frontend
cd ../frontend
pnpm install
```

### 3. Setup Environment

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env if needed (defaults work for local development)
```

### 4. Start Infrastructure

```bash
# From project root - Start PostgreSQL + Redis
docker-compose up -d

# Verify containers are running
docker ps
```

### 5. Initialize Database

```bash
cd backend

# Generate Prisma Client
pnpm prisma:generate

# Run migrations
pnpm prisma:migrate

# (Optional) Seed with sample data
pnpm db:seed
```

### 6. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
pnpm dev
# API: http://localhost:3000

# Terminal 2 - Frontend
cd frontend
pnpm dev
# UI: http://localhost:5173
```

## 📂 Project Structure

```
schedulecode/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Database models
│   │   ├── migrations/         # Migration history
│   │   └── seed.ts             # Sample data
│   ├── src/
│   │   ├── controllers/        # API route handlers
│   │   ├── services/           # Business logic
│   │   ├── middleware/         # Auth, validation, etc.
│   │   ├── routes/             # API routes
│   │   ├── utils/              # Helpers
│   │   └── index.ts            # Server entry
│   ├── .env                    # Environment config
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom hooks
│   │   ├── stores/             # Zustand stores
│   │   ├── lib/                # Utilities
│   │   └── App.tsx
│   └── package.json
│
├── docker-compose.yml          # PostgreSQL + Redis
├── .github/workflows/ci.yml    # CI pipeline
├── DEVELOPMENT.md              # Dev guide
├── PRD.md                      # Product requirements
├── TRD.md                      # Technical requirements
└── TODO.md                     # Development roadmap
```

## 🛠️ Development Commands

### Backend

```bash
pnpm dev              # Start dev server (hot reload)
pnpm build            # Build for production
pnpm start            # Run production build
pnpm lint             # Lint code
pnpm type-check       # TypeScript check
pnpm test             # Run tests

# Prisma
pnpm prisma:generate  # Generate client
pnpm prisma:migrate   # Run migrations
pnpm prisma:studio    # Database GUI
pnpm db:seed          # Seed database
```

### Frontend

```bash
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm preview          # Preview production build
pnpm lint             # Lint code
pnpm type-check       # TypeScript check
```

### Docker

```bash
docker-compose up -d           # Start services
docker-compose down            # Stop services
docker-compose logs -f         # View logs
docker-compose restart postgres # Restart PostgreSQL
```

## 🔒 Default Credentials (Development)

After seeding (`pnpm db:seed`):

- **Email**: `admin@example.com`
- **Password**: `password123`

- **Email**: `developer@example.com`
- **Password**: `password123`

## 🌐 API Documentation

- **Base URL**: `http://localhost:3000/api`
- **Auth**: JWT Bearer token
- **Docs**: See [TRD.md](./TRD.md) Section 4

Example:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
```

## 🧪 Testing

```bash
# Unit tests
cd backend && pnpm test
cd frontend && pnpm test

# E2E tests (coming in Week 8)
pnpm test:e2e
```

## 📖 Documentation

- **[PRD.md](./PRD.md)**: Product requirements and features
- **[TRD.md](./TRD.md)**: Technical architecture and API specs
- **[TODO.md](./TODO.md)**: 8-week development roadmap
- **[DEVELOPMENT.md](./DEVELOPMENT.md)**: Detailed development guide

## 🗺️ Development Roadmap

**Phase 1: MVP (8 weeks)** - Current focus
- Week 1: ✅ Project setup, Database, CI/CD
- Week 2: Authentication system
- Week 3: Project CRUD
- Week 4-8: Tasks, Roadmap, Members, Attachments, Lists

**Phase 2: Collaboration (4 weeks)**
- Notes & Comments, Notifications, Widget Dashboard

**Phase 3: Advanced (4 weeks)**
- Node graph, AI summaries, Search, Export

See [TODO.md](./TODO.md) for detailed task breakdown.

## 🤝 Contributing

1. Follow branch strategy: `feature/<name>`, `bugfix/<name>`
2. Commit conventions: `feat:`, `fix:`, `docs:`, `refactor:`
3. Run tests before PR
4. Update docs for new features

## 📝 License

MIT

## 📞 Support

- **Issues**: GitHub Issues
- **Docs**: See documentation files
- **Team**: schedulecode-dev team

---

**Built with ❤️ using React, Express, PostgreSQL, and Prisma**
