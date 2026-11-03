# BEN2 Maintenance — ระบบแจ้งซ่อมอุปกรณ์สื่อ (โรงเรียนเบญจมราชรังสฤษฎิ์ ๒)

เว็บ: https://repairben2.ienas.site/

- **ครู/บุคลากร** (`index.html`): แจ้งซ่อม 3 ขั้นตอนจากมือถือ และดู "งานของฉัน" (เก็บรหัสงานไว้ในเครื่องผู้ใช้)
- **ช่าง** (`admin.html`): เข้าสู่ระบบด้วยรหัสผ่าน จัดการคิวงาน รับเรื่อง/ปิดงาน/ใส่โน้ต
- **Backend**: Google Apps Script + Google Sheets (`apps-script/Code.gs`) — URL ตั้งใน `config.js`
- เว็บเป็นไฟล์ static ไม่ต้อง build (GitHub Pages)

## รันในเครื่อง / โหมดสาธิต

```bash
python -m http.server 8000
```

เปิด http://localhost:8000 — ถ้า `config.js` ยังไม่ได้ใส่ `SCRIPT_URL` เว็บจะเข้า **โหมดสาธิต** (เก็บข้อมูลในเบราว์เซอร์ ไม่ส่งไปที่ใด มีแถบเตือนด้านบน) รหัสผ่านช่างในโหมดสาธิตคือ `demo`

ทดสอบ: `node --test` (ต้องใช้ Node 20+) — ครอบคลุม backend (จำลอง Google services), ฟังก์ชันช่วย, local store และ API client

## ติดตั้ง/ติดตั้งใหม่ Backend (Google Apps Script)

ใช้เมื่อตั้งระบบครั้งแรก หรือเมื่อ URL เดิมใช้ไม่ได้ (ขึ้น 404 / "โหลดข้อมูลไม่สำเร็จ")

1. เข้า https://script.google.com > **โปรเจกต์ใหม่**
2. วางโค้ดจาก `apps-script/Code.gs` ลงไฟล์ `Code.gs` (ลบโค้ดตัวอย่างออก)
3. **Project Settings > Script properties** เพิ่ม `ADMIN_PASSWORD` = รหัสผ่านช่าง (ตั้งยาก ๆ ไม่ใช้ซ้ำกับที่อื่น; ถ้าไม่ตั้ง ช่างจะล็อกอินไม่ได้)
4. เลือกฟังก์ชัน **setup** แล้วกด **Run** อนุญาตสิทธิ์ Sheets + Drive
   ระบบสร้าง Google Sheet "BEN2 Maintenance - ใบแจ้งซ่อม" และโฟลเดอร์เก็บรูปใน Drive ให้เอง (ดู URL ของชีตใน Execution log)
5. **Deploy > New deployment > Web app** — Execute as: **Me**, Who has access: **Anyone** แล้วคัดลอก URL ที่ลงท้าย `/exec`
6. ใส่ URL ใน `config.js` (`SCRIPT_URL`) แล้ว commit / push

เมื่อแก้โค้ด Apps Script ภายหลัง ต้อง **Deploy > Manage deployments > แก้ไข > New version** ใช้ URL เดิมต่อได้

### ความปลอดภัย (สรุป)

- การเปลี่ยนสถานะงานและดูรายการทั้งหมดต้องมี token จากการล็อกอิน (หมดอายุ 6 ชม.) ใส่รหัสผิด 5 ครั้งจะถูกล็อก 10 นาที
- ฝั่งครูดึงได้เฉพาะงานตามรหัสที่ตัวเองเก็บไว้ ไม่เห็นงานคนอื่น
- จำกัดการแจ้งใหม่ 30 ครั้งต่อ 10 นาที, จำกัดความยาวข้อความ, รูปไม่เกิน 4 MB, กันสูตร Google Sheets ในข้อความ
- หน้าเว็บสร้าง DOM ด้วย `textContent` ไม่ฝัง HTML จากข้อมูลผู้ใช้
- **รหัสผู้ดูแลเดิม (`Newlnwza007` / `admin123`) เคยอยู่ในโค้ดสาธารณะบน GitHub ถือว่ารั่วแล้ว อย่านำกลับมาใช้**
- ข้อจำกัด: เว็บ static ใครก็เปิดดูซอร์สหน้าเว็บได้ ความลับต้องอยู่ใน Script properties เท่านั้น

## แจ้งเตือนเข้า LINE กลุ่ม

เมื่อมีใบแจ้งซ่อมใหม่ ระบบส่งข้อความเข้ากลุ่ม LINE ของช่าง (รหัสงาน อุปกรณ์ สถานที่ อาการ ผู้แจ้ง ลิงก์รูป และลิงก์ไปหน้าจัดการงาน)
ใช้ LINE Messaging API (LINE Notify ปิดบริการแล้ว) ส่งจาก Apps Script เพื่อไม่ให้ token อยู่ในหน้าเว็บ
ถ้ายังไม่ตั้งค่า ระบบแจ้งซ่อมทำงานปกติ แค่ไม่ส่ง LINE และการส่ง LINE ล้มเหลวไม่ทำให้การแจ้งซ่อมพัง

> **โควตา:** LINE นับข้อความที่ส่งเข้ากลุ่มเป็นจำนวนสมาชิกในกลุ่ม (กลุ่ม 10 คน แจ้ง 1 ครั้ง = 10 ข้อความ)
> ระบบจึงส่งแค่ 1 ข้อความต่อใบแจ้งซ่อม และ**ไม่แจ้งเมื่อช่างเปลี่ยนสถานะ**เป็นค่าเริ่มต้น
> ตรวจโควตาฟรีของบัญชีใน LINE Official Account Manager ก่อนใช้งานจริง

