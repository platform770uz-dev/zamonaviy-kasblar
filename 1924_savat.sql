-- 1924 CRM: «Savat» — har bir odamning bugungi qoʻngʻiroq savati (10 ta mijoz), qoʻngʻiroq natijalari va skript qadami.
-- Bir marta Supabase'da ishga tushiriladi (allaqachon qoʻllangan).

-- Savat: kimning savatida qaysi vazifa turibdi
create table if not exists public.crm_savat (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  egasi text not null check (char_length(egasi) between 3 and 120),
  vazifa_id bigint not null references public.crm_vazifalar(id) on delete cascade,
  unique (egasi, vazifa_id)
);
create index if not exists crm_savat_vazifa_idx on public.crm_savat (vazifa_id);
alter table public.crm_savat enable row level security;
drop policy if exists crm_savat_admin on public.crm_savat;
create policy crm_savat_admin on public.crm_savat for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Qoʻngʻiroq natijalari (doska va kunlik raqamlar shundan)
create table if not exists public.crm_qongiroqlar (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  bitim_id bigint not null references public.crm_bitimlar(id) on delete cascade,
  vazifa_id bigint references public.crm_vazifalar(id) on delete set null,
  muallif text check (char_length(muallif) <= 120),
  natija text not null check (natija in ('gaplashdik', 'kotarmadi', 'qayta', 'uchrashuv', 'rad', 'notogri', 'band')),
  izoh text not null check (char_length(izoh) between 1 and 2000),
  vaqt timestamptz,
  urinish smallint check (urinish between 1 and 99)
);
create index if not exists crm_qongiroqlar_bitim_idx on public.crm_qongiroqlar (bitim_id, created_at desc);
create index if not exists crm_qongiroqlar_vazifa_idx on public.crm_qongiroqlar (vazifa_id);
create index if not exists crm_qongiroqlar_vaqt_idx on public.crm_qongiroqlar (created_at desc);
alter table public.crm_qongiroqlar enable row level security;
drop policy if exists crm_qongiroqlar_admin on public.crm_qongiroqlar;
create policy crm_qongiroqlar_admin on public.crm_qongiroqlar for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Skriptda qaysi qadamda toʻxtaldik (mijoz boʻyicha; qayta qoʻngʻiroqda shu joydan davom etiladi)
create table if not exists public.crm_skript_holat (
  bitim_id bigint primary key references public.crm_bitimlar(id) on delete cascade,
  qadam smallint not null default 0 check (qadam between 0 and 50),
  updated_at timestamptz not null default now()
);
alter table public.crm_skript_holat enable row level security;
drop policy if exists crm_skript_holat_admin on public.crm_skript_holat;
create policy crm_skript_holat_admin on public.crm_skript_holat for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Savatga qoʻshish: 10 tadan oshmaydi; masʼuli yoʻq bitim savat egasiga biriktiriladi
create or replace function public.crm_savat_qosh()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('crm_savat:' || new.egasi));
  if (select count(*) from crm_savat where egasi = new.egasi) >= 10 then
    raise exception 'Savat toʻla — 10 ta mijoz';
  end if;
  update crm_bitimlar set masul = left(new.egasi, 60)
   where id = (select bitim_id from crm_vazifalar where id = new.vazifa_id) and masul is null;
  return new;
end $$;
drop trigger if exists crm_savat_qosh on public.crm_savat;
create trigger crm_savat_qosh before insert on public.crm_savat
  for each row execute function public.crm_savat_qosh();

-- Vazifa bajarildi (qayerda boʻlmasin) — hamma savatlardan chiqadi
create or replace function public.crm_vazifa_savatdan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.bajarildi and not old.bajarildi then
    delete from crm_savat where vazifa_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists crm_vazifa_savatdan on public.crm_vazifalar;
create trigger crm_vazifa_savatdan after update of bajarildi on public.crm_vazifalar
  for each row execute function public.crm_vazifa_savatdan();

