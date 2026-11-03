const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend, PNG, valid } = require('./gas-harness.cjs');

const withAdmin = () => loadBackend({ props: { ADMIN_PASSWORD: 's3cret' } });
const loginToken = (b) => b.post({ action: 'login', password: 's3cret' }).token;

test('login: wrong password is unauthorized, right password returns a token', () => {
  const b = withAdmin();
  const bad = b.post({ action: 'login', password: 'nope' });
  assert.equal(bad.status, 'error');
  assert.equal(bad.code, 'unauthorized');
  const ok = b.post({ action: 'login', password: 's3cret' });
  assert.equal(ok.status, 'success');
  assert.ok(ok.token && ok.token.length >= 32);
});

test('login: refused when ADMIN_PASSWORD is not configured', () => {
  const b = loadBackend();
  const r = b.post({ action: 'login', password: '' });
  assert.equal(r.status, 'error');
  assert.equal(r.code, 'unauthorized');
});

test('login: 5 wrong attempts lock out even the right password, window then resets', () => {
  const b = withAdmin();
  b.setNow(1000000);
  for (let i = 0; i < 5; i++) assert.equal(b.post({ action: 'login', password: 'x' }).code, 'unauthorized');
  assert.equal(b.post({ action: 'login', password: 's3cret' }).code, 'rate_limited');
  b.setNow(1000000 + 11 * 60 * 1000);
  assert.equal(b.post({ action: 'login', password: 's3cret' }).status, 'success');
});

test('list: needs a valid token', () => {
  const b = withAdmin();
  b.post(valid());
  assert.equal(b.post({ action: 'list' }).code, 'unauthorized');
  assert.equal(b.post({ action: 'list', token: 'forged' }).code, 'unauthorized');
  const r = b.post({ action: 'list', token: loginToken(b) });
  assert.equal(r.status, 'success');
  assert.equal(r.tickets.length, 1);
  assert.equal(r.tickets[0].ticket_id, 'BEN2-1234');
});

test('update: needs token, validates status and id', () => {
  const b = withAdmin();
  b.post(valid());
  const upd = { action: 'update', ticket_id: 'BEN2-1234', status: 'กำลังดำเนินการ', admin_note: 'ไปดูแล้ว' };
  assert.equal(b.post(upd).code, 'unauthorized');
  const token = loginToken(b);
  assert.equal(b.post(Object.assign({ token }, upd)).status, 'success');
  assert.equal(b.post(Object.assign({ token }, upd, { status: 'hack' })).code, 'invalid');
  assert.equal(b.post(Object.assign({ token }, upd, { ticket_id: 'BEN2-9' })).code, 'not_found');
  assert.equal(b.get({ ids: 'BEN2-1234' })[0].status, 'กำลังดำเนินการ');
  assert.deepEqual(b.store.notified.map((n) => n[0]), ['new', 'upd']);
});

test('GET: only returns the ids asked for; bad ids ignored; no ids -> []', () => {
  const b = withAdmin();
  b.post(valid({ ticket_id: 'BEN2-1111' }));
  b.post(valid({ ticket_id: 'BEN2-2222' }));
  assert.deepEqual(b.get({}), []);
  assert.deepEqual(b.get({ ids: '' }), []);
  assert.deepEqual(b.get({ ids: 'BEN2-1111' }).map((t) => t.ticket_id), ['BEN2-1111']);
  assert.deepEqual(b.get({ ids: 'BEN2-1111,drop table,BEN2-2222' }).map((t) => t.ticket_id).sort(), ['BEN2-1111', 'BEN2-2222']);
  const many = Array.from({ length: 80 }, (_, i) => 'BEN2-' + (i + 1)).join(',');
  assert.ok(b.get({ ids: many }).length <= 50);
});

test('create: reissues duplicate ids, rejects missing fields, ticket shape', () => {
  const b = withAdmin();
  assert.equal(b.post(valid()).ticket_id, 'BEN2-1234');
  const dup = b.post(valid());
  assert.equal(dup.status, 'success');
  assert.notEqual(dup.ticket_id, 'BEN2-1234');
  assert.equal(b.post(valid({ reporter_name: '  ' })).code, 'invalid');
  const t = b.get({ ids: 'BEN2-1234' })[0];
  assert.equal(t.status, 'รอรับเรื่อง');
  assert.equal(t.admin_note, '-');
  assert.equal(t.image_url, '-');
});

test('create: field length caps', () => {
  const b = withAdmin();
  const r = b.post(valid({ reporter_name: 'ก'.repeat(500), location: 'ข'.repeat(500), issue_detail: 'ค'.repeat(5000) }));
  const t = b.get({ ids: r.ticket_id })[0];
  assert.equal(t.reporter_name.length, 200);
  assert.equal(t.location.length, 200);
  assert.equal(t.issue_detail.length, 2000);
});

test('create: stores only real image data URLs, as Drive links', () => {
  const b = withAdmin();
  const withImg = b.post(valid({ imageBase64: PNG }));
  assert.match(b.get({ ids: withImg.ticket_id })[0].image_url, /^https:\/\/drive\.google\.com\//);
  const notImg = b.post(valid({ ticket_id: 'BEN2-5555', imageBase64: 'data:text/html;base64,PGI+' }));
  assert.equal(b.get({ ids: notImg.ticket_id })[0].image_url, '-');
  assert.equal(b.store.files.length, 1);
});

test('create: image over 4 MB is rejected', () => {
  const b = withAdmin();
  const big = 'data:image/jpeg;base64,' + Buffer.alloc(4 * 1024 * 1024 + 10, 1).toString('base64');
  assert.equal(b.post(valid({ imageBase64: big })).code, 'invalid');
  assert.equal(b.get({ ids: 'BEN2-1234' }).length, 0);
});

test('create: spreadsheet formulas are neutralised', () => {
  const b = withAdmin();
  const r = b.post(valid({ issue_detail: '=HYPERLINK("http://evil","x")', reporter_name: '@cmd' }));
  const row = b.store.rows.find((x) => x[1] === r.ticket_id);
  assert.ok(String(row[5]).startsWith("'="));
  assert.ok(String(row[2]).startsWith("'@"));
});

test('create: 30 per 10-minute window, then rate_limited; resets next window', () => {
  const b = withAdmin();
  b.setNow(5000000);
  for (let i = 0; i < 30; i++) assert.equal(b.post(valid({ ticket_id: 'BEN2-' + (100 + i) })).status, 'success');
  assert.equal(b.post(valid({ ticket_id: 'BEN2-999' })).code, 'rate_limited');
  b.setNow(5000000 + 11 * 60 * 1000);
  assert.equal(b.post(valid({ ticket_id: 'BEN2-999' })).status, 'success');
});

test('unknown action and bad JSON are errors, not crashes', () => {
  const b = withAdmin();
  assert.equal(b.post({ action: 'zzz' }).status, 'error');
  const out = JSON.parse(b.ctx.doPost({ postData: { contents: '{not json' } }).s);
  assert.equal(out.status, 'error');
});
