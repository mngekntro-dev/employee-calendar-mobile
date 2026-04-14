import { supabase } from './supabase';

const CALENDAR_API = 'https://employee-calendar-backend-production.up.railway.app';
const INTERNAL_SECRET = process.env.EXPO_PUBLIC_INTERNAL_API_SECRET ?? '';

function calendarHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(INTERNAL_SECRET ? { 'x-internal-secret': INTERNAL_SECRET } : {}),
  };
}

export type WorkType = '負荷試験' | '点検' | '修理' | 'その他';
export type CaseStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface Generator {
  id: string;
  name: string;
  model?: string | null;
  rated_output_kw?: number | null;
  rated_voltage_v?: number | null;
  rated_current_a?: number | null;
  manufacturer?: string | null;
  serial_number?: string | null;
  installed_at?: string | null;
  battery_model?: string | null;
  battery_count?: number | null;
  location?: string | null;
  client_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratorCase {
  id: string;
  name: string;
  address?: string | null;
  client_name?: string | null;
  work_type: WorkType;
  work_date?: string | null;
  staff_name?: string | null;
  contractor?: string | null;
  generator_id?: string | null;
  gen_model?: string | null;
  gen_rated_output_kw?: number | null;
  gen_rated_voltage_v?: number | null;
  gen_rated_current_a?: number | null;
  gen_manufacturer?: string | null;
  gen_serial_number?: string | null;
  gen_installed_at?: string | null;
  gen_battery_model?: string | null;
  gen_battery_count?: number | null;
  overall_result?: string | null;
  result_comment?: string | null;
  failure_date?: string | null;
  failure_location?: string | null;
  failure_urgency?: string | null;
  failure_symptom?: string | null;
  failure_cause?: string | null;
  repair_work?: string | null;
  repair_parts?: string | null;
  repair_result?: string | null;
  process_data?: any;
  status: CaseStatus;
  next_scheduled_date?: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchCases(): Promise<GeneratorCase[]> {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCase(id: string): Promise<GeneratorCase | null> {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createCase(payload: Partial<GeneratorCase>): Promise<GeneratorCase> {
  const { data, error } = await supabase
    .from('cases')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  await syncToCalendar(data);
  return data;
}

const CALENDAR_SYNC_FIELDS: (keyof GeneratorCase)[] = ['work_date', 'staff_name', 'name'];

export async function updateCase(id: string, payload: Partial<GeneratorCase>): Promise<GeneratorCase> {
  const { data, error } = await supabase
    .from('cases')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const needsSync = CALENDAR_SYNC_FIELDS.some(f => f in payload);
  if (needsSync) await syncToCalendar(data);
  return data;
}

export async function deleteCase(id: string): Promise<void> {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) throw error;
  try {
    await fetch(`${CALENDAR_API}/api/schedule-events/${id}`, {
      method: 'DELETE',
      headers: calendarHeaders(),
    });
  } catch { /* カレンダー連動は任意 */ }
}

export async function fetchGenerators(): Promise<Generator[]> {
  const { data, error } = await supabase
    .from('generators')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function syncToCalendar(c: GeneratorCase): Promise<void> {
  if (!c.work_date) {
    try {
      await fetch(`${CALENDAR_API}/api/schedule-events/${c.id}`, {
        method: 'DELETE',
        headers: calendarHeaders(),
      });
    } catch { /* サイレント */ }
    return;
  }
  try {
    await fetch(`${CALENDAR_API}/api/schedule-events`, {
      method: 'POST',
      headers: calendarHeaders(),
      body: JSON.stringify({
        case_id: c.id,
        title: `⚡ ${c.work_type}：${c.name}`,
        work_date: c.work_date,
        staff_name: c.staff_name ?? null,
        source: 'generator',
      }),
    });
  } catch { /* 連動失敗はサイレント */ }
}
