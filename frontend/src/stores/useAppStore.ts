import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task } from '../types';

interface AppState {
  // Current user
  currentUserId: number;
  currentLoginId: string; // ✅ 추가
  setCurrentUserId: (id: number) => void;
  setCurrentLoginId: (loginid: string) => void; // ✅ 추가

  // Drawer
  isDrawerOpen: boolean;
  selectedTask: Task | null;
  drawerProjectId: number;
  drawerInitialData: Partial<Task> | null;
  openDrawer: (task?: Task | null, projectId?: number, initialData?: Partial<Task> | null) => void;
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

  // Space context
  currentSpaceId: number | null;
  currentSpaceName: string | null;
  currentSpaceSlug: string | null;
  setCurrentSpace: (id: number | null, name: string | null, slug?: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    set => ({
      // ✅ Current user (persisted)
      currentUserId: 0, // ⭐ 권장: 1 -> 0
      currentLoginId: '', // ✅ 추가
      setCurrentUserId: id => set({ currentUserId: id }),
      setCurrentLoginId: loginid => set({ currentLoginId: loginid }),

      // Drawer
      isDrawerOpen: false,
      selectedTask: null,
      drawerProjectId: 1,
      drawerInitialData: null,
      openDrawer: (task = null, projectId = 1, initialData = null) =>
        set({
          isDrawerOpen: true,
          selectedTask: task,
          drawerProjectId: projectId,
          drawerInitialData: initialData,
        }),
      closeDrawer: () => set({ isDrawerOpen: false, selectedTask: null, drawerInitialData: null }),

      // Filter
      filterStatus: 'all',
      filterSearch: '',
      setFilterStatus: status => set({ filterStatus: status }),
      setFilterSearch: search => set({ filterSearch: search }),

      // Undo
      lastDeletedTask: null,
      setLastDeletedTask: task => set({ lastDeletedTask: task }),

      // Theme
      bgColor: '#F3F4F6',
      setBgColor: color => set({ bgColor: color }),

      // Sidebar collapse
      projectsCollapsed: false,
      toggleProjectsCollapsed: () =>
        set(state => ({ projectsCollapsed: !state.projectsCollapsed })),

      // Space context
      currentSpaceId: null,
      currentSpaceName: null,
      currentSpaceSlug: null,
      setCurrentSpace: (id, name, slug = null) => set({ currentSpaceId: id, currentSpaceName: name, currentSpaceSlug: slug }),
    }),
    {
      name: 'antigravity-app-store',
      partialize: state => ({
        currentUserId: state.currentUserId,
        currentLoginId: state.currentLoginId,
        bgColor: state.bgColor,
        projectsCollapsed: state.projectsCollapsed,
        currentSpaceId: state.currentSpaceId,
        currentSpaceName: state.currentSpaceName,
        currentSpaceSlug: state.currentSpaceSlug,
      }),
    }
  )
);
