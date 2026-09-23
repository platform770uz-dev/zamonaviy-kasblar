-- =====================================================================
-- 1924 — nomzodlar (ishga arizalar) + adminlar
-- Supabase → SQL Editor → New query → shu faylni toʻliq qoʻyib → Run.
-- Qayta ishga tushirsa ham xavfsiz (idempotent).
--
-- ENG PASTDAGI QATORDA email manzilingizni oʻzingiznikiga almashtiring!
-- =====================================================================

-- 1) Nomzodlar jadvali
create table if not exists public.nomzodlar (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  vakansiya     text not null default 'administrator'
                check (char_length(vakansiya) <= 40),
  ism           text not null check (char_length(ism) between 2 and 80),
  telefon       text not null check (char_length(telefon) between 9 and 30),
  javoblar      text not null check (javoblar ~ '^[ABCD]{12}$'),
  test_sek      integer check (test_sek between 0 and 86400),
  tanishuv_sek  integer check (tanishuv_sek between 0 and 86400),
  holat         text not null default 'yangi'
                check (holat in ('yangi','qongiroq','uchrashuv','qabul','rad')),
  izoh          text check (char_length(izoh) <= 2000)
);

create index if not exists nomzodlar_created_idx on public.nomzodlar (created_at desc);

-- 2) Adminlar roʻyxati (faqat shu yerdagi emaillar nomzodlarni koʻra oladi)
create table if not exists public.adminlar (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- 3) Admin tekshiruvi
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.adminlar a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 4) Himoya (RLS)
alter table public.nomzodlar enable row level security;
alter table public.adminlar  enable row level security;
-- adminlar jadvaliga siyosat yoʻq: API orqali hech kim oʻqiy ham, yoza ham olmaydi.

-- Test sahifasi (hamma uchun ochiq) faqat YANGI qator qoʻsha oladi — oʻqiy olmaydi
drop policy if exists nomzod_qoshish on public.nomzodlar;
create policy nomzod_qoshish on public.nomzodlar
  for insert to anon, authenticated
  with check (holat = 'yangi' and izoh is null);

-- Faqat adminlar koʻradi
drop policy if exists nomzod_korish on public.nomzodlar;
create policy nomzod_korish on public.nomzodlar
  for select to authenticated
  using (public.is_admin());

-- Faqat adminlar holat va izohni oʻzgartiradi
drop policy if exists nomzod_ozgartirish on public.nomzodlar;
create policy nomzod_ozgartirish on public.nomzodlar
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.nomzodlar from anon, authenticated;
grant insert (vakansiya, ism, telefon, javoblar, test_sek, tanishuv_sek) on public.nomzodlar to anon, authenticated;
grant select on public.nomzodlar to authenticated;
grant update (holat, izoh) on public.nomzodlar to authenticated;

revoke all on public.adminlar from anon, authenticated;

-- 5) Admin emaili — OʻZINGIZNIKIGA ALMASHTIRING
insert into public.adminlar (email) values ('SIZNING_EMAIL@gmail.com')
on conflict (email) do nothing;
