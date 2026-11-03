// In-browser stand-in for apps-script/Code.gs, used when config.js has no SCRIPT_URL.
// Same request/response shapes as the real backend. Admin password: "demo".
import { STATUSES } from './util.js';

const KEY = 'ben2.demo.tickets';
const DEMO_PASSWORD = 'demo';

export function createDemoBackend(storage = globalThis.localStorage) {
  const tokens = new Set();
  let memory = [];

  const load = () => {
    try { return JSON.parse(storage.getItem(KEY) || '[]'); } catch (e) { return memory; }
  };
  const save = (rows) => {
    memory = rows;
    try { storage.setItem(KEY, JSON.stringify(rows)); } catch (e) { /* keep memory copy */ }
  };
  const err = (code, message) => ({ status: 'error', code, message });
  const view = (t) => ({ ...t, image_url: '-', admin_note: t.admin_note || '-' });

  return {
    get(params = {}) {
      const ids = String(params.ids || '').split(',').filter(Boolean);
      return load().filter((t) => ids.includes(t.ticket_id)).map(view);
    },
    post(body) {
      const rows = load();
      if (body.action === 'login') {
        if (body.password !== DEMO_PASSWORD) return err('unauthorized', 'รหัสผ่านไม่ถูกต้อง');
        const token = 'demo-token-' + Math.random().toString(36).slice(2).padEnd(24, '0');
        tokens.add(token);
        return { status: 'success', token };
      }
      if (body.action === 'list') {
        if (!tokens.has(body.token)) return err('unauthorized', 'กรุณาเข้าสู่ระบบ');
        return { status: 'success', tickets: rows.map(view) };
      }
      if (body.action === 'create') {
        const f = ['reporter_name', 'equipment_type', 'location', 'issue_detail'].map((k) => String(body[k] || '').trim());
        if (f.some((v) => !v)) return err('invalid', 'กรอกข้อมูลไม่ครบ');
        let id = body.ticket_id;
        while (!/^BEN2-\d{1,6}$/.test(id) || rows.some((t) => t.ticket_id === id)) {
          id = 'BEN2-' + Math.floor(1000 + Math.random() * 9000);
        }
        rows.push({
          timestamp: new Date().toISOString(), ticket_id: id,
          reporter_name: f[0], equipment_type: f[1], location: f[2], issue_detail: f[3],
          status: STATUSES[0], admin_note: '',
        });
        save(rows);
        return { status: 'success', ticket_id: id };
      }
      if (body.action === 'update') {
        if (!tokens.has(body.token)) return err('unauthorized', 'กรุณาเข้าสู่ระบบ');
        if (!STATUSES.includes(body.status)) return err('invalid', 'สถานะไม่ถูกต้อง');
        const t = rows.find((r) => r.ticket_id === body.ticket_id);
        if (!t) return err('not_found', 'ไม่พบรหัสงานนี้');
        t.status = body.status;
        t.admin_note = String(body.admin_note || '').trim();
        save(rows);
        return { status: 'success' };
      }
      return err('invalid', 'unknown action');
    },
  };
}
