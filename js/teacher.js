// Teacher app: Home (#/), Report flow (#/report), My tickets (#/mine).
import { api, isDemo, ApiError } from './api.js';
import { createStore } from './store.js';
import { EQUIPMENT, STATUSES, chipsFor, statusMeta, relativeTime, safeImageUrl, appendChip } from './util.js';
import { OTHER, roomLabel, filterRooms, findRoomByLabel } from './rooms.js';
import { el, icon, clear, toast, copyText, brand, resizeImage, statusBadge } from './ui.js';

const store = createStore();
const view = document.getElementById('view');
const STEP_TITLES = ['เลือกอุปกรณ์', 'สถานที่และอาการ', 'รูปภาพและยืนยัน'];
const equipmentOf = (type) => EQUIPMENT.find((e) => e.value === type) || EQUIPMENT[EQUIPMENT.length - 1];

let timer = null;
let sent = null; // ticket id just submitted -> success screen
let draft = newDraft();

function newDraft(type = '') {
  const p = store.getProfile();
  // a remembered place that is not in the room list is shown as "other place" with its text
  const otherPlace = !!p.lastLocation && !findRoomByLabel(p.lastLocation);
  return { step: type ? 2 : 1, type, location: p.lastLocation, otherPlace, detail: '', name: p.name, imageData: null, sending: false, error: '', errors: {} };
}

const mount = (node) => { clear(view); view.append(node); };

/* ---------- Shared pieces ---------- */

function skeletons(n = 2) {
  return el('div', { class: 'list', 'aria-hidden': 'true' }, Array.from({ length: n }, () => el('div', { class: 'skeleton' })));
}

function errorBox(message, retry) {
  return el('div', { class: 'inline-error', role: 'alert' }, message,
    retry ? el('div', { style: 'margin-top:.5rem' }, el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: retry }, icon('fa-rotate'), 'ลองใหม่')) : null);
}

function emptyMine() {
  return el('div', { class: 'empty' }, icon('fa-clipboard-check'),
    el('p', {}, 'ยังไม่มีงานที่แจ้งไว้จากเครื่องนี้'),
    el('a', { class: 'btn btn-primary', style: 'margin-top:1rem', href: '#/report' }, icon('fa-plus'), 'แจ้งซ่อม'));
}

function ticketCard(t, onForget) {
  const eq = equipmentOf(t.equipment_type);
  const meta = statusMeta(t.status);
  const idx = Math.max(0, STATUSES.indexOf(t.status));
  const img = safeImageUrl(t.image_url);
  const hasNote = t.admin_note && t.admin_note !== '-';
  return el('article', { class: 'card ticket' },
    el('div', { class: 'ticket-icon' }, icon(eq.icon)),
    el('div', { class: 'grow' },
      el('div', { class: 'row between wrap' }, el('div', { class: 'ticket-title' }, `${t.equipment_type} · ${t.location}`), statusBadge(meta)),
      el('div', { class: 'ticket-meta' }, el('span', { class: 'code' }, t.ticket_id), ' · ', relativeTime(t.timestamp))),
    el('div', { class: 'ticket-body' },
      el('p', {}, t.issue_detail),
      el('ol', { class: 'timeline', 'aria-label': 'ความคืบหน้า' },
        STATUSES.map((s, i) => el('li', { class: i <= idx ? (i === idx ? 'reached current' : 'reached') : '' }, s))),
      hasNote ? el('div', { class: 'note' }, icon('fa-comment-dots'), ' ช่างแจ้ง: ', t.admin_note) : null,
      img ? el('a', { href: img, target: '_blank', rel: 'noopener', style: 'display:inline-block;margin-top:.6rem' },
        el('img', { class: 'thumb', src: img, alt: 'รูปประกอบ', loading: 'lazy' })) : null,
      onForget ? el('div', { style: 'margin-top:.5rem' }, el('button', { class: 'btn btn-danger-ghost btn-sm', type: 'button', onclick: onForget }, icon('fa-trash'), 'ลบออกจากเครื่องนี้')) : null));
}

