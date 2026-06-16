# Operix — Session Handoff (2026-06-16, Companion Browser Extension + Extension API)

Built the **Operix Companion** browser extension (a floating dock of the user's
running/paused tasks with checklist + related KB) **and the first JSON API** it
talks to. Localhost-first; production is a config swap. Read this + `docs/STATUS.md`
+ `docs/EXTENSION-PLAN.md` (the design rationale) to pick up.

Earlier the same day: Resource Allocation frontend was removed (see
`docs/SESSION-2026-06-15-payroll-ops.md` §Resource Allocation).

---

## 0. Quick start
- **Extension lives in `extension/`** — a plain **MV3 extension, no build step**.
  Load it via `chrome://extensions` → Developer mode → **Load unpacked** →
  `D:\Operix\extension`. Full guide: `extension/README.md`.
- **API base:** `http://localhost:3000/api/ext/v1` (origin is config —
  extension options "Operix address" + server `EXTENSION_ORIGINS`/`APP_URL`).
- **DB:** the `ExtensionToken` table was **`db:push`'d** to the shared DB this
  session (additive; user-approved).
- **Verify backend:** `npm run dev`, then `POST /api/ext/v1/auth/login`
  (`admin@operix.test` / `ChangeMe123!`) → use the returned token as
  `Authorization: Bearer …` against `/me`, `/tasks/active`, etc.

---

## 1. What this session delivered

### Backend — the extension API (first HTTP API in Operix)
The app had **zero** route handlers before this; everything was Server Actions.
Added `app/api/ext/v1/**` route handlers, bearer auth, and CORS.
- **Schema:** `ExtensionToken` model (hashed token, `label`, `lastUsedAt`,
  `expiresAt` [90d default], `revokedAt`) + `User.extensionTokens` relation.
  *This is also the foundation for the scoped "active-session / device
  management" feature.*
- **`lib/ext/`:** `cors.ts` (origin allowlist via `EXTENSION_ORIGINS`; dev
  reflects any `chrome-extension://`), `auth.ts` (`mintExtensionToken`,
  `authenticateExtension` → `SessionUser`, `revokeExtensionToken`,
  `listExtensionTokens`; SHA-256 hashed at rest), `handler.ts` (`withExtAuth`
  wrapper = bearer auth + CORS + error envelope), `tasks.ts`
  (`getActiveTasksFor` — the feed), `url.ts` (`appBaseUrl`, `isExtensionRedirect`).
- **Shared contract:** `shared/ext-contract.ts` — pure TS DTOs (no Prisma
  imports) imported by both the API and (conceptually) the extension.
- **Refactor for one source of truth:** timer logic →
  `lib/timer/core.ts` (`startTimerFor`/`pauseTimerFor`/`stopTimerFor`, session-
  agnostic); checklist → `lib/projects/task-access.ts` (`canEditTask`,
  `toggleChecklistItemFor`). The existing Server Actions
  (`lib/timer/actions.ts`, `toggleChecklistItem`) now wrap these + add
  `revalidatePath`. **Web behavior unchanged.**
- **Endpoints** (`/api/ext/v1`, all bearer-guarded except login + OPTIONS):
  `GET /me`, `POST /auth/login` (email+pw fallback), `POST /auth/revoke`,
  `GET /tasks/active`, `POST /tasks/[id]/timer` ({start|pause|stop}),
  `POST /checklist/[itemId]` ({isDone}). Mutations return the refreshed feed.
- **proxy.ts:** early-returns `NextResponse.next()` for `/api/ext/*` so bearer
  calls aren't 302'd to `/login`.
- **Connect flow:** `app/connect-extension/page.tsx` + `actions.ts` — a gated
  web-authorize page; mints a token and redirects to the extension's
  `chrome.identity` callback (validated to `*.chromiumapp.org`). No password in
  the extension.
- **Connected devices UI:** `app/(app)/profile/devices/page.tsx` +
  `components/ext/devices-list.tsx` (revoke). Reachable at `/profile/devices`.

### Extension — `extension/` (vanilla MV3, no build)
- `manifest.json` — MV3; `permissions: storage, alarms, identity`;
  `host_permissions: http://localhost:3000/*`; content script on `<all_urls>`.
- `src/background.js` — service worker: token storage, `chrome.alarms` polling
  (interval from prefs), the only network caller, `launchWebAuthFlow` connect,
  revoke, broadcasts `OPERIX_UPDATE` to all tabs.
