import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, relativeTime, safeImageUrl, appendChip, chipsFor, statusMeta, EQUIPMENT } from '../js/util.js';

test('escapeHtml escapes the five dangerous characters and tolerates null', () => {
  assert.equal(escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(12), '12');
});

test('relativeTime: Thai relative labels', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const ago = (s) => new Date(now - s * 1000).toISOString();
  assert.equal(relativeTime(ago(10), now), 'เมื่อสักครู่');
  assert.equal(relativeTime(ago(5 * 60), now), '5 นาทีที่แล้ว');
  assert.equal(relativeTime(ago(3 * 3600), now), '3 ชม. ที่แล้ว');
  assert.equal(relativeTime(ago(2 * 86400), now), '2 วันที่แล้ว');
  assert.equal(relativeTime(ago(-60), now), 'เมื่อสักครู่');
  assert.equal(relativeTime('not a date', now), '');
});

test('safeImageUrl: only https Google Drive links', () => {
  assert.equal(safeImageUrl('https://drive.google.com/uc?export=view&id=abc'), 'https://drive.google.com/uc?export=view&id=abc');
  assert.equal(safeImageUrl('javascript:alert(1)'), '');
  assert.equal(safeImageUrl('http://drive.google.com/x'), '');
  assert.equal(safeImageUrl('https://evil.com/https://drive.google.com/'), '');
  assert.equal(safeImageUrl('https://drive.google.com/x" onerror="a'), '');
  assert.equal(safeImageUrl('-'), '');
  assert.equal(safeImageUrl(undefined), '');
});

test('appendChip: adds with separator, no duplicates', () => {
  assert.equal(appendChip('', 'เปิดไม่ติด'), 'เปิดไม่ติด');
  assert.equal(appendChip('  ', 'เปิดไม่ติด'), 'เปิดไม่ติด');
  assert.equal(appendChip('เปิดไม่ติด', 'ไม่มีเสียง'), 'เปิดไม่ติด, ไม่มีเสียง');
  assert.equal(appendChip('เปิดไม่ติด, ไม่มีเสียง', 'ไม่มีเสียง'), 'เปิดไม่ติด, ไม่มีเสียง');
  assert.equal(appendChip('เปิดไม่ติด,', 'ไม่มีเสียง'), 'เปิดไม่ติด, ไม่มีเสียง');
});

test('chipsFor: network gets its own chips, others get the common set', () => {
  assert.ok(chipsFor('ระบบเครือข่าย').includes('เชื่อมต่อไม่ได้'));
  assert.ok(chipsFor('โปรเจคเตอร์').includes('เปิดไม่ติด'));
  assert.ok(chipsFor('ไม่มีประเภทนี้').length > 0);
});

test('statusMeta: known statuses and a safe fallback', () => {
  assert.equal(statusMeta('รอรับเรื่อง').key, 'pending');
  assert.equal(statusMeta('กำลังดำเนินการ').key, 'progress');
  assert.equal(statusMeta('เสร็จสิ้น').key, 'done');
  assert.equal(statusMeta('???').key, 'pending');
  assert.ok(statusMeta('เสร็จสิ้น').icon.startsWith('fa-'));
});

test('EQUIPMENT keeps the six backend values', () => {
  assert.deepEqual(EQUIPMENT.map((e) => e.value),
    ['โปรเจคเตอร์', 'คอมพิวเตอร์', 'โทรทัศน์', 'เครื่องเสียง', 'ระบบเครือข่าย', 'อื่นๆ']);
});
