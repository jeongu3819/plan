import axios from 'axios';
import { Task, Note, MentionNote, Attachment, SubProject, RoadmapItem, ProjectMember, GraphNode, GraphEdge, ProjectFile, SearchResultProject, SearchSummaryResult, ProjectAiQueryResponse, GitHubAuthStatus, GitHubProjectStatus, GitHubDashboardProject } from '../types';

const API_URL = `http://${window.location.hostname}:8000/api`;

const client = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 180000, // 3 minutes for AI requests
});

// ─── Types ───

export interface ProjectStats {
    id: number;
    name: string;
    total: number;
    done: number;
    in_progress: number;
    todo: number;
    progress: number;
}

export interface DashboardStats {
    total: number;
    in_progress: number;
    done: number;
    todo: number;
    hold: number;
    project_stats: ProjectStats[];
    overdue: Task[];
    upcoming: Task[];
    my_tasks: Task[];
}

export interface Project {
    id: number;
    name: string;
    description?: string;
    owner_id?: number;
    visibility?: string;
    created_at?: string;
    require_approval?: boolean;
    permissions?: Record<string, string>;
    github_repo?: string;
}

export interface User {
    id: number;
    loginid: string;
    username: string;
    role?: string;
    avatar_color?: string;
    is_active?: boolean;
    group_name?: string;
}

export interface DashboardLayout {
    [key: string]: any;
}

export interface Shortcut {
    id: number;
    name: string;
    url: string;
    icon_text: string;
    icon_color: string;
    order: number;
    open_new_tab: boolean;
    active: boolean;
    created_at?: string;
}

export interface Group {
    id: number;
    name: string;
    matched_count?: number;
    created_at?: string;
}

// ─── API ───

