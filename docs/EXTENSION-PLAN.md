# Operix Companion — Browser Extension Plan

A complete build plan for a browser extension that keeps a logged-in user's
**running / paused tasks** docked to the edge of the screen on any website, each
expandable to its **checklist** and **related knowledge-base guides**, with the
dock position (left / right / top / bottom) and on/off state user-customizable.

Status: **BUILT on localhost (2026-06-16)** — the backend API and the extension
are implemented; the API is HTTP-verified and the backend `tsc` is green. The live
browser test (load unpacked → connect → see the dock) is the user's next step.
Build/handoff detail: `docs/SESSION-2026-06-16-extension.md`; load/test guide:
`extension/README.md`. This document remains the design rationale.

---

## 0. TL;DR

- Build a **Manifest V3 extension** (Chrome/Edge first, Firefox via the same
  codebase) whose content script injects a **dockable, always-on overlay** into
  every page (Shadow-DOM isolated). The overlay lists the user's active timers
  and lets them tick checklist items, open KB guides, and pause/resume/stop.
- This **requires a new JSON API on the Operix side** — the app today has *zero*
  route handlers; everything is Server Actions. We add `/api/ext/v1/*`.
- Auth uses a **dedicated, revocable bearer token** (not the session cookie),
  minted through a "Connect" flow that reuses the existing web login. The token
  table doubles as the foundation for the previously-scoped **active-session /
  device management** feature.
- Refactor the existing timer/checklist business logic into **session-agnostic
  core functions** so the new API and the existing Server Actions share one
  source of truth.
- Ship in phases: **(0)** backend API + auth, **(1)** read-only overlay + connect
  flow, **(2)** interactions, **(3)** customization + polish, **(4)** hardening +
  cross-browser + store.

---

## 1. Goals & scope

**In scope (v1):**
- Persistent edge-docked panel, visible on all sites until the user turns it off.
- Shows the signed-in user's **RUNNING and PAUSED** tasks (their active timers).
- Each task row: name, project, status badge, **live ticking timer**, and
  play / pause / stop controls.
- Expand a task (accordion) → its **checklist** (tick items on/off) and
  **related KB guides** (open in an Operix tab).
- Dock **position** customizable: left, right, top, bottom; collapse to a thin
  tab; global on/off. Preferences persist across sessions/devices.
- Secure connect/disconnect; multi-tenant-safe; respects existing permissions.

**Out of scope (v1) — candidates for later:**
- Creating tasks / editing task fields / comments / attachments / mentions.
- Adding or deleting checklist items (v1 only *toggles* existing ones).
- Notifications mirror, calendar, payroll, or any non-task module.
- Realtime push (SSE/WebSocket) — v1 polls. Safari packaging.

---

## 2. Why a new API is required (grounded facts)

