import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CALENDAR_API_URL = Deno.env.get('CALENDAR_API_URL') ?? '';
const CALENDAR_ADMIN_EMAIL = Deno.env.get('CALENDAR_ADMIN_EMAIL') ?? '';
const CALENDAR_ADMIN_PASSWORD = Deno.env.get('CALENDAR_ADMIN_PASSWORD') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SyncMemberPayload {
  email: string;
  full_name: string;
  role: string;
  department: string | null;
}

interface CalendarEmployee {
  id: number;
  name: string;
  email: string;
  role: string;
  department_id: number | null;
  color: string | null;
  department_name: string | null;
}

interface CalendarDepartment {
  id: number;
  name: string;
}

async function getCalendarToken(): Promise<string> {
  const res = await fetch(`${CALENDAR_API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CALENDAR_ADMIN_EMAIL, password: CALENDAR_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Calendar login failed: ${res.status}`);
  const json = await res.json();
  const token: string = json.token ?? json.access_token ?? json.accessToken;
  if (!token) throw new Error('Calendar login: token not found in response');
  return token;
}

async function getDepartmentMap(token: string): Promise<Map<string, number>> {
  const res = await fetch(`${CALENDAR_API_URL}/departments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /departments failed: ${res.status}`);
  const departments: CalendarDepartment[] = await res.json();
  const map = new Map<string, number>();
  for (const d of departments) map.set(d.name, d.id);
  return map;
}

async function getEmployeeMap(token: string): Promise<Map<string, CalendarEmployee>> {
  const res = await fetch(`${CALENDAR_API_URL}/employees`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /employees failed: ${res.status}`);
  const employees: CalendarEmployee[] = await res.json();
  const map = new Map<string, CalendarEmployee>();
  for (const e of employees) map.set(e.email, e);
  return map;
}

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!CALENDAR_API_URL || !CALENDAR_ADMIN_EMAIL || !CALENDAR_ADMIN_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Calendar API secrets not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profile: SyncMemberPayload = await req.json();

    const token = await getCalendarToken();
    const [deptMap, employeeMap] = await Promise.all([
      getDepartmentMap(token),
      getEmployeeMap(token),
    ]);

    const departmentId = profile.department ? (deptMap.get(profile.department) ?? null) : null;
    const existing = employeeMap.get(profile.email);

    if (existing) {
      const res = await fetch(`${CALENDAR_API_URL}/employees/${existing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profile.full_name,
          email: profile.email,
          department_id: departmentId,
          role: profile.role,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`PUT /employees/${existing.id} failed: ${res.status} ${body}`);
      }
      return new Response(
        JSON.stringify({ success: true, action: 'updated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const res = await fetch(`${CALENDAR_API_URL}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profile.full_name,
          email: profile.email,
          password: generateRandomPassword(),
          department_id: departmentId,
          role: profile.role,
          color: null,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`POST /employees failed: ${res.status} ${body}`);
      }
      return new Response(
        JSON.stringify({ success: true, action: 'created' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
