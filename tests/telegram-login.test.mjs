import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLoginHandler, validateTelegramData } from '../supabase/functions/crm-telegram-login/login.ts';

const token = '123456:test-token';
const origin = 'https://platform770uz-dev.github.io';
function signed(fields = {}) {
  const values = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'test-query',
    user: JSON.stringify({ id: 12345, first_name: 'Admin' }),
    ...fields,
  };
  const message = Object.keys(values).sort().map((key) => `${key}=${values[key]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(message).digest('hex');
  return new URLSearchParams({ ...values, hash }).toString();
}
const request = (initData = signed(), from = origin) => new Request('https://example.test/login', {
  method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }),
});

test('validates Telegram HMAC including an optional signature field', async () => {
  assert.equal((await validateTelegramData(signed({ signature: 'telegram-signature' }), token)).id, 12345);
});

test('rejects tampering, duplicate fields, old and future launch data', async () => {
  await assert.rejects(validateTelegramData(signed().replace('test-query', 'changed-query'), token));
  await assert.rejects(validateTelegramData(signed() + '&user=%7B%22id%22%3A2%7D', token));
  await assert.rejects(validateTelegramData(signed({ auth_date: String(Math.floor(Date.now() / 1000) - 301) }), token));
  await assert.rejects(validateTelegramData(signed({ auth_date: String(Math.floor(Date.now() / 1000) + 60) }), token));
});

function mockAdmin(overrides = {}) {
  const state = {
    chat: { auth_user_id: 'user-1', tasdiqlangan: true, bloklangan: false, ...overrides },
    created: 0, links: 0, deleted: [], revokeOnLink: false,
    account: { id: 'user-1', email: 'test@crm.invalid', app_metadata: { crm_telegram_chat_id: '12345' } },
  };
  const admin = {
    from(table) {
      assert.equal(table, 'tg_chatlar');
      let patch;
      const conditions = [];
      const builder = {
        select() { return this; },
        eq(k, v) { if (k !== 'chat_id') conditions.push([k, v]); return this; },
        is(k, v) { conditions.push([k, v]); return this; },
        update(value) { patch = value; return this; },
        async maybeSingle() { return { data: { ...state.chat }, error: null }; },
        then(resolve, reject) {
          if (patch && conditions.every(([k, v]) => state.chat[k] === v)) {
            Object.assign(state.chat, patch);
            return Promise.resolve({ data: [{ auth_user_id: state.chat.auth_user_id }] }).then(resolve, reject);
          }
          return Promise.resolve({ data: [] }).then(resolve, reject);
        },
      };
      return builder;
    },
    auth: { admin: {
      async createUser(input) {
        state.created++;
        assert.equal(input.email_confirm, true);
        assert.equal(input.app_metadata.crm_telegram_chat_id, '12345');
        state.account = { id: 'new-user', email: input.email, app_metadata: input.app_metadata };
        return { data: { user: state.account } };
      },
      async getUserById(id) { assert.equal(id, state.account.id); return { data: { user: state.account } }; },
      async generateLink(input) {
        state.links++;
        assert.equal(input.email, state.account.email);
        assert.equal(input.type, 'magiclink');
        if (state.revokeOnLink) state.chat.bloklangan = true;
        return { data: { properties: { hashed_token: 'one-use-hash' }, user: state.account } };
      },
      async deleteUser(id) { state.deleted.push(id); },
    } },
  };
  return { state, handler: createLoginHandler(admin, () => token) };
}

test('approved Telegram admin receives a one-use login hash with no-store', async () => {
  const { state, handler } = mockAdmin();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { token_hash: 'one-use-hash' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(state.created, 0);
});

test('first approved login creates a separate Auth user and binds it', async () => {
  const { state, handler } = mockAdmin({ auth_user_id: null });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(state.created, 1);
  assert.equal(state.chat.auth_user_id, 'new-user');
  assert.match(state.account.email, /^tg12345-[a-f0-9]{24}@crm\.invalid$/);
});

test('pending and blocked admins cannot create accounts or login links', async () => {
  for (const flags of [{ tasdiqlangan: false }, { bloklangan: true }]) {
    const { state, handler } = mockAdmin(flags);
    assert.equal((await handler(request())).status, 403);
    assert.equal(state.created, 0);
    assert.equal(state.links, 0);
  }
});

test('revocation during auth exchange prevents returning the login hash', async () => {
  const { state, handler } = mockAdmin();
  state.revokeOnLink = true;
  const response = await handler(request());
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'approval_required' });
});

test('forged initData and foreign origins cannot reach authentication', async () => {
  const { state, handler } = mockAdmin();
  assert.equal((await handler(request('user=fake'))).status, 401);
  assert.equal((await handler(request(signed(), 'https://other.test'))).status, 403);
  assert.equal(state.links, 0);
  assert.equal(state.created, 0);
});

test('a mismatched server-side account binding is rejected', async () => {
  const { state, handler } = mockAdmin();
  state.account.app_metadata.crm_telegram_chat_id = '999';
  assert.equal((await handler(request())).status, 503);
  assert.equal(state.links, 0);
});
