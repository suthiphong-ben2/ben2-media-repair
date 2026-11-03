/**
 * แจ้งเตือนเข้า LINE กลุ่ม ผ่าน LINE Messaging API (push message)
 * (LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2025 จึงต้องใช้ Messaging API แทน)
 *
 * วางไฟล์นี้ในโปรเจกต์ Apps Script เดียวกับ Code.gs — Code.gs เรียก notifyNewTicket /
 * notifyTicketUpdate ให้เองหลังปล่อย lock แล้ว ถ้าไม่ได้ตั้งค่าไว้ระบบแจ้งซ่อมก็ทำงานปกติ ไม่ส่งอะไร
 *
 * Script properties (Project Settings > Script properties):
 *   LINE_CHANNEL_TOKEN   Channel access token (long-lived) ของ LINE Official Account   (จำเป็น)
 *   LINE_GROUP_ID        groupId ของกลุ่มช่าง ขึ้นต้นด้วย C (หาได้ตาม README)            (จำเป็น)
 *   LINE_NOTIFY_UPDATES  'true' = แจ้งเมื่อช่างเปลี่ยนสถานะด้วย (ค่าเริ่มต้น: ไม่แจ้ง)
 *   SITE_URL             ที่อยู่เว็บสำหรับลิงก์ในข้อความ (ค่าเริ่มต้น https://repairben2.ienas.site)
 *
 * โควตา: LINE นับข้อความที่ส่งเข้ากลุ่มเป็น "จำนวนสมาชิกในกลุ่ม" ต่อ 1 ข้อความ
 * (กลุ่ม 10 คน แจ้ง 1 ครั้ง = 10 ข้อความ) จึงส่งแค่ 1 ข้อความต่อเหตุการณ์ และปิดการแจ้งอัปเดตไว้เป็นค่าเริ่มต้น
 */

var LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
var LINE_TEXT_MAX = 4900;                       // LINE จำกัด 5,000 ตัวอักษรต่อข้อความ
var LINE_ID_RE = /^[CRU][0-9a-f]{32}$/;         // group / room / user id
var DEFAULT_SITE_URL = 'https://repairben2.ienas.site';

function lineConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    token: props.getProperty('LINE_CHANNEL_TOKEN'),
    to: props.getProperty('LINE_GROUP_ID'),
    updates: props.getProperty('LINE_NOTIFY_UPDATES') === 'true',
    site: String(props.getProperty('SITE_URL') || DEFAULT_SITE_URL).replace(/\/+$/, '')
  };
}

/** ส่งข้อความ 1 ข้อความเข้ากลุ่ม คืน {ok, skipped?, code?} — ไม่ throw เด็ดขาด */
function sendLine_(text) {
  var cfg = lineConfig_();
  if (!cfg.token || !cfg.to) {
    console.error('ยังไม่ได้ตั้ง LINE_CHANNEL_TOKEN / LINE_GROUP_ID ใน Script properties');
    return { ok: false, skipped: true };
  }
  if (!LINE_ID_RE.test(cfg.to)) {
    console.error('LINE_GROUP_ID รูปแบบไม่ถูกต้อง (ต้องขึ้นต้นด้วย C ตามด้วยตัวอักษร a-f/0-9 อีก 32 ตัว)');
    return { ok: false, skipped: true };
  }
  try {
    var res = UrlFetchApp.fetch(LINE_PUSH_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + cfg.token },
      payload: JSON.stringify({ to: cfg.to, messages: [{ type: 'text', text: String(text).slice(0, LINE_TEXT_MAX) }] }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error('LINE push failed: HTTP ' + code + ' ' + String(res.getContentText()).slice(0, 300));
      return { ok: false, code: code };
    }
    return { ok: true, code: code };
  } catch (err) {
    console.error('LINE push error: ' + err);
    return { ok: false };
  }
}

/** Code.gs เรียกหลังบันทึกใบแจ้งซ่อมใหม่; imageUrl = ลิงก์รูปใน Drive หรือ '-' */
function notifyNewTicket(d, imageUrl) {
  var site = lineConfig_().site;
  sendLine_(
    '🔧 แจ้งซ่อมใหม่ ' + d.ticket_id + '\n' +
    '🖥 ' + d.equipment_type + '\n' +
    '📍 ' + d.location + '\n' +
    '📝 ' + d.issue_detail + '\n' +
    '👤 ' + d.reporter_name +
    (imageUrl && imageUrl !== '-' ? '\n🖼 ' + imageUrl : '') +
    '\n👉 จัดการงาน: ' + site + '/admin.html'
  );
}

/** Code.gs เรียกหลังช่างเปลี่ยนสถานะ — ส่งเฉพาะเมื่อเปิด LINE_NOTIFY_UPDATES */
function notifyTicketUpdate(d) {
  if (!lineConfig_().updates) return;
  sendLine_(
    '🔄 ' + d.ticket_id + ' → ' + d.status +
    (d.admin_note ? '\n💬 ' + d.admin_note : '')
  );
}

/**
 * Code.gs เรียกเมื่อ LINE ส่ง webhook มา (body มี events) — ใช้หา groupId เท่านั้น
 * พิมพ์ groupId ลง Executions log ให้นำไปใส่ LINE_GROUP_ID ไม่ทำอย่างอื่นและไม่เก็บข้อมูลใด ๆ
 * (Apps Script อ่าน header X-Line-Signature ไม่ได้ จึงตรวจลายเซ็น webhook ไม่ได้ → ห้ามให้ webhook นี้ทำอะไรที่มีผลข้างเคียง)
 */
function handleLineWebhook_(body) {
  (body.events || []).forEach(function (ev) {
    var src = ev && ev.source;
    var id = src && (src.groupId || src.roomId);
    if (id && LINE_ID_RE.test(id)) {
      console.log('พบกลุ่ม LINE → ตั้ง Script property LINE_GROUP_ID = ' + id);
    }
  });
  return { status: 'success' };
}

/** รันเองใน Apps Script editor (เลือกฟังก์ชัน testLine แล้วกด Run) เพื่อทดสอบว่า token + groupId ใช้ได้ */
function testLine() {
  var r = sendLine_('✅ ทดสอบระบบแจ้งเตือน BEN2 — ถ้าเห็นข้อความนี้ แปลว่าตั้งค่าถูกต้องแล้ว');
  console.log(r.ok ? 'ส่งข้อความทดสอบสำเร็จ' : 'ส่งไม่สำเร็จ ดูข้อความผิดพลาดใน Execution log');
  return r;
}
