# BEN2 Redesign + Secure Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) — tasks run in this session. Steps use checkbox syntax.

**Goal:** Ship the teacher app, admin app and secured Apps Script API described in `docs/superpowers/specs/2026-11-02-ben2-redesign-design.md`.

**Architecture:** Static ES-module front end (no build) + Apps Script backend. Logic lives in small tested modules (`js/ui.js`, `js/store.js`, `js/api.js`, `js/demo-backend.js`); views (`js/teacher.js`, `js/admin.js`) only render and call them. A localStorage demo backend lets everything be verified without the real Apps Script.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), Font Awesome CDN, Kanit (Google Fonts), Node `node:test` for tests, Google Apps Script.

**Note on detail level:** plan is intentionally compact (files, test cases, commands, acceptance). Code is written test-first straight into the files and committed per task.

---

### Task 1: Backend security (Code.gs)

**Files:** Modify `apps-script/Code.gs`; Create `tests/gas-harness.js`, `tests/code-gs.test.js`

- [ ] Write harness (vm + mocks for SpreadsheetApp, PropertiesService, DriveApp, Utilities, LockService, ContentService, CacheService incl. `put/get/remove`) and failing tests:
  - login: wrong password → `unauthorized`; correct → token; `ADMIN_PASSWORD` unset → refused; 5 wrong attempts → `rate_limited` even for the right password
  - `list` without/with bad token → `unauthorized`; with token → all tickets
  - `update` without token → `unauthorized`; with token → success; bad status → `invalid`; unknown id → `not_found`
  - `GET ?ids=` returns only matching tickets, rejects ids not matching `^BEN2-\d{1,6}$`, caps at 50; `GET` with no ids → `[]`
  - `create`: caps (name/location 200, text 2000), non-image data URL ignored, image > 4 MB decoded rejected (`invalid`), 31st create inside window → `rate_limited`
- [ ] Run `node --test tests/code-gs.test.js` → FAIL
- [ ] Implement in `Code.gs`: `login_`, `requireToken_`, cache-based counters, `listByIds_`, size/type checks, error `code` field
- [ ] Run tests → PASS; commit `feat(api): token auth, rate limits, scoped reads`

### Task 2: Pure helpers + local store

**Files:** Create `js/ui.js`, `js/store.js`, `tests/ui.test.js`, `tests/store.test.js`

- [ ] Failing tests: `escapeHtml` (`<>&"'`), `relativeTime(iso, now)` (นาที/ชม./วัน ที่แล้ว, "เมื่อสักครู่"), `safeImageUrl` (only `https://drive.google.com/`), `appendChip(text, chip)` (adds with separator, no duplicates), `store` (get/set name+lastLocation, add/remove ticket ids, dedupe, survives throwing `localStorage`)
- [ ] Run → FAIL; implement; run → PASS; commit `feat: ui helpers and local store`

### Task 3: API client + demo backend + config

**Files:** Create `config.js`, `js/api.js`, `js/demo-backend.js`, `tests/demo-backend.test.js`

- [ ] Failing tests for demo backend using an in-memory storage shim: same contract as the real API (create → id, `GET ids`, login/list/update with token, wrong password code)
- [ ] Implement demo backend (password `demo`) and `api.js` (`createTicket`, `getMine(ids)`, `login`, `listAll`, `updateTicket`, 15 s timeout via AbortController, maps `{status:"error",code}` to thrown `ApiError`); `config.js` exports `SCRIPT_URL = ''` → demo mode
- [ ] Run tests → PASS; commit `feat: api client and demo backend`

### Task 4: Design system CSS

**Files:** Replace `styles.css`

- [ ] Tokens (colours, status pairs, type scale, radius, shadow, motion), base reset, components: app bar, bottom tabs (+ ≥768px top variant), buttons, inputs, tiles, chips, stepper, cards, badges, timeline, toast, skeleton, empty state, banner, dialog; focus ring; `prefers-reduced-motion`; safe-area insets
- [ ] Acceptance: no horizontal scroll at 320 px; text contrast ≥ 4.5:1 for tokens used
- [ ] Commit `feat(ui): design system`

### Task 5: Teacher app

**Files:** Replace `index.html`; Create `js/teacher.js`

- [ ] Routes `#/`, `#/report`, `#/mine` with hash router; Home, 3-step report flow (tiles → location+chips → photo+name+review), success screen, My tickets (timeline, refresh 60 s, forget), demo banner, intro once per session
- [ ] Image resize helper (canvas, ≤1280 px, JPEG 0.8) in `js/ui.js`; DOM built with `textContent`
- [ ] Acceptance (browser, demo backend, 375 px and 1280 px): submit a report end to end, see it in My tickets, status changes reflect after admin update
- [ ] Commit `feat: teacher app`

### Task 6: Admin app

**Files:** Replace `admin.html`; Create `js/admin.js`

- [ ] Login, stat-chip filters, search, cards sorted oldest-waiting first, quick actions (รับเรื่อง / เสร็จสิ้น with note / edit note), optimistic update with rollback, 30 s refresh with new-ticket badge, session expiry → login, logout
- [ ] Acceptance: with demo backend (password `demo`) full queue flow works; wrong password message; no `innerHTML` with ticket data
- [ ] Commit `feat: admin app`

### Task 7: Cleanup and docs

**Files:** Replace `dashboard.html`, `login.html` with redirects; Delete `app.js`, `layout.js`; Modify `README.md`

- [ ] Redirect pages (`dashboard.html` → `index.html#/mine`, `login.html` → `admin.html`)
- [ ] README: deploy steps incl. `ADMIN_PASSWORD`, demo mode, running tests, note that old credentials in git history are public
- [ ] `grep -rn "innerHTML" js/` reviewed: only static strings
- [ ] Commit `chore: remove legacy files, update docs`

### Task 8: Verify and hand off

- [ ] `node --test tests/` all green
- [ ] Browser pass on all pages at 375 px and 1280 px (screenshots), console clean
- [ ] Push branch; tell user: set `ADMIN_PASSWORD`, redeploy Code.gs, set `SCRIPT_URL` in `config.js`, then merge

---

## Self-review

- Spec coverage: teacher home/report/mine ✔ T5; admin ✔ T6; API table ✔ T1/T3; security items (token, brute force, create limits, scoped GET, XSS, credentials) ✔ T1/T5/T6/T7; design system ✔ T4; error handling/demo banner ✔ T3/T5; tests ✔ T1–T3.
- Names used across tasks: `createTicket`, `getMine`, `login`, `listAll`, `updateTicket`, `ApiError`, `escapeHtml`, `relativeTime`, `safeImageUrl`, `appendChip` — defined in T2/T3, consumed in T5/T6.