### ตั้งค่า (ทำครั้งเดียว)

1. สร้าง LINE Official Account + **Messaging API channel** ที่ https://developers.line.biz/ แล้วออก **Channel access token (long-lived)**
2. ใน LINE Official Account Manager เปิด **อนุญาตให้บอทเข้าร่วมแชทกลุ่ม** แล้วเชิญบอทเข้ากลุ่มช่าง
3. เพิ่มไฟล์ `apps-script/LineNotify.gs` ในโปรเจกต์ Apps Script เดียวกับ `Code.gs` แล้ว Deploy เวอร์ชันใหม่ (Manage deployments > แก้ไข > New version)
4. **หา groupId:** ที่ LINE Developers ตั้ง **Webhook URL** ของ channel เป็น URL Web app (`.../exec`) และเปิด Use webhook
   แล้วพิมพ์ข้อความอะไรก็ได้ในกลุ่ม 1 ครั้ง กลับไปที่ Apps Script > **Executions** จะมีบรรทัด
   `พบกลุ่ม LINE → ตั้ง Script property LINE_GROUP_ID = Cxxxxxxxx...` ให้คัดลอกค่านั้น
   (ปุ่ม Verify ของ LINE จะขึ้น error ได้ เพราะ Apps Script ตอบกลับด้วย redirect แต่ข้อความจากกลุ่มยังเข้ามาถึงตามปกติ)
5. **Script properties** เพิ่ม

   | ชื่อ | ค่า | จำเป็น |
   |---|---|---|
   | `LINE_CHANNEL_TOKEN` | Channel access token | ใช่ |
   | `LINE_GROUP_ID` | groupId จากขั้นที่ 4 | ใช่ |
   | `LINE_NOTIFY_UPDATES` | `true` ถ้าต้องการแจ้งเมื่อช่างเปลี่ยนสถานะด้วย | ไม่ (ค่าเริ่มต้น: ไม่แจ้ง) |
   | `SITE_URL` | ที่อยู่เว็บในลิงก์ข้อความ | ไม่ (ค่าเริ่มต้น `https://repairben2.ienas.site`) |

6. ใน Apps Script editor เลือกฟังก์ชัน **testLine** แล้วกด Run — ควรมีข้อความทดสอบเข้ากลุ่ม
   ถ้าไม่มี ดู Executions log: จะบอกว่าขาดค่าไหน หรือ LINE ตอบ HTTP อะไรกลับมา (เช่น 401 = token ผิด, 400 = groupId ผิดหรือบอทไม่ได้อยู่ในกลุ่ม)
7. หลังได้ groupId แล้ว จะปิด Webhook ใน LINE Developers ก็ได้ (webhook นี้ไม่ได้ทำอะไรนอกจากพิมพ์ groupId ลง log)

### ข้อควรรู้

- webhook ของ Apps Script ตรวจลายเซ็นของ LINE (`X-Line-Signature`) ไม่ได้ จึงออกแบบให้ไม่มีผลข้างเคียง: อ่านได้แค่ groupId ที่ถูกต้องรูปแบบแล้วพิมพ์ลง log เท่านั้น
- การส่ง LINE เกิดหลังปล่อย lock แล้ว จึงไม่ทำให้คนอื่นที่แจ้งซ่อมพร้อมกันต้องรอ
- ทดสอบอัตโนมัติ (`node --test`) ใช้ตัวจำลอง LINE API ไม่ได้ส่งข้อความจริง การส่งจริงต้องทดสอบด้วย `testLine`

## ย้ายไปไว้ที่เว็บโรงเรียน (www.ben2.ac.th/repair)

เว็บนี้เป็นไฟล์ static ที่ใช้พาธแบบสัมพัทธ์ทั้งหมด จึงวางไว้ใต้โฟลเดอร์ย่อยของเว็บโรงเรียนได้โดยไม่ต้องแก้โค้ด
สร้างชุดไฟล์พร้อมอัปโหลดด้วย `powershell -ExecutionPolicy Bypass -File scripts/make-school-bundle.ps1`
(ได้ `dist/repair/` และ `dist/ben2-repair-site.zip`) แล้วส่งให้ผู้ดูแลเว็บพร้อมคู่มือ [docs/school-site-handoff.md](docs/school-site-handoff.md)
หลังย้ายแล้วตั้ง Script property `SITE_URL` ใน Apps Script เป็นที่อยู่ใหม่ เพื่อให้ลิงก์ใน LINE ชี้ถูกที่

## โครงสร้างไฟล์

```
index.html / js/teacher.js   แอปฝั่งครู (hash routes: #/ #/report #/mine)
admin.html / js/admin.js     แอปฝั่งช่าง
js/api.js, demo-backend.js   ตัวเรียก backend + backend จำลอง
js/util.js, store.js, ui.js  ฟังก์ชันช่วย / ข้อมูลในเครื่อง / DOM helper
js/rooms-data.js, rooms.js   รายชื่อห้อง 135 ห้อง (แก้ห้องที่ rooms-data.js) + การค้นหา/ตัวเลือกห้อง
styles.css                   design system
apps-script/                 Code.gs (backend), LineNotify.gs
scripts/                     make-school-bundle.ps1 (สร้างชุดไฟล์สำหรับเว็บโรงเรียน)
docs/                        school-site-handoff.md (คู่มือผู้ดูแลเว็บ), superpowers/ (สเปกและแผนงาน)
```
