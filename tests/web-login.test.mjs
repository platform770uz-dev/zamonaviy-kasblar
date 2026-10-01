import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebLoginHandler, pinMatches } from '../supabase/functions/crm-web-login/login.ts';

const origin = 'https://platform770uz-dev.github.io';
const request = (pin, from = origin, ip = '198.51.100.44') => new Request('https://example.test/login', {
  method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ pin }),
});

function mockAdmin({ enabled = true } = {}) {
  const state = { login: null, user: null, failures: 0, created: 0, links: 0, deleted: [] };
  const admin = {
    from(table) {
      assert.equal(table, 'crm_web_login');
      let insert;
      let id;
      return {
        select() { return this; },
        eq(key, value) { assert.equal(key, 'id'); id = value; return this; },
        insert(value) { insert = value; return this; },
        async maybeSingle() {
          if (insert) {
            state.login = { ...insert, enabled };
            return { data: state.login, error: null };
          }
          return { data: id === 'shared' && state.login ? { ...state.login } : null, error: null };
        },
      };
    },
    async rpc(name, args) {
      assert.equal(name, 'crm_web_pin_attempt');
      assert.match(args.p_ip_hash, /^[0-9a-f]{64}$/);
      if (args.p_failed) state.failures++;
      return { data: args.p_failed ? state.failures <= 5 : state.failures < 5, error: null };
    },
    auth: { admin: {
      async createUser(input) {
        state.created++;
        state.user = { id: 'web-user', email: input.email, app_metadata: input.app_metadata };
        assert.equal(input.email_confirm, true);
        assert.equal(input.app_metadata.crm_web_pin, true);
        return { data: { user: state.user }, error: null };
      },
      async getUserById(id) { assert.equal(id, 'web-user'); return { data: { user: state.user }, error: null }; },
      async generateLink(input) {
        state.links++;
        assert.equal(input.type, 'magiclink');
        assert.equal(input.email, state.user.email);
        return { data: { properties: { hashed_token: 'one-use-hash' }, user: state.user }, error: null };
      },
      async deleteUser(id) { state.deleted.push(id); return { error: null }; },
    } },
  };
  return { state, handler: createWebLoginHandler(admin, () => '8888') };
}

test('PIN comparison requires the exact four-digit secret', () => {
  assert.equal(pinMatches('8888', '8888'), true);
  for (const pin of ['08888', '888', '8889', 'abcd', null, 8888]) assert.equal(pinMatches(pin, '8888'), false);
  assert.equal(pinMatches('8888', ''), false);
});

test('valid PIN creates a shared CRM-only Auth identity and returns a one-use hash', async () => {
  const { state, handler } = mockAdmin();
  const response = await handler(request('8888'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { token_hash: 'one-use-hash' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(state.created, 1);
  assert.deepEqual(state.login, { id: 'shared', auth_user_id: 'web-user', enabled: true });
  assert.equal(state.links, 1);
});

test('invalid PIN is rejected without creating an account; attempts are rate limited', async () => {
  const { state, handler } = mockAdmin();
  for (let i = 0; i < 5; i++) assert.equal((await handler(request('0000'))).status, 401);
  assert.equal((await handler(request('8888'))).status, 429);
  assert.equal(state.created, 0);
  assert.equal(state.links, 0);
});

test('disabled web login and foreign origins cannot receive a session hash', async () => {
  const disabled = mockAdmin({ enabled: false });
  const first = await disabled.handler(request('8888'));
  assert.equal(first.status, 403);
  assert.equal(disabled.state.links, 0);

  const foreign = mockAdmin();
  assert.equal((await foreign.handler(request('8888', 'https://other.example'))).status, 403);
  assert.equal(foreign.state.created, 0);
});

test('missing server-side PIN fails closed', async () => {
  const { state } = mockAdmin();
  const handler = createWebLoginHandler({}, () => '');
  assert.equal((await handler(request('8888'))).status, 503);
  assert.equal(state.created, 0);
});

