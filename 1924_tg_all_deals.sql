-- Apply once in the CRM Supabase project's SQL Editor.
-- Extends the existing bot notification to deals created by signed-in CRM admins
-- and Autopilot imports. The bot token stays in Edge Function Secrets.

create or replace function public.crm_tg_yangi_lid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
  v_ids jsonb;
  v_sec text;
begin
  select count(*) into v_n from new_rows;
  if v_n = 0 then return null; end if;
  select jsonb_agg(id) into v_ids from (select id from new_rows order by id limit 20) s;
  select qiymat into v_sec from public.crm_maxfiy where kalit = 'tg_ichki';
  if v_sec is null then return null; end if;
  perform net.http_post(
    url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/tg-bot',
    body := jsonb_build_object('turi', 'yangi_lid', 'ids', v_ids, 'soni', v_n),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', v_sec),
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  return null; -- notification failure must not prevent saving a deal
end $$;

revoke execute on function public.crm_tg_yangi_lid() from public, anon, authenticated;
