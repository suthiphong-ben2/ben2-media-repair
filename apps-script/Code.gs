/**
 * ระบบแจ้งซ่อมอุปกรณ์สื่อภายในห้องเรียนและห้องปฏิบัติการ
 * โรงเรียนเบญจมราชรังสฤษฎิ์ ๒
 *
 * ไฟล์นี้ทำหน้าที่เป็น API อย่างเดียว หน้าเว็บอยู่บน GitHub Pages
 * อ่านข้อมูล  : GET  แบบ JSONP (?callback=...&action=...)
 * เขียนข้อมูล : POST เนื้อหาเป็น JSON (Content-Type: text/plain เพื่อเลี่ยง preflight)
 */

const SHEET_ROOMS     = 'Rooms';
const SHEET_TICKETS   = 'Tickets';
const SHEET_TEACHERS  = 'Teachers';
const SHEET_BUILDINGS = 'Buildings';
const SHEET_LOG       = 'Log';

const EQUIPMENT = ['โปรเจคเตอร์', 'จอรับภาพ', 'เครื่องเสียง', 'ลำโพง', 'สายสัญญาณภาพ (HDMI)', 'อื่น ๆ'];
const STATUSES  = ['รอดำเนินการ', 'กำลังดำเนินการ', 'รออะไหล่ / ส่งซ่อมภายนอก', 'เสร็จสิ้น', 'ยกเลิก'];

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function ss() {
  const id = prop('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

// ---------- ทางเข้า ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  const cb = p.callback || '';
  try {
    let data;
    switch (p.action) {
      case 'bootstrap': data = bootstrap_(); break;
      case 'myTickets': data = ticketsByTeacher_(p.teacher || ''); break;
      default: data = { ok: true, message: 'ระบบแจ้งซ่อมอุปกรณ์สื่อ บ.ษ.๒ — API พร้อมใช้งาน' };
    }
    return reply_({ ok: true, data: data }, cb);
  } catch (err) {
    return reply_({ ok: false, error: String(err.message || err) }, cb);
  }
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let data;
    switch (body.action) {
      case 'submit':   data = submitTicket_(body); break;
      case 'listAll':  requirePin_(body.pin); data = ticketsAsObjects_(body.year); break;
      case 'summary':  requirePin_(body.pin); data = getSummary_(body.year); break;
      case 'update':   requirePin_(body.pin); data = updateTicket_(body); break;
      case 'checkPin': requirePin_(body.pin); data = { ok: true }; break;
      case 'adminData':      requirePin_(body.pin); data = adminData_(); break;
      case 'saveRoom':       requirePin_(body.pin); data = saveRoom_(body.room); break;
      case 'deleteRoom':     requirePin_(body.pin); data = deleteRoom_(body.row); break;
      case 'saveBuildings':  requirePin_(body.pin); data = saveGrid_(SHEET_BUILDINGS, body.rows, 4); break;
      case 'saveTeachers':   requirePin_(body.pin); data = saveGrid_(SHEET_TEACHERS, body.rows, 2); break;
      default: throw new Error('ไม่รู้จักคำสั่ง ' + body.action);
    }
    return reply_({ ok: true, data: data }, '');
  } catch (err) {
    return reply_({ ok: false, error: String(err.message || err) }, '');
  }
}

function reply_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function requirePin_(pin) {
  const real = prop('ADMIN_PIN');
  if (!real) throw new Error('ยังไม่ได้ตั้งรหัสผู้ดูแล (ADMIN_PIN) ใน Script Properties');
  if (String(pin || '') !== real) throw new Error('รหัสผู้ดูแลไม่ถูกต้อง');
}

const EQ_ORDER = ['โปรเจคเตอร์', 'จอรับภาพ', 'เครื่องเสียง', 'ลำโพง', 'สายสัญญาณภาพ (HDMI)'];
const EQ_CODE  = { 'ไม่มี': '0', 'มี': '1', 'ชำรุด': '2' };
const CACHE_KEY = 'bootstrap_v2';
const CACHE_TTL = 21600; // 6 ชั่วโมง

