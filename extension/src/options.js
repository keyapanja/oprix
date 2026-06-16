// Operix Companion — options page (full preferences).

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

async function getPrefs() {
  const o = await chrome.storage.sync.get(PREFS_KEY);
  return { ...DEFAULT_PREFS, ...(o[PREFS_KEY] || {}) };
}
async function setPrefs(patch) {
  const next = { ...(await getPrefs()), ...patch };
  await chrome.storage.sync.set({ [PREFS_KEY]: next });
  flashSaved();
  return next;
}
function flashSaved() {
  const s = document.getElementById("saved");
  s.textContent = "Saved";
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => (s.textContent = ""), 1200);
}

function row(label, desc, control) {
  const r = document.createElement("div");
  r.className = "row";
  const left = document.createElement("div");
  const l = document.createElement("div");
  l.className = "label";
  l.textContent = label;
  left.append(l);
  if (desc) {
    const d = document.createElement("div");
    d.className = "desc";
    d.textContent = desc;
    left.append(d);
  }
  r.append(left, control);
  return r;
}

function selectControl(value, options, onChange) {
  const s = document.createElement("select");
  for (const [val, text] of options) {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = text;
    if (val === String(value)) o.selected = true;
    s.append(o);
  }
  s.onchange = () => onChange(s.value);
  return s;
}

async function render() {
  const prefs = await getPrefs();
  const form = document.getElementById("form");
  form.textContent = "";

  form.append(
    row(
      "Show dock on pages",
      "Turn the floating task dock on or off everywhere.",
      selectControl(prefs.enabled ? "on" : "off", [["on", "On"], ["off", "Off"]], (v) =>
        setPrefs({ enabled: v === "on" }),
      ),
    ),
  );

  form.append(
    row(
      "Dock size",
      "Start as a small floating card or a full-height panel.",
      selectControl(
        prefs.mode,
        [["compact", "Compact card"], ["full", "Full panel"]],
        (v) => setPrefs({ mode: v }),
      ),
    ),
  );

  form.append(
    row(
      "Dock position",
      "Which edge of the screen the dock sticks to.",
      selectControl(
        prefs.dock,
        [["left", "Left"], ["right", "Right"], ["top", "Top"], ["bottom", "Bottom"]],
        (v) => setPrefs({ dock: v }),
      ),
    ),
  );

  form.append(
    row(
      "Theme",
      "Match your system, or force light / dark.",
      selectControl(
        prefs.theme,
        [["auto", "Match system"], ["light", "Light"], ["dark", "Dark"]],
        (v) => setPrefs({ theme: v }),
      ),
    ),
  );

  form.append(
    row(
      "Show paused tasks",
      "Include paused timers, not just running ones.",
      selectControl(prefs.showPaused ? "on" : "off", [["on", "Yes"], ["off", "Only running"]], (v) =>
        setPrefs({ showPaused: v === "on" }),
      ),
    ),
  );

  form.append(
    row(
      "Refresh interval",
      "How often the dock checks for changes.",
      selectControl(
        String(prefs.pollSeconds),
        [["15", "15 seconds"], ["30", "30 seconds"], ["60", "1 minute"], ["120", "2 minutes"]],
        (v) => setPrefs({ pollSeconds: Number(v) }),
      ),
    ),
  );

  // API origin (advanced — for pointing at a deployed Operix instead of localhost)
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "http://localhost:3000";
  input.value = prefs.apiOrigin || "";
  input.onchange = () => setPrefs({ apiOrigin: input.value.trim().replace(/\/+$/, "") });
  form.append(
    row("Operix address", "Leave blank for local development (localhost:3000).", input),
  );
}

render();
