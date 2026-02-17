# Development Guide - 일정관리 플랫폼

## 📋 Prerequisites

- **Node.js**: 20 LTS or higher
- **pnpm**: 8.15+ (Package Manager)
- **Docker**: Latest version with Docker Compose
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

### 3. Setup Environment Variables

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your configuration
```

### 4. Start Infrastructure (Docker)

```bash
# From project root
docker-compose up -d

# Verify containers are running
docker ps
```

You should see:
- `schedulecode-postgres` on port 5432
- `schedulecode-redis` on port 6379

### 5. Setup Database

```bash
cd backend

# Generate Prisma Client
pnpm prisma generate

# Run migrations
pnpm prisma migrate dev --name init

# (Optional) Seed database
pnpm prisma db seed
```

### 6. Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
pnpm dev

# Terminal 2 - Frontend
cd frontend
pnpm dev
```

Access the application:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000

## 🏗️ Project Structure

```
schedulecode/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma       # Database schema
│   ├── src/
│   │   ├── controllers/        # API controllers
│   │   ├── services/           # Business logic
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # API routes
│   │   ├── utils/              # Utilities
│   │   └── index.ts            # Entry point
│   ├── .env                    # Environment variables
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom hooks
│   │   ├── stores/             # Zustand stores
│   │   ├── lib/                # Libraries
│   │   └── App.tsx
│   └── package.json
│
├── docker-compose.yml          # Docker services
└── .github/
    └── workflows/
        └── ci.yml              # GitHub Actions CI
```

## 🔄 Git Workflow

### Branch Strategy

- **main**: Production-ready code
- **develop**: Integration branch
- **feature/**: Feature branches (e.g., `feature/auth-system`)
- **bugfix/**: Bug fix branches
- **hotfix/**: Emergency fixes

### Workflow

```bash
# Create feature branch
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# Work on feature
git add .
git commit -m "feat: your feature description"

# Push to remote
git push -u origin feature/your-feature-name

# Create Pull Request to develop
# After review and approval, merge to develop
```

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: Add user authentication
fix: Resolve task deletion bug
docs: Update API documentation
style: Format code with Prettier
refactor: Simplify project service logic
test: Add unit tests for auth service
chore: Update dependencies
```

## 🧪 Testing

### Unit Tests

```bash
# Backend
cd backend
pnpm test

# Frontend
cd frontend
pnpm test
```

### E2E Tests

```bash
# Coming soon with Playwright
pnpm test:e2e
```

## 📦 Database Management

### Prisma Commands

```bash
# Generate Prisma Client (after schema changes)
pnpm prisma generate

# Create migration
pnpm prisma migrate dev --name your_migration_name

# Apply migrations (production)
pnpm prisma migrate deploy

# Reset database (development only)
pnpm prisma migrate reset

# Open Prisma Studio (database GUI)
pnpm prisma studio
```

### Database Schema Updates

1. Edit `backend/prisma/schema.prisma`
2. Run migration: `pnpm prisma migrate dev --name description`
3. Prisma Client auto-generates
4. Update TypeScript code to use new schema

## 🔧 Development Tools

### Code Quality

```bash
# Lint
pnpm lint

# Type check
pnpm type-check

# Format code
pnpm format
```

### Docker Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart specific service
docker-compose restart postgres

# Clean volumes (caution: deletes data)
docker-compose down -v
```

## 🐛 Troubleshooting

### Docker Issues

**Problem**: Cannot connect to Docker daemon
```bash
# Solution: Start Docker Desktop
# Then verify: docker ps
```

**Problem**: Port already in use
```bash
# Find process using port
lsof -i :5432
# Kill process or change port in docker-compose.yml
```

### Prisma Issues

**Problem**: Prisma Client out of sync
```bash
# Solution: Regenerate client
pnpm prisma generate
```

**Problem**: Migration conflicts
```bash
# Solution: Reset database (development)
pnpm prisma migrate reset
# Or resolve migration manually
```

### Node Modules Issues

```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## 📝 API Documentation

API endpoints follow RESTful conventions. See [TRD.md](./TRD.md) Section 4 for complete API specification.

Base URL: `http://localhost:3000/api`

### Example Request

```bash
# Register user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword",
    "name": "John Doe"
  }'
```

## 🚢 Deployment

### Environment Setup

1. **Development**: Local with Docker
2. **Staging**: TBD
3. **Production**: TBD

Deployment configuration coming in Week 8 (TODO.md).

## 📚 Additional Resources

- [PRD.md](./PRD.md) - Product Requirements Document
- [TRD.md](./TRD.md) - Technical Requirements Document
- [TODO.md](./TODO.md) - Development Roadmap
- [Prisma Docs](https://www.prisma.io/docs)
- [React Docs](https://react.dev)
- [Express Docs](https://expressjs.com)

## 🤝 Contributing

1. Follow the Git workflow above
2. Ensure all tests pass before PR
3. Update documentation for new features
4. Follow code style guidelines (ESLint + Prettier)

## 📞 Support

For issues or questions:
- Check TODO.md for known issues
- Review TRD.md for technical details
- Contact team lead
