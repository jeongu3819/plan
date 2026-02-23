import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task } from '../types';

interface AppState {
    // Current user
    currentUserId: number;
    setCurrentUserId: (id: number) => void;

    // Drawer
    isDrawerOpen: boolean;
    selectedTask: Task | null;
    drawerProjectId: number;
    openDrawer: (task?: Task | null, projectId?: number) => void;
    closeDrawer: () => void;

    // Filter
    filterStatus: string;
    filterSearch: string;
    setFilterStatus: (status: string) => void;
    setFilterSearch: (search: string) => void;

    // Undo
    lastDeletedTask: Task | null;
    setLastDeletedTask: (task: Task | null) => void;

    // Theme
    bgColor: string;
    setBgColor: (color: string) => void;

    // Sidebar collapse
    projectsCollapsed: boolean;
    toggleProjectsCollapsed: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            // Current user (persisted)
            currentUserId: 1,
            setCurrentUserId: (id) => set({ currentUserId: id }),

            // Drawer
            isDrawerOpen: false,
            selectedTask: null,
            drawerProjectId: 1,
            openDrawer: (task = null, projectId = 1) => set({
                isDrawerOpen: true,
                selectedTask: task,
                drawerProjectId: projectId,
            }),
            closeDrawer: () => set({ isDrawerOpen: false, selectedTask: null }),

            // Filter
            filterStatus: 'all',
            filterSearch: '',
            setFilterStatus: (status) => set({ filterStatus: status }),
            setFilterSearch: (search) => set({ filterSearch: search }),

            // Undo
            lastDeletedTask: null,
            setLastDeletedTask: (task) => set({ lastDeletedTask: task }),

            // Theme
            bgColor: '#F3F4F6',
            setBgColor: (color) => set({ bgColor: color }),

            // Sidebar collapse
            projectsCollapsed: false,
            toggleProjectsCollapsed: () => set((state) => ({ projectsCollapsed: !state.projectsCollapsed })),
        }),
        {
            name: 'antigravity-app-store',
            partialize: (state) => ({ currentUserId: state.currentUserId, bgColor: state.bgColor, projectsCollapsed: state.projectsCollapsed }),
        }
    )
);