-- Qoʻngʻiroq natijasini yozish — hammasi bitta tranzaksiyada:
-- natija + vazifa (bajarildi yoki qayta vaqt) + hamma savatlardan chiqarish + bitim tarixi.
-- Koʻtarmadi/band: 1 soatdan keyin qayta, 5-urinishdan keyin vazifa yopiladi.
create or replace function public.crm_qongiroq_yoz(p_savat bigint, p_natija text, p_izoh text, p_vaqt timestamptz default null)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_sv crm_savat%rowtype;
  v_t crm_vazifalar%rowtype;
  v_q crm_qongiroqlar%rowtype;
  v_me text := coalesce(auth.jwt() ->> 'email', '');
  v_izoh text := btrim(coalesce(p_izoh, ''));
  v_n int;
  v_lbl text;
begin
  if not public.is_admin() then raise exception 'Ruxsat yoʻq'; end if;
  if p_natija is null or p_natija not in ('gaplashdik', 'kotarmadi', 'qayta', 'uchrashuv', 'rad', 'notogri', 'band') then
    raise exception 'Natija notoʻgʻri';
  end if;
  if v_izoh = '' then raise exception 'Izoh yozing'; end if;
  if p_natija in ('qayta', 'uchrashuv') and p_vaqt is null then raise exception 'Vaqtni tanlang'; end if;

  select * into v_sv from crm_savat where id = p_savat;
  if not found then raise exception 'Bu mijoz savatda yoʻq — uni boshqa odam allaqachon yakunlagan boʻlishi mumkin'; end if;
  select * into v_t from crm_vazifalar where id = v_sv.vazifa_id for update;
  if not found or v_t.bitim_id is null then raise exception 'Vazifa topilmadi'; end if;

  if p_natija in ('kotarmadi', 'band') then
    select count(*) + 1 into v_n from crm_qongiroqlar q
     where q.vazifa_id = v_t.id and q.natija in ('kotarmadi', 'band')
       and q.created_at > coalesce((select max(x.created_at) from crm_qongiroqlar x
                                     where x.vazifa_id = v_t.id and x.natija not in ('kotarmadi', 'band')), '-infinity'::timestamptz);
  end if;

  insert into crm_qongiroqlar (bitim_id, vazifa_id, muallif, natija, izoh, vaqt, urinish)
  values (v_t.bitim_id, v_t.id, nullif(v_me, ''), p_natija, left(v_izoh, 2000), p_vaqt, v_n)
  returning * into v_q;

  if p_natija in ('kotarmadi', 'band') and v_n < 5 then
    update crm_vazifalar set muddat = now() + interval '1 hour' where id = v_t.id returning * into v_t;
  elsif p_natija = 'qayta' then
    update crm_vazifalar set muddat = p_vaqt where id = v_t.id returning * into v_t;
  else
    update crm_vazifalar set bajarildi = true, bajarilgan_at = now() where id = v_t.id returning * into v_t;
  end if;

  delete from crm_savat where vazifa_id = v_t.id;

  v_lbl := case p_natija
    when 'gaplashdik' then 'Gaplashdik'
    when 'kotarmadi' then 'Koʻtarmadi (urinish ' || v_n || '/5)'
    when 'band' then 'Band / uzdi (urinish ' || v_n || '/5)'
    when 'qayta' then 'Qayta qoʻngʻiroq: ' || to_char(p_vaqt at time zone 'Asia/Tashkent', 'DD.MM HH24:MI')
    when 'uchrashuv' then 'Uchrashuv: ' || to_char(p_vaqt at time zone 'Asia/Tashkent', 'DD.MM HH24:MI')
    when 'rad' then 'Rad etdi'
    else 'Notoʻgʻri raqam'
  end;
  insert into crm_tarix (bitim_id, turi, matn, muallif)
  values (v_t.bitim_id, 'izoh', left('📞 ' || v_lbl || ' — ' || v_izoh, 2000), nullif(v_me, ''));

  return jsonb_build_object('qongiroq', to_jsonb(v_q), 'vazifa', to_jsonb(v_t));
end $$;
revoke execute on function public.crm_qongiroq_yoz(bigint, text, text, timestamptz) from public, anon;
grant execute on function public.crm_qongiroq_yoz(bigint, text, text, timestamptz) to authenticated;
revoke execute on function public.crm_savat_qosh() from public, anon, authenticated;
revoke execute on function public.crm_vazifa_savatdan() from public, anon, authenticated;
