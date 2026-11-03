# BEN2 Maintenance — UI/UX redesign + secure backend (design)

Date: 2026-11-02 · Status: approved in chat (sections 1–2); section 3 (design system) decided by author within the approved direction.

## Goals

- Teachers/staff (primary users) report a broken device from a phone in under 30 seconds and can see the status of *their own* reports.
- Technicians manage the queue quickly on phone or desktop.
- Drop the old school-website skeleton (top bar, menu, ticker, hero). Mobile-first app feel; keep school identity (navy + gold, crest, Kanit).
- Close the security holes found in the current code (see Security).
- LINE group notification stays **out of scope** (postponed by the user). Existing `LineNotify.gs` hooks remain and no-op when unconfigured.

## Architecture

Static site on GitHub Pages, no build step. Backend stays Google Apps Script (`apps-script/Code.gs`).

```
index.html            teacher app (hash routes: #/ , #/report , #/mine)
admin.html            technician app (login + queue)
dashboard.html        redirect to index.html#/mine   (old links)
login.html            redirect to admin.html         (old links)
styles.css            design tokens + components (single file)
config.js             export const SCRIPT_URL  ('' => demo mode)
js/api.js             fetch wrapper; real backend or in-browser demo backend
js/demo-backend.js    localStorage-backed fake of the Apps Script API (demo/tests)
js/store.js           teacher local data (name, last location, my ticket ids)
js/ui.js              escapeHtml, toast, relative time, image resize, icons map
js/teacher.js         teacher routes/views
js/admin.js           admin views
apps-script/Code.gs   backend (modified)
tests/                node:test unit tests + Apps Script mock harness
```

ES modules (`<script type="module">`). `layout.js`, SweetAlert2 and the old `app.js` are removed. Font Awesome CDN kept for icons.

## Teacher app

- Shell: slim top bar (crest + "BEN2 แจ้งซ่อม"); bottom tab bar on phones: หน้าแรก / แจ้งซ่อม (prominent centre) / งานของฉัน. On ≥768px the tabs move to the top bar; content max-width 640px, centred.
- **Home:** greeting (uses saved name), primary "แจ้งซ่อม" button, 6 equipment tiles (tap → report flow with type preselected), up to 3 active tickets of mine, small link to ben2.ac.th.
- **Report flow (3 steps, progress bar, back/next, state kept across steps):**
  1. Equipment tile (6 types, same values as today).
  2. Location (prefilled from last report) + symptom chips (เปิดไม่ติด / ไม่มีภาพ / ไม่มีเสียง / ค้างหรือช้า / ต่อสายไม่ได้ / อื่นๆ — Wi-Fi gets its own pair) that append to a free-text box; text required.
  3. Photo (camera/gallery, optional, resized client-side to ≤1280px JPEG q0.8), name (prefilled, required), review summary, Submit.
  - Success screen: ticket code with copy button, buttons "ดูงานของฉัน" / "แจ้งเรื่องอื่น". Failure keeps the form and shows a retry message; submit button disabled while sending (no double submit).
