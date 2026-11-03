// Technician app: login + ticket queue.
import { api, isDemo, ApiError } from './api.js';
import { EQUIPMENT, STATUSES, statusMeta, relativeTime, safeImageUrl } from './util.js';
import { el, icon, clear, toast, brand, statusBadge } from './ui.js';

const TOKEN_KEY = 'ben2.admin.token';
const view = document.getElementById('view');
const logoutBtn = document.getElementById('logoutBtn');
const [PENDING, PROGRESS, DONE] = STATUSES;
const FILTERS = [['all', 'ทั้งหมด'], [PENDING, 'รอรับเรื่อง'], [PROGRESS, 'กำลังดำเนินการ'], [DONE, 'เสร็จสิ้น']];

let token = null;
let tickets = [];
let known = null;      // ids seen so far (to detect new tickets)
let fresh = 0;         // new tickets since last "seen"
let filter = PENDING;
let query = '';
let inflight = 0;      // updates in progress (pause auto refresh)
let timer = null;

try { token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { /* ignore */ }
const saveToken = (t) => { token = t; try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } };
const equipmentOf = (type) => EQUIPMENT.find((e) => e.value === type) || EQUIPMENT[EQUIPMENT.length - 1];
const mount = (node) => { clear(view); view.append(node); };

/* ---------- Login ---------- */

function loginView(message = '') {
  const pw = el('input', { class: 'input', type: 'password', id: 'pw', autocomplete: 'current-password', placeholder: 'รหัสผ่านช่าง', required: true, 'aria-label': 'รหัสผ่านช่าง' });
  const err = el('div', { class: 'inline-error', role: 'alert', hidden: !message }, message);
  const btn = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, icon('fa-right-to-bracket'), 'เข้าสู่ระบบ');
  const form = el('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    btn.disabled = true;
    err.hidden = true;
    try {
      saveToken(await api.login(pw.value));
      pw.value = '';
      await showQueue();
    } catch (x) {
      err.textContent = x instanceof ApiError ? x.message : 'เข้าสู่ระบบไม่สำเร็จ';
      err.hidden = false;
      pw.value = '';
      pw.focus();
    }
    btn.disabled = false;
  } }, el('h1', {}, 'ช่างซ่อม'), el('p', { class: 'muted' }, 'เข้าสู่ระบบเพื่อจัดการงานแจ้งซ่อม'), err, pw, btn);
  logoutBtn.hidden = true;
  mount(el('div', { class: 'login-wrap' }, el('div', { class: 'card login-card' }, el('div', { class: 'lock' }, icon('fa-lock')), form)));
  pw.focus();
}

function logout(message = '') {
  clearInterval(timer);
  saveToken(null);
  tickets = [];
  known = null;
  fresh = 0;
  loginView(message);
}

/* ---------- Queue ---------- */

async function refresh(silent) {
  try {
    const rows = await api.listAll(token);
    if (known) rows.forEach((t) => { if (!known.has(t.ticket_id)) { known.add(t.ticket_id); fresh += 1; } });
    else known = new Set(rows.map((t) => t.ticket_id));
    tickets = rows;
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'unauthorized') { logout('หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่'); return false; }
    if (!silent) toast(e.message, 'error');
    return silent;
  }
}

async function showQueue() {
  logoutBtn.hidden = false;
  mount(el('div', { class: 'stack' }, el('div', { class: 'skeleton' }, ' '), el('div', { class: 'skeleton' })));
  if (!(await refresh(false))) return;
  renderQueue();
  clearInterval(timer);
  timer = setInterval(async () => {
    if (document.visibilityState !== 'visible' || inflight || document.querySelector('dialog[open]')) return;
    if (await refresh(true)) renderQueue();
  }, 30000);
}

function sortFor(rows) {
  const t = (x) => Date.parse(x.timestamp) || 0;
  const open = rows.filter((x) => x.status !== DONE).sort((a, b) => t(a) - t(b));
  const done = rows.filter((x) => x.status === DONE).sort((a, b) => t(b) - t(a));
  return filter === DONE ? done : filter === 'all' ? [...open, ...done] : open;
}

function visible() {
  const q = query.trim().toLowerCase();
  return sortFor(tickets.filter((t) => filter === 'all' || t.status === filter)).filter((t) =>
    !q || [t.ticket_id, t.reporter_name, t.location, t.issue_detail, t.equipment_type].some((v) => String(v || '').toLowerCase().includes(q)));
}

