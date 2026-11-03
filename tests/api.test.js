import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoBackend } from '../js/demo-backend.js';
import { createApi, ApiError } from '../js/api.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const fields = (over = {}) => ({ reporter_name: 'ครูสมชาย', equipment_type: 'โปรเจคเตอร์', location: 'อาคาร 1', issue_detail: 'เปิดไม่ติด', ...over });

test('demo backend + api: create, read mine, login, list, update', async () => {
  const api = createApi({ demo: createDemoBackend(memoryStorage()) });
  const id = await api.createTicket(fields());
  assert.match(id, /^BEN2-\d+$/);

  const mine = await api.getMine([id, 'BEN2-999999']);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, 'รอรับเรื่อง');
  assert.equal(mine[0].admin_note, '-');

  await assert.rejects(api.listAll('nope'), (e) => e instanceof ApiError && e.code === 'unauthorized');
  await assert.rejects(api.login('wrong'), (e) => e.code === 'unauthorized');
  const token = await api.login('demo');
  assert.equal((await api.listAll(token)).length, 1);

  await api.updateTicket(token, id, 'เสร็จสิ้น', 'เปลี่ยนหลอดแล้ว');
  const after = (await api.getMine([id]))[0];
  assert.equal(after.status, 'เสร็จสิ้น');
  assert.equal(after.admin_note, 'เปลี่ยนหลอดแล้ว');

  await assert.rejects(api.updateTicket('nope', id, 'เสร็จสิ้น', ''), (e) => e.code === 'unauthorized');
  await assert.rejects(api.updateTicket(token, id, 'bad', ''), (e) => e.code === 'invalid');
  await assert.rejects(api.createTicket(fields({ reporter_name: '' })), (e) => e.code === 'invalid');
});

test('real transport: builds GET url, posts text/plain JSON, maps server errors', async () => {
  const calls = [];
  const fakeFetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const body = opts.body ? JSON.parse(opts.body) : null;
    const reply = (obj) => ({ ok: true, json: async () => obj });
    if (!body) return reply([{ ticket_id: 'BEN2-1' }]);
    if (body.action === 'create') return reply({ status: 'success', ticket_id: 'BEN2-77' });
    return reply({ status: 'error', code: 'unauthorized', message: 'กรุณาเข้าสู่ระบบ' });
  };
  const api = createApi({ scriptUrl: 'https://script.example/exec', fetchImpl: fakeFetch });

  assert.deepEqual(await api.getMine(['BEN2-1', 'BEN2-2']), [{ ticket_id: 'BEN2-1' }]);
  assert.equal(calls[0].url, 'https://script.example/exec?ids=BEN2-1%2CBEN2-2');

  assert.equal(await api.createTicket(fields()), 'BEN2-77');
  assert.equal(calls[1].opts.method, 'POST');
  assert.equal(calls[1].opts.headers['Content-Type'], 'text/plain;charset=utf-8');

  await assert.rejects(api.listAll('t'), (e) => e instanceof ApiError && e.code === 'unauthorized' && e.message === 'กรุณาเข้าสู่ระบบ');
});

test('real transport: network failure, non-JSON and timeout become ApiError', async () => {
  const down = createApi({ scriptUrl: 'https://x/exec', fetchImpl: async () => { throw new TypeError('offline'); } });
  await assert.rejects(down.getMine(['BEN2-1']), (e) => e.code === 'network');

  const html = createApi({ scriptUrl: 'https://x/exec', fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } }) });
  await assert.rejects(html.getMine(['BEN2-1']), (e) => e.code === 'server');

  const http500 = createApi({ scriptUrl: 'https://x/exec', fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(http500.getMine(['BEN2-1']), (e) => e.code === 'server');

  const slow = createApi({
    scriptUrl: 'https://x/exec',
    timeoutMs: 20,
    fetchImpl: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
  });
  await assert.rejects(slow.getMine(['BEN2-1']), (e) => e.code === 'network');
});

test('getMine with no ids does not call the network', async () => {
  let called = false;
  const api = createApi({ scriptUrl: 'https://x/exec', fetchImpl: async () => { called = true; } });
  assert.deepEqual(await api.getMine([]), []);
  assert.equal(called, false);
});
