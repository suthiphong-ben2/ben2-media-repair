const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend, PNG, valid } = require('./gas-harness.cjs');

const GROUP = 'C' + 'a1b2c3d4'.repeat(4);          // C + 32 hex chars, the shape of a real groupId
const TOKEN = 'line-secret-token-0123456789';
const configured = (extra = {}, opts = {}) =>
  loadBackend({ line: true, props: Object.assign({ LINE_CHANNEL_TOKEN: TOKEN, LINE_GROUP_ID: GROUP }, extra), ...opts });

test('not configured: ticket is saved, nothing is sent', () => {
  const b = loadBackend({ line: true });
  assert.equal(b.post(valid()).status, 'success');
  assert.equal(b.store.fetches.length, 0);
});

test('new ticket: one push to the group with the ticket details and the admin link', () => {
  const b = configured();
  const r = b.post(valid({ ticket_id: 'BEN2-4321', imageBase64: PNG }));
  assert.equal(r.status, 'success');
  assert.equal(b.store.fetches.length, 1);
  const f = b.store.fetches[0];
  assert.equal(f.url, 'https://api.line.me/v2/bot/message/push');
  assert.equal(f.opts.headers.Authorization, 'Bearer ' + TOKEN);
  assert.equal(f.payload.to, GROUP);
  assert.equal(f.payload.messages.length, 1);                // group pushes count per member, so one message only
  const text = f.payload.messages[0].text;
  for (const part of ['BEN2-4321', 'ครูสมชาย', 'โปรเจคเตอร์', 'อาคาร 1', 'เปิดไม่ติด', 'drive.google.com',
                      'https://repairben2.ienas.site/admin.html']) {
    assert.ok(text.includes(part), 'message should contain ' + part);
  }
});

test('SITE_URL property overrides the admin link', () => {
  const b = configured({ SITE_URL: 'https://example.org/' });
  b.post(valid());
  assert.ok(b.store.fetches[0].payload.messages[0].text.includes('https://example.org/admin.html'));
});

test('status updates are off by default, on with LINE_NOTIFY_UPDATES=true', () => {
  const off = configured({ ADMIN_PASSWORD: 'pw' });
  off.post(valid());
  const t1 = off.post({ action: 'login', password: 'pw' }).token;
  off.post({ action: 'update', token: t1, ticket_id: 'BEN2-1234', status: 'เสร็จสิ้น', admin_note: 'เรียบร้อย' });
  assert.equal(off.store.fetches.length, 1);                  // only the "new ticket" push

  const on = configured({ ADMIN_PASSWORD: 'pw', LINE_NOTIFY_UPDATES: 'true' });
  on.post(valid());
  const t2 = on.post({ action: 'login', password: 'pw' }).token;
  on.post({ action: 'update', token: t2, ticket_id: 'BEN2-1234', status: 'เสร็จสิ้น', admin_note: 'เปลี่ยนหลอดแล้ว' });
  assert.equal(on.store.fetches.length, 2);
  const text = on.store.fetches[1].payload.messages[0].text;
  assert.ok(text.includes('BEN2-1234') && text.includes('เสร็จสิ้น') && text.includes('เปลี่ยนหลอดแล้ว'));
});

test('LINE failures never break the ticket flow, are logged with status/body, and never leak the token', () => {
  const http = configured({}, { lineResponse: { code: 401, body: '{"message":"Authentication failed"}' } });
  assert.equal(http.post(valid()).status, 'success');
  assert.equal(http.get({ ids: 'BEN2-1234' }).length, 1);
  assert.ok(http.store.errors.some((e) => e.includes('401') && e.includes('Authentication failed')));

  const net = configured({}, { lineResponse: { throws: 'DNS error' } });
  assert.equal(net.post(valid()).status, 'success');
  assert.ok(net.store.errors.some((e) => e.includes('DNS error')));

  for (const b of [http, net]) assert.ok(![...b.store.errors, ...b.store.logs].some((l) => l.includes(TOKEN)));
});

test('notification is sent after the script lock is released', () => {
  const b = configured();
  b.post(valid());
  assert.deepEqual(b.store.events, ['lock', 'unlock', 'fetch']);
});

test('malformed LINE_GROUP_ID is rejected with a clear log, nothing sent', () => {
  const b = configured({ LINE_GROUP_ID: 'not-a-group-id' });
  assert.equal(b.post(valid()).status, 'success');
  assert.equal(b.store.fetches.length, 0);
  assert.ok(b.store.errors.some((e) => e.includes('LINE_GROUP_ID')));
});

test('very long fields are cut so the message stays within LINE\'s 5000-char limit', () => {
  const b = configured();
  b.post(valid({ reporter_name: 'ก'.repeat(500), location: 'ข'.repeat(500), issue_detail: 'ค'.repeat(5000) }));
  assert.ok(b.store.fetches[0].payload.messages[0].text.length <= 5000);
});

test('webhook: logs the groupId from a group event, creates no ticket, returns success', () => {
  const b = loadBackend({ line: true });
  const r = b.post({ destination: 'U1', events: [{ type: 'message', source: { type: 'group', groupId: GROUP, userId: 'U2' } }] });
  assert.equal(r.status, 'success');
  assert.ok(b.store.logs.some((l) => l.includes(GROUP) && l.includes('LINE_GROUP_ID')));
  assert.equal(b.store.rows.length, 0);
  assert.equal(b.store.fetches.length, 0);
});

test('webhook: empty "verify" payload, user chats and bogus ids are ignored safely', () => {
  const b = loadBackend({ line: true });
  assert.equal(b.post({ events: [] }).status, 'success');
  assert.equal(b.post({ events: [{ source: { type: 'user', userId: 'U9' } }] }).status, 'success');
  assert.equal(b.post({ events: [{ source: { type: 'group', groupId: 'x"; drop' } }] }).status, 'success');
  assert.equal(b.store.logs.filter((l) => l.includes('LINE_GROUP_ID')).length, 0);
});

test('testLine(): sends one test message when configured, explains what is missing otherwise', () => {
  const b = configured();
  const ok = b.ctx.testLine();
  assert.equal(ok.ok, true);
  assert.equal(b.store.fetches.length, 1);
  assert.ok(b.store.fetches[0].payload.messages[0].text.includes('ทดสอบ'));

  const empty = loadBackend({ line: true });
  const res = empty.ctx.testLine();
  assert.equal(res.ok, false);
  assert.equal(empty.store.fetches.length, 0);
  assert.ok(empty.store.errors.some((e) => e.includes('LINE_CHANNEL_TOKEN') || e.includes('LINE_GROUP_ID')));
});