function renderQueue() {
  const scroll = window.scrollY;
  const count = (s) => tickets.filter((t) => s === 'all' || t.status === s).length;
  const search = el('input', { class: 'input', type: 'search', placeholder: 'ค้นหา ห้อง / ชื่อ / รหัส', value: query, 'aria-label': 'ค้นหา',
    oninput: (e) => { query = e.target.value; renderList(); } });
  const list = el('div', { class: 'list', id: 'list', 'aria-live': 'polite' });

  function renderList() {
    const rows = visible();
    clear(list).append(...(rows.length ? rows.map(card) : [el('div', { class: 'empty' }, icon('fa-inbox'), el('p', {}, query ? 'ไม่พบงานที่ค้นหา' : 'ไม่มีงานในหมวดนี้'))]));
  }

  mount(el('div', { class: 'stack' },
    el('div', { class: 'row between wrap' }, el('h1', {}, 'งานแจ้งซ่อม'),
      el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => { if (await refresh(false)) renderQueue(); } }, icon('fa-rotate'), 'รีเฟรช')),
    fresh ? el('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => { fresh = 0; filter = PENDING; renderQueue(); } },
      icon('fa-bell'), `มีงานใหม่ ${fresh} รายการ`) : null,
    el('div', { class: 'seg' }, FILTERS.map(([key, label]) =>
      el('button', { class: 'seg-btn', type: 'button', 'aria-pressed': String(filter === key), 'aria-label': `${label} ${count(key)}`, onclick: () => { filter = key; renderQueue(); } },
        el('strong', {}, String(count(key))), el('span', {}, label)))),
    search, list));
  renderList();
  window.scrollTo(0, scroll);
}

function card(t) {
  const eq = equipmentOf(t.equipment_type);
  const img = safeImageUrl(t.image_url);
  const hasNote = t.admin_note && t.admin_note !== '-';
  const actions = [];
  if (t.status === PENDING) actions.push(el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => change(t, PROGRESS, t.admin_note) }, icon('fa-hand'), 'รับเรื่อง'));
  if (t.status !== DONE) actions.push(el('button', { class: 'btn btn-navy btn-sm', type: 'button', onclick: () => askNote(t, DONE) }, icon('fa-circle-check'), 'เสร็จสิ้น'));
  actions.push(el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => askNote(t, t.status) }, icon('fa-pen'), 'โน้ต'));
  return el('article', { class: 'card ticket' },
    el('div', { class: 'ticket-icon' }, icon(eq.icon)),
    el('div', { class: 'grow' },
      el('div', { class: 'row between wrap' }, el('div', { class: 'ticket-title' }, `${t.equipment_type} · ${t.location}`), statusBadge(statusMeta(t.status))),
      el('div', { class: 'ticket-meta' }, el('span', { class: 'code' }, t.ticket_id), ` · ${t.reporter_name} · ${relativeTime(t.timestamp)}`)),
    el('div', { class: 'ticket-body' },
      el('p', {}, t.issue_detail),
      hasNote ? el('div', { class: 'note' }, icon('fa-comment-dots'), ' ', t.admin_note) : null,
      img ? el('a', { href: img, target: '_blank', rel: 'noopener', style: 'display:inline-block;margin-top:.6rem' }, el('img', { class: 'thumb', src: img, alt: 'รูปประกอบ', loading: 'lazy' })) : null),
    el('div', { class: 'ticket-actions' }, actions));
}

/* ---------- Actions ---------- */

async function change(t, status, note) {
  const before = { status: t.status, admin_note: t.admin_note };
  t.status = status;
  t.admin_note = note || '-';
  inflight += 1;
  renderQueue();
  try {
    await api.updateTicket(token, t.ticket_id, status, note && note !== '-' ? note : '');
    toast('บันทึกแล้ว', 'success');
  } catch (e) {
    Object.assign(t, before);
    if (e instanceof ApiError && e.code === 'unauthorized') { inflight -= 1; return logout('หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่'); }
    toast(e.message, 'error');
  }
  inflight -= 1;
  renderQueue();
}

function askNote(t, status) {
  const finishing = status === DONE && t.status !== DONE;
  const area = el('textarea', { class: 'textarea', maxlength: 2000, placeholder: 'ข้อความถึงผู้แจ้ง (ไม่บังคับ) เช่น เปลี่ยนหลอดภาพแล้ว' }, t.admin_note && t.admin_note !== '-' ? t.admin_note : '');
  const dlg = el('dialog', { class: 'sheet' },
    el('form', { method: 'dialog', class: 'stack', onsubmit: (e) => { e.preventDefault(); dlg.close(); dlg.remove(); change(t, status, area.value.trim()); } },
      el('h2', {}, finishing ? `ปิดงาน ${t.ticket_id}` : `โน้ต ${t.ticket_id}`),
      area,
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-outline', type: 'button', onclick: () => { dlg.close(); dlg.remove(); } }, 'ยกเลิก'),
        el('button', { class: 'btn btn-navy grow', type: 'submit' }, finishing ? 'ยืนยันเสร็จสิ้น' : 'บันทึก'))));
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  area.focus();
}

/* ---------- Boot ---------- */

document.querySelector('.appbar-inner').prepend(brand('BEN2 ช่างซ่อม', 'ระบบจัดการงานแจ้งซ่อม'));
document.getElementById('demoBanner').hidden = !isDemo;
logoutBtn.addEventListener('click', () => logout());
if (token) showQueue(); else loginView();
