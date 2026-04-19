export interface User {
  id: number;
  loginid: string;
  username: string;
  role?: string;
  avatar_color?: string;
  is_active?: boolean;
  group_name?: string;
  deptname?: string;
  mail?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  owner_id?: number;
  visibility?: string;
  created_at?: string;
  require_approval?: boolean;
  space_id?: number;
  permissions?: {
    post_write?: string;
    post_edit?: string;
    post_view?: string;
    comment_write?: string;
    file_view?: string;
    file_download?: string;
  };
}

export type SpacePurpose =
  | 'project_management'
  | 'equipment_ops'
  | 'process_change'
  | 'sw_dev'
  | 'integrated_ops'
  | 'custom';

export interface Space {
  id: number;
  name: string;
  slug: string;
  description?: string;
  created_by?: number;
  is_active: boolean;
  created_at?: string;
  purpose?: SpacePurpose;
  member_count: number;
  members: SpaceMemberInfo[];
}

export interface SpaceMemberInfo {
  user_id: number;
  role: string;
  username: string;
  loginid: string;
  avatar_color?: string;
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
  remarks?: string;
  attachment_count?: number;
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
  mentioned_user_ids?: number[];
}

export interface MentionNote extends Note {
  project_name?: string;
}

export interface Attachment {
  id: number;
  task_id: number;
  url: string;
  filename?: string;
  type?: string;
  stored_name?: string;
  size?: number;
  created_at?: string;
}

export interface TaskActivity {
  id: number;
  task_id: number;
  block_type: 'checkbox' | 'text';
  order_index: number;
  content: string;
  checked: boolean;
  checked_at?: string | null;
  style?: { bold?: boolean; color?: string };
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
  loginid?: string;
  deptname?: string;
  mail?: string;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  status?: string;
  attachment_type?: string;
  url?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface SearchResultProject {
  project: Project;
  tasks: Task[];
  sub_projects: SubProject[];
  notes: Note[];
  files: ProjectFile[];
  progress: number;
  status_counts: { total: number; done: number; in_progress: number; todo: number; hold: number };
  overdue_tasks: Task[];
  upcoming_tasks: Task[];
}

export interface AiProjectSummary {
  project_id: number;
  project_name: string;
  one_liner: string;
  status_text: string;
  key_schedule: string;
  sub_project_summary: string;
  related_materials: string;
  risks: string;
  next_actions: string;
}

export interface SearchSummaryResult {
  id: number;
  query: string;
  overall_summary: string;
  project_summaries: AiProjectSummary[];
  model: string;
  created_at: string;
}

export interface ProjectAiQueryResponse {
  id: number;
  project_id: number;
  user_id: number;
  query: string;
  parsed_response: {
    one_liner: string;
    details: string;
    key_schedule: string;
    next_actions: string;
  };
  raw_response: string;
  model: string;
  created_at: string;
  context?: {
    project_name: string;
    members: string[];
    tasks: {
      id: number;
      title: string;
      status: string;
      priority: string;
      progress: number;
      due_date: string | null;
      assignees: string[];
      sub_project: string;
      description: string;
    }[];
    status_breakdown: {
      total: number;
      done: number;
      in_progress: number;
      todo: number;
      hold: number;
      overall_progress: number;
    };
    filter?: {
      mode: string;
      window_start?: string | null;
      window_end?: string | null;
    };
  };
}

// ========================================
// v3.0 Sheet 운영 타입
// ========================================

export interface ColumnRoleInfo {
  col: number;       // 0-based column index
  header: string;    // detected header text
  confidence: number; // 0~1
}

export interface ColumnRoleMapping {
  check_status?: ColumnRoleInfo;
  checked_at?: ColumnRoleInfo;
  assignee?: ColumnRoleInfo;
  due_date?: ColumnRoleInfo;
  remark?: ColumnRoleInfo;
}

export interface SheetTemplate {
  id: number;
  name: string;
  description?: string;
  category?: string;
  original_filename?: string;
  sheet_name?: string;
  structure?: SheetStructure;
  row_count: number;
  col_count: number;
  checkable_count: number;
  column_role_mapping?: ColumnRoleMapping | null;
  structure_hash?: string;
  created_by?: number;
  created_at?: string;
}

export interface SheetStructure {
  cells: SheetCell[];
  merges: SheetMerge[];
  col_widths?: number[];
  row_heights?: number[];
  total_rows: number;
  total_cols: number;
  checkable_cells: SheetCheckableCell[];
  headers?: { col: number; value: string }[];
  column_roles?: ColumnRoleMapping;
  header_row_idx?: number;
  data_start_row?: number;
  structure_hash?: string;
}

export interface SheetCell {
  row: number;
  col: number;
  value: string;
  type?: string;
  bg?: string;
  font?: { bold?: boolean; italic?: boolean; fontSize?: number; fontColor?: string };
  borders?: Record<string, string>;
  align?: string;
  wrapText?: boolean;
  rowSpan?: number;
  colSpan?: number;
}

export interface SheetMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface SheetCheckableCell {
  ref: string;
  row: number;
  col: number;
  label: string;
  initial_value?: string;
}

export interface SheetExecution {
  id: number;
  template_id: number;
  project_id?: number;
  task_id?: number;
  title: string;
  equipment_name?: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  total_items: number;
  checked_items: number;
  progress: number;
  started_by?: number;
  started_at?: string;
  completed_at?: string;
  completed_by?: number;
  template_structure?: SheetStructure;
  template_name?: string;
  items?: SheetExecutionItem[];
}

export interface SheetExecutionItem {
  id: number;
  cell_ref: string;
  row_idx: number;
  col_idx: number;
  label: string;
  checked: boolean;
  value?: string;
  memo?: string;
  checked_by?: number;
  checked_at?: string;
}

export interface SheetExecutionLog {
  id: number;
  action: string;
  item_id?: number;
  old_value?: string;
  new_value?: string;
  memo?: string;
  user_id?: number;
  created_at?: string;
}
