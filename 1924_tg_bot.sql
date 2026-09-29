-- 1924: Telegram admin-bot (Edge Function tg-bot) — havolalar menyusi va yangi lid xabarlari.
-- Bot tokeni bu yerda YOʻQ: u faqat Supabase → Edge Functions → Secrets → TELEGRAM_BOT_TOKEN da.

create extension if not exists pg_net with schema extensions;

-- Botga yozgan chatlar; xabarlar faqat tasdiqlangan = true boʻlganlarga boradi.
-- Siyosat yoʻq: faqat tg-bot funksiyasi (service_role) oʻqiydi va yozadi.
create table if not exists public.tg_chatlar (
  chat_id bigint primary key,
  ism text check (char_length(ism) <= 120),
  username text check (char_length(username) <= 64),
  tasdiqlangan boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.tg_chatlar enable row level security;

-- Rollar: owner — hamma havola, adminlarni tasdiqlaydi/oladi; admin — faqat CRM va lid xabarlari.
-- bloklangan — owner rad etgan odam (bot unga jim).
alter table public.tg_chatlar
  add column if not exists rol text not null default 'admin' check (rol in ('owner', 'admin')),
  add column if not exists bloklangan boolean not null default false;

-- Birinchi owner qoʻlda tayinlanadi: botga Start bosing, keyin bu yerda
--   update public.tg_chatlar set rol = 'owner', tasdiqlangan = true where chat_id = <Telegram ID>;
-- (ID: select chat_id, ism from public.tg_chatlar;)

-- Ichki kalitlar: Telegram webhook tekshiruvi va baza → funksiya chaqiruvi uchun
insert into public.crm_maxfiy (kalit, qiymat) values
  ('tg_webhook', encode(extensions.gen_random_bytes(32), 'hex')),
  ('tg_ichki', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (kalit) do nothing;

-- Tashqaridan kelgan yangi bitim (Meta forma, ustoz.html va h.k.) → tg-bot → Telegram.
-- Admin CRM'da oʻzi qoʻshgan yoki import qilgan bitimlar (authenticated) uchun xabar yoʻq.
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
  if coalesce(auth.role(), '') = 'authenticated' then return null; end if;
  select count(*) into v_n from new_rows;
  if v_n = 0 then return null; end if;
  select jsonb_agg(id) into v_ids from (select id from new_rows order by id limit 20) s;
  select qiymat into v_sec from crm_maxfiy where kalit = 'tg_ichki';
  if v_sec is null then return null; end if;
  perform net.http_post(
    url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/tg-bot',
    body := jsonb_build_object('turi', 'yangi_lid', 'ids', v_ids, 'soni', v_n),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', v_sec),
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  return null; -- xabar ketmasa ham lid saqlanishi shart
end $$;

-- Trigger funksiyasini API (rpc) orqali chaqirib boʻlmasin; trigger oʻzi ishlashda davom etadi
revoke execute on function public.crm_tg_yangi_lid() from public, anon, authenticated;

-- Yangi nomzod (ishga.html testini topshirdi) → tg-bot → faqat owner'ga xabar.
create or replace function public.crm_tg_yangi_nomzod()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sec text;
begin
  if coalesce(auth.role(), '') = 'authenticated' then return null; end if;
  select qiymat into v_sec from crm_maxfiy where kalit = 'tg_ichki';
  if v_sec is null then return null; end if;
  perform net.http_post(
    url := 'https://uzivivmrixstxjvzkksz.supabase.co/functions/v1/tg-bot',
    body := jsonb_build_object('turi', 'yangi_nomzod', 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-crm-secret', v_sec),
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  return null; -- xabar ketmasa ham nomzod saqlanishi shart
end $$;

revoke execute on function public.crm_tg_yangi_nomzod() from public, anon, authenticated;

drop trigger if exists nomzodlar_tg on public.nomzodlar;
create trigger nomzodlar_tg
  after insert on public.nomzodlar
  for each row execute function public.crm_tg_yangi_nomzod();

drop trigger if exists crm_bitimlar_tg on public.crm_bitimlar;
create trigger crm_bitimlar_tg
  after insert on public.crm_bitimlar
  referencing new table as new_rows
  for each statement execute function public.crm_tg_yangi_lid();
