/**
 * BEN2 Maintenance — backend (Google Apps Script Web app) — API v2
 *
 *   GET  ?ids=BEN2-1,BEN2-2        -> JSON array: only the tickets whose ids are listed (public)
 *   POST {action:"create", ...}    -> new ticket (public, rate limited)
 *   POST {action:"login", password}-> {status:"success", token}
 *   POST {action:"list", token}    -> {status:"success", tickets:[...all...]}
 *   POST {action:"update", token, ticket_id, status, admin_note}
 *
 * Errors: {status:"error", code, message}
 *   code = unauthorized | rate_limited | invalid | not_found | server
 *
 * ตั้งค่าครั้งแรก (ดู README):
 *   1) Project Settings > Script properties > เพิ่ม ADMIN_PASSWORD = รหัสผ่านของช่าง
 *   2) เลือกฟังก์ชัน setup แล้วกด Run (ระบบสร้าง Google Sheet + โฟลเดอร์รูปให้เอง)
 *   3) Deploy > Web app (Execute as: Me, Who has access: Anyone)
 */

var HEADERS = ['timestamp', 'ticket_id', 'reporter_name', 'equipment_type', 'location',
               'issue_detail', 'image_url', 'status', 'admin_note', 'updated_at'];
var SHEET_NAME = 'Tickets';
var STATUSES = ['รอรับเรื่อง', 'กำลังดำเนินการ', 'เสร็จสิ้น'];

var MAX_SHORT = 200;            // ชื่อ / สถานที่
var MAX_TEXT = 2000;            // อาการ / โน้ต
var MAX_IMAGE_BYTES = 4 * 1024 * 1024;
var MAX_IDS = 50;
var TOKEN_TTL_SEC = 21600;      // CacheService รองรับสูงสุด 6 ชม.
var LOGIN_MAX_FAILS = 5;
var LOGIN_WINDOW_MS = 10 * 60 * 1000;
var CREATE_MAX = 30;
var CREATE_WINDOW_MS = 10 * 60 * 1000;

/* ---------- Setup ---------- */

function setup() {
  var sheet = getSheet_();
  getImageFolder_();
  console.log('Sheet: ' + sheet.getParent().getUrl());
  if (!PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD')) {
    console.log('ยังไม่ได้ตั้ง ADMIN_PASSWORD ใน Script properties — ช่างจะล็อกอินไม่ได้');
  }
}

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  var id = props.getProperty('SHEET_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('BEN2 Maintenance - ใบแจ้งซ่อม');
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getImageFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMAGE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder('BEN2 Maintenance - รูปแจ้งซ่อม');
  props.setProperty('IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

/* ---------- Helpers ---------- */

function nowMs_() { return Date.now(); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function err_(code, message) {
  return { status: 'error', code: code, message: message };
}

function clean_(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || MAX_TEXT);
}

// กันสูตร Google Sheets (=, +, -, @) ที่ผู้ใช้ใส่มา
function safeCell_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ตัวนับแบบหน้าต่างเวลาคงที่ (fixed window) เก็บใน CacheService
function bucketKey_(name, windowMs) {
  return name + '_' + Math.floor(nowMs_() / windowMs);
}

function counterGet_(name, windowMs) {
  return parseInt(CacheService.getScriptCache().get(bucketKey_(name, windowMs)) || '0', 10);
}

function counterInc_(name, windowMs) {
  var cache = CacheService.getScriptCache();
  var key = bucketKey_(name, windowMs);
  var n = parseInt(cache.get(key) || '0', 10) + 1;
  cache.put(key, String(n), Math.ceil((windowMs * 2) / 1000));
  return n;
}

/* ---------- Auth ---------- */

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function login_(d) {
  if (counterGet_('loginfail', LOGIN_WINDOW_MS) >= LOGIN_MAX_FAILS) {
    return err_('rate_limited', 'ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่');
  }
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected || !safeEqual_(d.password == null ? '' : d.password, expected)) {
    counterInc_('loginfail', LOGIN_WINDOW_MS);
    return err_('unauthorized', 'รหัสผ่านไม่ถูกต้อง');
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('tok_' + token, '1', TOKEN_TTL_SEC);
  return { status: 'success', token: token };
}

function tokenOk_(token) {
  return typeof token === 'string' && token.length >= 32 &&
    CacheService.getScriptCache().get('tok_' + token) === '1';
}

/* ---------- HTTP ---------- */

function doGet(e) {
  try {
    var raw = e && e.parameter && e.parameter.ids ? String(e.parameter.ids) : '';
    var ids = raw.split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return /^BEN2-\d{1,6}$/.test(s); })
      .slice(0, MAX_IDS);
    return json_(ids.length ? listTickets_(ids) : []);
  } catch (error) {
    console.error(error);
    return json_(err_('server', 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์'));
  }
}

// แจ้งเตือน (เช่น LINE) ต้องส่งหลังปล่อย lock เพื่อไม่ให้ API ภายนอกที่ช้าไปบล็อกผู้ใช้คนอื่น
var pendingNotices_ = [];

function queueNotice_(fn) {
  pendingNotices_.push(fn);
}

function flushNotices_() {
  var queue = pendingNotices_;
  pendingNotices_ = [];
  queue.forEach(function (fn) {
    try { fn(); } catch (error) { console.error('notify failed: ' + error); }
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = false;
  var out;
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d.action && d.events) {
      // webhook จาก LINE (ใช้หา groupId เท่านั้น ไม่มีผลข้างเคียง)
      out = json_(typeof handleLineWebhook_ === 'function' ? handleLineWebhook_(d) : { status: 'success' });
    } else if (d.action === 'login') {
      out = json_(login_(d));
    } else if (d.action === 'list') {
      out = tokenOk_(d.token)
        ? json_({ status: 'success', tickets: listTickets_(null) })
        : json_(err_('unauthorized', 'กรุณาเข้าสู่ระบบ'));
    } else if (d.action === 'create' || d.action === 'update') {
      if (d.action === 'update' && !tokenOk_(d.token)) {
        out = json_(err_('unauthorized', 'กรุณาเข้าสู่ระบบ'));
      } else {
        lock.waitLock(20000);
        locked = true;
        out = json_(d.action === 'create' ? createTicket_(d) : updateTicket_(d));
      }
    } else {
      out = json_(err_('invalid', 'unknown action'));
    }
  } catch (error) {
    console.error(error);
    out = json_(err_('server', 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์'));
  } finally {
    if (locked) lock.releaseLock();
  }
  flushNotices_();
  return out;
}

/* ---------- Tickets ---------- */

function listTickets_(onlyIds) {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];
  rows.forEach(function (r) {
    if (onlyIds && onlyIds.indexOf(r[1]) === -1) return;
    out.push({
      timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      ticket_id: r[1],
      reporter_name: r[2],
      equipment_type: r[3],
      location: r[4],
      issue_detail: r[5],
      image_url: r[6] || '-',
      status: r[7],
      admin_note: r[8] || '-'
    });
  });
  return out;
}

function findRow_(sheet, ticketId) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === ticketId) return i + 2;
  }
  return -1;
}

