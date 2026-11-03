import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, OTHER, roomLabel, filterRooms, findRoomByLabel } from '../js/rooms.js';

test('the room list is complete enough and every room has a usable label', () => {
  assert.ok(ROOMS.length >= 130, 'expected the full school list, got ' + ROOMS.length);
  for (const r of ROOMS) assert.ok(roomLabel(r).trim().length > 0, 'empty label for ' + JSON.stringify(r));
});

test('labels are unique (the label is what gets saved with the ticket)', () => {
  const labels = ROOMS.map(roomLabel);
  assert.equal(new Set(labels).size, labels.length);
});

test('label format: "code — name", just the name without a code, just the code without a name', () => {
  assert.equal(roomLabel({ code: '121', name: 'ห้องแนะแนว' }), '121 — ห้องแนะแนว');
  assert.equal(roomLabel({ code: '', name: 'ห้องลูกเสือ' }), 'ห้องลูกเสือ');
  assert.equal(roomLabel({ code: '438', name: '' }), '438');
});

test('known rooms are present with the expected labels', () => {
  for (const label of ['121 — ห้องแนะแนว', '151 — ม.3/1', '221 — com 7', '341 — LAB ฟิสิกส์', '531 — ห้องประชุม']) {
    assert.ok(findRoomByLabel(label), 'missing ' + label);
  }
});

test('filterRooms: empty query returns everything', () => {
  assert.equal(filterRooms('').length, ROOMS.length);
  assert.equal(filterRooms('   ').length, ROOMS.length);
  assert.equal(filterRooms(undefined).length, ROOMS.length);
});

test('filterRooms: matches room code and room name', () => {
  assert.deepEqual(filterRooms('234').map(roomLabel), ['234 — ม.4/4']);
  assert.ok(filterRooms('ฟิสิกส์').map(roomLabel).includes('341 — LAB ฟิสิกส์'));
});

test('filterRooms: case-insensitive, trims, all words must match', () => {
  assert.ok(filterRooms('lab').map(roomLabel).includes('355 — LAB เคมี'));
  assert.ok(filterRooms('  LAB  ').length > 3);
  assert.deepEqual(filterRooms('lab เคมี').map(roomLabel), ['355 — LAB เคมี']);
});

test('filterRooms: the room that contains the whole query comes first', () => {
  const hits = filterRooms('com 1').map(roomLabel);
  assert.equal(hits[0], '331 — com 1');
  assert.ok(hits.length > 1, 'looser matches (any word order) still appear after it');
});

test('filterRooms: no match gives an empty list', () => {
  assert.deepEqual(filterRooms('zzzzzz'), []);
});

test('findRoomByLabel round-trips; free text and the OTHER sentinel are not rooms', () => {
  for (const r of ROOMS) assert.equal(findRoomByLabel(roomLabel(r)), r);
  assert.equal(findRoomByLabel('ใต้ต้นไม้หน้าอาคาร 1'), undefined);
  assert.equal(findRoomByLabel(''), undefined);
  assert.equal(findRoomByLabel(OTHER), undefined);
});

test('source typos are cleaned: no doubled Thai combining marks in any label', () => {
  const doubled = /([ัิ-ฺ็-๎])\1/;
  for (const r of ROOMS) assert.ok(!doubled.test(roomLabel(r)), 'doubled mark in ' + roomLabel(r));
  assert.ok(findRoomByLabel('243 — ห้องพักครูคณิตฯ'));
});

test('OTHER sentinel is not something a person could pick as a room label', () => {
  assert.ok(OTHER.startsWith('__'));
  assert.ok(!ROOMS.map(roomLabel).includes(OTHER));
});
