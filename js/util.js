// Pure helpers and static data (no DOM access, so they can be unit tested in Node).

export const EQUIPMENT = [
  { value: 'โปรเจคเตอร์', label: 'โปรเจคเตอร์', icon: 'fa-video' },
  { value: 'คอมพิวเตอร์', label: 'คอมพิวเตอร์', icon: 'fa-desktop' },
  { value: 'โทรทัศน์', label: 'โทรทัศน์ / สมาร์ทบอร์ด', icon: 'fa-tv' },
  { value: 'เครื่องเสียง', label: 'เครื่องเสียง / ไมค์', icon: 'fa-volume-high' },
  { value: 'ระบบเครือข่าย', label: 'อินเทอร์เน็ต / Wi-Fi', icon: 'fa-wifi' },
  { value: 'อื่นๆ', label: 'อื่น ๆ', icon: 'fa-screwdriver-wrench' },
];

export const STATUSES = ['รอรับเรื่อง', 'กำลังดำเนินการ', 'เสร็จสิ้น'];

const STATUS_META = {
  'รอรับเรื่อง': { key: 'pending', icon: 'fa-clock', label: 'รอรับเรื่อง' },
  'กำลังดำเนินการ': { key: 'progress', icon: 'fa-gear', label: 'กำลังดำเนินการ' },
  'เสร็จสิ้น': { key: 'done', icon: 'fa-circle-check', label: 'เสร็จสิ้น' },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META['รอรับเรื่อง'];
}

const COMMON_CHIPS = ['เปิดไม่ติด', 'ไม่มีภาพ', 'ไม่มีเสียง', 'ค้าง / ช้า', 'ต่อสายไม่ได้'];
const NETWORK_CHIPS = ['เชื่อมต่อไม่ได้', 'สัญญาณช้า / หลุดบ่อย'];

export function chipsFor(equipmentType) {
  return equipmentType === 'ระบบเครือข่าย' ? NETWORK_CHIPS : COMMON_CHIPS;
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const sec = Math.floor((now - t) / 1000);
  if (sec < 60) return 'เมื่อสักครู่';
  if (sec < 3600) return Math.floor(sec / 60) + ' นาทีที่แล้ว';
  if (sec < 86400) return Math.floor(sec / 3600) + ' ชม. ที่แล้ว';
  return Math.floor(sec / 86400) + ' วันที่แล้ว';
}

// Ticket photos are Google Drive links; anything else is never put into an <img>/<a>.
export function safeImageUrl(url) {
  return typeof url === 'string' && /^https:\/\/drive\.google\.com\/[^\s"'<>]*$/.test(url) ? url : '';
}

export function appendChip(text, chip) {
  const t = String(text || '').trim();
  if (!t) return chip;
  if (t.includes(chip)) return t;
  return t + (t.endsWith(',') ? ' ' : ', ') + chip;
}
