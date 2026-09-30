import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Telegram approval grants CRM only and revocation rejects an existing JWT', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
      $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
      grant usage on schema auth to authenticated;
      create table public.adminlar(email text primary key);
      create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
        select exists(select 1 from public.adminlar where email = auth.jwt()->>'email');
      $$;
      revoke all on function public.is_admin() from public, anon;
      grant execute on function public.is_admin() to authenticated;
      create table public.tg_chatlar(chat_id bigint primary key, tasdiqlangan boolean not null, bloklangan boolean not null);
      create table public.nomzodlar(id bigint primary key);
      alter table public.nomzodlar enable row level security;
      create policy hr_admin on public.nomzodlar for select to authenticated using(public.is_admin());
      grant select on public.nomzodlar to authenticated;
      insert into public.nomzodlar values(1);
      create function public.crm_qongiroq_yoz(bigint, text, text, timestamptz default null) returns jsonb language plpgsql as $$
      begin
        if not public.is_admin() then raise exception 'Ruxsat yoʻq'; end if;
        return jsonb_build_object('ok', true);
      end $$;
      revoke all on function public.crm_qongiroq_yoz(bigint,text,text,timestamptz) from public;
      grant execute on function public.crm_qongiroq_yoz(bigint,text,text,timestamptz) to authenticated;
    `);
    for (const table of ['crm_voronkalar','crm_bosqichlar','crm_bitimlar','crm_kontaktlar','crm_vazifalar','crm_tarix','crm_sozlama','crm_savat','crm_qongiroqlar','crm_skript_holat']) {
      await db.exec(`create table public.${table}(id bigint generated always as identity primary key, nom text);
        alter table public.${table} enable row level security;
        create policy old_admin on public.${table} for all to authenticated using(public.is_admin()) with check(public.is_admin());`);
    }
    const migration = await fs.readFile(new URL('../1924_tg_crm_login.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // repeat deployment is safe
    const approved = '00000000-0000-0000-0000-000000000001';
    const stranger = '00000000-0000-0000-0000-000000000002';
    const owner = '00000000-0000-0000-0000-000000000003';
    await db.exec(`insert into auth.users values ('${approved}'),('${stranger}'),('${owner}');
      insert into public.tg_chatlar values(12345, true, false, '${approved}');
      insert into public.adminlar values('owner@example.test');
      insert into public.crm_bitimlar(nom) values('CRM test');`);
    async function assume(id, email, extra = {}) {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, email, ...extra })]);
      await db.exec('set role authenticated');
    }
    await assume(approved, 'tg12345@crm.invalid');
    assert.equal((await db.query('select public.is_crm_admin() as allowed')).rows[0].allowed, true);
    assert.equal((await db.query('select count(*)::int as n from public.crm_bitimlar')).rows[0].n, 1);
    await db.exec("insert into public.crm_bitimlar(nom) values('Allowed')");
    assert.equal((await db.query('select count(*)::int as n from public.nomzodlar')).rows[0].n, 0);
    await assert.rejects(db.query('select * from public.tg_chatlar'));
    await assert.rejects(db.query('select * from public.adminlar'));
    assert.equal((await db.query("select public.crm_qongiroq_yoz(1,'gaplashdik','test',null) as result")).rows[0].result.ok, true);
    await db.exec('reset role; update public.tg_chatlar set tasdiqlangan=false, bloklangan=true where chat_id=12345; set role authenticated;');
    assert.equal((await db.query('select public.is_crm_admin() as allowed')).rows[0].allowed, false);
    assert.equal((await db.query('select count(*)::int as n from public.crm_bitimlar')).rows[0].n, 0);
    await assert.rejects(db.exec("insert into public.crm_bitimlar(nom) values('Denied')"));
    await assert.rejects(db.query("select public.crm_qongiroq_yoz(1,'gaplashdik','test',null)"));
    await assume(stranger, 'stranger@example.test', { user_metadata: { telegram_chat_id: 12345, role: 'admin' } });
    assert.equal((await db.query('select public.is_crm_admin() as allowed')).rows[0].allowed, false);
    await assume(owner, 'owner@example.test');
    assert.equal((await db.query('select public.is_crm_admin() as allowed')).rows[0].allowed, true);
    assert.equal((await db.query('select count(*)::int as n from public.nomzodlar')).rows[0].n, 1);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select public.is_crm_admin()'));
    await assert.rejects(db.query('select * from public.crm_bitimlar'));
  } finally { await db.close(); }
});
