# Oprix Companion — browser extension

A floating dock that keeps your **running / paused Oprix tasks** pinned to the
edge of any web page, each expandable to its **checklist** and **related
knowledge-base guides**, with start / pause / stop timer controls. Dock position
(left / right / top / bottom), theme, and on/off are all customizable.

This is a **plain MV3 extension — no build step**. Just load the folder.

---

## Prerequisites
- Access to your Oprix instance — the extension defaults to **https://oprix.gowithepic.com**
  (set a local URL in the options page for dev — see "Production vs local dev" below).
- A staff Oprix account you can log in with.
- Chrome or Edge (Chromium). Firefox works with minor differences.

## Load it (≈30 seconds)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`D:\Oprix\extension`** folder.
4. The “Oprix Companion” icon appears in your toolbar (pin it for convenience).

## Connect
1. Click the **Oprix Companion** toolbar icon → **Connect to Oprix**.
2. A tab opens at `oprix.gowithepic.com/connect-extension`. Log in if needed, then click
   **Authorize**. The tab closes itself and the extension is connected.
   - No password is ever typed into the extension — it reuses your normal Oprix
     login and receives a scoped, revocable token.

## Use it
- Start a timer on any task in Oprix (the play button on a task). It appears in
  the dock within a few seconds (or click **Refresh**).
- **Live timer** ticks in real time. **▶ / ⏸** start/pause, **■** stops (banks the
  time). Controls show only when you’re allowed to time that task.
- Click the **chevron** to expand a task → tick **checklist** items and open
  **related guides** (open in a new Oprix tab).
- Click a **task name** to open it in Oprix.

## Customize
From the toolbar **popup** or **Advanced settings** (options page):
- **Dock position** — left, right, top, or bottom.
- **Show dock on pages** — global on/off (the dock stays until you turn it off).
- **Theme** — match system, or force light / dark.
- **Show paused tasks** — include paused timers or only running ones.
- **Refresh interval** — 15s / 30s / 1m / 2m.
- **Size** — the dock starts as a **compact floating card**. The ⤢ button expands it
  to a full-height panel; the **−** button minimizes it to a small pill.
- **Move the chip** — when minimized, **drag the pill anywhere** on screen; it
  remembers where you put it. A click (without dragging) reopens the dock.
- The dock is automatically **hidden on the Oprix site itself** — you're already
  in the app there.

## Manage / disconnect
- **Disconnect** from the popup, or revoke any device from the Oprix web app at
  **Profile → Connected devices** (`/profile/devices`).

## Troubleshooting
- **“No running tasks.”** Start a timer on a task in Oprix first — the dock only
  shows tasks you have an active timer on.
- **“Session expired — reconnect.”** Click the toolbar icon → Connect again.
- **“Unknown request” / nothing loads.** The background worker is running a stale
  copy. Open `chrome://extensions`, click **⟳ reload** on Oprix Companion, then
  reload the web page.
- **Connect fails on production.** The server must allow this extension's id —
  set `EXTENSION_ORIGINS=chrome-extension://<your-id>` and redeploy (see below).
- **Dock not visible.** Check the popup’s “Show dock on pages” is On; some pages
  with very high z-index overlays may sit above it.

---

## Production (default) vs local dev
This build is **wired for production** — it talks to **https://oprix.gowithepic.com**
out of the box (`host_permissions` + default API origin), and the dock auto-hides on
that site. The one remaining step is server-side CORS:

The extension id is **pinned** via the manifest `key`, so it's the same for everyone
who installs it: `cjmfclenldejgleeppfoaeekkfcdhgde`.

1. On the server (Coolify), set this once and redeploy:
   **`EXTENSION_ORIGINS=chrome-extension://cjmfclenldejgleeppfoaeekkfcdhgde`**
   Without it the API rejects the extension — CORS fails closed by design.
2. **Load unpacked** (above) and click **Connect** — the connect tab opens on
   oprix.gowithepic.com. (You can confirm the id matches on the extension's card.)

**For local dev:** open the extension **options → Oprix address** and set
`http://localhost:3000` (localhost is still in `host_permissions`). Run `npm run dev`
and connect as usual.

No code rearchitecture is needed — the API origin is just configuration.
