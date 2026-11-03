import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m };
};
const brokenStorage = () => ({
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
});

test('profile: starts empty, saves and reloads name + last location', () => {
  const storage = memoryStorage();
  const s = createStore(storage);
  assert.deepEqual(s.getProfile(), { name: '', lastLocation: '' });
  s.saveProfile({ name: 'ครูสมชาย', lastLocation: 'อาคาร 1 ห้อง 114' });
  assert.deepEqual(createStore(storage).getProfile(), { name: 'ครูสมชาย', lastLocation: 'อาคาร 1 ห้อง 114' });
});

test('tickets: newest first, deduped, removable', () => {
  const s = createStore(memoryStorage());
  s.addTicket('BEN2-1');
  s.addTicket('BEN2-2');
  s.addTicket('BEN2-1');
  assert.deepEqual(s.getTickets(), ['BEN2-1', 'BEN2-2']);
  s.removeTicket('BEN2-1');
  assert.deepEqual(s.getTickets(), ['BEN2-2']);
});

test('tickets: capped at 100 ids', () => {
  const s = createStore(memoryStorage());
  for (let i = 1; i <= 120; i++) s.addTicket('BEN2-' + i);
  assert.equal(s.getTickets().length, 100);
  assert.equal(s.getTickets()[0], 'BEN2-120');
});

test('corrupt or foreign JSON does not crash and is ignored', () => {
  const storage = memoryStorage();
  storage.setItem('ben2.v1', '{not json');
  assert.deepEqual(createStore(storage).getTickets(), []);
  storage.setItem('ben2.v1', JSON.stringify({ tickets: ['BEN2-5', '<script>', 7], name: 42 }));
  const s = createStore(storage);
  assert.deepEqual(s.getTickets(), ['BEN2-5']);
  assert.equal(s.getProfile().name, '');
});

test('storage that throws: falls back to memory for this page', () => {
  const s = createStore(brokenStorage());
  s.addTicket('BEN2-9');
  s.saveProfile({ name: 'ก', lastLocation: 'ข' });
  assert.deepEqual(s.getTickets(), ['BEN2-9']);
  assert.equal(s.getProfile().name, 'ก');
});

test('no storage at all (undefined): still works in memory', () => {
  const s = createStore(undefined);
  s.addTicket('BEN2-3');
  assert.deepEqual(s.getTickets(), ['BEN2-3']);
});
