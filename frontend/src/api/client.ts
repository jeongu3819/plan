import axios from 'axios';
import {
  Task,
  Note,
  MentionNote,
  Attachment,
  SubProject,
  RoadmapItem,
  ProjectMember,
  GraphNode,
  GraphEdge,
  ProjectFile,
  SearchResultProject,
  SearchSummaryResult,
  ProjectAiQueryResponse,
  User,
  Project,
} from '../types';

// ✅ Vite 환경변수 우선, 없으면 현재 호스트 기준으로 백엔드 접근
// 백엔드 main.py 예시가 8085이므로 기본 fallback을 8085로 둠
const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8085/api`;

const client = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 180000, // 3 minutes for AI requests
});

/**
 * ✅ Request Interceptor
 * - localStorage.session_token 이 있으면 Authorization 자동 부착
 */
client.interceptors.request.use(
  config => {
    const token = localStorage.getItem('session_token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

/**
 * ✅ Response Interceptor
 * - 세션 만료/서버 재시작 등으로 401 발생 시 토큰 제거 후 SSO 로그인으로 이동
 */
client.interceptors.response.use(
  res => res,
  err => {
    const status = err?.response?.status;
    if (status === 401) {
      localStorage.removeItem('session_token');
      // 백엔드: /api/auth/login
      window.location.href = `${API_URL}/auth/login`;
    }
    return Promise.reject(err);
  }
);

// ─── Local API Response Types ───
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
  description?: string;
  is_active?: boolean;
  matched_count?: number;
  created_at?: string;
}

export interface AiSettings {
  api_url: string;
  model_name: string;
  api_key: string;
}

export interface ReportResponse {
  report: string;
  model: string;
  sections?: {
    overview?: string;
    task_analysis?: string;
    status_analysis?: string;
    next_steps?: string;
  };
  structured?: any;
}

type MeResponse = {
  user_id: number;
  loginid: string;
  username: string;
  role: string;
  is_active: boolean;
  deptname?: string;
  mail?: string;
};

const requireUserId = (userId?: number) => {
  if (!userId || userId <= 0) throw new Error('user_id is required');
  return userId;
};

// ─── API ───
export const api = {
  // =========================
  // Auth (SSO)
  // =========================
  getMe: async (): Promise<MeResponse> => {
    const res = await client.get('/auth/user/me');
    return res.data;
  },
  // 필요하면 프론트에서 로그인 이동용으로 사용
  getLoginUrl: (): string => `${API_URL}/auth/login`,

  // =========================
  // Stats
  // =========================
  getStats: async (userId: number): Promise<DashboardStats> => {
    const res = await client.get('/stats', { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  // =========================
  // Projects
  // =========================
  getProjects: async (userId: number): Promise<Project[]> => {
    const res = await client.get('/projects', { params: { user_id: requireUserId(userId) } });
    return res.data.projects || [];
  },
  createProject: async (project: {
    name: string;
    description?: string;
    owner_id?: number;
    visibility?: string;
    require_approval?: boolean;
    permissions?: Record<string, string>;
    member_ids?: number[];
  }): Promise<Project> => {
    // 백엔드 ProjectCreate: owner_id/visibility/require_approval/permissions/member_ids 지원
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

  // =========================
  // Users (DB)
  // =========================
  getUsers: async (): Promise<User[]> => {
    const res = await client.get('/users');
    return res.data.users || [];
  },

  /**
   * ⚠️ 백엔드에 /api/users POST가 존재 (현재 권한 체크 없음)
   * - 일단 기존 프론트 호환을 위해 유지
   * - loginid는 소문자 강제
   */
  createUser: async (user: {
    username: string;
    loginid: string;
    role?: string;
    avatar_color?: string;
  }): Promise<User> => {
    const payload = {
      ...user,
      loginid: user.loginid.trim().toLowerCase(),
    };
    const res = await client.post('/users', payload);
    return res.data;
  },

  updateUser: async (id: number, updates: Partial<User>): Promise<User> => {
    const res = await client.patch(`/users/${id}`, updates);
    return res.data;
  },

  deleteUser: async (id: number): Promise<void> => {
    await client.delete(`/users/${id}`);
  },

  // =========================
  // User Preferences / Layout
  // =========================
  getUserLayout: async (userId: number): Promise<DashboardLayout | null> => {
    const res = await client.get(`/users/${requireUserId(userId)}/preferences`);
    return res.data.layout || null;
  },
  saveUserLayout: async (userId: number, layout: DashboardLayout): Promise<void> => {
    await client.put(`/users/${requireUserId(userId)}/preferences/layout`, { layout });
  },

  // =========================
  // Tasks
  // =========================
  getTasks: async (projectId: number | undefined, userId: number): Promise<Task[]> => {
    const params: Record<string, any> = { user_id: requireUserId(userId) };
    if (projectId) params.project_id = projectId;

    const res = await client.get('/tasks', { params });
    const tasks: Task[] = res.data.tasks || [];
    return tasks.filter(t => !t.archived_at);
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

  // =========================
  // SubProjects (sidecar)
  // =========================
  getSubProjects: async (projectId: number): Promise<SubProject[]> => {
    const res = await client.get(`/projects/${projectId}/subprojects`);
    return res.data.sub_projects || [];
  },
  createSubProject: async (
    projectId: number,
    sub: { name: string; description?: string; parent_id?: number | null }
  ): Promise<SubProject> => {
    const res = await client.post(`/projects/${projectId}/subprojects`, sub);
    return res.data;
  },
  updateSubProject: async (subId: number, updates: Partial<SubProject>): Promise<SubProject> => {
    const res = await client.patch(`/subprojects/${subId}`, updates);
    return res.data;
  },
  deleteSubProject: async (id: number): Promise<void> => {
    await client.delete(`/subprojects/${id}`);
  },

  // =========================
  // Notes (sidecar)
  // =========================
  getNotes: async (projectId: number, userId: number): Promise<Note[]> => {
    // 백엔드: user_id 있으면 프로젝트 접근 체크 수행
    const res = await client.get(`/projects/${projectId}/notes`, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data.notes || [];
  },

  createNote: async (
    projectId: number,
    content: string,
    userId: number
  ): Promise<Note & { message: string }> => {
    const res = await client.post(
      `/projects/${projectId}/notes`,
      { content },
      { params: { user_id: requireUserId(userId) } }
    );
    return res.data;
  },

  deleteNote: async (id: number): Promise<void> => {
    await client.delete(`/notes/${id}`);
  },

  // =========================
  // Mentions
  // ✅ v1.2: Backend /api/mentions endpoint implemented
  // =========================
  getMentions: async (userId: number): Promise<MentionNote[]> => {
    const res = await client.get('/mentions', { params: { user_id: requireUserId(userId) } });
    return res.data.mentions || [];
  },

  // =========================
  // Attachments (sidecar)
  // =========================
  getAttachments: async (taskId: number): Promise<Attachment[]> => {
    const res = await client.get(`/tasks/${taskId}/attachments`);
    return res.data.attachments || [];
  },
  createAttachment: async (
    taskId: number,
    attachment: { url: string; filename?: string; type?: string }
  ): Promise<Attachment> => {
    const res = await client.post(`/tasks/${taskId}/attachments`, attachment);
    return res.data;
  },
  deleteAttachment: async (id: number): Promise<void> => {
    await client.delete(`/attachments/${id}`);
  },

  // =========================
  // Roadmap
  // =========================
  getRoadmap: async (params: {
    project_id: number;
    view?: string;
    from?: string;
    to?: string;
    assignee_id?: number;
    status?: string;
  }): Promise<{ view: string; items: RoadmapItem[] }> => {
    // 백엔드: from/to는 alias="from"/"to"
    const res = await client.get('/roadmap', { params });
    return res.data;
  },

  // =========================
  // Project Members / Join Requests
  // =========================
  getProjectMembers: async (projectId: number): Promise<ProjectMember[]> => {
    const res = await client.get(`/projects/${projectId}/members`);
    return res.data.members || [];
  },

  addProjectMember: async (
    projectId: number,
    userId: number,
    role: string = 'member'
  ): Promise<any> => {
    const res = await client.post(`/projects/${projectId}/members`, { user_id: userId, role });
    return res.data;
  },

  removeProjectMember: async (projectId: number, userId: number): Promise<void> => {
    await client.delete(`/projects/${projectId}/members/${userId}`);
  },

  requestJoin: async (projectId: number, userId: number): Promise<any> => {
    const res = await client.post(`/projects/${projectId}/join-request`, null, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  getJoinRequests: async (projectId: number): Promise<any[]> => {
    const res = await client.get(`/projects/${projectId}/join-requests`);
    return res.data.join_requests || [];
  },

  approveJoinRequest: async (projectId: number, userId: number, action: string): Promise<any> => {
    const res = await client.post(`/projects/${projectId}/join-requests/approve`, {
      user_id: userId,
      action,
    });
    return res.data;
  },

  // =========================
  // Graph
  // =========================
  getProjectGraph: async (
    projectId: number
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> => {
    const res = await client.get(`/projects/${projectId}/graph`);
    return res.data;
  },

  // =========================
  // Project Files (sidecar metadata + 실제 업로드)
  // =========================
  getProjectFiles: async (projectId: number, userId: number): Promise<ProjectFile[]> => {
    const res = await client.get(`/projects/${projectId}/files`, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data.files || [];
  },

  uploadProjectFile: async (
    projectId: number,
    file: File,
    userId: number
  ): Promise<ProjectFile> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await client.post(`/projects/${projectId}/files`, formData, {
      params: { user_id: requireUserId(userId) }, // ✅ default=1 쓰지 말고 반드시 넣기
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  downloadProjectFile: (projectId: number, fileId: number, userId: number): string => {
    // ✅ 백엔드는 user_id 있으면 권한 체크 수행 -> URL에도 user_id 포함 권장
    return `${API_URL}/projects/${projectId}/files/${fileId}/download?user_id=${requireUserId(userId)}`;
  },

  deleteProjectFile: async (projectId: number, fileId: number): Promise<void> => {
    await client.delete(`/projects/${projectId}/files/${fileId}`);
  },

  // =========================
  // Global Roadmap
  // =========================
  getGlobalRoadmap: async (
    userId: number,
    view: string = 'month'
  ): Promise<{ view: string; items: RoadmapItem[] }> => {
    const res = await client.get('/roadmap/global', {
      params: { user_id: requireUserId(userId), view },
    });
    return res.data;
  },

  // ⚠️ saveGlobalRoadmapOrder endpoint는 백엔드 코드에 아직 안 보임(있다면 유지)
  saveGlobalRoadmapOrder: async (
    userId: number,
    order: string[],
    parentKey?: string
  ): Promise<void> => {
    await client.put(
      `/roadmap/global/order`,
      {
        order,
        parent_key: parentKey || null,
      },
      { params: { user_id: requireUserId(userId) } }
    );
  },

  saveRoadmapOrder: async (
    projectId: number,
    order: string[],
    parentKey?: string
  ): Promise<void> => {
    await client.put(
      `/projects/${projectId}/roadmap/order`,
      {
        order,
        parent_key: parentKey || null,
      }
    );
  },

  // =========================
  // Shortcuts (sidecar) - admin required (require_admin)
  // =========================
  getShortcuts: async (): Promise<Shortcut[]> => {
    const res = await client.get('/shortcuts');
    return res.data.shortcuts || [];
  },

  createShortcut: async (
    data: {
      name: string;
      url: string;
      icon_text?: string;
      icon_color?: string;
      order?: number;
      open_new_tab?: boolean;
    },
    userId: number
  ): Promise<Shortcut> => {
    const res = await client.post('/shortcuts', data, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  updateShortcut: async (
    id: number,
    data: Partial<Shortcut>,
    userId: number
  ): Promise<Shortcut> => {
    const res = await client.patch(`/shortcuts/${id}`, data, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  deleteShortcut: async (id: number, userId: number): Promise<void> => {
    await client.delete(`/shortcuts/${id}`, {
      params: { user_id: requireUserId(userId) },
    });
  },

  // =========================
  // Admin Users (require_admin)
  // =========================
  getAdminUsers: async (userId: number): Promise<User[]> => {
    const res = await client.get('/admin/users', { params: { user_id: requireUserId(userId) } });
    return res.data.users || [];
  },

  toggleUserActive: async (targetId: number, userId: number): Promise<User> => {
    const res = await client.patch(`/admin/users/${targetId}/toggle-active`, null, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  /**
   * ⚠️ 백엔드 코드에 /api/admin/users/{id}/role 이 아직 안 보임
   * - 우선 admin endpoint를 시도하고, 404면 /api/users/{id} patch로 fallback
   */
  updateUserRole: async (targetId: number, role: string, adminUserId: number): Promise<User> => {
    try {
      const res = await client.patch(
        `/admin/users/${targetId}/role`,
        { role },
        {
          params: { user_id: requireUserId(adminUserId) },
        }
      );
      return res.data;
    } catch (e: any) {
      if (e?.response?.status === 404) {
        const res2 = await client.patch(`/users/${targetId}`, { role });
        return res2.data;
      }
      throw e;
    }
  },

  // =========================
  // Groups (sidecar)
  // =========================
  getGroups: async (adminUserId: number): Promise<Group[]> => {
    const res = await client.get('/admin/groups', {
      params: { user_id: requireUserId(adminUserId) },
    });
    return res.data.groups || [];
  },

  createGroup: async (
    data: { name: string; description?: string },
    adminUserId: number
  ): Promise<Group> => {
    const res = await client.post('/admin/groups', data, {
      params: { user_id: requireUserId(adminUserId) },
    });
    return res.data;
  },

  deleteGroup: async (groupId: number, adminUserId: number): Promise<void> => {
    await client.delete(`/admin/groups/${groupId}`, {
      params: { user_id: requireUserId(adminUserId) },
    });
  },

  applyGroup: async (groupId: number, adminUserId: number): Promise<any> => {
    const res = await client.post(`/admin/groups/${groupId}/apply`, null, {
      params: { user_id: requireUserId(adminUserId) },
    });
    return res.data;
  },

  // =========================
  // Search & AI Summary / AI Query
  // ⚠️ 이 파트는 너가 올린 main.py 일부에 아직 안 보임(있다면 유지)
  // =========================
  searchProjects: async (
    params: {
      query?: string;
      status?: string;
      from_date?: string;
      to_date?: string;
      sort?: string;
    },
    userId: number
  ): Promise<{ projects: SearchResultProject[]; total: number }> => {
    const res = await client.post('/search', params, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  generateSearchSummary: async (
    data: { project_ids: number[]; query?: string },
    userId: number
  ): Promise<SearchSummaryResult> => {
    const res = await client.post('/search/ai-summary', data, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  getSearchSummaries: async (userId: number): Promise<{ summaries: SearchSummaryResult[] }> => {
    const res = await client.get('/search/summaries', {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  submitSummaryFeedback: async (
    data: { summary_id: number; rating: string; comment?: string },
    userId: number
  ): Promise<any> => {
    const res = await client.post('/search/feedback', data, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  saveSummaryCorrection: async (
    data: { summary_id: number; corrected_text: string },
    userId: number
  ): Promise<any> => {
    const res = await client.post('/search/correction', data, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  queryProjectAi: async (
    projectId: number,
    query: string,
    userId: number
  ): Promise<ProjectAiQueryResponse> => {
    const res = await client.post(
      `/projects/${projectId}/ai-query`,
      { query },
      { params: { user_id: requireUserId(userId) } }
    );
    return res.data;
  },

  // =========================
  // Org Admin (v1.2)
  // =========================
  getOrgTree: async (userId: number) => {
    const res = await client.get('/admin/org/tree', { params: { user_id: requireUserId(userId) } });
    return res.data.tree || [];
  },

  createOrgGroup: async (data: any, userId: number) => {
    const res = await client.post('/admin/org/groups', data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  updateOrgGroup: async (groupId: number, data: any, userId: number) => {
    const res = await client.patch(`/admin/org/groups/${groupId}`, data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  deleteOrgGroup: async (groupId: number, userId: number) => {
    const res = await client.delete(`/admin/org/groups/${groupId}`, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  assignUserToPart: async (targetUserId: number, data: any, userId: number) => {
    const res = await client.post(`/admin/org/users/${targetUserId}/assign`, data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  assignProjectPart: async (projectId: number, data: any, userId: number) => {
    const res = await client.post(`/admin/org/projects/${projectId}/assign-part`, data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  getUnassignedUsers: async (userId: number) => {
    const res = await client.get('/admin/org/unassigned-users', { params: { user_id: requireUserId(userId) } });
    return res.data.users || [];
  },
};

export { client, API_URL };
export type { User, Project };
