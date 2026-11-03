// Teacher's data kept on this device only: name, last location, ids of tickets they reported.
const KEY = 'ben2.v1';
const MAX_TICKETS = 100;
const ID_RE = /^BEN2-\d{1,6}$/;

export function createStore(storage = globalThis.localStorage) {
  let memory = null; // used when storage is missing or throws

  function load() {
    let data = memory;
    if (!data) {
      try {
        data = JSON.parse(storage.getItem(KEY) || 'null');
      } catch (e) {
        data = null;
      }
    }
    data = data && typeof data === 'object' ? data : {};
    return {
      name: typeof data.name === 'string' ? data.name : '',
      lastLocation: typeof data.lastLocation === 'string' ? data.lastLocation : '',
      tickets: Array.isArray(data.tickets) ? data.tickets.filter((t) => typeof t === 'string' && ID_RE.test(t)) : [],
    };
  }

  function save(data) {
    memory = data;
    try {
      storage.setItem(KEY, JSON.stringify(data));
      memory = null;
    } catch (e) {
      // keep the in-memory copy for this page view
    }
  }

  return {
    getProfile() {
      const d = load();
      return { name: d.name, lastLocation: d.lastLocation };
    },
    saveProfile({ name, lastLocation }) {
      const d = load();
      d.name = String(name || '').trim().slice(0, 200);
      d.lastLocation = String(lastLocation || '').trim().slice(0, 200);
      save(d);
    },
    getTickets() {
      return load().tickets;
    },
    addTicket(id) {
      const d = load();
      d.tickets = [id, ...d.tickets.filter((t) => t !== id)].slice(0, MAX_TICKETS);
      save(d);
    },
    removeTicket(id) {
      const d = load();
      d.tickets = d.tickets.filter((t) => t !== id);
      save(d);
    },
  };
}
