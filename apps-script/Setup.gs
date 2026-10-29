/**
 * ฟังก์ชันติดตั้งครั้งเดียว — รันจากเมนู "ระบบแจ้งซ่อม" บนแถบเครื่องมือของ Google Sheet
 * ลำดับ: 1) setupSheets()  2) importRoomsFromOldSheet()  3) กรอกรายชื่อครูในชีต Teachers
 */

function setupSheets() {
  const book = ss();

  const rooms = book.getSheetByName(SHEET_ROOMS) || book.insertSheet(SHEET_ROOMS);
  if (rooms.getLastRow() === 0) {
    rooms.appendRow(['room_code', 'room_name', 'building', 'projector', 'screen', 'amplifier', 'speaker', 'hdmi',
                     'program', 'room_caretaker', 'room_caretaker_photo', 'active']);
  }

  const tickets = book.getSheetByName(SHEET_TICKETS) || book.insertSheet(SHEET_TICKETS);
  if (tickets.getLastRow() === 0) {
    tickets.appendRow([
      'เลขที่งาน', 'วันเวลาที่แจ้ง', 'ปีการศึกษา', 'เลขห้อง', 'ชื่อห้อง', 'อุปกรณ์', 'ความเร่งด่วน',
      'อาการ / รายละเอียด', 'ลิงก์รูปภาพ', 'ชื่อผู้แจ้ง', 'เบอร์ติดต่อ',
      'สถานะ', 'ผู้รับผิดชอบ', 'บันทึกการซ่อม', 'อัปเดตล่าสุด', 'วันที่ปิดงาน', 'อาคาร'
    ]);
  }

  const buildings = book.getSheetByName(SHEET_BUILDINGS) || book.insertSheet(SHEET_BUILDINGS);
  if (buildings.getLastRow() === 0) {
    buildings.appendRow(['รหัสอาคาร', 'ชื่ออาคาร', 'ครูผู้ดูแลอาคาร', 'รูปผู้ดูแล']);
    buildings.getRange(2, 1, 4, 4).setValues([
      ['1', 'อาคาร 1', '', ''],
      ['2', 'อาคาร 2', '', ''],
      ['3', 'อาคาร 3', '', ''],
      ['4', 'อาคาร 4', '', '']
    ]);
  }

  const teachers = book.getSheetByName(SHEET_TEACHERS) || book.insertSheet(SHEET_TEACHERS);
  if (teachers.getLastRow() === 0) {
    teachers.appendRow(['ชื่อ-สกุล', 'กลุ่มสาระ / ฝ่าย']);
    teachers.appendRow(['ครูสุทธิพงษ์ สุขสร้อย', 'วิทยาศาสตร์และเทคโนโลยี']);
  }

  const log = book.getSheetByName(SHEET_LOG) || book.insertSheet(SHEET_LOG);
  if (log.getLastRow() === 0) {
    log.appendRow(['เวลา', 'เลขที่งาน', 'ผู้ดำเนินการ', 'การกระทำ', 'รายละเอียด']);
  }

  [rooms, tickets, teachers, buildings, log].forEach(sh => {
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#E8EDEB');
    sh.setFrozenRows(1);
  });

  SpreadsheetApp.getUi().alert('สร้างชีตเรียบร้อย\nขั้นต่อไป: กด "2. นำเข้าทะเบียนห้อง" แล้วกรอกรายชื่อครูในชีต Teachers และชื่อครูผู้ดูแลแต่ละอาคารในชีต Buildings');
}

/**
 * ดึงทะเบียนห้องจากชีตสำรวจเดิมมาลงชีต Rooms
 * โครงสร้างชีตเดิม: A=เลขห้อง B=ชื่อห้อง C=โปรเจคเตอร์ D=จอ E=เครื่องเสียง F=ลำโพง G=HDMI เริ่มแถวที่ 5
 */