| Finding | Source | Consequence |
|---|---|---|
| **No route handlers exist** — all mutations are `"use server"` Server Actions | `lib/**/actions.ts`; no `app/api/**` | Must build `/api/ext/v1/*` from scratch |
| Session = one **httpOnly** cookie `operix_session`, jose **HS256**, `sameSite=lax`, 7-day | `lib/auth/session.ts` | Extension JS can't read it; `lax` blocks it on cross-site fetches → need a **bearer token** |
| **`proxy.ts` gates every non-static path**, redirles no-cookie requests to `/login` | `proxy.ts` matcher | API namespace must be **exempted** in the proxy or bearer calls 302 before the handler |
| `next.config.ts` is **empty** — no CORS/headers | `next.config.ts` | Must set **CORS + OPTIONS preflight** ourselves |
| Timer state machine, checklist toggles, KB match are **already implemented & deterministic** | `lib/timer/*`, `lib/projects/actions.ts`, `tasks/[id]/page.tsx` | API **reuses** them via a shared core (don't reinvent) |
| Capabilities + per-role task scope already exist | `lib/auth/can.ts`, `lib/auth/permissions.ts`, `lib/tasks/visibility.ts` | API enforces the **same** authz |

---

## 3. Architecture overview

```
┌─────────────────────────── User's browser (any website) ───────────────────────────┐
│                                                                                      │
│   Page DOM                          Extension                                         │
│  ┌─────────┐   inject     ┌──────────────────────────┐   chrome.runtime  ┌─────────┐ │
│  │  host   │◀────────────▶│  Content script (overlay)│◀─────messaging────▶│ Service │ │
│  │  page   │  Shadow DOM  │  React + Tailwind dock    │                    │ worker  │ │
│  └─────────┘              │  • task accordions        │                    │ (bg)    │ │
│                           │  • live timer tick (1s)   │   fetch (Bearer)   └────┬────┘ │
│                           │  • checklist / KB         │   via background        │      │
│                           └──────────────────────────┘                         │      │
│   Toolbar popup (connect / settings)   chrome.storage.local(token,cache)        │      │
└─────────────────────────────────────────────────────────────────────────────────│────┘
                                                                                   │ HTTPS
                                                                                   ▼
                                            ┌──────────────────────────────────────────┐
                                            │ Operix (Next.js 16)                        │
                                            │  proxy.ts ── exempt /api/ext/* ──┐         │
                                            │  app/api/ext/v1/* route handlers │         │
                                            │    ↳ bearer auth (ExtensionToken)│         │
                                            │    ↳ CORS + OPTIONS               │         │
                                            │    ↳ shared core (timer/checklist)│         │
                                            │  Prisma → PostgreSQL (Supabase)  ◀┘         │
                                            └──────────────────────────────────────────┘
```

**Key rule (MV3):** the **content script never calls the API directly** (it runs
in the host page's origin and would hit CORS / leak nothing useful). It messages
the **background service worker**, which holds `host_permissions` for the Operix
origin and makes the authenticated fetch. The content script only renders and
ticks the local timer.

---

## 4. Authentication & authorization (the crux)

### 4.1 Token model (server)
Add an `ExtensionToken` table (Prisma). Store a **hash** of the token, never the
raw value:

```prisma
model ExtensionToken {
  id          String    @id @default(cuid())
  companyId   String
  userId      String
  tokenHash   String    @unique          // sha-256 of the raw token
  label       String                     // "Chrome on Windows", set at connect
  createdAt   DateTime  @default(now())
  lastUsedAt  DateTime?
  expiresAt   DateTime?                   // null = long-lived; recommend 90d + refresh
  revokedAt   DateTime?
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

Raw token = `randomBytes(32).toString("hex")` (same primitive already used for
`User.setupToken`). The raw token is shown to the extension **once** at connect;
the server keeps only `tokenHash`.

> **Synergy:** this is essentially the `Session` table the previously-scoped
> *active-session management* feature needs. Building it here also delivers
> "see my connected devices / sign out everywhere" for the web app. Log
> mint/revoke to `ActivityLog` to feed the scoped **audit trail** too.

### 4.2 Connect flow (recommended: reuse the web login, no password in the extension)
Use `chrome.identity.launchWebAuthFlow`:

1. Extension opens `https://<APP_URL>/connect-extension?state=<nonce>&redirect_uri=https://<extid>.chromiumapp.org/`.
2. `/connect-extension` is a **normal gated page** — `proxy.ts` forces login if
   needed, so the user authenticates with their existing credentials in a real
   Operix tab (full trust, SSO-ready later).
3. The page shows "Authorize Operix Companion for **<browser>**?" → on click a
   Server Action mints an `ExtensionToken` and redirects to
   `redirect_uri#token=<raw>&state=<nonce>`.
4. `launchWebAuthFlow` captures the redirect; the extension verifies `state`,
   stores the raw token in `chrome.storage.local`, and calls `GET /me`.

**Fallback (simpler, less ideal):** an email+password form in the extension →
`POST /api/ext/v1/auth/login` (rate-limited, reuses `verifyPassword`) → returns a
token. Handles credentials inside the extension; offer only if launchWebAuthFlow
is a problem.

### 4.3 Request auth + authorization
- Every `/api/ext/v1/*` call sends `Authorization: Bearer <token>`.
- A helper `authenticateExtension(req)` hashes the token, looks up a live
  `ExtensionToken` (not revoked/expired), bumps `lastUsedAt`, and rebuilds a
  `SessionUser`-equivalent (`userId, companyId, role, email, employeeId`).
- Reuse existing authz unchanged: `resolvePermissions()` for capabilities,
  `taskScopeWhere()`/`resolveTaskScope()` for which tasks are visible,
  `canUseTimer()` for timer control, `canEditTask` for checklist toggles. The
  token grants **exactly** the user's normal rights — nothing more.

### 4.4 Disconnect / revoke
- Extension "Disconnect" → `POST /api/ext/v1/auth/revoke` (sets `revokedAt`) +
  clears local storage.
- Web app "Connected devices" list → revoke any token; "sign out everywhere".

---

## 5. Backend work (Operix side)

1. **Schema:** add `ExtensionToken` (+ relation on `User`); `db:push` (needs the
   usual explicit OK for the shared DB).
2. **Proxy exemption:** in `proxy.ts`, early-return `NextResponse.next()` for
   paths under `/api/ext/` (and answer `OPTIONS` preflight) **before** the
   cookie-auth redirect — otherwise bearer calls get 302'd to `/login`.
3. **CORS helper:** `lib/ext/cors.ts` — allow origin `chrome-extension://<id>`
   (from an `EXTENSION_ORIGINS` env allowlist), methods `GET,POST,OPTIONS`,
   headers `Authorization,Content-Type`; centralized `withCors()` + `preflight()`.
4. **Auth helper:** `lib/ext/auth.ts` — `authenticateExtension(req)` +
   `mintExtensionToken(session, label)` + `revokeToken()`.
5. **Refactor business logic into session-agnostic cores** (one source of truth):
   - `lib/timer/core.ts`: `startTimerFor(session, taskId)`,
     `pauseTimerFor(session, taskId)`, `stopTimerFor(session, taskId)` — the
     current `lib/timer/actions.ts` Server Actions become thin wrappers that read
     the cookie session, call the core, then `revalidatePath`.
   - `lib/projects/checklist-core.ts`: `toggleChecklistItemFor(session, itemId, isDone)`
     — `toggleChecklistItem` Server Action wraps it.
   - A `lib/ext/tasks.ts` `getActiveTasksFor(session)` that returns the DTO feed
     (running/paused timers + checklist + KB), reusing `getTaskTimerStates`,
     `canUseTimer`, and the service-match KB query from `tasks/[id]/page.tsx`.
6. **Route handlers** under `app/api/ext/v1/` (see §6).
7. **`/connect-extension` page** + authorize Server Action.
8. **"Connected devices"** management UI in the web app (Profile/Settings).
9. Env: `EXTENSION_ORIGINS` (comma-sep), reuse `APP_URL`, `AUTH_SECRET`.

### 5.1 Endpoints (`/api/ext/v1`)

| Method | Path | Purpose | Reuses |
|---|---|---|---|
| `OPTIONS` | `*` | CORS preflight → 204 | cors helper |
| `GET` | `/me` | Validate token → user + capabilities | `resolvePermissions` |
| `POST` | `/auth/login` | (Fallback) email+pw → token | `verifyPassword`, mint |
| `POST` | `/auth/revoke` | Disconnect current token | revoke |
| `GET` | `/tasks/active` | **Core feed**: running/paused tasks + timer + checklist + KB | `getActiveTasksFor` |
| `GET` | `/tasks/:id` | Single task detail (optional; feed may suffice) | same core |
| `POST` | `/tasks/:id/timer` | `{action:'start'\|'pause'\|'stop'}` → new timer state | timer core |
| `POST` | `/checklist/:itemId` | `{isDone}` → toggle | checklist core |
| `GET` | `/poll?since=<ms>` | (Opt.) only tasks changed since `ms` | core + `updatedAt` |

All responses JSON, `withCors()`-wrapped, bearer-guarded (except OPTIONS / login).

---

## 6. API contract (shared DTOs)

Define once in `shared/ext-contract.ts`, imported by the Next API (`@/shared/...`)
and by the extension build (relative import) so both sides stay in lockstep:

```ts
export type ExtTimer = { status: 'RUNNING'|'PAUSED'|'NONE'; baseSeconds: number; runStartedAtMs: number | null };
export type ExtChecklistItem = { id: string; text: string; isDone: boolean };
export type ExtKbLink = { id: string; title: string; scope: 'project'|'general'; url: string };
export type ExtTask = {
  id: string; name: string;
  projectId: string; projectName: string; serviceName: string | null;
  status: TaskStatus; priority: Priority; dueDate: string | null;
  isAssignee: boolean; isReviewer: boolean; canTime: boolean; canEdit: boolean;
  timer: ExtTimer; trackedSeconds: number;
  checklist: ExtChecklistItem[]; kb: ExtKbLink[];
  webUrl: string;                       // deep link → /tasks/:id
};
export type ExtActiveResponse = { tasks: ExtTask[]; serverTimeMs: number };  // serverTimeMs corrects clock skew
export type ExtUser = { id: string; email: string; displayName: string; role: Role; companyId: string; capabilities: string[] };
```

"Active tasks" = tasks where the user has a `TaskTimer` row (RUNNING or PAUSED).
That's the precise, cheap query (`TaskTimer where userId = me`) that maps exactly
to "running / paused tasks."

---

## 7. Extension architecture (MV3)

**Components**
- **Background service worker** — the only network caller. Holds the token, polls
  on a `chrome.alarms` cadence, fetches `/tasks/active`, broadcasts updates to all
  tabs' content scripts, and performs mutations on demand. (MV3 SWs are ephemeral
  → never rely on in-memory state; persist to `chrome.storage`, wake via alarms.)
- **Content script** — injected on `<all_urls>`; mounts the **dock** inside a
  **Shadow DOM** (style isolation from the host page). Renders task accordions,
  ticks the live timer locally every second (no network), and relays user actions
  to the background via `chrome.runtime` messaging.
- **Popup** (toolbar icon) — connect/disconnect, quick settings, status.
- **Options page** — full preferences (dock position, poll interval, theme, site
  allow/deny list, which states to show).

**Storage**
- `chrome.storage.local`: `{ token, cachedTasks, lastSyncMs }` (secrets/cache).
- `chrome.storage.sync`: `{ enabled, dock, collapsed, pollSeconds, theme, statesFilter, siteMode }` (prefs, roam across devices).

**Manifest (key parts)**
- `permissions`: `storage`, `alarms`, `identity` (connect flow).
- `host_permissions`: the Operix origin (e.g. `https://app.operix.com/*`).
- `content_scripts`: `matches: ["<all_urls>"]` for the always-on dock (privacy
  mitigations in §10); plus an options-page site allow/deny filter.
- `background.service_worker` (module), `action.default_popup`, icons.
- `content_security_policy.extension_pages`: `connect-src` limited to the API origin.
- `web_accessible_resources`: dock assets/fonts if needed.

---

## 8. UI / UX

**The dock**
- **Left / right** → a vertical panel (~320px), full height: best for accordions.
  Default = right.
- **Top / bottom** → a horizontal strip, full width: tasks render as compact
  chips; expanding opens a popover above/below (accordion-in-column doesn't fit a
  thin strip — documented trade-off).
- **Collapse** → shrinks to a thin tab/pill showing a count + the running timer;
  click to re-expand. Distinct from **off**.
- **Off** → content script removes the dock entirely; toolbar popup / a keyboard
  shortcut brings it back. "Stays until the user turns it off" = the `enabled`
  flag in `storage.sync`.

**Task row (collapsed):** status dot · name · project · live `HH:MM:SS` ·
play/pause (toggles RUNNING↔PAUSED) · stop (finalizes). Running rows sort to top.

**Task row (expanded accordion):**
- **Checklist** — progress bar + checkboxes; ticking calls
  `POST /checklist/:itemId` (optimistic). v1 = toggle only.
- **Related guides** — KB list (project-scoped first, then general), each opens
  `webUrl` (the Operix article) in a new tab. Optional later: inline preview.

**Theming** — mirror Operix's emerald/teal tokens, light + dark (follow OS or a
manual toggle). Reuse the same look so it feels native to the product.