// ---------- ข้อมูลตั้งต้นสำหรับหน้าเว็บ ----------
function bootstrap_() {
  const cached = cacheRead_(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const data = {
    rooms: compactRooms_(),
    teachers: getTeachers_(),
    buildings: getBuildings_(),
    equipment: EQUIPMENT,
    eqOrder: EQ_ORDER,
    statuses: STATUSES,
    years: listYears_(),
    currentYear: academicYear_()
  };
  cacheWrite_(CACHE_KEY, JSON.stringify(data));
  return data;
}

/**
 * แคชของ Apps Script เก็บได้คีย์ละ 100KB จึงต้องหั่นเป็นท่อน
 * เรียก clearCache() เมื่อข้อมูลเปลี่ยน ระบบทำให้อัตโนมัติอยู่แล้วทุกครั้งที่มีการบันทึก
 */
function cacheRead_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const n = parseInt(cache.get(key + ':n'), 10);
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + ':' + i);
    const parts = cache.getAll(keys);
    let out = '';
    for (let i = 0; i < n; i++) {
      const chunk = parts[key + ':' + i];
      if (chunk === undefined || chunk === null) return null; // ท่อนใดหายถือว่าแคชใช้ไม่ได้
      out += chunk;
    }
    return out;
  } catch (err) {
    return null;
  }
}

function cacheWrite_(key, text) {
  try {
    const cache = CacheService.getScriptCache();
    const SIZE = 90000;
    const map = {};
    let n = 0;
    for (let i = 0; i < text.length; i += SIZE) {
      map[key + ':' + n] = text.substring(i, i + SIZE);
      n++;
    }
    map[key + ':n'] = String(n);
    cache.putAll(map, CACHE_TTL);
  } catch (err) {
    console.error('cache write failed: ' + err);
  }
}

/**
 * ย่อข้อมูลห้องก่อนส่งออก สถานะอุปกรณ์ 5 ชิ้นรวมเป็นสตริงเดียว เช่น "11201"
 * เรียงตาม EQ_ORDER และช่องที่ว่างจะไม่ถูกส่งไปเลย ช่วยให้หน้าเว็บโหลดเร็วขึ้นมาก
 */
function compactRooms_() {
  return getRooms_().map(r => {
    const o = { code: r.code, name: r.name, building: r.building };
    o.eq = EQ_ORDER.map(k => EQ_CODE[r.has[k]] || '0').join('');
    if (r.program) o.program = r.program;
    if (r.caretakers && r.caretakers.length) o.caretakers = r.caretakers;
    return o;
  });
}

function clearCache() {
  try {
    const cache = CacheService.getScriptCache();
    const n = parseInt(cache.get(CACHE_KEY + ':n'), 10) || 0;
    const keys = [CACHE_KEY + ':n'];
    for (let i = 0; i < n; i++) keys.push(CACHE_KEY + ':' + i);
    cache.removeAll(keys);
  } catch (err) {
    console.error('cache clear failed: ' + err);
  }
}

/** ปีการศึกษาทั้งหมดที่มีใบแจ้งซ่อม เรียงจากใหม่ไปเก่า */
function listYears_() {
  const sh = ss().getSheetByName(SHEET_TICKETS);
  const years = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues().flat()
      .forEach(v => { if (v) years[String(v).trim()] = true; });
  }
  years[String(academicYear_())] = true;
  return Object.keys(years).sort().reverse();
}