/* ---------- Home ---------- */

function homeView() {
  const p = store.getProfile();
  const active = el('div', { class: 'list' }, skeletons(1));
  const root = el('div', {},
    el('section', { class: 'hero-card on-navy' },
      el('h1', {}, p.name ? `สวัสดี ${p.name}` : 'แจ้งซ่อมอุปกรณ์สื่อ'),
      el('p', {}, 'เลือกอุปกรณ์ที่มีปัญหา ใช้เวลาไม่ถึงนาที ติดตามผลได้ที่ "งานของฉัน"'),
      el('a', { class: 'btn btn-primary', href: '#/report' }, icon('fa-plus'), 'แจ้งซ่อมเลย')),
    el('div', { class: 'section-head' }, el('h2', {}, 'เลือกอุปกรณ์ที่เสีย')),
    el('div', { class: 'tiles' }, EQUIPMENT.map((e) =>
      el('a', { class: 'tile', href: `#/report?type=${encodeURIComponent(e.value)}` }, icon(e.icon), e.label))),
    el('div', { class: 'section-head' }, el('h2', {}, 'งานที่ยังไม่เสร็จ'), el('a', { href: '#/mine', class: 'small' }, 'ดูทั้งหมด')),
    active,
    el('p', { class: 'muted small', style: 'margin-top:2rem;text-align:center' },
      'โรงเรียนเบญจมราชรังสฤษฎิ์ ๒ · ',
      el('a', { href: 'https://www.ben2.ac.th/', target: '_blank', rel: 'noopener' }, 'ben2.ac.th'), ' · ',
      el('a', { href: 'admin.html' }, 'สำหรับช่าง'),
      el('br'), 'พัฒนาระบบโดย นายวีระภัทร อ่วมเกษม KMITL และนายสุทธิพงษ์ สุขสร้อย คุณครูที่ปรึกษา'));

  const ids = store.getTickets();
  if (!ids.length) {
    clear(active).append(el('p', { class: 'muted' }, 'ยังไม่มีงานที่แจ้งไว้'));
  } else {
    api.getMine(ids.slice(0, 20)).then((rows) => {
      const open = rows.filter((t) => t.status !== 'เสร็จสิ้น').slice(0, 3);
      clear(active).append(...(open.length ? open.map((t) => ticketCard(t)) : [el('p', { class: 'muted' }, 'ไม่มีงานค้าง 🎉')]));
    }).catch((e) => clear(active).append(errorBox(e.message)));
  }
  return root;
}

/* ---------- Report flow ---------- */

/** Room picker: search box + the school's room list, with an "other place" option for anything not listed. */
function locationField() {
  const filter = el('input', { class: 'input', type: 'search', id: 'f-room-filter', autocomplete: 'off',
    placeholder: 'ค้นหาห้อง เช่น 234 หรือ LAB', 'aria-label': 'ค้นหาห้อง (พิมพ์เลขห้องหรือชื่อ)' });
  const select = el('select', { class: 'select', id: 'f-loc', 'aria-invalid': draft.errors.location ? 'true' : null });
  const other = el('input', { class: 'input', id: 'f-loc-other', maxlength: 200, autocomplete: 'off',
    placeholder: 'ระบุสถานที่ เช่น สนามบาสเกตบอล', 'aria-label': 'ระบุสถานที่', value: draft.otherPlace ? draft.location : '',
    oninput: (e) => { draft.location = e.target.value; } });
  other.hidden = !draft.otherPlace;

  function fill() {
    const rooms = filterRooms(filter.value);
    const picked = draft.otherPlace ? undefined : findRoomByLabel(draft.location);
    const shown = picked && !rooms.includes(picked) ? [picked, ...rooms] : rooms; // keep the current choice visible while searching
    clear(select).append(
      el('option', { value: '' }, '— เลือกห้อง —'),
      ...shown.map((r) => el('option', { value: roomLabel(r) }, roomLabel(r))),
      el('option', { value: OTHER }, 'สถานที่อื่น (พิมพ์เอง)'));
    select.value = draft.otherPlace ? OTHER : picked ? roomLabel(picked) : '';
  }

  select.addEventListener('change', () => {
    draft.otherPlace = select.value === OTHER;
    draft.location = draft.otherPlace ? other.value : select.value;
    other.hidden = !draft.otherPlace;
    if (draft.otherPlace) other.focus();
  });
  filter.addEventListener('input', () => {
    fill();
    const rooms = filterRooms(filter.value);
    if (!draft.otherPlace && !draft.location && rooms.length === 1) { // one match and nothing chosen yet: choose it
      draft.location = roomLabel(rooms[0]);
      fill();
    }
  });
  fill();

  return el('div', { class: 'field' },
    el('label', { class: 'label', for: 'f-loc' }, 'สถานที่ / ห้อง'),
    el('div', { style: 'display:grid;gap:.5rem' }, filter, select, other),
    draft.errors.location ? el('div', { class: 'error' }, draft.errors.location) : null);
}

