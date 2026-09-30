const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'crm.html'), 'utf8');

function sourceBetween(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `source markers: ${start}`);
  return html.slice(a, b);
}

test('report counts old deals closed during the selected period', () => {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  const context = {
    S: {
      vid: 1,
      V: [{ id: 1, nom: 'B2B' }],
      B: [
        { id: 1, voronka_id: 1, turi: 'oddiy', nom: 'New' },
        { id: 2, voronka_id: 1, turi: 'yutuq', nom: 'Won' },
        { id: 3, voronka_id: 1, turi: 'yoqotish', nom: 'Lost' },
      ],
      D: [
        { id: 1, voronka_id: 1, bosqich_id: 2, created_at: daysAgo(60), yopilgan_at: daysAgo(1), byudjet: 100, manba: 'Instagram' },
        { id: 2, voronka_id: 1, bosqich_id: 3, created_at: daysAgo(80), yopilgan_at: daysAgo(1), byudjet: 0, manba: 'Telegram' },
        { id: 3, voronka_id: 1, bosqich_id: 1, created_at: daysAgo(1), yopilgan_at: null, byudjet: 0, manba: 'Instagram' },
      ],
    },
    Date,
    Math,
    String,
    Number,
    Object,
    el(_tag, cls, text) {
      return {
        cls,
        text,
        children: [],
        style: {},
        appendChild(child) { this.children.push(child); },
        addEventListener() {},
      };
    },
    byId(list, id) { return list.find((x) => x.id === id); },
    stagesOf(id) { return context.S.B.filter((x) => x.voronka_id === id); },
    money(n) { return `${n} sum`; },
    status() {},
    render() {},
  };
  vm.runInNewContext(sourceBetween('  var period = "30";', '  /* ---------- sozlamalar ---------- */'), context);
  const root = context.el('root');
  context.renderReport(root);
  const nodes = [];
  const walk = (n) => { nodes.push(n); n.children.forEach(walk); };
  walk(root);
  const stats = nodes.filter((n) => n.cls === 'stat');
  const value = (label) => stats.find((n) => n.children[0].text === label).children[1].text;
  assert.equal(value('Yangi bitim'), '1');
  assert.equal(value('Hozir ochiq'), '1');
  assert.equal(value('Yopildi: muvaffaqiyatli'), '1');
  assert.equal(value('Yopildi: yoʻqotilgan'), '1');
  assert.equal(value('Yopilganlardan yutuq'), '50%');
});

test('retry recovers a saved note and creates only the missing task', async () => {
  const existingNote = { id: 7, bitim_id: 10, matn: '📞 SKRIPT — test' };
  const inserted = [];
  const context = {
    S: { SK: {}, T: [] },
    sb: {
      from(table) {
        return {
          select() {
            return {
              eq() { return this; },
              order() { return this; },
              async limit() { return { data: table === 'crm_tarix' ? [existingNote] : [] }; },
            };
          },
          insert(row) {
            inserted.push({ table, row });
            return { async select() { return { data: [{ id: 8, ...row }] }; } };
          },
        };
      },
    },
    byId(list, id) { return list.find((x) => x.id === id); },
    errText(r) { return r.error?.message || 'error'; },
  };
  vm.runInNewContext(sourceBetween('  function impPendingErrors(res){', '  function openImport(){'), context);
  const res = {
    skript: 0, dosye: 0, vazifa: 0,
    pending: {
      notes: [{ row: { bitim_id: 10, turi: 'izoh', matn: existingNote.matn }, err: 'network' }],
      tasks: [{ row: { bitim_id: 10, matn: 'Call', muddat: new Date().toISOString() }, err: 'network' }],
    },
  };
  await context.impRetryMissing(res);
  assert.equal(res.pending.notes.length, 0);
  assert.equal(res.pending.tasks.length, 0);
  assert.equal(res.skript, 1);
  assert.equal(res.vazifa, 1);
  assert.deepEqual(inserted.map((x) => x.table), ['crm_vazifalar']);
});

test('retry does not insert when checking for an existing row fails', async () => {
  let inserted = false;
  const context = {
    S: { SK: {}, T: [] },
    sb: {
      from() {
        return {
          select() { return { eq() { return this; }, order() { return this; }, async limit() { return { error: { message: 'offline' } }; } }; },
          insert() { inserted = true; throw new Error('must not insert'); },
        };
      },
    },
    byId() { return null; },
    errText(r) { return r.error.message; },
  };
  vm.runInNewContext(sourceBetween('  function impPendingErrors(res){', '  function openImport(){'), context);
  const res = { skript: 0, dosye: 0, vazifa: 0, pending: { notes: [{ row: { bitim_id: 1, matn: 'Note' }, err: 'network' }], tasks: [] } };
  await context.impRetryMissing(res);
  assert.equal(inserted, false);
  assert.equal(res.pending.notes[0].err, 'offline');
});
