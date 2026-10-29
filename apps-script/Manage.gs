/**
 * หลังบ้านของหน้าจัดการข้อมูล (manage.html)
 * ทุกคำสั่งในไฟล์นี้ผ่านการตรวจรหัสผู้ดูแลมาแล้วจาก doPost ใน Code.gs
 */

const ROOM_COLS = 12; // room_code ถึง active

/** ข้อมูลทั้งหมดที่หน้าจัดการต้องใช้ */
function adminData_() {
  return {
    rooms: rawRooms_(),
    buildings: rawGrid_(SHEET_BUILDINGS, 4),
    teachers: rawGrid_(SHEET_TEACHERS, 2),
    equipment: EQUIPMENT
  };
}

/** อ่านห้องทั้งหมดรวมห้องที่ปิดใช้งาน พร้อมเลขแถวไว้อ้างตอนบันทึก */
function rawRooms_() {
  const sh = ss().getSheetByName(SHEET_ROOMS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ROOM_COLS).getValues()
    .map((r, i) => ({
      row: i + 2,
      code: String(r[0] || '').trim(),
      name: String(r[1] || '').trim(),
      building: String(r[2] || '').trim(),
      projector: String(r[3] || 'ไม่มี').trim(),
      screen: String(r[4] || 'ไม่มี').trim(),
      amplifier: String(r[5] || 'ไม่มี').trim(),
      speaker: String(r[6] || 'ไม่มี').trim(),
      hdmi: String(r[7] || 'ไม่มี').trim(),
      program: String(r[8] || '').trim(),
      caretaker: String(r[9] || '').trim(),
      photo: String(r[10] || '').trim(),
      active: String(r[11] || 'ใช้งาน').trim()
    }))
    .filter(r => r.code || r.name);
}

/** อ่านชีตแบบตารางดิบ ใช้กับ Buildings และ Teachers */
function rawGrid_(sheetName, cols) {
  const sh = ss().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues()
    .map(r => r.map(v => String(v || '').trim()))
    .filter(r => r.join('').length > 0);
}

/** เขียนทับทั้งตาราง (ไม่แตะหัวตาราง) ใช้กับ Buildings และ Teachers */
function saveGrid_(sheetName, rows, cols) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss().getSheetByName(sheetName);
    if (!sh) throw new Error('ไม่พบชีต ' + sheetName);

    const clean = (rows || [])
      .map(r => {
        const out = [];
        for (let i = 0; i < cols; i++) out.push(String((r && r[i]) || '').trim());
        return out;
      })
      .filter(r => r.join('').length > 0);

    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, cols).clearContent();
    if (clean.length) sh.getRange(2, 1, clean.length, cols).setValues(clean);
    clearCache();
    return { count: clean.length };
  } finally {
    lock.releaseLock();
  }
}

/** บันทึกห้องเดียว ถ้าไม่มีเลขแถวคือเพิ่มห้องใหม่ */
function saveRoom_(r) {
  if (!r) throw new Error('ไม่มีข้อมูลห้อง');
  if (!String(r.code || '').trim() && !String(r.name || '').trim()) {
    throw new Error('ต้องมีเลขห้องหรือชื่อห้องอย่างน้อยหนึ่งอย่าง');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss().getSheetByName(SHEET_ROOMS);
    const values = [
      String(r.code || '').trim(),
      String(r.name || '').trim(),
      String(r.building || '').trim(),
      String(r.projector || 'ไม่มี'),
      String(r.screen || 'ไม่มี'),
      String(r.amplifier || 'ไม่มี'),
      String(r.speaker || 'ไม่มี'),
      String(r.hdmi || 'ไม่มี'),
      String(r.program || '').trim(),
      String(r.caretaker || '').trim(),
      String(r.photo || '').trim(),
      String(r.active || 'ใช้งาน')
    ];

    let row = parseInt(r.row, 10);
    if (row && row >= 2 && row <= sh.getLastRow()) {
      sh.getRange(row, 1, 1, ROOM_COLS).setValues([values]);
    } else {
      sh.appendRow(values);
      row = sh.getLastRow();
    }
    clearCache();
    return { row: row };
  } finally {
    lock.releaseLock();
  }
}

function deleteRoom_(row) {
  const n = parseInt(row, 10);
  const sh = ss().getSheetByName(SHEET_ROOMS);
  if (!n || n < 2 || n > sh.getLastRow()) throw new Error('ไม่พบแถวที่ต้องการลบ');
  sh.deleteRow(n);
  clearCache();
  return { ok: true };
}