function reportView() {
  if (sent) return successView();
  const body = el('div', { class: 'stack' });
  const rerender = () => mount(reportView());
  const go = (step) => { draft.step = step; draft.error = ''; rerender(); window.scrollTo(0, 0); };

  const head = el('div', {},
    el('h1', { class: 'view-title' }, 'แจ้งซ่อม'),
    el('ol', { class: 'stepper', 'aria-label': 'ขั้นตอน' },
      [1, 2, 3].map((n) => el('li', { class: n < draft.step ? 'done' : n === draft.step ? 'current' : '' }))),
    el('p', { class: 'step-label' }, `ขั้นที่ ${draft.step} จาก 3 · ${STEP_TITLES[draft.step - 1]}`));

  if (draft.step === 1) {
    body.append(el('div', { class: 'tiles' }, EQUIPMENT.map((e) =>
      el('button', { class: 'tile', type: 'button', 'aria-pressed': String(draft.type === e.value),
        onclick: () => { draft.type = e.value; go(2); } }, icon(e.icon), e.label))));
  }

  if (draft.step === 2) {
    const detail = el('textarea', { class: 'textarea', id: 'f-detail', placeholder: 'อธิบายอาการที่พบ', maxlength: 2000,
      'aria-invalid': draft.errors.detail ? 'true' : null, oninput: (e) => { draft.detail = e.target.value; syncChips(); } }, draft.detail);
    const chipButtons = chipsFor(draft.type).map((c) => el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false',
      onclick: () => { draft.detail = appendChip(draft.detail, c); detail.value = draft.detail; syncChips(); detail.focus(); } }, c));
    function syncChips() { chipButtons.forEach((b) => b.setAttribute('aria-pressed', String(draft.detail.includes(b.textContent)))); }
    syncChips();
    body.append(
      el('div', { class: 'card stack' },
        el('p', {}, el('span', { class: 'muted' }, 'อุปกรณ์: '), icon(equipmentOf(draft.type).icon), ' ', draft.type, ' ',
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => go(1) }, 'เปลี่ยน')),
        locationField(),
        el('div', { class: 'field' }, el('span', { class: 'label' }, 'อาการที่พบ'), el('div', { class: 'chips', style: 'margin-bottom:.6rem' }, chipButtons), detail,
          draft.errors.detail ? el('div', { class: 'error' }, draft.errors.detail) : null)),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-outline', type: 'button', onclick: () => go(1) }, 'ย้อนกลับ'),
        el('button', { class: 'btn btn-navy grow', type: 'button', onclick: () => {
          draft.errors = {};
          if (!draft.location.trim()) draft.errors.location = draft.otherPlace ? 'กรุณาระบุสถานที่' : 'กรุณาเลือกห้อง หรือเลือก "สถานที่อื่น" แล้วพิมพ์เอง';
          if (!draft.detail.trim()) draft.errors.detail = 'กรุณาระบุอาการ';
          if (Object.keys(draft.errors).length) return rerender();
          go(3);
        } }, 'ถัดไป', icon('fa-arrow-right'))));
  }

  if (draft.step === 3) {
    const nameInput = el('input', { class: 'input', id: 'f-name', value: draft.name, placeholder: 'เช่น ครูสมชาย ใจดี', maxlength: 200, autocomplete: 'name',
      'aria-invalid': draft.errors.name ? 'true' : null, oninput: (e) => { draft.name = e.target.value; } });
    const preview = el('div', {});
    const showPreview = () => clear(preview).append(...(draft.imageData ? [
      el('img', { class: 'thumb', src: draft.imageData, alt: 'ตัวอย่างรูป', style: 'width:120px;height:120px' }),
      el('button', { class: 'btn btn-danger-ghost btn-sm', type: 'button', onclick: () => { draft.imageData = null; showPreview(); } }, icon('fa-xmark'), 'เอารูปออก')] : []));
    showPreview();
    const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'f-photo', onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { draft.imageData = await resizeImage(f); showPreview(); } catch (err) { toast('อ่านไฟล์รูปไม่ได้ ลองเลือกรูปอื่น', 'error'); }
    } });
    const submit = el('button', { class: 'btn btn-primary grow', type: 'button', disabled: draft.sending, onclick: () => send(rerender) },
      icon('fa-paper-plane'), draft.sending ? 'กำลังส่ง…' : 'ส่งใบแจ้งซ่อม');
    body.append(
      el('div', { class: 'card stack' },
        el('div', { class: 'field' }, el('span', { class: 'label' }, 'รูปประกอบ (ไม่บังคับ)'),
          el('label', { class: 'btn btn-outline', for: 'f-photo' }, icon('fa-camera'), 'ถ่ายรูป / เลือกรูป'), file, preview),
        el('label', { class: 'field' }, el('span', { class: 'label' }, 'ชื่อผู้แจ้ง'), nameInput,
          draft.errors.name ? el('div', { class: 'error' }, draft.errors.name) : null)),
      el('div', { class: 'card' },
        el('h3', {}, 'ตรวจทานก่อนส่ง'),
        el('p', {}, icon(equipmentOf(draft.type).icon), ' ', draft.type),
        el('p', {}, icon('fa-location-dot'), ' ', draft.location),
        el('p', { class: 'muted' }, draft.detail)),
      draft.error ? errorBox(draft.error) : null,
      el('div', { class: 'row' }, el('button', { class: 'btn btn-outline', type: 'button', disabled: draft.sending, onclick: () => go(2) }, 'ย้อนกลับ'), submit));
  }

  return el('div', {}, head, body);
}

