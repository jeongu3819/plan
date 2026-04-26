import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';

import HomePage from './pages/HomePage';
import ProjectPage from './pages/ProjectPage';
import KanbanBoardPage from './pages/KanbanBoardPage';
import TrashPage from './pages/TrashPage';
import AiSettingsPage from './pages/AiSettingsPage';
import GlobalRoadmapPage from './pages/GlobalRoadmapPage';
import AdminPage from './pages/AdminPage';
import SsoCallback from './pages/SsoCallbackPage';

import { MainLayout } from './layouts/MainLayout';
import TaskDrawer from './components/TaskDrawer';
import { UserProvider } from './context/UserContext';
import MentionsPage from './pages/MentionsPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import GroupPage from './pages/GroupPage';
import SpaceManagePage from './pages/SpaceManagePage';
import SheetTemplatePage from './pages/SheetTemplatePage';
import SheetExecutionPage from './pages/SheetExecutionPage';
import SheetHistoryPage from './pages/SheetHistoryPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
  },
});

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2955FF',
      light: '#6B8AFF',
      dark: '#1E44CC',
    },
    secondary: {
      main: '#8B5CF6',
    },
    background: {
      default: '#F9FAFB',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A1D29',
      secondary: '#6B7280',
    },
    success: {
      main: '#22C55E',
    },
    warning: {
      main: '#F59E0B',
    },
    error: {
      main: '#EF4444',
    },
  },
  typography: {
    fontFamily: "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h4: {
      fontWeight: 800,
      letterSpacing: '-0.025em',
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h6: {
      fontWeight: 700,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
  },
});

const withMainLayout = (element: React.ReactNode) => <MainLayout>{element}</MainLayout>;

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider
          maxSnack={3}
          autoHideDuration={3000}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <UserProvider>
            <Routes>
              {/* SSO 콜백 (레이아웃 없이) */}
              <Route path="/sso-callback" element={<SsoCallback />} />
              <Route path="/access-denied" element={<AccessDeniedPage />} />

              {/* Space 기반 라우팅 — 모든 페이지가 space 컨텍스트 아래 */}
              <Route path="/space/:spaceSlug" element={withMainLayout(<HomePage />)} />
              <Route path="/space/:spaceSlug/project/kanbanboard" element={withMainLayout(<KanbanBoardPage />)} />
              <Route path="/space/:spaceSlug/project/:id" element={withMainLayout(<ProjectPage />)} />
              <Route path="/space/:spaceSlug/trash" element={withMainLayout(<TrashPage />)} />
              <Route path="/space/:spaceSlug/ai-settings" element={withMainLayout(<AiSettingsPage />)} />
              <Route path="/space/:spaceSlug/roadmap" element={withMainLayout(<GlobalRoadmapPage />)} />
              <Route path="/space/:spaceSlug/mentions" element={withMainLayout(<MentionsPage />)} />
              <Route path="/space/:spaceSlug/admin" element={withMainLayout(<AdminPage />)} />
              <Route path="/space/:spaceSlug/groups" element={withMainLayout(<GroupPage />)} />
              <Route path="/space/:spaceSlug/spaces" element={withMainLayout(<SpaceManagePage />)} />
              <Route path="/space/:spaceSlug/sheets" element={withMainLayout(<SheetTemplatePage />)} />
              <Route path="/space/:spaceSlug/sheets/execution/:executionId" element={withMainLayout(<SheetExecutionPage />)} />
              <Route path="/space/:spaceSlug/sheets/history" element={withMainLayout(<SheetHistoryPage />)} />

              {/* 레거시 루트 — space 없이 접근 시 기본 공간으로 리다이렉트 */}
              <Route path="/" element={withMainLayout(<HomePage />)} />
              <Route path="/project/kanbanboard" element={withMainLayout(<KanbanBoardPage />)} />
              <Route path="/project/:id" element={withMainLayout(<ProjectPage />)} />
              <Route path="/trash" element={withMainLayout(<TrashPage />)} />
              <Route path="/ai-settings" element={withMainLayout(<AiSettingsPage />)} />
              <Route path="/roadmap" element={withMainLayout(<GlobalRoadmapPage />)} />
              <Route path="/mentions" element={withMainLayout(<MentionsPage />)} />
              <Route path="/admin" element={withMainLayout(<AdminPage />)} />
              <Route path="/groups" element={withMainLayout(<GroupPage />)} />
              <Route path="/spaces" element={withMainLayout(<SpaceManagePage />)} />

              {/* fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

            {/* 전역 Drawer */}
            <TaskDrawer />
          </UserProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
