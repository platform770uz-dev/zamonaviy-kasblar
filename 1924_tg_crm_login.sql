-- Run in the CRM Supabase project before deploying crm-telegram-login and tg-bot.
-- Telegram approval grants CRM access only. The HR/admin email allowlist stays separate.
begin;

alter table public.tg_chatlar
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists tg_chatlar_auth_user_idx on public.tg_chatlar(auth_user_id);
alter table public.tg_chatlar enable row level security;
revoke all on public.tg_chatlar from anon, authenticated;
grant select, insert, update, delete on public.tg_chatlar to service_role;

create schema if not exists crm_private;
revoke all on schema crm_private from public;
grant usage on schema crm_private to authenticated;

-- Private privileged lookup; the caller's uid, never client metadata, selects the row.
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
    )
  );
$$;
revoke all on function crm_private.has_crm_access() from public, anon;
grant execute on function crm_private.has_crm_access() to authenticated;

create or replace function public.is_crm_admin()
returns boolean
language sql stable security invoker
set search_path = ''
as $$ select crm_private.has_crm_access(); $$;
revoke all on function public.is_crm_admin() from public, anon;
grant execute on function public.is_crm_admin() to authenticated;

-- Add only the operations used by CRM. Existing email-admin policies remain.
do $$
declare
  item record;
  operation text;
  predicate text;
  sequence_name text;
begin
  for item in select * from (values
    ('crm_voronkalar', array['select','insert','update','delete']),
    ('crm_bosqichlar', array['select','insert','update','delete']),
    ('crm_bitimlar', array['select','insert','update','delete']),
    ('crm_kontaktlar', array['select','insert','update','delete']),
    ('crm_vazifalar', array['select','insert','update']),
    ('crm_tarix', array['select','insert']),
    ('crm_sozlama', array['select','insert','update']),
    ('crm_savat', array['select','insert','delete']),
    ('crm_qongiroqlar', array['select','insert']),
    ('crm_skript_holat', array['select','insert','update'])
  ) as permissions(table_name, operations)
  loop
    execute format('alter table public.%I enable row level security', item.table_name);
    foreach operation in array item.operations loop
      predicate := case operation
        when 'insert' then 'with check ((select public.is_crm_admin()))'
        when 'update' then 'using ((select public.is_crm_admin())) with check ((select public.is_crm_admin()))'
        else 'using ((select public.is_crm_admin()))' end;
      execute format('drop policy if exists %I on public.%I', 'crm_tg_' || operation, item.table_name);
      execute format('create policy %I on public.%I for %s to authenticated %s', 'crm_tg_' || operation, item.table_name, operation, predicate);
      execute format('grant %s on public.%I to authenticated', operation, item.table_name);
    end loop;
    -- Some CRM tables use a natural key instead of an id sequence.
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = item.table_name and column_name = 'id') then
      sequence_name := pg_get_serial_sequence('public.' || item.table_name, 'id');
      if sequence_name is not null then execute format('grant usage on sequence %s to authenticated', sequence_name); end if;
    end if;
  end loop;
end $$;

-- Preserve the deployed call-result logic and replace only its permission guard.
do $$
declare
  function_id regprocedure := to_regprocedure('public.crm_qongiroq_yoz(bigint,text,text,timestamptz)');
  definition text;
begin
  if function_id is null then raise exception 'Apply 1924_savat.sql first'; end if;
  definition := pg_get_functiondef(function_id);
  if position('public.is_crm_admin()' in definition) > 0 then return; end if;
  if position('public.is_admin()' in definition) = 0 then
    raise exception 'crm_qongiroq_yoz permission guard changed; review before applying';
  end if;
  execute replace(definition, 'public.is_admin()', 'public.is_crm_admin()');
end $$;

commit;