async function send(rerender) {
  if (draft.sending) return;
  draft.errors = {};
  if (!draft.name.trim()) { draft.errors.name = 'กรุณาระบุชื่อ'; return rerender(); }
  draft.sending = true;
  draft.error = '';
  rerender();
  try {
    const id = await api.createTicket({
      reporter_name: draft.name.trim(), equipment_type: draft.type, location: draft.location.trim(),
      issue_detail: draft.detail.trim(), imageBase64: draft.imageData,
    });
    store.addTicket(id);
    store.saveProfile({ name: draft.name, lastLocation: draft.location });
    draft = newDraft();
    sent = id;
  } catch (e) {
    draft.error = e instanceof ApiError ? e.message : 'ส่งไม่สำเร็จ กรุณาลองใหม่';
  }
  draft.sending = false;
  rerender();
  window.scrollTo(0, 0);
}

function successView() {
  const id = sent;
  return el('div', { class: 'card success' },
    el('div', { class: 'check' }, icon('fa-check')),
    el('h2', {}, 'ส่งใบแจ้งซ่อมแล้ว'),
    el('div', { class: 'ticket-code' }, el('span', { class: 'code' }, id),
      el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => toast(await copyText(id) ? 'คัดลอกรหัสแล้ว' : 'คัดลอกไม่ได้', 'success') }, icon('fa-copy'), 'คัดลอก')),
    el('p', { class: 'muted' }, 'ช่างจะรับเรื่องและอัปเดตสถานะให้ ดูความคืบหน้าได้ที่ "งานของฉัน"'),
    el('div', { class: 'stack', style: 'margin-top:1.25rem' },
      el('a', { class: 'btn btn-navy btn-block', href: '#/mine', onclick: () => { sent = null; } }, icon('fa-clipboard-list'), 'ดูงานของฉัน'),
      el('button', { class: 'btn btn-outline btn-block', type: 'button', onclick: () => { sent = null; mount(reportView()); } }, 'แจ้งเรื่องอื่น')));
}

