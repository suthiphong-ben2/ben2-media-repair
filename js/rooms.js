// Room picker logic (pure, no DOM). The data itself lives in rooms-data.js.
import { ROOMS_DATA } from './rooms-data.js';

/** Value of the "other place, type it yourself" option. Never a real room label. */
export const OTHER = '__other__';

export const ROOMS = ROOMS_DATA.map(([code, name, building]) => ({ code, name, building }));

/** What is shown in the list and saved with the ticket: "121 — ห้องแนะแนว". */
export function roomLabel(room) {
  if (room.code && room.name) return room.code + ' — ' + room.name;
  return room.code || room.name;
}

const byLabel = new Map(ROOMS.map((r) => [roomLabel(r), r]));

export function findRoomByLabel(label) {
  return byLabel.get(label);
}

/**
 * Case-insensitive; every space-separated word must appear in the label. Empty query = all rooms.
 * Rooms whose label contains the whole query as typed are listed first, the rest keep list order.
 */
export function filterRooms(query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return ROOMS;
  const whole = words.join(' ');
  const hits = ROOMS.filter((r) => {
    const text = roomLabel(r).toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const best = hits.filter((r) => roomLabel(r).toLowerCase().includes(whole));
  return [...best, ...hits.filter((r) => !best.includes(r))];
}
