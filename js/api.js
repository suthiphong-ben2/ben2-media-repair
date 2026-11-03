// Client for the Apps Script backend (or the in-browser demo backend when SCRIPT_URL is empty).
import { SCRIPT_URL } from '../config.js';
import { createDemoBackend } from './demo-backend.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const NETWORK_MSG = 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
const SERVER_MSG = 'ระบบหลังบ้านตอบกลับผิดปกติ กรุณาลองใหม่ภายหลัง';

export function createApi({ scriptUrl = '', fetchImpl = globalThis.fetch, demo = null, timeoutMs = 15000 } = {}) {
  async function transport(method, params, body) {
    if (!scriptUrl) {
      const out = method === 'GET' ? demo.get(params) : demo.post(body);
      return Promise.resolve(out);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = method === 'GET' ? scriptUrl + '?ids=' + encodeURIComponent(params.ids) : scriptUrl;
      const res = await fetchImpl(url, method === 'GET'
        ? { signal: controller.signal }
        : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: controller.signal });
      if (!res.ok) throw new ApiError('server', SERVER_MSG);
      try {
        return await res.json();
      } catch (e) {
        throw new ApiError('server', SERVER_MSG);
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError('network', NETWORK_MSG);
    } finally {
      clearTimeout(timer);
    }
  }

  const unwrap = (out) => {
    if (out && out.status === 'error') throw new ApiError(out.code || 'server', out.message || SERVER_MSG);
    return out;
  };

  return {
    async createTicket(fields) {
      const ticket_id = 'BEN2-' + Math.floor(1000 + Math.random() * 9000);
      const out = unwrap(await transport('POST', null, { action: 'create', ticket_id, ...fields }));
      return out.ticket_id || ticket_id;
    },
    async getMine(ids) {
      if (!ids.length) return [];
      const out = await transport('GET', { ids: ids.join(',') });
      unwrap(out);
      return Array.isArray(out) ? out : [];
    },
    async login(password) {
      return unwrap(await transport('POST', null, { action: 'login', password })).token;
    },
    async listAll(token) {
      return unwrap(await transport('POST', null, { action: 'list', token })).tickets || [];
    },
    async updateTicket(token, ticket_id, status, admin_note) {
      unwrap(await transport('POST', null, { action: 'update', token, ticket_id, status, admin_note }));
    },
  };
}

export const isDemo = !SCRIPT_URL;
export const api = createApi({ scriptUrl: SCRIPT_URL, demo: SCRIPT_URL ? null : createDemoBackend() });