- `src/content.js` — the **dock** in a Shadow DOM (style-isolated; reads nothing
  from host pages). Task cards with **live client-side timer**, ▶/⏸/■ controls,
  expandable **checklist** (toggle) + **related KB** (open in Operix). Dock
  **position left/right/top/bottom**, **compact card by default** (⤢ expand to a
  full panel, − minimize to a pill), **on/off**, light/
  dark theme. Clock-skew corrected via `serverTimeMs`.
- `src/popup.{html,js}` — connect/disconnect, show-dock toggle, position, refresh.
- `src/options.{html,js}` — full prefs (position, theme, show-paused, poll
  interval, Operix address).
- Prefs in `chrome.storage.sync`; token/cache in `chrome.storage.local`.

---

## 2. How it was verified
- **Backend `tsc` green** after all additions (route validators included).
- **API over HTTP** (real curl against localhost): login→token, `/me`,
  `/tasks/active` (empty + a deep test with a synthetic timer showing checklist +
  KB mapping + `webUrl` + live timer), 401 on missing/bad token, OPTIONS
  preflight 204 with correct CORS headers. Test timer + test tokens cleaned up.
- **Extension** can't be browser-loaded from the dev env → every JS file passes
  `node --check` and `manifest.json` is valid JSON. **User must do the live
  browser test** (load unpacked → connect → start a timer → see the dock).

---

## 3. Known limitations / deferred
- **Live browser test pending** (user side) — the dock UI hasn't run in a real
  browser yet.
- **Per-site allow/deny list** not built — on/off is global (meets "until turned
  off"). 
- **No realtime** — 15–120s polling + immediate refresh on actions + local timer
  tick. SSE is a later upgrade.
- **Vanilla JS, not WXT/React** — chosen for no-build robustness + instant load.
  Migrate to WXT/React for production packaging + cross-browser store builds.
- **Top/bottom docks** are a horizontal card strip (accordion best in left/right).
- **Password-login endpoint** (`/auth/login`) is enabled for dev convenience;
  consider gating/removing it in prod in favor of the connect flow only.

## 4. Production checklist (when Operix goes live)
1. `manifest.json` `host_permissions` → live origin; set options "Operix address"
   (or default in code).
2. Server env `EXTENSION_ORIGINS=chrome-extension://<id>` (+ `APP_URL`=live).
3. Pin the extension id with a manifest `"key"` (so dev id == store id).
4. Optionally migrate to WXT + publish to Chrome Web Store / Edge Add-ons.

## 5. Standing context
- `docs/EXTENSION-PLAN.md` = the full design (auth options, phases, synergies).
- The `ExtensionToken` table + `/auth/revoke` + `/profile/devices` already
  deliver most of the scoped **active-session management** feature for the web.
- The connect flow is **SSO-ready**: when Google SSO lands, `/connect-extension`
  inherits it.

---

## 6. Follow-up refinements (2026-06-16, after the first browser test)
- **Feed scope changed** — the dock now shows the user's **To Do / In Progress /
  Redo** assigned tasks (was: their active timers). `lib/ext/tasks.ts` queries by
  `assignees.some(employeeId) + status in WORK_STATES`. Other statuses live only
  on the website. Feed is **assignee-based**, so connect as an **employee** (a
  user with an employee record); admins see an empty dock.
- **Submit for review from the dock** — when a task's checklist is fully checked
  (or it has none), a **Workflow** section appears: final output/preview link +
  **Submit for review** → `POST /api/ext/v1/tasks/[id]/submit` → reuses new
  `lib/tasks/workflow-core.ts` `submitForReviewFor` (status → REVIEW, sets
  `finalLink`, notifies the reviewer). The web Server Action `submitForReview` now
  wraps the same core. On success the task leaves the work-state feed → drops off
  the dock.
- **Checkboxes redesigned** for visibility on the dark card (2px brighter border +
  lighter fill via `--check-bg`/`--check-border`, hover highlight).
- **Dock hidden on the Operix site** — `content.js onOperixSite()` compares the
  page origin to the configured Operix origin and renders nothing there.
- **Chip redesign + drag** — the minimized pill is a brand-gradient chip with a
  live ticking timer (when running), a count badge, and a pulse; **draggable**
  anywhere via pointer events, position persisted in `prefs.pillPos`. A click
  without a drag reopens the dock.