function newTicketId_(sheet, wanted) {
  var id = clean_(wanted, 20);
  if (!/^BEN2-\d{1,6}$/.test(id) || findRow_(sheet, id) !== -1) {
    do {
      id = 'BEN2-' + Math.floor(1000 + Math.random() * 9000);
    } while (findRow_(sheet, id) !== -1);
  }
  return id;
}

// คืน '-' ถ้าไม่มีรูป / ไม่ใช่รูป, คืน null ถ้าไฟล์ใหญ่เกินกำหนด
function saveImage_(dataUrl, ticketId) {
  var m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+\/=]+)$/.exec(dataUrl || '');
  if (!m) return '-';
  if (m[2].length > MAX_IMAGE_BYTES * 1.4) return null;
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > MAX_IMAGE_BYTES) return null;
  var ext = m[1].split('/')[1].replace('jpeg', 'jpg');
  var blob = Utilities.newBlob(bytes, m[1], ticketId + '.' + ext);
  var file = getImageFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function createTicket_(d) {
  var name = clean_(d.reporter_name, MAX_SHORT), type = clean_(d.equipment_type, MAX_SHORT),
      place = clean_(d.location, MAX_SHORT), detail = clean_(d.issue_detail, MAX_TEXT);
  if (!name || !type || !place || !detail) return err_('invalid', 'กรอกข้อมูลไม่ครบ');
  if (counterGet_('creates', CREATE_WINDOW_MS) >= CREATE_MAX) {
    return err_('rate_limited', 'มีการแจ้งเข้ามาถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
  }
  var sheet = getSheet_();
  var ticketId = newTicketId_(sheet, d.ticket_id);
  var imageUrl = saveImage_(d.imageBase64, ticketId);
  if (imageUrl === null) return err_('invalid', 'รูปภาพใหญ่เกินไป (สูงสุด 4 MB)');
  counterInc_('creates', CREATE_WINDOW_MS);
  var now = new Date();
  sheet.appendRow([now, ticketId, safeCell_(name), safeCell_(type), safeCell_(place), safeCell_(detail),
                   imageUrl, STATUSES[0], '', now]);

  if (typeof notifyNewTicket === 'function') {
    queueNotice_(function () {
      notifyNewTicket({ ticket_id: ticketId, reporter_name: name, equipment_type: type,
                        location: place, issue_detail: detail }, imageUrl);
    });
  }
  return { status: 'success', ticket_id: ticketId };
}

function updateTicket_(d) {
  var status = clean_(d.status, MAX_SHORT);
  if (STATUSES.indexOf(status) === -1) return err_('invalid', 'สถานะไม่ถูกต้อง');
  var sheet = getSheet_();
  var id = clean_(d.ticket_id, 20);
  var row = findRow_(sheet, id);
  if (row === -1) return err_('not_found', 'ไม่พบรหัสงานนี้');
  var note = clean_(d.admin_note, MAX_TEXT);
  sheet.getRange(row, 8, 1, 3).setValues([[status, safeCell_(note), new Date()]]);

  if (typeof notifyTicketUpdate === 'function') {
    queueNotice_(function () { notifyTicketUpdate({ ticket_id: id, status: status, admin_note: note }); });
  }
  return { status: 'success' };
}
