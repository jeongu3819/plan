import axios from 'axios';
import {
  Task,
  Note,
  MentionNote,
  Attachment,
  TaskActivity,
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

/** localStorage에 저장된 me에서 user_id 꺼내기 (없으면 undefined) */
function getStoredUserId(): number | undefined {
  try {
    const raw = localStorage.getItem('me');
    if (!raw) return undefined;
    const me = JSON.parse(raw);
    const uid = Number(me?.user_id);
    return Number.isFinite(uid) && uid > 0 ? uid : undefined;
  } catch {
    return undefined;
  }
}

/** userId가 없으면 me.user_id로 자동 채움 */
function resolveUserId(userId?: number): number | undefined {
  if (userId && userId > 0) return userId;
  return getStoredUserId();
}

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
    if (status === 403) {
      const detail = err?.response?.data?.detail || '';
      if (detail.includes('등록') || detail.includes('접근 권한')) {
        window.location.href = '/access-denied';
      }
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
  all_tasks: Task[];
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

export interface UserShortcut {
  id: number;
  user_id: number;
  name: string;
  url: string;
  icon_text?: string;
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

export interface MemberGroupMember {
  user_id: number;
  username: string;
  loginid: string;
  avatar_color?: string;
  deptname?: string;
}

export interface MemberGroup {
  id: number;
  name: string;
  description?: string;
  created_by: number;
  created_at?: string;
  member_count: number;
  members: MemberGroupMember[];
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
  getStats: async (userId: number, spaceId?: number | null): Promise<DashboardStats> => {
    const params: Record<string, any> = { user_id: requireUserId(userId) };
    if (spaceId) params.space_id = spaceId;
    const res = await client.get('/stats', { params });
    return res.data;
  },

  // =========================
  // Projects
  // =========================
  getProjects: async (userId: number, spaceId?: number | null): Promise<Project[]> => {
    const params: Record<string, any> = { user_id: requireUserId(userId) };
    if (spaceId) params.space_id = spaceId;
    const res = await client.get('/projects', { params });
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
    space_id?: number;
  }): Promise<Project> => {
    const res = await client.post('/projects', project);
    return res.data;
  },
  updateProject: async (id: number, updates: Partial<Project>, callerUserId?: number): Promise<Project> => {
    const params = callerUserId ? { caller_user_id: callerUserId } : {};
    const res = await client.patch(`/projects/${id}`, updates, { params });
    return res.data;
  },
  deleteProject: async (id: number): Promise<void> => {
    await client.delete(`/projects/${id}`);
  },
  restoreProject: async (id: number): Promise<void> => {
    await client.post(`/projects/${id}/restore`);
  },
  getTrash: async (): Promise<{ projects: any[]; tasks: any[] }> => {
    const res = await client.get('/trash');
    return res.data;
  },

  // =========================
  // Project Hiding (per-user)
  // =========================
  toggleHiddenProject: async (userId: number, projectId: number): Promise<{ action: string; hidden_projects: number[] }> => {
    const res = await client.post(`/users/${requireUserId(userId)}/hidden-projects/${projectId}`);
    return res.data;
  },

  getHiddenProjects: async (userId: number): Promise<number[]> => {
    const res = await client.get(`/users/${requireUserId(userId)}/hidden-projects`);
    return res.data.hidden_projects || [];
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
    deptname?: string;
    mail?: string;
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

  uploadTaskFile: async (taskId: number, file: File, userId: number): Promise<Attachment> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await client.post(`/tasks/${taskId}/files`, formData, {
      params: { user_id: requireUserId(userId) },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  // =========================
  // Task Activities (Checklist)
  // =========================
  getTaskActivities: async (taskId: number): Promise<TaskActivity[]> => {
    const res = await client.get(`/tasks/${taskId}/activities`);
    return res.data.activities || [];
  },
  createTaskActivity: async (taskId: number, data: { content: string; block_type?: string; checked?: boolean; style?: any }): Promise<TaskActivity> => {
    const res = await client.post(`/tasks/${taskId}/activities`, data);
    return res.data;
  },
  updateTaskActivity: async (activityId: number, data: Partial<TaskActivity>): Promise<TaskActivity> => {
    const res = await client.patch(`/activities/${activityId}`, data);
    return res.data;
  },
  deleteTaskActivity: async (activityId: number): Promise<void> => {
    await client.delete(`/activities/${activityId}`);
  },
  reorderTaskActivities: async (taskId: number, order: number[]): Promise<void> => {
    await client.put(`/tasks/${taskId}/activities/reorder`, { order });
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

  updateProjectMemberRole: async (projectId: number, targetUserId: number, role: string, callerUserId: number): Promise<any> => {
    const res = await client.patch(`/projects/${projectId}/members/${targetUserId}/role`, { role }, { params: { user_id: requireUserId(callerUserId) } });
    return res.data;
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
  // Report
  // =========================
  getReportData: async (projectId: number, userId?: number): Promise<any> => {
    const uid = resolveUserId(userId);
    const res = await client.get(`/report/data/${projectId}`, {
      params: uid ? { user_id: uid } : {},
    });
    return res.data;
  },

  deleteReportData: async (projectId: number, userId?: number): Promise<any> => {
    const uid = resolveUserId(userId);
    const res = await client.delete(`/report/data/${projectId}`, {
      params: uid ? { user_id: uid } : {},
    });
    return res.data;
  },

  generateReport: async (projectId: number): Promise<ReportResponse> => {
    // generate는 보통 권한체크를 내부에서 project access로 하니까 params 없어도 되는데,
    // 통일하고 싶으면 uid 붙여도 됨(백엔드가 받게 만들었을 때)
    const res = await client.post('/report/generate', { project_id: projectId });
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

  deleteAdminUser: async (targetId: number, adminUserId: number): Promise<void> => {
    await client.delete(`/admin/users/${targetId}`, { params: { user_id: requireUserId(adminUserId) } });
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
  // Member Groups (DB)
  // =========================
  getMemberGroups: async (userId: number): Promise<MemberGroup[]> => {
    const res = await client.get('/member-groups', {
      params: { user_id: requireUserId(userId) },
    });
    return res.data.groups || [];
  },

  createMemberGroup: async (
    data: { name: string; description?: string; member_user_ids?: number[] },
    userId: number
  ): Promise<MemberGroup> => {
    const res = await client.post('/member-groups', data, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  updateMemberGroup: async (
    groupId: number,
    data: { name?: string; description?: string; member_user_ids?: number[] },
    userId: number
  ): Promise<MemberGroup> => {
    const res = await client.patch(`/member-groups/${groupId}`, data, {
      params: { user_id: requireUserId(userId) },
    });
    return res.data;
  },

  deleteMemberGroup: async (groupId: number, userId: number): Promise<void> => {
    await client.delete(`/member-groups/${groupId}`, {
      params: { user_id: requireUserId(userId) },
    });
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

  // =========================
  // AI Settings
  // =========================
  getAiSettings: async (): Promise<AiSettings> => {
    const res = await client.get('/settings/ai');
    return res.data;
  },
  saveAiSettings: async (data: { api_url: string; model_name: string; api_key?: string }, userId: number): Promise<any> => {
    const res = await client.put('/settings/ai', data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  // =========================
  // List Order (B-1)
  // =========================
  getListOrder: async (projectId: number): Promise<{ order: number[] }> => {
    const res = await client.get(`/projects/${projectId}/list/order`);
    return res.data;
  },
  getAllListOrders: async (projectId: number): Promise<Record<string, number[]>> => {
    const res = await client.get(`/projects/${projectId}/list/all-orders`);
    return res.data;
  },
  saveListOrder: async (projectId: number, order: number[]): Promise<void> => {
    await client.put(`/projects/${projectId}/list/order`, { order });
  },
  getSubProjectOrder: async (projectId: number): Promise<{ order: number[] }> => {
    const res = await client.get(`/projects/${projectId}/subprojects/order`);
    return res.data;
  },
  saveSubProjectOrder: async (projectId: number, order: number[]): Promise<void> => {
    await client.put(`/projects/${projectId}/subprojects/order`, { order });
  },
  getSpTaskOrder: async (subId: number): Promise<{ order: number[] }> => {
    const res = await client.get(`/subprojects/${subId}/tasks/order`);
    return res.data;
  },
  saveSpTaskOrder: async (subId: number, order: number[]): Promise<void> => {
    await client.put(`/subprojects/${subId}/tasks/order`, { order });
  },

  // =========================
  // Knox Employee Search (D-2)
  // =========================
  // =========================
  // User Shortcuts (per-user, DB)
  // =========================
  getUserShortcuts: async (userId: number): Promise<UserShortcut[]> => {
    const res = await client.get('/user-shortcuts', { params: { user_id: requireUserId(userId) } });
    return res.data.shortcuts || [];
  },

  createUserShortcut: async (
    userId: number,
    data: { name: string; url: string; icon_text?: string; icon_color?: string; order?: number; open_new_tab?: boolean }
  ): Promise<UserShortcut> => {
    const res = await client.post('/user-shortcuts', data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  updateUserShortcut: async (
    shortcutId: number,
    userId: number,
    data: Partial<UserShortcut>
  ): Promise<UserShortcut> => {
    const res = await client.patch(`/user-shortcuts/${shortcutId}`, data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },

  deleteUserShortcut: async (shortcutId: number, userId: number): Promise<void> => {
    await client.delete(`/user-shortcuts/${shortcutId}`, { params: { user_id: requireUserId(userId) } });
  },

  searchKnoxEmployees: async (params: { fullName?: string; userIds?: string; query?: string }): Promise<any[]> => {
    const res = await client.get('/employees', { params });
    return res.data.employees || res.data || [];
  },

  getUnassignedUsers: async (userId: number) => {
    const res = await client.get('/admin/org/unassigned-users', { params: { user_id: requireUserId(userId) } });
    return res.data.users || [];
  },

  // =========================
  // Spaces
  // =========================
  getSpaces: async (userId: number): Promise<any[]> => {
    const res = await client.get('/spaces', { params: { user_id: requireUserId(userId) } });
    return res.data.spaces || [];
  },
  createSpace: async (data: { name: string; slug?: string; description?: string; member_user_ids?: number[] }, userId: number): Promise<any> => {
    const res = await client.post('/spaces', data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },
  updateSpace: async (spaceId: number, data: { name?: string; description?: string }, userId: number): Promise<any> => {
    const res = await client.patch(`/spaces/${spaceId}`, data, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },
  addSpaceMember: async (spaceId: number, targetUserId: number, userId: number, role: string = 'member'): Promise<any> => {
    const res = await client.post(`/spaces/${spaceId}/members`, null, { params: { user_id: requireUserId(userId), target_user_id: targetUserId, role } });
    return res.data;
  },
  removeSpaceMember: async (spaceId: number, targetUserId: number, userId: number): Promise<any> => {
    const res = await client.delete(`/spaces/${spaceId}/members/${targetUserId}`, { params: { user_id: requireUserId(userId) } });
    return res.data;
  },
};

export { client, API_URL };
export type { User, Project };
