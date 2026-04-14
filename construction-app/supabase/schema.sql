-- ============================================================
-- 建設現場管理アプリ Supabase スキーマ
-- ============================================================

-- 拡張機能
create extension if not exists "uuid-ossp";

-- ============================================================
-- テーブル定義
-- ============================================================

-- 会社テーブル
create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- プロフィールテーブル（auth.users と 1:1）
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null check (role in ('admin', 'employee', 'partner')) default 'partner',
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 案件テーブル
create table public.projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text not null default '',
  status text not null check (status in ('planning', 'active', 'completed', 'paused')) default 'planning',
  start_date date,
  end_date date,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 案件メンバーテーブル
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('manager', 'member')) default 'member',
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- 招待テーブル
create table public.invitations (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  email text,
  role text not null check (role in ('admin', 'employee', 'partner')) default 'partner',
  company_id uuid not null references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'expired')) default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================
-- updated_at トリガー
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 新規ユーザー登録時に profiles を自動作成するトリガー
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  inv record;
  company_id uuid;
  user_role text;
begin
  -- 招待トークンがメタデータにあるか確認
  if new.raw_user_meta_data->>'invitation_token' is not null then
    select * into inv
    from public.invitations
    where token = new.raw_user_meta_data->>'invitation_token'
      and status = 'pending'
      and expires_at > now();

    if found then
      company_id := inv.company_id;
      user_role := inv.role;

      -- profiles 作成
      insert into public.profiles (id, email, full_name, role, company_id)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        user_role,
        company_id
      );

      -- 案件招待の場合、project_members に追加
      if inv.project_id is not null then
        insert into public.project_members (project_id, user_id, added_by)
        values (inv.project_id, new.id, inv.invited_by)
        on conflict do nothing;
      end if;

      -- 招待ステータスを更新
      update public.invitations set status = 'accepted' where id = inv.id;

      return new;
    end if;
  end if;

  -- 招待なしの場合（初期管理者など）
  insert into public.profiles (id, email, full_name, role, company_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'partner'),
    (new.raw_user_meta_data->>'company_id')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security 有効化
-- ============================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invitations enable row level security;

-- ============================================================
-- ヘルパー関数（RLS で使用）
-- ============================================================

-- 自分のロールを返す
create or replace function public.my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 自分の company_id を返す
create or replace function public.my_company_id()
returns uuid language sql security definer stable as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- 案件のメンバーか確認
create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS ポリシー: companies
-- ============================================================

create policy "自社の情報のみ参照可"
  on public.companies for select
  using (id = public.my_company_id());

-- ============================================================
-- RLS ポリシー: profiles
-- ============================================================

create policy "同じ会社のメンバーを参照可"
  on public.profiles for select
  using (company_id = public.my_company_id());

create policy "自分のプロフィールを更新可"
  on public.profiles for update
  using (id = auth.uid());

create policy "管理者は同社メンバーを削除可"
  on public.profiles for delete
  using (
    public.my_role() = 'admin'
    and company_id = public.my_company_id()
    and id <> auth.uid()
  );

-- ============================================================
-- RLS ポリシー: projects
-- ============================================================

create policy "参照: admin=全件 / employee+partner=参加案件のみ"
  on public.projects for select
  using (
    company_id = public.my_company_id()
    and (
      public.my_role() = 'admin'
      or public.is_project_member(id)
    )
  );

create policy "作成: admin・employee のみ"
  on public.projects for insert
  with check (
    company_id = public.my_company_id()
    and public.my_role() in ('admin', 'employee')
  );

create policy "更新: admin=全件 / employee=参加案件のみ"
  on public.projects for update
  using (
    company_id = public.my_company_id()
    and (
      public.my_role() = 'admin'
      or (public.my_role() = 'employee' and public.is_project_member(id))
    )
  );

create policy "削除: admin のみ"
  on public.projects for delete
  using (
    company_id = public.my_company_id()
    and public.my_role() = 'admin'
  );

-- ============================================================
-- RLS ポリシー: project_members
-- ============================================================

create policy "参照: admin=全件 / その他=参加案件のみ"
  on public.project_members for select
  using (
    public.my_role() = 'admin'
    or public.is_project_member(project_id)
  );

create policy "追加: admin・employee のみ"
  on public.project_members for insert
  with check (
    public.my_role() in ('admin', 'employee')
    and public.is_project_member(project_id)
  );

create policy "削除: admin=全件 / employee=参加案件のみ"
  on public.project_members for delete
  using (
    public.my_role() = 'admin'
    or (public.my_role() = 'employee' and public.is_project_member(project_id))
  );

-- ============================================================
-- RLS ポリシー: invitations
-- ============================================================

create policy "参照: admin・employee のみ（自社）"
  on public.invitations for select
  using (
    company_id = public.my_company_id()
    and public.my_role() in ('admin', 'employee')
  );

create policy "作成: admin・employee のみ（自社）"
  on public.invitations for insert
  with check (
    company_id = public.my_company_id()
    and public.my_role() in ('admin', 'employee')
  );

create policy "更新: 本人（招待した人）のみ"
  on public.invitations for update
  using (
    company_id = public.my_company_id()
    and public.my_role() in ('admin', 'employee')
  );

-- トークン単体で招待情報を参照できるようにする（未認証ユーザー用）
-- ※ anon ロールに SELECT を許可（token で絞る）
create policy "招待トークンで参照可（未認証）"
  on public.invitations for select
  to anon
  using (status = 'pending' and expires_at > now());

-- ============================================================
-- 初期データ例（コメントアウト：必要時に有効化）
-- ============================================================

-- insert into public.companies (name) values ('サンプル建設株式会社');
-- insert into public.profiles (id, email, full_name, role, company_id)
-- values ('your-auth-user-uuid', 'admin@example.com', '管理者 太郎', 'admin', 'your-company-uuid');