**Customization surface** — position (4-way), collapse, on/off, poll interval,
theme, which states to show (running-only vs running+paused), per-site
visibility (all sites / allowlist / denylist), reorder strategy (running-first).

---

## 9. Data sync strategy

- **Live timer:** purely client-side. With `runStartedAtMs` + `serverTimeMs`
  (skew correction), the content script renders elapsed seconds via a 1s
  interval — **no polling needed** for the ticking display.
- **List/checklist/status changes:** background polls `GET /tasks/active` every
  `pollSeconds` (default 20–30s) via `chrome.alarms`, plus an **immediate refresh**
  when the popup opens and **after every mutation**.
- **Optimistic updates:** timer/checklist actions update the UI instantly, then
  reconcile against the response; roll back + toast on error.
- **Efficiency:** optional `GET /poll?since=` and/or `ETag`/304 to keep payloads
  small. Realtime (SSE) is a later upgrade — viable but harder against an
  ephemeral SW, so not in v1.

---

## 10. Security & privacy

- **Token:** stored hashed server-side; raw token only in `storage.local`; sent
  as bearer over HTTPS; revocable; `lastUsedAt` tracked; recommend 90-day expiry
  + silent refresh, or long-lived + manual revoke.
- **Multi-tenant:** every query re-scoped by `companyId` from the token; reuse
  `taskScopeWhere` so the extension can never see more tasks than the web app.
