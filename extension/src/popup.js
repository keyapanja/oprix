// Operix Companion — popup: the primary on/off switch + quick dock controls.

const PREFS_KEY = "operix_prefs";
const DEFAULT_PREFS = {
  enabled: true,
  dock: "right",
  mode: "compact",
  collapsed: false,
  theme: "auto",
  pollSeconds: 30,
  showPaused: true,
  apiOrigin: "",
};

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

async function getPrefs() {
  const o = await chrome.storage.sync.get(PREFS_KEY);
  return { ...DEFAULT_PREFS, ...(o[PREFS_KEY] || {}) };
}
async function setPrefs(patch) {
  const next = { ...(await getPrefs()), ...patch };
  await chrome.storage.sync.set({ [PREFS_KEY]: next });
  return next;
}

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const k of kids) n.append(k);
  return n;
}

function buildSwitch(checked, onChange) {
  const label = el("label", { className: "switch" });
  const input = el("input", { type: "checkbox", checked });
  const slider = el("span", { className: "slider" });
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, slider);
  return label;
}

async function render() {
  const app = $("app");
  app.textContent = "";
  const [state, prefs] = await Promise.all([send({ type: "OPERIX_GET_STATE" }), getPrefs()]);
  const connected = !!(state && state.connected);
  $("dot").className = "dot" + (connected ? " on" : "");

  const err = el("div", { className: "err", id: "err" });

  // Primary on/off — the dock has no close button, so this is THE switch.
  const showCard = el("div", { className: "toggle-card" });
  showCard.append(
    el(
      "div",
      {},
      el("div", { className: "tc-title", textContent: "Show dock on pages" }),
      el("div", { className: "tc-sub", textContent: "The floating dock turns on or off here." }),
    ),
    buildSwitch(prefs.enabled, async (on) => {
      await setPrefs({ enabled: on });
      render();
    }),
  );
  app.append(showCard);

  // Connection status
  if (connected) {
    const who = (state.user && (state.user.displayName || state.user.email)) || "your account";
    app.append(el("div", { className: "muted", textContent: `Connected as ${who}` }));
  } else {
    app.append(
      el("div", { className: "muted", textContent: "Connect the extension to show your running tasks." }),
    );
  }

  // Connect / disconnect
  if (connected) {
    const dc = el("button", { className: "danger", textContent: "Disconnect" });
    dc.onclick = async () => {
      dc.disabled = true;
      const r = await send({ type: "OPERIX_DISCONNECT" });
      if (!r || !r.ok) err.textContent = (r && r.error) || "Failed to disconnect";
      render();
    };
    app.append(dc);
  } else {
    const c = el("button", { className: "primary", textContent: "Connect to Operix" });
    c.onclick = async () => {
      c.disabled = true;
      c.textContent = "Opening Operix…";
      const r = await send({ type: "OPERIX_CONNECT" });
      if (!r || !r.ok) {
        err.textContent = (r && r.error) || "Connect failed";
        c.disabled = false;
        c.textContent = "Connect to Operix";
      } else {
        render();
      }
    };
    app.append(c);
  }

  // Dock position
  const posRow = el("div", { className: "row" });
  posRow.append(el("label", { textContent: "Dock position" }));
  const seg = el("div", { className: "seg" });
  for (const pos of ["left", "right", "top", "bottom"]) {
    const b = el("button", {
      textContent: pos[0].toUpperCase(),
      title: pos,
      className: prefs.dock === pos ? "active" : "",
    });
    b.onclick = async () => {
      await setPrefs({ dock: pos });
      render();
    };
    seg.append(b);
  }
  posRow.append(seg);
  app.append(posRow);

  // Refresh + settings
  if (connected) {
    const refresh = el("button", { textContent: "Refresh now" });
    refresh.onclick = async () => {
      refresh.disabled = true;
      refresh.textContent = "Refreshing…";
      const r = await send({ type: "OPERIX_REFRESH" });
      if (!r || !r.ok) err.textContent = (r && r.error) || "Refresh failed";
      refresh.disabled = false;
      refresh.textContent = "Refresh now";
    };
    app.append(refresh);
  }

  const opts = el("button", { className: "link", textContent: "Advanced settings →" });
  opts.onclick = () => chrome.runtime.openOptionsPage();
  app.append(opts);
  app.append(err);
}

render();
