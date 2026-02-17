# Schedule Management Platform - Frontend

React + Vite + TypeScript frontend application for the schedule management platform.

## Tech Stack

- **Framework**: React 18.3+
- **Build Tool**: Vite 5.0+
- **Language**: TypeScript 5.0+
- **State Management**: Zustand 4.5+
- **Routing**: React Router 6.20+
- **UI Framework**: Tailwind CSS 3.4+
- **Component Library**: shadcn/ui (커스텀 구현, Radix 미사용)
- **Icons**: Lucide React
- **Drag & Drop**: @dnd-kit
- **Date**: date-fns

## Getting Started

### Prerequisites

- Node.js 20 LTS
- pnpm 8.15+

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start development server
pnpm dev
```

### Available Scripts

- `pnpm dev` - Start development server (http://localhost:5173)
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint errors
- `pnpm format` - Format code with Prettier
- `pnpm type-check` - Run TypeScript type checking

## Project Structure

```
src/
├── components/           # 재사용 컴포넌트
│   ├── ui/              # UI 프리미티브 (button, badge, card, sheet, tabs, ...)
│   ├── Sidebar.tsx      # 사이드바 네비게이션
│   ├── TaskCard.tsx     # 칸반 태스크 카드
│   ├── TaskDrawer.tsx   # 태스크 상세 우측 패널
│   ├── KanbanColumn.tsx # 칸반 컬럼
│   ├── FilterBar.tsx    # 필터/검색 바
│   ├── ListView.tsx     # 리스트 뷰 테이블
│   ├── CalendarView.tsx # 캘린더 뷰
│   ├── QuickAdd.tsx     # 빠른 태스크 추가
│   └── CreateProjectModal.tsx
├── data/                # Mock 데이터
│   ├── mockProjects.ts  # 프로젝트 샘플 데이터
│   └── mockTasks.ts     # 태스크 샘플 데이터 + 인터페이스
├── lib/                 # 유틸리티
│   └── utils.ts         # cn() 등 헬퍼
├── pages/               # 페이지 컴포넌트
│   ├── HomePage.tsx     # 대시보드
│   ├── ProjectListPage.tsx
│   ├── ProjectDetailPage.tsx  # Board/List/Calendar/Overview 탭
│   ├── KanbanBoardPage.tsx    # 독립 칸반 (레거시)
│   └── TrashPage.tsx    # 휴지통
├── stores/              # Zustand 상태 관리
│   ├── useProjectStore.ts
│   ├── useTaskStore.ts
│   └── useAuthStore.ts
├── App.tsx              # 루트 (BrowserRouter + ToastProvider)
├── main.tsx             # 엔트리포인트
└── index.css            # 글로벌 스타일 (Tailwind)
```

## Features

### Phase 0 - UI/플로우 프로토타입 (현재)

**페이지**
- ✅ HomePage - 대시보드 (프로젝트 통계, 활성 프로젝트, 예정 태스크)
- ✅ ProjectListPage - 프로젝트 목록
- ✅ ProjectDetailPage - 프로젝트 상세 (4개 탭: Board/List/Calendar/Overview)
- ✅ TrashPage - 휴지통 (복구/영구삭제)
- ✅ Sidebar - 네비게이션 + 프로젝트 목록 + 사용자 프로필

**뷰 (ProjectDetailPage 내 탭)**
- ✅ Board View - 칸반 보드 (4컬럼, @dnd-kit 드래그앤드롭)
- ✅ List View - 테이블 (6컬럼 정렬)
- ✅ Calendar View - 월간 캘린더 (날짜별 태스크)
- ✅ Overview - 통계 카드 + 프로젝트 상세 + 하위 프로젝트

**핵심 컴포넌트**
- ✅ TaskDrawer - 우측 패널 (보기/수정 모드, 접기 섹션)
- ✅ QuickAdd - 인라인 태스크 추가 (제목+담당자+날짜)
- ✅ FilterBar - 검색 + 상태/우선순위/담당자 필터
- ✅ TaskCard - 칸반 카드 (우선순위 색상, 마감일, 담당자)
- ✅ KanbanColumn - 칸반 컬럼 (드롭 영역, 태스크 카운트)
- ✅ ToastProvider - 글로벌 토스트 (Undo 액션 지원)
- ✅ CreateProjectModal - 프로젝트 생성

**UX 기능**
- ✅ Soft Delete + Undo 토스트 (5초)
- ✅ 드래그앤드롭 상태 변경 (Board 뷰)
- ✅ 필터/검색 (상단 고정 FilterBar)
- ✅ 빈 화면(Empty State) 안내
- ⬜ 인라인 수정 (더블클릭 편집)
- ⬜ ActivityLog (변경 히스토리)

**UI 프리미티브 (shadcn/ui 커스텀)**
- ✅ Button, Badge, Card, Input, Progress
- ✅ Sheet (슬라이드 패널), Tabs, Select, Textarea
- ✅ Checkbox, Toast, Tooltip

### Phase 1 - API 연동 (예정)
- ⬜ FastAPI Mock API + JSON 저장 연동
- ⬜ TanStack Query로 서버 상태 관리
- ⬜ ActivityLog API
- ⬜ 에러 처리/로딩 UX

### Phase 2 - MySQL 연동 (예정)
- ⬜ Repository 교체 (JSON → MySQL)

### Phase 3 - 권한/관리자 (예정)
- ⬜ 인증/로그인
- ⬜ 역할 기반 권한

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

### Tailwind CSS

Tailwind is configured with shadcn/ui design tokens. See `tailwind.config.js` for customization.

### ESLint & Prettier

Code quality is enforced with ESLint and Prettier. Run `pnpm lint:fix` and `pnpm format` before committing.

## Development Guidelines

### Component Creation

Use shadcn/ui components as base:

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Click me</Button>
      </CardContent>
    </Card>
  );
}
```

### State Management

Use Zustand stores for global state:

```tsx
import { useAuthStore } from '@/stores/useAuthStore';

export function MyComponent() {
  const { user, isAuthenticated } = useAuthStore();

  return <div>{user?.name}</div>;
}
```

### API Calls

Use TanStack Query with Axios:

```tsx
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';

export function MyComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return response.data;
    },
  });

  return <div>{data?.length} projects</div>;
}
```

## Performance

- Code splitting with React.lazy
- Image optimization with WebP
- Bundle size target: < 500KB (gzip)
- Initial load time: < 3s on 3G

## Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatible
- Focus management

## Browser Support

- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

## License

Private - All Rights Reserved
