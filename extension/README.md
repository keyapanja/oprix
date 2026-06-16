# Operix Companion — browser extension

A floating dock that keeps your **running / paused Operix tasks** pinned to the
edge of any web page, each expandable to its **checklist** and **related
knowledge-base guides**, with start / pause / stop timer controls. Dock position
(left / right / top / bottom), theme, and on/off are all customizable.

This is a **plain MV3 extension — no build step**. Just load the folder.

---

## Prerequisites
- The Operix dev server running at **http://localhost:3000** (`npm run dev`).
- A staff Operix account you can log in with (e.g. `admin@operix.test`).
- Chrome or Edge (Chromium). Firefox works with minor differences.

## Load it (≈30 seconds)
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`D:\Operix\extension`** folder.
4. The “Operix Companion” icon appears in your toolbar (pin it for convenience).

## Connect
1. Click the **Operix Companion** toolbar icon → **Connect to Operix**.
2. A tab opens at `localhost:3000/connect-extension`. Log in if needed, then click
   **Authorize**. The tab closes itself and the extension is connected.
   - No password is ever typed into the extension — it reuses your normal Operix
     login and receives a scoped, revocable token.

## Use it
- Start a timer on any task in Operix (the play button on a task). It appears in
  the dock within a few seconds (or click **Refresh**).
- **Live timer** ticks in real time. **▶ / ⏸** start/pause, **■** stops (banks the
  time). Controls show only when you’re allowed to time that task.
- Click the **chevron** to expand a task → tick **checklist** items and open
  **related guides** (open in a new Operix tab).
- Click a **task name** to open it in Operix.

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
- The dock is automatically **hidden on the Operix site itself** — you're already
  in the app there.

## Manage / disconnect
- **Disconnect** from the popup, or revoke any device from the Operix web app at
  **Profile → Connected devices** (`/profile/devices`).

## Troubleshooting
- **“No running tasks.”** Start a timer on a task in Operix first — the dock only
  shows tasks you have an active timer on.
- **“Session expired — reconnect.”** Click the toolbar icon → Connect again.
- **Nothing loads / connect fails.** Make sure `npm run dev` is running on
  `localhost:3000` and you’re logged in there.
- **Dock not visible.** Check the popup’s “Show dock on pages” is On; some pages
  with very high z-index overlays may sit above it.

---

## Going to production later
This build is wired for **localhost**. When Operix is deployed:
1. In `manifest.json`, change `host_permissions` to your live origin
   (e.g. `https://app.operix.com/*`). Keep/replace localhost as needed.
2. In the extension **options → Operix address**, set your live URL (or change the
   default in code).
3. On the server, set `EXTENSION_ORIGINS=chrome-extension://<your-extension-id>`
   so CORS is locked to your published extension.
4. (Recommended) Pin the extension id by adding a `"key"` to `manifest.json` so
   dev and Web Store builds share one id.

No code rearchitecture is needed — the API origin is just configuration.