- **CORS allowlist:** only the published `chrome-extension://<id>` origin(s);
  reject others; preflight enforced.
- **CSP:** `connect-src` pinned to the API origin; no remote code.
- **Privacy on third-party pages:** the content script **reads nothing** from host
  pages — it only injects an isolated Shadow-DOM widget. No host-page data is sent
  anywhere. `<all_urls>` is required for an always-on dock; mitigate with a
  prominent allow/deny site list and a clear privacy disclosure for store review.
- **Rate-limit** `/auth/login`; **audit-log** token mint/revoke and timer/checklist
  mutations (feeds the scoped audit-trail feature).
- **Least privilege:** the API exposes only the task/timer/checklist/KB surface —
  not employee, payroll, or org data.

---

## 11. Tech stack & repo layout

- **Framework:** **WXT** (recommended) — MV3, first-class cross-browser
  (Chrome/Edge/Firefox/Safari targets), great DX, uses `browser.*` polyfill.
  Alternative: Vite + `@crxjs/vite-plugin` (Chrome-leaning).
- **UI:** **React 19 + Tailwind v4** (matches Operix; reuse design tokens). Dock
  mounted into a Shadow root.
- **Language:** TypeScript, sharing `shared/ext-contract.ts` with the backend.
- **Repo:** add an **`extension/`** folder in the Operix repo (monorepo) so it can
  import the shared contract and ship/version alongside the API. Its own
  `package.json` + build; not part of the Next build.
