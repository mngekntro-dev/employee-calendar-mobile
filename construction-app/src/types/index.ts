// ============================================================
// 型定義
// ============================================================

export type UserRole = 'admin' | 'employee' | 'partner';

export type ProjectStatus = 'inquiry' | 'planning' | 'active' | 'completed' | 'paused';

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export type ProjectMemberRole = 'manager' | 'member';

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string | null;
  created_at: string;
}

export interface Property {
  id: string;
  name: string;
  address: string | null;
  building_type: string | null;
  customer_company: string | null;
  customer_contact: string | null;
  customer_phone: string | null;
  customer_type: string | null;
  company_id: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  company_id: string;
  created_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // 拡張フィールド
  address: string | null;
  building_type: string | null;
  parking_info: string | null;
  work_period: string | null;
  weekend_work: string | null;
  smoking_rule: string | null;
  other_notes: string | null;
  customer_type: string | null;
  customer_company: string | null;
  customer_contact: string | null;
  customer_phone: string | null;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  added_by: string | null;
  created_at: string;
  // JOIN 用
  profile?: Profile;
}

export interface Invitation {
  id: string;
  token: string;
  email: string | null;
  role: UserRole;
  company_id: string;
  project_id: string | null;
  status: InvitationStatus;
  expires_at: string;
  invited_by: string;
  created_at: string;
  // JOIN 用
  inviter?: Profile;
  project?: Project;
}

export type TaskStatus = '未着手' | '進行中' | '完了';

export interface TaskAssignee {
  user_id: string;
  profile?: { full_name: string };
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
  requester_id: string | null;
  requester?: { full_name: string };
  assignees?: TaskAssignee[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ナビゲーション用パラメータ型
export type RootStackParamList = {
  Login: undefined;
  InviteAccept: { token: string };
  Main: undefined;
};

export type MainTabParamList = {
  ProjectList: undefined;
  UserManagement: undefined;
};

export type ProjectStackParamList = {
  ProjectListHome: undefined;
  ProjectDetail: { projectId: string };
  ProjectForm: { projectId?: string };
  TeamMember: { projectId: string };
};

// ラベル用ユーティリティ
export const ROLE_LABEL: Record<UserRole, string> = {
  admin: '会社管理者',
  employee: '社員',
  partner: '協力会社',
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  inquiry: '引き合い',
  planning: '計画中',
  active: '施工中',
  completed: '完了',
  paused: '一時停止',
};

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  inquiry: '#7c3aed',
  planning: '#6b7280',
  active: '#1a56db',
  completed: '#057a55',
  paused: '#e3a008',
};