/** หนึ่งแถวต่อครูหนึ่งคน อาคารเดียวกันมีได้หลายแถว ระบบจะรวมให้เอง */
function getBuildings_() {
  const sh = ss().getSheetByName(SHEET_BUILDINGS);
  if (!sh || sh.getLastRow() < 2) return [];

  const order = [];
  const map = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(r => {
    const code = String(r[0]).trim();
    if (!code) return;
    if (!map[code]) { map[code] = { code: code, name: '', caretakers: [] }; order.push(code); }
    const name = String(r[1] || '').trim();
    if (name && !map[code].name) map[code].name = name;
    const care = String(r[2] || '').trim();
    if (care) map[code].caretakers.push({ name: care, photo: photoUrl_(r[3]) });
  });
  return order.map(c => map[c]);
}

function caretakersOf_(buildingCode) {
  const b = getBuildings_().filter(x => x.code === String(buildingCode).trim())[0];
  return b ? b.caretakers : [];
}

/** จับคู่ชื่อกับรูปที่คั่นด้วยจุลภาคตามลำดับ เช่น "ครูก, ครูข" คู่กับ "a.jpg, b.jpg" */
function pairPeople_(namesRaw, photosRaw) {
  const names = String(namesRaw || '').split(',').map(s => s.trim()).filter(String);
  const photos = String(photosRaw || '').split(',').map(s => s.trim());
  return names.map((n, i) => ({ name: n, photo: photoUrl_(photos[i] || '') }));
}

/**
 * รับได้ทั้งลิงก์ Google Drive, ลิงก์รูปทั่วไป และชื่อไฟล์ที่วางไว้ในโฟลเดอร์ photos ของ repo
 * ลิงก์ Drive จะถูกแปลงเป็นรูปแบบ thumbnail ที่ฝังในหน้าเว็บได้
 */