- **Packaging:** WXT build → Chrome Web Store + Edge Add-ons (one bundle); Firefox
  AMO from the same source.

---

## 12. Cross-browser

- **Chrome + Edge** (Chromium MV3): primary target, identical bundle.
- **Firefox**: MV3 supported; minor background/`browser.*` differences abstracted
  by WXT. `launchWebAuthFlow` has a Firefox equivalent.
- **Safari**: needs an Xcode wrapper + Apple developer account — **deferred**.

---

## 13. Phased delivery plan

| Phase | Deliverable | Rough effort* |
|---|---|---|
| **0 — Backend API + auth** | `ExtensionToken` schema; proxy exemption + CORS; auth/core refactor; `/me`, `/tasks/active`, `/tasks/:id/timer`, `/checklist/:itemId`; `/connect-extension` page; "Connected devices" UI | 3–5 d |
| **1 — Extension skeleton + read-only dock** | WXT project; connect flow; background poller; Shadow-DOM dock listing running/paused tasks with live timer; checklist + KB **read-only** | 4–6 d |
| **2 — Interactions** | Timer start/pause/stop; checklist toggle; optimistic updates + reconcile; error/reconnect states | 2–3 d |
| **3 — Customization + polish** | Dock position (L/R/T/B), collapse, on/off, options page, theme, state filter, site allow/deny; empty/loading states; icons | 3–4 d |
| **4 — Hardening + ship** | Token refresh/expiry, rate-limit, audit logs; Edge/Firefox; store listings + privacy disclosure; QA | 3–5 d |