function importRoomsFromOldSheet() {
  const SOURCE = 'แบบแจ้งซ่อมแซมอุปกรณ์สื่อ1/2569';
  const START_ROW = 5;

  const src = ss().getSheetByName(SOURCE);
  if (!src) throw new Error('ไม่พบชีตชื่อ ' + SOURCE + ' — แก้ชื่อในตัวแปร SOURCE ให้ตรงก่อน');

  const rows = src.getRange(START_ROW, 1, src.getLastRow() - START_ROW + 1, 7).getValues();
  const norm = v => {
    const s = String(v || '').trim();
    return (s === 'มี' || s === 'ชำรุด') ? s : 'ไม่มี';
  };

  // เก็บค่าที่ครูกรอกเองไว้ก่อน (โครงการ / ผู้ดูแลรายห้อง) เพื่อไม่ให้การนำเข้าซ้ำลบทิ้ง
  const dest = ss().getSheetByName(SHEET_ROOMS);
  const keep = {};
  if (dest.getLastRow() > 1) {
    dest.getRange(2, 1, dest.getLastRow() - 1, 12).getValues().forEach(r => {
      const key = String(r[0]).trim() + '|' + String(r[1]).trim();
      keep[key] = { program: r[8] || '', caretaker: r[9] || '', photo: r[10] || '', active: r[11] || 'ใช้งาน' };
    });
  }

  const out = [];
  rows.forEach(r => {
    const code = String(r[0] || '').trim();
    const name = String(r[1] || '').trim();
    if (!code && !name) return;
    const old = keep[code + '|' + name] || { program: '', caretaker: '', photo: '', active: 'ใช้งาน' };
    out.push([code, name, buildingFromCode_(code),
              norm(r[2]), norm(r[3]), norm(r[4]), norm(r[5]), norm(r[6]),
              old.program, old.caretaker, old.photo, old.active]);
  });

  if (dest.getLastRow() > 1) dest.getRange(2, 1, dest.getLastRow() - 1, 12).clearContent();
  dest.getRange(2, 1, out.length, 12).setValues(out);

  clearCache();
  SpreadsheetApp.getUi().alert('นำเข้าห้องแล้ว ' + out.length + ' ห้อง (ข้อมูลโครงการ ผู้ดูแลรายห้อง และรูปที่กรอกไว้ยังอยู่ครบ)');
}

/** เลขห้องหลักแรกคือรหัสอาคาร เช่น 234 อยู่อาคาร 2 — ห้องที่เลขไม่เข้าเกณฑ์ให้กรอกรหัสอาคารเองในชีต Rooms */
function buildingFromCode_(code) {
  const c = String(code).trim();
  return /^\d{3}$/.test(c) ? c[0] : '';
}

/**
 * ปิดปีการศึกษา — เก็บภาพนิ่งทะเบียนห้อง ณ วันนี้ไว้เป็นชีต Rooms_25xx
 * ทะเบียนห้องตัวปัจจุบัน (Rooms) ยังใช้ต่อในปีถัดไปได้เลย ไม่ถูกล้าง
 * ใบแจ้งซ่อมไม่ต้องแยกชีต เพราะมีคอลัมน์ปีการศึกษากำกับอยู่แล้ว
 */
function closeAcademicYear() {
  const ui = SpreadsheetApp.getUi();
  const year = academicYear_();
  const name = 'Rooms_' + year;
  const book = ss();

  if (book.getSheetByName(name)) {
    ui.alert('มีชีต ' + name + ' อยู่แล้ว หากต้องการเก็บใหม่ให้ลบหรือเปลี่ยนชื่อชีตเดิมก่อน');
    return;
  }

  const answer = ui.alert(
    'ปิดปีการศึกษา ' + year,
    'ระบบจะคัดลอกทะเบียนห้องปัจจุบันไปเก็บไว้เป็นชีต ' + name +
    '\nทะเบียนห้องตัวใช้งานจริงยังอยู่เหมือนเดิม ปีหน้าแก้ต่อได้เลย\n\nดำเนินการต่อหรือไม่',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  const snap = book.getSheetByName(SHEET_ROOMS).copyTo(book).setName(name);
  snap.getRange(1, 1, 1, snap.getLastColumn()).setBackground('#D9D9D9');
  book.setActiveSheet(snap);

  const count = ticketsAsObjects_(String(year)).length;
  ui.alert('เก็บทะเบียนห้องปีการศึกษา ' + year + ' เรียบร้อย\n' +
           'ปีนี้มีใบแจ้งซ่อมทั้งหมด ' + count + ' รายการ ดูย้อนหลังได้จากตัวกรองปีในหน้าผู้ดูแล');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ระบบแจ้งซ่อม')
    .addItem('1. สร้างชีตของระบบ', 'setupSheets')
    .addItem('2. นำเข้าทะเบียนห้อง', 'importRoomsFromOldSheet')
    .addSeparator()
    .addItem('ปิดปีการศึกษา (เก็บภาพนิ่งทะเบียนห้อง)', 'closeAcademicYear')
    .addSeparator()
    .addItem('ล้างแคช (ใช้เมื่อแก้ชีตเองแล้วหน้าเว็บยังไม่เปลี่ยน)', 'clearCache')
    .addSeparator()
    .addItem('ทดสอบแจ้งเตือน LINE', 'testLine')
    .addItem('ส่งสรุปงานค้างเข้า LINE', 'weeklyDigest')
    .addToUi();
}
