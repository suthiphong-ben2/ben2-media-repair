// Loads apps-script/Code.gs into a vm sandbox with in-memory fakes of the Google services it uses.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// opts.line: also load LineNotify.gs (instead of stubbing the notify* hooks) and fake UrlFetchApp.
// opts.lineResponse: {code, body} the fake LINE API answers with; or {throws: 'msg'} to simulate a network failure.
function loadBackend({ props = {}, line = false, lineResponse = { code: 200, body: '{}' } } = {}) {
  const store = { props: Object.assign({}, props), rows: [], cache: {}, files: [], notified: [],
                  fetches: [], logs: [], errors: [], events: [] };
  let uuid = 0;

  const sheet = {
    getLastRow: () => store.rows.length,
    appendRow: (r) => store.rows.push(r),
    setFrozenRows() {},
    setName() {},
    getRange: (row, col, nr, nc) => ({
      getValues: () => store.rows.slice(row - 1, row - 1 + nr).map((r) => r.slice(col - 1, col - 1 + nc)),
      setValues: (v) => v[0].forEach((x, i) => { store.rows[row - 1][col - 1 + i] = x; }),
    }),
  };
  const ss = { getSheetByName: () => sheet, getSheets: () => [sheet], getId: () => 'SS1', getUrl: () => 'url' };
  const folder = {
    getId: () => 'F1',
    createFile: (blob) => {
      store.files.push(blob);
      return { setSharing() {}, getId: () => 'IMG' + store.files.length };
    },
  };

  const ctx = {
    console: {
      log: (...a) => store.logs.push(a.join(' ')),
      error: (...a) => store.errors.push(a.join(' ')),
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        store.events.push('fetch');
        store.fetches.push({ url, opts, payload: opts && opts.payload ? JSON.parse(opts.payload) : null });
        if (lineResponse.throws) throw new Error(lineResponse.throws);
        return { getResponseCode: () => lineResponse.code, getContentText: () => lineResponse.body };
      },
    },
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store.props ? store.props[k] : null),
        setProperty: (k, v) => { store.props[k] = v; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in store.cache ? store.cache[k] : null),
        put: (k, v) => { store.cache[k] = String(v); },
        remove: (k) => { delete store.cache[k]; },
      }),
    },
    DriveApp: {
      createFolder: () => folder,
      getFolderById: () => folder,
      Access: { ANYONE_WITH_LINK: 1 },
      Permission: { VIEW: 1 },
    },
    Utilities: {
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      getUuid: () => 'uuid-' + String(++uuid).padStart(31, '0'),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => store.events.push('lock'),
        releaseLock: () => store.events.push('unlock'),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ s, setMimeType() { return this; } }),
    },
  };
  if (!line) {
    ctx.notifyNewTicket = (d, img) => store.notified.push(['new', d.ticket_id, img]);
    ctx.notifyTicketUpdate = (d) => store.notified.push(['upd', d.ticket_id, d.status]);
  }
  vm.createContext(ctx);
  const gs = (name) => fs.readFileSync(path.join(__dirname, '..', 'apps-script', name), 'utf8');
  vm.runInContext(gs('Code.gs'), ctx);
  if (line) vm.runInContext(gs('LineNotify.gs'), ctx);

  return {
    ctx,
    store,
    post: (o) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).s),
    get: (params = {}) => JSON.parse(ctx.doGet({ parameter: params }).s),
    setNow: (ms) => { ctx.nowMs_ = () => ms; },
  };
}

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const valid = (over = {}) => Object.assign(
  { action: 'create', ticket_id: 'BEN2-1234', reporter_name: 'ครูสมชาย', equipment_type: 'โปรเจคเตอร์',
    location: 'อาคาร 1', issue_detail: 'เปิดไม่ติด', imageBase64: null }, over);

module.exports = { loadBackend, PNG, valid };
