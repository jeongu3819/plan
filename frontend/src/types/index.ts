export interface User {
    id: number;
    loginid: string;
    username: string;
    role?: string;
    avatar_color?: string;
    is_active?: boolean;
}

export interface Project {
    id: number;
    name: string;
    description?: string;
    owner_id?: number;
    visibility?: string;
    created_at?: string;
    require_approval?: boolean;
    permissions?: {
        post_write?: string;
        post_edit?: string;
        post_view?: string;
        comment_write?: string;
        file_view?: string;
        file_download?: string;
    };
}

export interface ProjectFile {
    id: number;
    project_id: number;
    filename: string;
    stored_name: string;
    size: number;
    uploader_id: number;
    created_at: string;
}

export interface SubProject {
    id: number;
    project_id: number;
    parent_id?: number | null;
    name: string;
    description?: string;
    created_at?: string;
}

export interface Task {
    id: number;
    project_id: number;
    title: string;
    description?: string;
    status: 'todo' | 'in_progress' | 'done' | 'hold';
    priority?: 'low' | 'medium' | 'high';
    start_date?: string | null;
    due_date?: string | null;
    assignee_ids: number[];
    tags?: string[];
    sub_project_id?: number | null;
    progress?: number;
    archived_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface Note {
    id: number;
    project_id: number;
    author_id: number;
    content: string;
    created_at: string;
    updated_at?: string;
    author_name?: string;
    author_color?: string;
}

export interface Attachment {
    id: number;
    task_id: number;
    url: string;
    filename?: string;
    type?: string;
    created_at?: string;
}

export interface RoadmapItem {
    id: string;
    type: 'project' | 'subproject' | 'task';
    name: string;
    start_date?: string | null;
    due_date?: string | null;
    status: string;
    progress: number;
    overdue: boolean;
    children?: RoadmapItem[];
    assignee_ids?: number[];
}

export interface ActivityLog {
    id: number;
    task_id: number;
    user_id: number;
    action: string;
    details: string;
    created_at: string;
}

export interface ProjectMember {
    project_id: number;
    user_id: number;
    role: string;
    username?: string;
    avatar_color?: string;
}

export interface GraphNode {
    id: string;
    type: string;
    label: string;
    status?: string;
}

export interface GraphEdge {
    source: string;
    target: string;
}
