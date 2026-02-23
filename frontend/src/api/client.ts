import axios from 'axios';
import { Task, Note, Attachment, SubProject, RoadmapItem, ProjectMember, GraphNode, GraphEdge, ProjectFile } from '../types';

const API_URL = 'http://localhost:8000/api';

const client = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
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
}

export interface User {
    id: number;
    loginid: string;
    username: string;
    role?: string;
    avatar_color?: string;
    is_active?: boolean;
}

export interface DashboardLayout {
    [key: string]: any;
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
};