\* Solo-dev estimates; **~3–4 weeks** for a polished v1.

**Critical path:** Phase 0 (the API + auth) unblocks everything. Phases 1→2→3 are
sequential on the extension; Phase 4 overlaps polish.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| httpOnly + `sameSite=lax` cookie unusable from the extension | Dedicated bearer token (§4) |
| `proxy.ts` 302s bearer API calls to `/login` | Exempt `/api/ext/*` early in the proxy |
| MV3 service worker killed mid-poll → lost state | `chrome.alarms` + `chrome.storage`; no in-memory reliance |
| Host-page CSS/JS clobbers the dock | Shadow DOM + scoped styles |
| `<all_urls>` raises store-review/privacy flags | Read nothing from pages; allow/deny list; clear disclosure |
| Duplicated timer/checklist logic drifts from the web app | Shared session-agnostic core; Server Actions become wrappers |
| Token theft | HTTPS-only, hashed at rest, revocable, expiry + "sign out everywhere" |
| Clock skew distorts live timer | `serverTimeMs` in the feed corrects it |

---

## 15. Decisions needed from you

1. **Auth bootstrap** — reuse-web-login via `launchWebAuthFlow` (recommended) vs
   email+password inside the extension?
2. **Browsers** — Chrome + Edge first (recommended), Firefox in Phase 4, Safari
   deferred — OK?
3. **Repo** — monorepo `extension/` folder (recommended) vs separate repo?
4. **Overlay scope** — inject on **all** sites by default (matches "always
   visible"), or start with an allowlist the user opts each site into?
5. **Timer control from the extension** — allow start/pause/stop (recommended) or
   read-only display in v1?
6. **API origin / domain** — confirm the production Operix domain so CORS +
   `host_permissions` can be pinned (depends on go-live domain).

---

## 16. Synergies with already-scoped work

- **Active-session / device management:** the `ExtensionToken` table is the same
  primitive — building it here delivers "connected devices / sign out everywhere"
  for the web app too.
- **Audit trail:** log token mint/revoke + extension-driven timer/checklist
  mutations into `ActivityLog`.
- **SSO (deferred):** the `/connect-extension` web-authorize flow is SSO-ready —
  once Google SSO lands, the connect flow inherits it for free.
- **API foundation:** `/api/ext/v1` is the first JSON API in Operix; it can later
  generalize into a public/integration API (mobile app, Zapier, etc.).
```