/* ---------- My tickets ---------- */

function mineView() {
  const list = el('div', { class: 'list', 'aria-live': 'polite' });
  let loaded = false;

  async function load(silent) {
    const ids = store.getTickets();
    if (!ids.length) return clear(list).append(emptyMine());
    if (!silent || !loaded) clear(list).append(skeletons(Math.min(ids.length, 3)));
    try {
      const rows = await api.getMine(ids);
      const byId = new Map(rows.map((t) => [t.ticket_id, t]));
      clear(list).append(...ids.map((id) => {
        const forget = () => { if (confirm(`ลบ ${id} ออกจากรายการในเครื่องนี้? (ข้อมูลในระบบไม่ถูกลบ)`)) { store.removeTicket(id); load(false); } };
        return byId.has(id) ? ticketCard(byId.get(id), forget)
          : el('div', { class: 'card' }, el('span', { class: 'code' }, id), el('p', { class: 'muted' }, 'ไม่พบข้อมูลงานนี้ในระบบ'),
            el('button', { class: 'btn btn-danger-ghost btn-sm', type: 'button', onclick: forget }, icon('fa-trash'), 'ลบออก'));
      }));
      loaded = true;
    } catch (e) {
      if (!silent || !loaded) clear(list).append(errorBox(e.message, () => load(false)));
    }
  }

  load(false);
  timer = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, 60000);

  return el('div', { class: 'stack' },
    el('div', { class: 'row between' },
      el('div', {}, el('h1', { class: 'view-title' }, 'งานของฉัน'), el('p', { class: 'muted small' }, 'รายการที่แจ้งจากเครื่องนี้ · รีเฟรชอัตโนมัติทุก 1 นาที')),
      el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => load(false) }, icon('fa-rotate'), 'รีเฟรช')),
    list);
}

/* ---------- Router + boot ---------- */

function route() {
  clearInterval(timer);
  timer = null;
  const [path, query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const current = path === '/report' || path === '/mine' ? path : '/';
  if (current !== '/report') sent = null;

  document.querySelectorAll('.tab').forEach((a) => {
    if (a.dataset.route === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = ({ '/': 'BEN2 แจ้งซ่อม', '/report': 'แจ้งซ่อม · BEN2', '/mine': 'งานของฉัน · BEN2' })[current];

  if (current === '/report') {
    const type = params.get('type');
    if (type && EQUIPMENT.some((e) => e.value === type)) {
      draft.type = type;
      if (draft.step === 1) draft.step = 2;
      history.replaceState(null, '', '#/report');
    }
    mount(reportView());
  } else {
    mount(current === '/mine' ? mineView() : homeView());
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function splash() {
  const node = document.getElementById('splash');
  let seen = false;
  try { seen = sessionStorage.getItem('ben2.splash') === '1'; sessionStorage.setItem('ben2.splash', '1'); } catch (e) { /* ignore */ }
  if (seen) return;
  node.hidden = false;
  const hide = () => { node.classList.add('hide'); setTimeout(() => { node.hidden = true; }, 450); };
  node.addEventListener('click', hide);
  setTimeout(hide, 1100);
}

document.querySelector('.appbar-inner').prepend(brand('BEN2 แจ้งซ่อม', 'โรงเรียนเบญจมราชรังสฤษฎิ์ ๒'));
document.getElementById('demoBanner').hidden = !isDemo;
window.addEventListener('hashchange', route);
splash();
route();