export const api = {
    // Stats
    getStats: async (userId?: number): Promise<DashboardStats> => {
        const params = userId ? { user_id: userId } : {};
        const res = await client.get('/stats', { params });
        return res.data;
    },

    // Projects
    getProjects: async (userId?: number): Promise<Project[]> => {
        const params = userId ? { user_id: userId } : {};
        const res = await client.get('/projects', { params });
        return res.data.projects || [];
    },
    createProject: async (project: { name: string; description?: string; owner_id?: number; require_approval?: boolean; permissions?: Record<string, string>; member_ids?: number[] }): Promise<Project> => {
        const res = await client.post('/projects', project);
        return res.data;
    },
    updateProject: async (id: number, updates: Partial<Project>): Promise<Project> => {
        const res = await client.patch(`/projects/${id}`, updates);
        return res.data;
    },
    deleteProject: async (id: number): Promise<void> => {
        await client.delete(`/projects/${id}`);
    },

    // Users
    getUsers: async (): Promise<User[]> => {
        const res = await client.get('/users');
        return res.data.users || [];
    },
    createUser: async (user: { username: string; loginid: string; role?: string; avatar_color?: string }): Promise<User> => {
        const res = await client.post('/users', user);
        return res.data;
    },
    deleteUser: async (id: number): Promise<void> => {
        await client.delete(`/users/${id}`);
    },

    // User Preferences / Layout
    getUserLayout: async (userId: number): Promise<DashboardLayout | null> => {
        const res = await client.get(`/users/${userId}/preferences`);
        return res.data.layout || null;
    },
    saveUserLayout: async (userId: number, layout: DashboardLayout): Promise<void> => {
        await client.put(`/users/${userId}/preferences/layout`, { layout });
    },

    // Tasks
    getTasks: async (projectId?: number, userId?: number): Promise<Task[]> => {
        const params: Record<string, any> = {};
        if (projectId) params.project_id = projectId;
        if (userId) params.user_id = userId;
        const res = await client.get('/tasks', { params });
        let tasks: Task[] = res.data.tasks || [];
        tasks = tasks.filter(t => !t.archived_at);
        return tasks;
    },
    createTask: async (task: Omit<Task, 'id'>): Promise<Task> => {
        const res = await client.post('/tasks', task);
        return res.data;
    },
    updateTask: async (id: number, updates: Partial<Task>): Promise<Task> => {
        const res = await client.patch(`/tasks/${id}`, updates);
        return res.data;
    },
    deleteTask: async (id: number): Promise<void> => {
        await client.delete(`/tasks/${id}`);
    },
    restoreTask: async (id: number): Promise<void> => {
        await client.post(`/tasks/${id}/restore`);
    },

    // SubProjects
    getSubProjects: async (projectId: number): Promise<SubProject[]> => {
        const res = await client.get(`/projects/${projectId}/subprojects`);
        return res.data.sub_projects || [];
    },
    createSubProject: async (projectId: number, sub: { name: string; description?: string; parent_id?: number | null }): Promise<SubProject> => {
        const res = await client.post(`/projects/${projectId}/subprojects`, sub);
        return res.data;
    },
    deleteSubProject: async (id: number): Promise<void> => {
        await client.delete(`/subprojects/${id}`);
    },

    // Notes
    getNotes: async (projectId: number): Promise<Note[]> => {
        const res = await client.get(`/projects/${projectId}/notes`);
        return res.data.notes || [];
    },
    createNote: async (projectId: number, content: string, userId: number = 1): Promise<Note & { message: string }> => {
        const res = await client.post(`/projects/${projectId}/notes?user_id=${userId}`, { content });
        return res.data;
    },
    deleteNote: async (id: number): Promise<void> => {
        await client.delete(`/notes/${id}`);
    },

    // Mentions
    getMentions: async (userId: number): Promise<MentionNote[]> => {
        const res = await client.get('/mentions', { params: { user_id: userId } });
        return res.data.mentions || [];
    },

    // Attachments
    getAttachments: async (taskId: number): Promise<Attachment[]> => {
        const res = await client.get(`/tasks/${taskId}/attachments`);
        return res.data.attachments || [];
    },
    createAttachment: async (taskId: number, attachment: { url: string; filename?: string; type?: string }): Promise<Attachment> => {
        const res = await client.post(`/tasks/${taskId}/attachments`, attachment);
        return res.data;
    },
    deleteAttachment: async (id: number): Promise<void> => {
        await client.delete(`/attachments/${id}`);
    },

    // Roadmap
    getRoadmap: async (params: {
        project_id: number;
        view?: string;
        from?: string;
        to?: string;
        assignee_id?: number;
        status?: string;
    }): Promise<{ view: string; items: RoadmapItem[] }> => {
        const res = await client.get('/roadmap', { params });
        return res.data;
    },

    // Roadmap Order
    saveRoadmapOrder: async (projectId: number, order: string[], parentKey?: string): Promise<void> => {
        await client.put(`/projects/${projectId}/roadmap-order`, { order, parent_key: parentKey || null });
    },

    // Project Members
    getProjectMembers: async (projectId: number): Promise<ProjectMember[]> => {
        const res = await client.get(`/projects/${projectId}/members`);
        return res.data.members || [];
    },
    addProjectMember: async (projectId: number, userId: number, role: string = 'member'): Promise<void> => {
        await client.post(`/projects/${projectId}/members`, { user_id: userId, role });
    },
    removeProjectMember: async (projectId: number, userId: number): Promise<void> => {
        await client.delete(`/projects/${projectId}/members/${userId}`);
    },

    // Graph
    getProjectGraph: async (projectId: number): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> => {
        const res = await client.get(`/projects/${projectId}/graph`);
        return res.data;
    },

    // AI Settings
    getAiSettings: async (): Promise<{ api_url: string; model_name: string; api_key: string }> => {
        const res = await client.get('/settings/ai');
        return res.data;
    },
    saveAiSettings: async (settings: { api_url: string; model_name: string; api_key?: string }): Promise<void> => {
        await client.put('/settings/ai', settings);
    },

    // Report
    getReportData: async (projectId: number) => {
        const res = await client.get(`/report/data/${projectId}`);
        return res.data;
    },
    generateReport: async (projectId: number): Promise<{ report: string; model: string }> => {
        const res = await client.post('/report/generate', { project_id: projectId });
        return res.data;
    },

    // Project Files
    getProjectFiles: async (projectId: number, userId?: number): Promise<ProjectFile[]> => {
        const params = userId ? { user_id: userId } : {};
        const res = await client.get(`/projects/${projectId}/files`, { params });
        return res.data.files || [];
    },
    uploadProjectFile: async (projectId: number, file: File, userId: number = 1): Promise<ProjectFile> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await client.post(`/projects/${projectId}/files?user_id=${userId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data;
    },
    downloadProjectFile: (projectId: number, fileId: number): string => {
        return `${API_URL}/projects/${projectId}/files/${fileId}/download`;
    },
    deleteProjectFile: async (projectId: number, fileId: number): Promise<void> => {
        await client.delete(`/projects/${projectId}/files/${fileId}`);
    },

    // Join Requests
    requestJoin: async (projectId: number, userId: number): Promise<any> => {
        const res = await client.post(`/projects/${projectId}/join-request?user_id=${userId}`);
        return res.data;
    },
    getJoinRequests: async (projectId: number): Promise<any[]> => {
        const res = await client.get(`/projects/${projectId}/join-requests`);
        return res.data.join_requests || [];
    },
    approveJoinRequest: async (projectId: number, userId: number, action: string): Promise<any> => {
        const res = await client.post(`/projects/${projectId}/join-requests/approve`, { user_id: userId, action });
        return res.data;
    },

    // Global Roadmap
    getGlobalRoadmap: async (userId: number, view: string = 'month'): Promise<{ view: string; items: RoadmapItem[] }> => {
        const res = await client.get('/roadmap/global', { params: { user_id: userId, view } });
        return res.data;
    },
    saveGlobalRoadmapOrder: async (userId: number, order: string[], parentKey?: string): Promise<void> => {
        await client.put(`/roadmap/global/order?user_id=${userId}`, { order, parent_key: parentKey || null });
    },

    // Shortcuts
    getShortcuts: async (): Promise<Shortcut[]> => {
        const res = await client.get('/shortcuts');
        return res.data.shortcuts || [];
    },
    createShortcut: async (data: { name: string; url: string; icon_text?: string; icon_color?: string; order?: number; open_new_tab?: boolean }, userId: number): Promise<Shortcut> => {
        const res = await client.post(`/shortcuts?user_id=${userId}`, data);
        return res.data;
    },
    updateShortcut: async (id: number, data: Partial<Shortcut>, userId: number): Promise<Shortcut> => {
        const res = await client.patch(`/shortcuts/${id}?user_id=${userId}`, data);
        return res.data;
    },
    deleteShortcut: async (id: number, userId: number): Promise<void> => {
        await client.delete(`/shortcuts/${id}?user_id=${userId}`);
    },

    // Admin
    getAdminUsers: async (userId: number): Promise<User[]> => {
        const res = await client.get(`/admin/users?user_id=${userId}`);
        return res.data.users || [];
    },
    toggleUserActive: async (targetId: number, userId: number): Promise<User> => {
        const res = await client.patch(`/admin/users/${targetId}/toggle-active?user_id=${userId}`);
        return res.data;
    },
    updateUserRole: async (targetId: number, role: string, userId: number): Promise<User> => {
        const res = await client.patch(`/admin/users/${targetId}/role?user_id=${userId}`, { role });
        return res.data;
    },

    // Groups
    getGroups: async (userId: number): Promise<Group[]> => {
        const res = await client.get(`/admin/groups?user_id=${userId}`);
        return res.data.groups || [];
    },
    createGroup: async (data: { name: string }, userId: number): Promise<Group> => {
        const res = await client.post(`/admin/groups?user_id=${userId}`, data);
        return res.data;
    },
    deleteGroup: async (groupId: number, userId: number): Promise<void> => {
        await client.delete(`/admin/groups/${groupId}?user_id=${userId}`);
    },
    applyGroup: async (groupId: number, userId: number): Promise<any> => {
        const res = await client.post(`/admin/groups/${groupId}/apply?user_id=${userId}`);
        return res.data;
    },

    // ─── Search & AI Summary ───
    searchProjects: async (params: { query?: string; status?: string; from_date?: string; to_date?: string; sort?: string }, userId: number): Promise<{ projects: SearchResultProject[]; total: number }> => {
        const res = await client.post(`/search?user_id=${userId}`, params);
        return res.data;
    },
    generateSearchSummary: async (data: { project_ids: number[]; query?: string }, userId: number): Promise<SearchSummaryResult> => {
        const res = await client.post(`/search/ai-summary?user_id=${userId}`, data);
        return res.data;
    },
    getSearchSummaries: async (userId: number): Promise<{ summaries: SearchSummaryResult[] }> => {
        const res = await client.get(`/search/summaries?user_id=${userId}`);
        return res.data;
    },
    submitSummaryFeedback: async (data: { summary_id: number; rating: string; comment?: string }, userId: number): Promise<any> => {
        const res = await client.post(`/search/feedback?user_id=${userId}`, data);
        return res.data;
    },
    saveSummaryCorrection: async (data: { summary_id: number; corrected_text: string }, userId: number): Promise<any> => {
        const res = await client.post(`/search/correction?user_id=${userId}`, data);
        return res.data;
    },
    queryProjectAi: async (projectId: number, query: string, userId: number): Promise<ProjectAiQueryResponse> => {
        const res = await client.post(`/projects/${projectId}/ai-query?user_id=${userId}`, { query });
        return res.data;
    },

    // ─── GitHub Integration ───
    getGitHubAuthStatus: async (): Promise<GitHubAuthStatus> => {
        const res = await client.get('/github/auth-status');
        return res.data;
    },
    syncGitHub: async (projectId: number): Promise<{ message: string; stats: { pulled: number; pushed: number; updated: number }; errors?: string[] }> => {
        const res = await client.post(`/projects/${projectId}/github/sync`);
        return res.data;
    },
    getGitHubProjectStatus: async (projectId: number): Promise<GitHubProjectStatus> => {
        const res = await client.get(`/projects/${projectId}/github/status`);
        return res.data;
    },
    getGitHubDashboard: async (): Promise<{ projects: GitHubDashboardProject[] }> => {
        const res = await client.get('/github/dashboard');
        return res.data;
    },
};
