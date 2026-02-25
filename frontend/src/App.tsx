import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import HomePage from './pages/HomePage';
import ProjectPage from './pages/ProjectPage';
import TrashPage from './pages/TrashPage';
import AiSettingsPage from './pages/AiSettingsPage';
import GlobalRoadmapPage from './pages/GlobalRoadmapPage';
import AdminPage from './pages/AdminPage';
import SearchPage from './pages/SearchPage';
import MentionsPage from './pages/MentionsPage';
import { MainLayout } from './layouts/MainLayout';
import TaskDrawer from './components/TaskDrawer';

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
                    <Router>
                        <MainLayout>
                            <Routes>
                                <Route path="/" element={<HomePage />} />
                                <Route path="/project/:id" element={<ProjectPage />} />
                                <Route path="/trash" element={<TrashPage />} />
                                <Route path="/ai-settings" element={<AiSettingsPage />} />
                                <Route path="/roadmap" element={<GlobalRoadmapPage />} />
                                <Route path="/search" element={<SearchPage />} />
                                <Route path="/mentions" element={<MentionsPage />} />
                                <Route path="/admin" element={<AdminPage />} />
                            </Routes>
                        </MainLayout>
                        <TaskDrawer />
                    </Router>
                </SnackbarProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
};

export default App;