function photoUrl_(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const m = v.match(/[-\w]{25,}/);
  if (v.indexOf('drive.google.com') !== -1 && m) {
    return 'https://drive.google.com/thumbnail?id=' + m[0] + '&sz=w300';
  }
  if (/^https?:\/\//.test(v)) return v;
  return 'photos/' + v;
}

/** ชื่อผู้ดูแลอาคารทั้งหมดในรูปข้อความ เช่น "ครูก, ครูข" */
function caretakerNamesOf_(buildingCode) {
  return caretakersOf_(buildingCode).map(c => c.name).join(', ');
}

function buildingNameOf_(buildingCode) {
  const b = getBuildings_().filter(x => x.code === String(buildingCode).trim())[0];
  return b ? (b.name || b.code) : String(buildingCode || '');
}

function getRooms_() {
  const sh = ss().getSheetByName(SHEET_ROOMS);
  const values = sh.getDataRange().getValues();
  const head = values.shift().map(h => String(h).trim());
  const at = name => head.indexOf(name);

  return values
    .filter(r => String(r[at('room_code')] || r[at('room_name')]).trim() !== '')
    .filter(r => String(r[at('active')]).trim() !== 'ปิดใช้งาน')
    .map(r => ({
      code: String(r[at('room_code')] || '').trim(),
      name: String(r[at('room_name')] || '').trim(),
      building: String(r[at('building')] || '').trim(),
      program: at('program') >= 0 ? String(r[at('program')] || '').trim() : '',
      caretakers: pairPeople_(
        at('room_caretaker') >= 0 ? r[at('room_caretaker')] : '',
        at('room_caretaker_photo') >= 0 ? r[at('room_caretaker_photo')] : ''
      ),
      has: {
        'โปรเจคเตอร์': r[at('projector')],
        'จอรับภาพ': r[at('screen')],
        'เครื่องเสียง': r[at('amplifier')],
        'ลำโพง': r[at('speaker')],
        'สายสัญญาณภาพ (HDMI)': r[at('hdmi')]
      }
    }));
}

function getTeachers_() {
  const sh = ss().getSheetByName(SHEET_TEACHERS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .map(r => ({ name: String(r[0]).trim(), group: String(r[1] || '').trim() }))
    .filter(t => t.name);
}

// ---------- แจ้งซ่อม ----------
function submitTicket_(p) {
  if (!String(p.reporterName || '').trim()) throw new Error('กรุณาเลือกชื่อผู้แจ้ง');
  if (!p.roomCode && !p.roomName) throw new Error('กรุณาเลือกห้อง');
  if (!p.items || !p.items.length) throw new Error('กรุณาเลือกอุปกรณ์ที่ต้องการแจ้ง');
  if (!String(p.detail || '').trim()) throw new Error('กรุณาอธิบายอาการเสีย');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss().getSheetByName(SHEET_TICKETS);
    const id = nextTicketId_(sh);
    const now = new Date();
    const photoUrl = (p.photo && p.photo.data) ? savePhoto_(id, p.photo) : '';

    // อ่านข้อมูลห้องจากทะเบียนจริง ไม่เชื่อค่าที่ส่งมาจากหน้าเว็บ
    const room = getRooms_().filter(r => r.code === String(p.roomCode).trim() &&
                                         r.name === String(p.roomName).trim())[0];
    const building = room ? room.building : String(p.building || '').trim();
    const buildingCares = caretakersOf_(building);
    const roomCares = room ? room.caretakers : [];
    const program = room ? room.program : '';
    const owners = roomCares.length ? roomCares : buildingCares;
    const owner = owners.map(c => c.name).join(', ');

    sh.appendRow([
      id, now, academicYear_(),
      p.roomCode || '', p.roomName || '',
      p.items.join(', '),
      p.severity || '',
      String(p.detail).trim(),
      photoUrl,
      String(p.reporterName).trim(),
      String(p.phone || '').trim(),
      'รอดำเนินการ',
      owner, '', now, '',
      building
    ]);

    markRoomBroken_(p.roomCode, p.items);
    clearCache();
    logChange_(id, p.reporterName, 'แจ้งซ่อมใหม่', 'รอดำเนินการ' + (owner ? ' — ผู้รับผิดชอบ ' + owner : ''));
    notifyLine_(buildNewTicketMessage_(id, p, now, building, buildingCares, roomCares, program));
    return { id: id, caretaker: owner, program: program };
  } finally {
    lock.releaseLock();
  }
}

function nextTicketId_(sh) {
  const last = sh.getLastRow();
  const year = academicYear_();
  let running = 0;
  if (last > 1) {
    sh.getRange(2, 1, last - 1, 1).getValues().flat().map(String).forEach(v => {
      const m = v.match(/^RP(\d{4})-(\d+)$/);
      if (m && m[1] === String(year)) running = Math.max(running, parseInt(m[2], 10));
    });
  }
  return 'RP' + year + '-' + Utilities.formatString('%04d', running + 1);
}

/** ปีการศึกษาไทย: เดือน พ.ค.–มี.ค. นับเป็นปีการศึกษาเดียวกัน */
function academicYear_() {
  const d = new Date();
  const be = d.getFullYear() + 543;
  return (d.getMonth() + 1) < 5 ? be - 1 : be;
}

function savePhoto_(ticketId, photo) {
  const folderId = prop('DRIVE_FOLDER_ID');
  if (!folderId) return '';
  const blob = Utilities.newBlob(
    Utilities.base64Decode(photo.data),
    photo.mimeType || 'image/jpeg',
    ticketId + '-' + (photo.name || 'photo.jpg')
  );
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

const EQUIP_COL = {
  'โปรเจคเตอร์': 'projector', 'จอรับภาพ': 'screen', 'เครื่องเสียง': 'amplifier',
  'ลำโพง': 'speaker', 'สายสัญญาณภาพ (HDMI)': 'hdmi'
};

function setRoomEquip_(roomCode, items, value) {
  if (!roomCode) return;
  const sh = ss().getSheetByName(SHEET_ROOMS);
  const values = sh.getDataRange().getValues();
  const head = values[0].map(h => String(h).trim());
  const codeCol = head.indexOf('room_code');
  const row = values.findIndex((r, i) => i > 0 && String(r[codeCol]).trim() === String(roomCode).trim());
  if (row < 1) return;
  items.forEach(it => {
    const col = head.indexOf(EQUIP_COL[String(it).trim()]);
    if (col >= 0) sh.getRange(row + 1, col + 1).setValue(value);
  });
}

function markRoomBroken_(roomCode, items) { setRoomEquip_(roomCode, items, 'ชำรุด'); }

// ---------- อ่านรายการแจ้งซ่อม ----------
function ticketsAsObjects_(year) {
  const sh = ss().getSheetByName(SHEET_TICKETS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  const filter = String(year || '').trim();

  return sh.getRange(2, 1, last - 1, 17).getValues().map((r, i) => ({
    row: i + 2,
    id: r[0],
    reportedAt: r[1] ? Utilities.formatDate(new Date(r[1]), tz, 'd/M/yyyy HH:mm') : '',
    ts: r[1] ? new Date(r[1]).getTime() : 0,
    year: String(r[2] || '').trim(),
    roomCode: r[3], roomName: r[4], items: r[5], severity: r[6],
    detail: r[7], photoUrl: r[8],
    reporterName: r[9], phone: r[10],
    status: r[11], assignee: r[12], note: r[13],
    updatedAt: r[14] ? Utilities.formatDate(new Date(r[14]), tz, 'd/M/yyyy HH:mm') : '',
    closedAt: r[15] ? Utilities.formatDate(new Date(r[15]), tz, 'd/M/yyyy') : '',
    building: String(r[16] || '').trim()
  }))
  .filter(t => !filter || t.year === filter)
  .sort((a, b) => b.ts - a.ts);
}

function ticketsByTeacher_(name) {
  const key = String(name).trim();
  if (!key) return [];
  return ticketsAsObjects_().filter(t => String(t.reporterName).trim() === key);
}

function getSummary_(year) {
  const all = ticketsAsObjects_(year);
  const byStatus = {};
  STATUSES.forEach(s => byStatus[s] = 0);
  const byRoom = {};
  const openByBuilding = {};
  all.forEach(t => {
    if (byStatus[t.status] !== undefined) byStatus[t.status]++;
    const k = t.roomCode || t.roomName;
    byRoom[k] = (byRoom[k] || 0) + 1;
    if (t.status !== 'เสร็จสิ้น' && t.status !== 'ยกเลิก' && t.building) {
      openByBuilding[t.building] = (openByBuilding[t.building] || 0) + 1;
    }
  });
  return {
    total: all.length,
    open: all.filter(t => t.status !== 'เสร็จสิ้น' && t.status !== 'ยกเลิก').length,
    byStatus: byStatus,
    openByBuilding: Object.keys(openByBuilding).sort()
      .map(k => ({ building: k, name: buildingNameOf_(k), caretaker: caretakerNamesOf_(k), count: openByBuilding[k] })),
    topRooms: Object.keys(byRoom).map(k => ({ room: k, count: byRoom[k] }))
                    .sort((a, b) => b.count - a.count).slice(0, 5)
  };
}

// ---------- ผู้ดูแลอัปเดตงาน ----------
function updateTicket_(p) {
  if (STATUSES.indexOf(p.status) === -1) throw new Error('สถานะไม่ถูกต้อง');
  const sh = ss().getSheetByName(SHEET_TICKETS);
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat().map(String);
  const i = ids.indexOf(String(p.id));
  if (i === -1) throw new Error('ไม่พบเลขที่งาน ' + p.id);
  const row = i + 2;

  sh.getRange(row, 12).setValue(p.status);
  sh.getRange(row, 13).setValue(p.assignee || '');
  sh.getRange(row, 14).setValue(p.note || '');
  sh.getRange(row, 15).setValue(new Date());

  const t = sh.getRange(row, 1, 1, 17).getValues()[0];
  if (p.status === 'เสร็จสิ้น') {
    sh.getRange(row, 16).setValue(new Date());
    setRoomEquip_(t[3], String(t[5]).split(','), 'มี');
    clearCache();
  }

  logChange_(p.id, p.assignee || 'ผู้ดูแล', 'อัปเดตสถานะ', p.status + (p.note ? ' — ' + p.note : ''));
  notifyLine_('อัปเดตงาน ' + p.id + '\nห้อง ' + t[3] + ' ' + t[4] +
              '\nสถานะ: ' + p.status + (p.note ? '\nบันทึก: ' + p.note : ''));
  return { ok: true };
}

function logChange_(id, actor, action, detail) {
  const sh = ss().getSheetByName(SHEET_LOG);
  if (sh) sh.appendRow([new Date(), id, actor, action, detail]);
}

// ---------- แจ้งเตือน LINE ----------
function buildNewTicketMessage_(id, p, now, building, buildingCares, roomCares, program) {
  const tz = Session.getScriptTimeZone();
  const names = list => list.map(c => c.name).join(', ');
  const lines = [
    'แจ้งซ่อมใหม่ ' + id,
    (building ? buildingNameOf_(building) + ' — ' : '') + 'ห้อง ' + (p.roomCode || '-') + ' ' + (p.roomName || '') +
      (program ? ' [' + program + ']' : ''),
    'อุปกรณ์: ' + p.items.join(', '),
    'อาการ: ' + p.detail,
    'ความเร่งด่วน: ' + (p.severity || '-'),
    'ผู้แจ้ง: ' + p.reporterName + (p.phone ? ' (' + p.phone + ')' : '')
  ];

  if (roomCares.length) {
    lines.push('ผู้ดูแลห้องนี้: ' + names(roomCares));
    if (buildingCares.length) lines.push('ผู้ดูแลอาคาร: ' + names(buildingCares));
  } else if (buildingCares.length) {
    lines.push('ผู้ดูแลอาคาร: ' + names(buildingCares));
  } else {
    lines.push('ยังไม่ได้กำหนดผู้ดูแลของห้องนี้');
  }

  lines.push('เวลา: ' + Utilities.formatDate(now, tz, 'd/M/yyyy HH:mm'));
  return lines.join('\n');
}

function notifyLine_(text) {
  const token = prop('LINE_CHANNEL_ACCESS_TOKEN');
  const target = prop('LINE_TARGET_ID');
  if (!token) return;
  const url = target ? 'https://api.line.me/v2/bot/message/push'
                     : 'https://api.line.me/v2/bot/message/broadcast';
  const body = { messages: [{ type: 'text', text: text.substring(0, 4900) }] };
  if (target) body.to = target;
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.error('LINE push failed: ' + err);
  }
}

/** รันครั้งเดียวเพื่อทดสอบว่าตั้งค่า LINE ถูกต้อง */
function testLine() {
  notifyLine_('ทดสอบการแจ้งเตือนจากระบบแจ้งซ่อมอุปกรณ์สื่อ บ.ษ.๒');
}

/** สรุปงานค้างส่งเข้า LINE (ตั้ง Trigger รายสัปดาห์) */
function weeklyDigest() {
  const open = ticketsAsObjects_().filter(t => t.status === 'รอดำเนินการ' || t.status === 'กำลังดำเนินการ');
  if (!open.length) return notifyLine_('สรุปงานซ่อมประจำสัปดาห์: ไม่มีงานค้าง');

  const groups = {};
  open.forEach(t => {
    const key = t.building || 'ไม่ระบุอาคาร';
    (groups[key] = groups[key] || []).push(t);
  });

  const parts = ['สรุปงานซ่อมค้าง ' + open.length + ' รายการ'];
  Object.keys(groups).sort().forEach(k => {
    const care = caretakerNamesOf_(k);
    parts.push('\n' + buildingNameOf_(k) + (care ? ' (' + care + ')' : ''));
    groups[k].slice(0, 10).forEach(t => {
      parts.push('• ' + t.id + ' ห้อง ' + t.roomCode + ' — ' + t.items + ' (' + t.status + ')');
    });
  });
  notifyLine_(parts.join('\n'));
}
