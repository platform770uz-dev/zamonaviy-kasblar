-- Shared laptop PIN login. The PIN itself is stored only as a Supabase Edge Function secret.
begin;

create table if not exists public.crm_web_login (
  id text primary key check (id = 'shared'),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_web_login enable row level security;
revoke all on public.crm_web_login from public, anon, authenticated;
grant select, insert, update, delete on public.crm_web_login to service_role;

create table if not exists public.crm_web_pin_attempts (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  failures integer not null default 0 check (failures >= 0),
  updated_at timestamptz not null default now()
);
alter table public.crm_web_pin_attempts enable row level security;
revoke all on public.crm_web_pin_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.crm_web_pin_attempts to service_role;

create or replace function public.crm_web_pin_attempt(p_ip_hash text, p_failed boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_failures integer;
  v_window timestamptz;
begin
  if p_ip_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from public.crm_web_pin_attempts where updated_at < v_now - interval '2 days';
  if not p_failed then
    select failures, window_started_at into v_failures, v_window
    from public.crm_web_pin_attempts where ip_hash = p_ip_hash;
    if not found then return true; end if;
    return v_window <= v_now - interval '15 minutes' or v_failures < 5;
  end if;
  insert into public.crm_web_pin_attempts(ip_hash, window_started_at, failures, updated_at)
  values (p_ip_hash, v_now, 1, v_now)
  on conflict (ip_hash) do update set
    window_started_at = case when public.crm_web_pin_attempts.window_started_at <= v_now - interval '15 minutes' then v_now else public.crm_web_pin_attempts.window_started_at end,
    failures = case when public.crm_web_pin_attempts.window_started_at <= v_now - interval '15 minutes' then 1 else public.crm_web_pin_attempts.failures + 1 end,
    updated_at = v_now
  returning failures into v_failures;
  return v_failures <= 5;
end;
$$;
revoke all on function public.crm_web_pin_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.crm_web_pin_attempt(text, boolean) to service_role;

create or replace function crm_private.has_crm_access()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_admin() or exists (
      select 1 from public.tg_chatlar t
      where t.auth_user_id = auth.uid()
        and t.tasdiqlangan and not t.bloklangan
    ) or exists (
      select 1 from public.crm_web_login w
      where w.auth_user_id = auth.uid() and w.enabled
    )
  );
$$;
revoke all on function crm_private.has_crm_access() from public, anon;
grant execute on function crm_private.has_crm_access() to authenticated;

commit;

