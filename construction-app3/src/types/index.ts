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

export type Department = '電気工事事業部' | '発電機事業部' | '経理部';

export const DEPARTMENTS: Department[] = ['電気工事事業部', '発電機事業部', '経理部'];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  company_id: string | null;
  department: Department | null;
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

// ============================================================
// 負荷試験関連型定義
// ============================================================

/** 負荷率ステージ (0/10/20/30/50/75/100%) */
export type LoadStage = 0 | 10 | 20 | 30 | 50 | 75 | 100;

/** 負荷試験測定値（1段階分） */
export interface LoadTestMeasurement {
  stage: LoadStage;
  /** 運転時間 (min) */
  run_time: string;
  /** 出力 (kW) */
  output: string;
  /** 電圧 (V) */
  voltage: string;
  /** 電流 (A) */
  current: string;
  /** 周波数 (Hz) */
  frequency: string;
  /** 回転数 (rpm) */
  rpm: string;
  /** 備考 */
  notes: string;
  /** 電流計算値 (自動計算: (定格出力×負荷率/100×1000)÷346) */
  current_calc?: number | null;
}

/** 定格負荷試験 30%負荷 × 6測定タイミング */
export interface RatedLoadRecord {
  /** 測定タイミング (min): 0, 10, 20, 30, 45, 60 */
  minute: number;
  voltage: string;
  current: string;
  battery_voltage: string;
  frequency: string;
  water_temp: string;
  oil_temp: string;
  oil_pressure: string;
  rpm: string;
}

/** 総合判定 */
export type OverallJudgment = 'normal' | 'caution' | 'repair_needed';

/** 負荷試験レコード（Supabase load_test_records テーブル対応） */
export interface LoadTestRecord {
  id: string;
  case_id: string;
  // 基本情報（案件から引き継ぎ）
  name: string;
  address: string | null;
  work_date: string | null;
  staff_name: string | null;
  contractor: string | null;
  license_number: string | null;
  // 発電機情報（案件から引き継ぎ）
  gen_model: string | null;
  gen_rated_output_kw: number | null;
  output_unit?: 'kva' | 'kw' | null;
  gen_rated_voltage_v: number | null;
  gen_rated_current_a: number | null;
  gen_manufacturer: string | null;
  gen_serial_number: string | null;
  gen_battery_model: string | null;
  gen_battery_count: number | null;
  // 測定値（JSON配列）
  measurements: LoadTestMeasurement[];
  // 定格負荷試験（JSON配列）
  rated_load_records: RatedLoadRecord[];
  // 総合判定
  overall_judgment: OverallJudgment | null;
  result_comment: string | null;
  created_at: string;
  updated_at: string;
}

// ナビゲーション：GeneratorStack のパラメータ
export type GeneratorStackParamList = {
  GeneratorList: undefined;
  GeneratorForm: { caseId?: string };
  GeneratorDetail: { caseId: string };
  GeneratorProcess: { caseId: string };
  // F-1: 負荷試験入力フォーム（別タスクで実装中）
  LoadTestForm: { caseId: string; recordId?: string };
  // --- F-2〜F-4: 追加 (inspection / repair / renewal) ---
  // F-2: 点検入力フォーム
  InspectionForm: { caseId: string; recordId?: string };
  // F-3: 修理報告書入力フォーム
  RepairReportForm: { caseId: string; recordId?: string };
  // F-4: 更新・新設工事入力フォーム
  RenewalInstallForm: { caseId: string; recordId?: string };
};

// ============================================================
// F-2: 点検記録型定義
// ============================================================
export type InspectionCheckResult = '良好' | '要注意' | '不良' | '';
export type InspectionOverallResult = '異常なし' | '要注意' | '要修繕' | '';

export interface InspectionRecord {
  id: string;
  case_id: string;
  subject: string | null;
  address: string | null;
  work_date: string | null;
  staff_name: string | null;
  contractor: string | null;
  gen_model: string | null;
  gen_rated_output_kw: number | null;
  output_unit?: 'kva' | 'kw' | null;
  gen_manufacturer: string | null;
  gen_serial_number: string | null;
  check_appearance: InspectionCheckResult | null;
  check_fuel_level: InspectionCheckResult | null;
  check_battery_voltage: InspectionCheckResult | null;
  check_coolant: InspectionCheckResult | null;
  check_oil_pressure: InspectionCheckResult | null;
  check_trial_run: InspectionCheckResult | null;
  overall_result: InspectionOverallResult | null;
  photo_urls: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// F-3: 修理報告書型定義
// ============================================================
export type FailureLocation = 'エンジン' | '制御盤' | '蓄電池' | '燃料系統' | '冷却系統' | 'その他' | '';
export type RepairUrgency = '通常' | '急ぎ' | '緊急';
export type RepairResultType = '修理完了' | '応急処置' | '部品待ち' | '要追加修理' | '';

export interface RepairReport {
  id: string;
  case_id: string;
  subject: string | null;
  address: string | null;
  staff_name: string | null;
  contractor: string | null;
  gen_model: string | null;
  gen_rated_output_kw: number | null;
  output_unit?: 'kva' | 'kw' | null;
  gen_manufacturer: string | null;
  gen_serial_number: string | null;
  failure_date: string | null;
  repair_date: string | null;
  failure_location: FailureLocation | null;
  urgency: RepairUrgency;
  failure_symptom: string | null;
  failure_cause: string | null;
  repair_work: string;
  repair_parts: string | null;
  repair_result: RepairResultType | null;
  next_inspection_date: string | null;
  notes: string | null;
  photo_before_url: string | null;
  photo_during_url: string | null;
  photo_after_url: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// F-4: 更新・新設工事記録型定義
// ============================================================
export type WorkCategory = '更新工事' | '新設設置';

export interface RenewalInstallRecord {
  id: string;
  case_id: string;
  subject: string | null;
  address: string | null;
  work_date: string | null;
  staff_name: string | null;
  contractor: string | null;
  work_category: WorkCategory;
  existing_gen_model: string | null;
  existing_gen_serial: string | null;
  existing_removal_date: string | null;
  new_gen_model: string | null;
  new_gen_rated_output_kw: number | null;
  new_output_unit?: 'kva' | 'kw' | null;
  new_gen_manufacturer: string | null;
  new_gen_install_date: string | null;
  construction_detail: string | null;
  fire_dept_notified: boolean;
  photo_urls: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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
