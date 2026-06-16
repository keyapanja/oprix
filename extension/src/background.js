// Operix Companion — background service worker (MV3).
// The ONLY network caller. Holds the bearer token, polls the API on an alarm,
// performs mutations on demand, and broadcasts updates to every tab's dock.
// MV3 service workers are ephemeral, so all state lives in chrome.storage.

const DEFAULT_API_ORIGIN = "http://localhost:3000";
const POLL_ALARM = "operix-poll";

// Secrets + cache (device-local). Prefs roam via chrome.storage.sync.
const LK = { token: "operix_token", user: "operix_user", cache: "operix_cache" };
const PREFS_KEY = "operix_prefs";
const DEFAULT_PREFS = {
  enabled: true,
  dock: "right", // left | right | top | bottom
  collapsed: false,
  theme: "auto", // auto | light | dark
  pollSeconds: 30,
  showPaused: true,
  apiOrigin: "", // empty => DEFAULT_API_ORIGIN
};

async function getPrefs() {
  const o = await chrome.storage.sync.get(PREFS_KEY);
  return { ...DEFAULT_PREFS, ...(o[PREFS_KEY] || {}) };
}
async function getApiOrigin() {
  const p = await getPrefs();
  return (p.apiOrigin || DEFAULT_API_ORIGIN).replace(/\/+$/, "");
}
async function getToken() {
  return (await chrome.storage.local.get(LK.token))[LK.token] || null;
}

// ---- API client ----------------------------------------------------------
async function api(path, { method = "GET", body } = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not connected");
  const origin = await getApiOrigin();
  const res = await fetch(`${origin}/api/ext/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    await clearSession();
    throw new Error("Session expired — reconnect from the extension.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function clearSession() {
  await chrome.storage.local.remove([LK.token, LK.user, LK.cache]);
}

// ---- Connect / disconnect ------------------------------------------------
function deviceLabel() {
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return browser + (os ? ` on ${os}` : "");
}

async function connect() {
  const origin = await getApiOrigin();
  const redirectUri = chrome.identity.getRedirectURL(); // https://<id>.chromiumapp.org/
  const state = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const url =
    `${origin}/connect-extension?state=${encodeURIComponent(state)}` +
    `&label=${encodeURIComponent(deviceLabel())}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const redirect = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!redirect) throw new Error("Connect was cancelled");
  const frag = redirect.includes("#") ? redirect.split("#")[1] : redirect.split("?")[1] || "";
  const params = new URLSearchParams(frag);
  if (params.get("state") !== state) throw new Error("Security check failed — please try again");
  const token = params.get("token");
  if (!token) throw new Error("No token returned from Operix");

  await chrome.storage.local.set({ [LK.token]: token });
  const me = await api("/me");
  await chrome.storage.local.set({ [LK.user]: me });
  await refresh();
  return me;
}

async function disconnect() {
  try {
    await api("/auth/revoke", { method: "POST" });
  } catch {
    /* revoke best-effort; clear locally regardless */
  }
  await clearSession();
  broadcast({ type: "OPERIX_UPDATE", connected: false, feed: null });
}

// ---- Data ----------------------------------------------------------------
async function refresh() {
  const feed = await api("/tasks/active");
  await chrome.storage.local.set({ [LK.cache]: feed });
  broadcast({ type: "OPERIX_UPDATE", connected: true, feed });
  return feed;
}

async function timer(taskId, action) {
  const feed = await api(`/tasks/${taskId}/timer`, { method: "POST", body: { action } });
  await chrome.storage.local.set({ [LK.cache]: feed });
  broadcast({ type: "OPERIX_UPDATE", connected: true, feed });
  return feed;
}

async function checklist(itemId, isDone) {
  await api(`/checklist/${itemId}`, { method: "POST", body: { isDone } });
  return refresh();
}

async function submitForReview(taskId, finalLink) {
  const feed = await api(`/tasks/${taskId}/submit`, { method: "POST", body: { finalLink } });
  await chrome.storage.local.set({ [LK.cache]: feed });
  broadcast({ type: "OPERIX_UPDATE", connected: true, feed });
  return feed;
}

async function broadcast(msg) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id != null) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
  }
}

// ---- Messaging (from content scripts + popup) ----------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case "OPERIX_CONNECT":
          sendResponse({ ok: true, user: await connect() });
          break;
        case "OPERIX_DISCONNECT":
          await disconnect();
          sendResponse({ ok: true });
          break;
        case "OPERIX_REFRESH":
          sendResponse({ ok: true, feed: await refresh() });
          break;
        case "OPERIX_GET_STATE": {
          const s = await chrome.storage.local.get([LK.token, LK.user, LK.cache]);
          sendResponse({
            ok: true,
            connected: !!s[LK.token],
            user: s[LK.user] || null,
            feed: s[LK.cache] || null,
          });
          break;
        }
        case "OPERIX_TIMER":
          sendResponse({ ok: true, feed: await timer(msg.taskId, msg.action) });
          break;
        case "OPERIX_CHECKLIST":
          sendResponse({ ok: true, feed: await checklist(msg.itemId, msg.isDone) });
          break;
        case "OPERIX_SUBMIT":
          sendResponse({ ok: true, feed: await submitForReview(msg.taskId, msg.finalLink) });
          break;
        default:
          sendResponse({ ok: false, error: "Unknown request" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the channel open for the async response
});

// ---- Poll alarm ----------------------------------------------------------
async function setupAlarm() {
  const p = await getPrefs();
  const minutes = Math.max(0.5, (p.pollSeconds || 30) / 60);
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: minutes });
}

chrome.runtime.onInstalled.addListener(() => setupAlarm());
chrome.runtime.onStartup.addListener(() => setupAlarm());

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== POLL_ALARM) return;
  if (await getToken()) {
    try {
      await refresh();
    } catch {
      /* transient; next tick retries */
    }
  }
});

// Re-arm the alarm when the poll interval changes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[PREFS_KEY]) setupAlarm();
});