- **My tickets (#/mine):** cards from the locally saved ids, newest first, status timeline (รอรับเรื่อง → กำลังดำเนินการ → เสร็จสิ้น), technician note, photo thumb (tap = full), auto-refresh every 60 s while visible, manual refresh, empty state with CTA. "ลืมงานนี้" removes an id from this device only.
- Intro splash: once per browser session, ≤1.2 s, skippable by tap; honours `prefers-reduced-motion`.
- Local data (`localStorage` key `ben2.v1`): `{ name, lastLocation, tickets: [id…] }`. Wrapped in try/catch; app works (without memory) if storage is unavailable.

## Admin app

- Login screen: one password field. No credentials in the source.
- After login: stat chips (รอรับเรื่อง / กำลังดำเนินการ / เสร็จสิ้น / ทั้งหมด) double as filters; search (room, name, id); card list sorted with oldest-waiting first inside the active filter; each card shows device icon, location, symptom, thumb, "2 ชม. ที่แล้ว", status badge.
- Card actions: **รับเรื่อง** (one tap → กำลังดำเนินการ), **เสร็จสิ้น** (opens note box, optional note, then confirm), **แก้ไขโน้ต**. Result via toast; optimistic UI rolled back on error.
- Auto-refresh every 30 s; "มีงานใหม่ N" badge when new ids appear. Logout button; session token lives in `sessionStorage`.
- Session expiry (server says unauthorized) → back to login with message.

## Backend API (v2)

All POST bodies are JSON sent as `text/plain` (avoids CORS preflight on Apps Script).

| Call | Auth | Result |
|---|---|---|
| `GET ?ids=BEN2-1,BEN2-2` | none | tickets matching those ids only (max 50 ids, each must match `^BEN2-\d{1,6}$`) |
| `POST {action:"create", …}` | none, rate limited | `{status:"success", ticket_id}` |
| `POST {action:"login", password}` | password | `{status:"success", token}`; token valid 6 h (CacheService max) |
| `POST {action:"list", token}` | token | all tickets |
| `POST {action:"update", token, ticket_id, status, admin_note}` | token | `{status:"success"}` |

Errors are `{status:"error", message, code}`; `code` ∈ `unauthorized | rate_limited | invalid | not_found | server`.

## Security

- **Server-side auth:** `update` and `list` require a token from `login`. Password is the Script Property `ADMIN_PASSWORD` (never in the repo); if unset, login is refused. Token = random UUID stored in `CacheService` for 6 h.
- **Brute force:** 5 failed logins per 10 min (global counter in cache) → `rate_limited` for the rest of the window.
- **Public create abuse:** global limit 30 creates / 10 min; text fields trimmed and capped (2000 chars; name/location 200); image ≤ 4 MB decoded, `data:image/(png|jpeg|webp|gif)` only; status must be one of the three known values.
- **Privacy:** public GET returns only the tickets whose ids the caller already knows; the full list needs a token.
- **XSS:** the current code injects ticket fields into `innerHTML` unescaped (stored XSS reachable by any teacher). New code builds DOM with `textContent` / `escapeHtml`; image URLs are only accepted when they start with `https://drive.google.com/`.
- Remove hard-coded credentials from `app.js` (history keeps them: tell the owner those credentials are public and must not be reused).
- Known limit: static hosting means anyone can read the front-end source; secrets must stay in Apps Script properties.

## Design system (decisions)

- Colours: navy `#12285A`, deep navy `#0a1a3e`, gold `#FFD700` (CTA fill with navy text; on white use `#8a6508` for text), page `#f5f6f9`, surface `#fff`, text `#17203a`, muted `#5b6785`, line `#dde3f0`.
- Status (always colour + icon + label): pending amber `#b45309` on `#fff4de`; in progress blue `#12285A` on `#e6ecfa`; done green `#047857` on `#e2f6ee`.
- Type: Kanit 400/500/600, base 16 px, scale 14/16/18/22/28. Min tap target 48 px. Radius 16 (cards) / 12 (inputs) / pill (buttons, chips).
- Motion 150–250 ms ease; disabled under `prefers-reduced-motion`. Visible `:focus-visible` ring (gold on navy, navy on white). Contrast ≥ 4.5:1 for text.
- Layout: single column on phones, safe-area padding for the bottom bar, no horizontal scroll at 320 px.

## Error handling

- Network/timeout (15 s) → inline message + retry, never lose form input.
- Backend not configured (`SCRIPT_URL` empty) → demo backend + visible "โหมดสาธิต" banner so nobody mistakes it for production.
- Image too large/unreadable → message, form stays; submitting without image is fine.

## Testing

- `node --test tests/`: unit tests for `escapeHtml`, relative time, store, symptom-chip append logic, image-URL allow-list, and the Apps Script mock harness (create/list/update/auth/rate limits/validation).
- Manual: run `python -m http.server`, drive teacher and admin flows against the demo backend in the browser at 375 px and 1280 px.
- After the owner deploys Code.gs: end-to-end smoke test with the real URL.

## Out of scope

LINE notifications (postponed), editing/deleting tickets by teachers, multi-technician accounts, email/push.
