// Oprix Companion — content script: the floating dock.
// Renders inside a Shadow DOM (isolated from the host page). Reads NOTHING from
// the page; only talks to the background worker via chrome.runtime messaging.

(() => {
  if (window.__oprixDockLoaded) return; // guard against double injection
  window.__oprixDockLoaded = true;

  const PREFS_KEY = "oprix_prefs";
  const DEFAULT_PREFS = {
    enabled: true,
    dock: "right",
    mode: "compact", // compact (small floating card) | full (edge-to-edge panel)
    collapsed: false,
    theme: "auto",
    pollSeconds: 30,
    showPaused: true,
    apiOrigin: "",
    pillPos: null, // {left, top} once the collapsed chip has been dragged
  };

  const state = {
    prefs: { ...DEFAULT_PREFS },
    connected: false,
    user: null,
    feed: null, // ExtActiveResponse
    error: "",
    clockSkew: 0, // clientNow - serverTimeMs
    expanded: new Set(),
    busy: new Set(), // task/item ids with an in-flight action
    drafts: {}, // taskId -> in-progress "final output link" text
  };

  let host, shadow, panel;

  // ---- icons (inline SVG) ----
  const I = {
    play: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    collapse:
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/></svg>',
    book: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    logo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    expand:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>',
    shrink:
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10h-6V4M14 10l6-6M4 14h6v6M10 14l-6 6"/></svg>',
  };

  const PRIORITY_TONE = { LOW: "#64748b", MEDIUM: "#0ea5e9", HIGH: "#f59e0b", URGENT: "#ef4444" };
  const STATUS_LABEL = {
    TODO: "To Do",
    IN_PROGRESS: "In Progress",
    REVIEW: "Review",
    REDO: "Redo",
    CLIENT_REVIEW: "Client Review",
    COMPLETED: "Completed",
  };

  // ---- helpers ----
  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r || { ok: false, error: "No response" });
        });
      } catch (e) {
        resolve({ ok: false, error: String((e && e.message) || e) });
      }
    });

  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "html") n.innerHTML = v;
        else if (k === "onclick") n.addEventListener("click", v);
        else if (k === "onchange") n.addEventListener("change", v);
        else if (k.startsWith("data-")) n.setAttribute(k, v);
        else if (k === "title") n.title = v;
        else n[k] = v;
      }
    }
    for (const kid of kids) {
      if (kid == null || kid === false) continue;
      n.append(typeof kid === "string" || typeof kid === "number" ? String(kid) : kid);
    }
    return n;
  }

  function liveSeconds(t) {
    const base = t.baseSeconds || 0;
    if (t.status === "RUNNING" && t.runStartedAtMs) {
      const serverNow = Date.now() - state.clockSkew;
      return base + Math.max(0, Math.floor((serverNow - t.runStartedAtMs) / 1000));
    }
    return base;
  }
  function fmtClock(total) {
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const hr = Math.floor(total / 3600);
    const p = (n) => String(n).padStart(2, "0");
    return hr > 0 ? `${hr}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  }

  // ---- prefs ----
  async function loadPrefs() {
    const o = await chrome.storage.sync.get(PREFS_KEY);
    state.prefs = { ...DEFAULT_PREFS, ...(o[PREFS_KEY] || {}) };
  }
  async function setPrefs(patch) {
    state.prefs = { ...state.prefs, ...patch };
    await chrome.storage.sync.set({ [PREFS_KEY]: state.prefs });
  }

  function oprixOrigin() {
    return (state.prefs.apiOrigin || "https://oprix.gowithepic.com").replace(/\/+$/, "");
  }
  // The dock is redundant on the Oprix app itself — hide it there.
  function onOprixSite() {
    try {
      return location.origin.replace(/\/+$/, "") === oprixOrigin();
    } catch {
      return false;
    }
  }

  // ---- shell (host + shadow + style) ----
  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    host.id = "oprix-companion-dock";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    panel = document.createElement("div");
    panel.className = "panel";
    shadow.append(style, panel);
    (document.documentElement || document.body).append(host);
  }

  function applyShell() {
    if (!state.prefs.enabled || onOprixSite()) {
      if (host) host.style.display = "none";
      return;
    }
    ensureHost();
    host.style.display = "block";
    const dark =
      state.prefs.theme === "dark" ||
      (state.prefs.theme === "auto" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    panel.setAttribute("data-theme", dark ? "dark" : "light");
    panel.setAttribute("data-dock", state.prefs.dock);
    panel.setAttribute("data-mode", state.prefs.mode || "compact");
    panel.classList.toggle("collapsed", !!state.prefs.collapsed);
    // Full-width horizontal layout only applies to the FULL top/bottom dock.
    const horizontal =
      (state.prefs.dock === "top" || state.prefs.dock === "bottom") &&
      (state.prefs.mode || "compact") === "full";
    panel.classList.toggle("horizontal", horizontal);
    applyPillAnchor();
  }

  // When collapsed and the chip was dragged, pin it to that point; otherwise let
  // the CSS dock corner place it. Inline position is cleared for the panel.
  function applyPillAnchor() {
    const p = state.prefs.collapsed ? state.prefs.pillPos : null;
    if (p && typeof p.left === "number") {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = panel.offsetWidth || 120;
      const hh = panel.offsetHeight || 40;
      panel.style.left = Math.max(6, Math.min(vw - w - 6, p.left)) + "px";
      panel.style.top = Math.max(6, Math.min(vh - hh - 6, p.top)) + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    } else {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
    }
  }

  // ---- render ----
  function visibleTasks() {
    const tasks = (state.feed && state.feed.tasks) || [];
    return state.prefs.showPaused ? tasks : tasks.filter((t) => t.timer.status === "RUNNING");
  }

  function render() {
    applyShell();
    if (!state.prefs.enabled || onOprixSite() || !panel) return;
    panel.textContent = "";

    if (state.prefs.collapsed) {
      panel.append(renderCollapsed());
      updateTimers(); // fill the pill's time now — avoids a ~1s blank flash on re-render
      return;
    }
    panel.append(renderHeader());
    const body = h("div", { class: "body" });
    if (!state.connected) {
      body.append(renderConnect());
    } else {
      const tasks = visibleTasks();
      if (state.error) body.append(h("div", { class: "banner err" }, state.error));
      if (tasks.length === 0) {
        body.append(
          h(
            "div",
            { class: "empty" },
            "No running tasks. Start a timer on a task in Oprix and it'll show up here.",
          ),
        );
      } else {
        const list = h("div", { class: "list" });
        for (const t of tasks) list.append(renderTask(t));
        body.append(list);
      }
    }
    panel.append(body);
    updateTimers();
  }

  function renderCollapsed() {
    const tasks = visibleTasks();
    const running = tasks.filter((t) => t.timer.status === "RUNNING");
    const pill = h("button", {
      class: "pill" + (running.length ? " running" : ""),
      title: "Drag to move · click to open",
    });
    pill.append(h("span", { class: "pill-ic", html: I.logo }));
    if (running.length) {
      const r = running[0];
      pill.append(
        h("span", {
          class: "time pill-time",
          "data-status": "RUNNING",
          "data-base": String(r.timer.baseSeconds || 0),
          "data-start": r.timer.runStartedAtMs ? String(r.timer.runStartedAtMs) : "",
        }),
      );
      pill.append(h("span", { class: "pill-badge" }, String(tasks.length)));
    } else {
      pill.append(
        h("span", { class: "pill-label" }, tasks.length ? `${tasks.length} ${tasks.length > 1 ? "tasks" : "task"}` : "Oprix"),
      );
    }
    makeChipDraggable(pill);
    return pill;
  }

  // Drag the collapsed chip anywhere; a click (no drag) opens the dock.
  function makeChipDraggable(pill) {
    let sx = 0, sy = 0, ol = 0, ot = 0, down = false, moved = false;
    pill.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      down = true;
      moved = false;
      sx = e.clientX;
      sy = e.clientY;
      const rect = panel.getBoundingClientRect();
      ol = rect.left;
      ot = rect.top;
      pill.classList.add("grabbing");
      try { pill.setPointerCapture(e.pointerId); } catch {}
    });
    pill.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
      if (!moved) return;
      const w = panel.offsetWidth, hh = panel.offsetHeight;
      // Clamp to the CONTENT area (clientWidth/Height exclude the scrollbars), so
      // the chip can never be dropped onto or under the scrollbar.
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      panel.style.left = Math.max(6, Math.min(vw - w - 6, ol + dx)) + "px";
      panel.style.top = Math.max(6, Math.min(vh - hh - 6, ot + dy)) + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    const end = async (e) => {
      if (!down) return;
      down = false;
      pill.classList.remove("grabbing");
      try { pill.releasePointerCapture(e.pointerId); } catch {}
      if (moved) {
        const rect = panel.getBoundingClientRect();
        await setPrefs({ pillPos: { left: Math.round(rect.left), top: Math.round(rect.top) } });
      } else {
        await setPrefs({ collapsed: false });
        render();
      }
    };
    pill.addEventListener("pointerup", end);
    pill.addEventListener("pointercancel", end);
  }

  function renderHeader() {
    const dot = h("span", { class: "dot" + (state.connected ? " on" : "") });
    const title = h("span", { class: "title" }, h("span", { class: "logo", html: I.logo }), "Oprix");
    const spacer = h("span", { class: "spacer" });
    const btns = h("span", { class: "hbtns" });
    if (state.connected)
      btns.append(
        iconBtn(I.refresh, "Refresh", async (b) => {
          b.classList.add("spin");
          await send({ type: "OPRIX_REFRESH" });
          b.classList.remove("spin");
        }),
      );
    btns.append(
      iconBtn(
        state.prefs.mode === "full" ? I.shrink : I.expand,
        state.prefs.mode === "full" ? "Shrink to compact card" : "Expand to full panel",
        () => setPrefs({ mode: state.prefs.mode === "full" ? "compact" : "full" }).then(render),
      ),
      iconBtn(I.collapse, "Minimize", () => setPrefs({ collapsed: true }).then(render)),
    );
    return h("div", { class: "header" }, dot, title, spacer, btns);
  }

  function renderConnect() {
    const wrap = h("div", { class: "connect" });
    wrap.append(h("div", { class: "connect-msg" }, "Connect to Oprix to see your running tasks here."));
    const btn = h("button", {
      class: "btn primary",
      onclick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.textContent = "Opening Oprix…";
        const r = await send({ type: "OPRIX_CONNECT" });
        if (!r || !r.ok) {
          state.error = (r && r.error) || "Connect failed";
          render();
        }
      },
    });
    btn.textContent = "Connect to Oprix";
    wrap.append(btn);
    if (state.error) wrap.append(h("div", { class: "connect-err" }, state.error));
    return wrap;
  }

  function iconBtn(svg, title, onClick) {
    return h("button", { class: "ibtn", title, html: svg, onclick: (e) => onClick(e.currentTarget, e) });
  }

  function renderTask(t) {
    const expanded = state.expanded.has(t.id);
    const card = h("div", { class: "card" + (t.timer.status === "RUNNING" ? " running" : "") });

    // header row
    const accent = h("span", { class: "accent", style: `background:${PRIORITY_TONE[t.priority] || "#64748b"}` });
    const name = h("button", {
      class: "task-name",
      title: "Open in Oprix",
      onclick: () => window.open(t.webUrl, "_blank", "noopener"),
    });
    name.textContent = t.name;
    const meta = h(
      "div",
      { class: "task-meta" },
      h("span", { class: "st-badge st-" + t.status }, STATUS_LABEL[t.status] || t.status),
      t.projectName,
      t.serviceName ? h("span", { class: "sep" }, "·") : null,
      t.serviceName || null,
    );
    const nameCol = h("div", { class: "name-col" }, name, meta);

    const time = h("span", {
      class: "time",
      "data-status": t.timer.status,
      "data-base": String(t.timer.baseSeconds || 0),
      "data-start": t.timer.runStartedAtMs ? String(t.timer.runStartedAtMs) : "",
    });

    const controls = h("div", { class: "controls" });
    if (t.canTime) {
      const running = t.timer.status === "RUNNING";
      const label = running ? "Pause" : t.timer.status === "PAUSED" ? "Resume" : "Start";
      controls.append(actionBtn(running ? I.pause : I.play, label, t.id, running ? "pause" : "start"));
    }
    const chevron = h("button", {
      class: "chev" + (expanded ? " open" : ""),
      title: expanded ? "Collapse" : "Expand",
      html: I.chevron,
      onclick: () => {
        if (state.expanded.has(t.id)) state.expanded.delete(t.id);
        else state.expanded.add(t.id);
        render();
      },
    });

    const headRow = h(
      "div",
      { class: "card-head" },
      accent,
      nameCol,
      h("div", { class: "right" }, time, controls, chevron),
    );
    card.append(headRow);

    if (expanded) card.append(renderTaskBody(t));
    return card;
  }

  function actionBtn(svg, title, taskId, action, variant) {
    const busy = state.busy.has(taskId);
    return h("button", {
      class: "tbtn" + (variant ? " " + variant : ""),
      title,
      html: svg,
      disabled: busy,
      onclick: async (e) => {
        e.stopPropagation();
        if (state.busy.has(taskId)) return;
        state.busy.add(taskId);
        e.currentTarget.classList.add("busy");
        const r = await send({ type: "OPRIX_TIMER", taskId, action });
        state.busy.delete(taskId);
        if (!r || !r.ok) {
          state.error = (r && r.error) || "Action failed";
          render();
        }
        // success → background broadcasts OPRIX_UPDATE which re-renders
      },
    });
  }

  function renderTaskBody(t) {
    const body = h("div", { class: "card-body" });

    // checklist
    const done = t.checklist.filter((c) => c.isDone).length;
    if (t.checklist.length) {
      body.append(
        h(
          "div",
          { class: "section-label" },
          `Checklist`,
          h("span", { class: "count" }, `${done}/${t.checklist.length}`),
        ),
      );
      const ul = h("div", { class: "checklist" });
      for (const c of t.checklist) {
        const box = h("button", {
          class: "check" + (c.isDone ? " checked" : ""),
          disabled: !t.canEdit || state.busy.has(c.id),
          html: c.isDone
            ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5 9-10"/></svg>'
            : "",
          onclick: async () => {
            if (!t.canEdit || state.busy.has(c.id)) return;
            state.busy.add(c.id);
            // optimistic
            c.isDone = !c.isDone;
            render();
            const r = await send({ type: "OPRIX_CHECKLIST", itemId: c.id, isDone: c.isDone });
            state.busy.delete(c.id);
            if (!r || !r.ok) {
              c.isDone = !c.isDone; // rollback
              state.error = (r && r.error) || "Couldn't update";
              render();
            }
          },
        });
        const label = h("span", { class: "check-text" + (c.isDone ? " struck" : "") }, c.text);
        ul.append(h("div", { class: "check-row" }, box, label));
      }
      body.append(ul);
    }

    // related KB
    if (t.kb && t.kb.length) {
      body.append(h("div", { class: "section-label" }, "Related guides"));
      const kb = h("div", { class: "kb" });
      for (const g of t.kb) {
        const link = h(
          "button",
          { class: "kb-item", title: g.title, onclick: () => window.open(g.url, "_blank", "noopener") },
          h("span", { class: "kb-ic", html: I.book }),
          h("span", { class: "kb-title" }, g.title),
          g.scope === "project" ? h("span", { class: "tag" }, "project") : null,
          h("span", { class: "kb-ext", html: I.ext }),
        );
        kb.append(link);
      }
      body.append(kb);
    }

    // Workflow: once the checklist is complete (or there is none), reveal the
    // final-output link + Submit for review. Submitting moves the task to REVIEW,
    // so it drops off the dock.
    const allChecked = t.checklist.every((c) => c.isDone); // true when no checklist
    if (allChecked) body.append(renderWorkflow(t));

    if (!t.checklist.length && (!t.kb || !t.kb.length) && !allChecked) {
      body.append(h("div", { class: "empty-sm" }, "No checklist or guides for this task."));
    }
    return body;
  }

  function renderWorkflow(t) {
    const wrap = h("div", { class: "workflow" });
    wrap.append(h("div", { class: "section-label" }, "Workflow"));
    const input = h("input", {
      class: "wf-input",
      type: "url",
      placeholder: "Final output / preview link (https://…)",
      value: state.drafts[t.id] || "",
    });
    input.addEventListener("input", () => {
      state.drafts[t.id] = input.value;
    });
    const err = h("div", { class: "wf-err" });
    const btn = h("button", { class: "wf-submit" }, "Submit for review");
    btn.addEventListener("click", async () => {
      const link = (state.drafts[t.id] || input.value || "").trim();
      if (!link) {
        err.textContent = "Add the final output / preview link first.";
        input.focus();
        return;
      }
      btn.disabled = true;
      btn.textContent = "Submitting…";
      err.textContent = "";
      const r = await send({ type: "OPRIX_SUBMIT", taskId: t.id, finalLink: link });
      if (!r || !r.ok) {
        err.textContent = (r && r.error) || "Submit failed";
        btn.disabled = false;
        btn.textContent = "Submit for review";
      } else {
        delete state.drafts[t.id];
        // background broadcasts the refreshed feed (task removed) → re-render
      }
    });
    wrap.append(input, btn, err);
    return wrap;
  }

  // ---- live timer tick (updates only .time nodes) ----
  function updateTimers() {
    if (!panel) return;
    const nodes = panel.querySelectorAll(".time");
    nodes.forEach((node) => {
      const status = node.getAttribute("data-status");
      const base = Number(node.getAttribute("data-base") || 0);
      const start = node.getAttribute("data-start");
      const secs = liveSeconds({
        status,
        baseSeconds: base,
        runStartedAtMs: start ? Number(start) : null,
      });
      node.textContent = fmtClock(secs);
      node.classList.toggle("ticking", status === "RUNNING");
    });
  }
  setInterval(updateTimers, 1000);

  // ---- incoming messages from background ----
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "OPRIX_UPDATE") {
      state.connected = !!msg.connected;
      if (msg.feed) {
        state.feed = msg.feed;
        state.clockSkew = Date.now() - (msg.feed.serverTimeMs || Date.now());
      } else {
        state.feed = null;
      }
      state.error = "";
      render();
    } else if (msg.type === "OPRIX_ERROR") {
      state.error = msg.error || "Something went wrong";
      render();
    }
  });

  // react to pref changes (position/theme/enabled/showPaused) from popup/options
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[PREFS_KEY]) {
      state.prefs = { ...DEFAULT_PREFS, ...(changes[PREFS_KEY].newValue || {}) };
      render();
      restartPolling();
    }
  });

  // Keep the dragged chip on-screen if the window is resized.
  window.addEventListener("resize", () => {
    if (state.prefs.enabled && !onOprixSite() && state.prefs.collapsed) applyPillAnchor();
  });

  // ---- live auto-sync -----------------------------------------------------
  // Poll at the chosen interval while the tab is visible (driven from the
  // content script, so it honors sub-30s intervals that chrome.alarms clamps),
  // and refresh the instant a tab is shown / refocused — so task statuses stay
  // current without ever reloading the website.
  let pollTimer = null;
  function restartPolling() {
    if (pollTimer) clearInterval(pollTimer);
    const secs = Math.max(10, Number(state.prefs.pollSeconds) || 30);
    pollTimer = setInterval(() => {
      if (state.connected && !document.hidden && !onOprixSite()) send({ type: "OPRIX_REFRESH" });
    }, secs * 1000);
  }
  let lastFocusRefresh = 0;
  function focusRefresh() {
    if (!state.connected || document.hidden || onOprixSite()) return;
    const now = Date.now();
    if (now - lastFocusRefresh < 4000) return; // debounce bursts of focus events
    lastFocusRefresh = now;
    send({ type: "OPRIX_REFRESH" });
  }
  document.addEventListener("visibilitychange", focusRefresh);
  window.addEventListener("focus", focusRefresh);

  // ---- init ----
  async function init() {
    await loadPrefs();
    applyShell();
    const s = await send({ type: "OPRIX_GET_STATE" });
    if (s && s.ok) {
      state.connected = !!s.connected;
      state.user = s.user || null;
      if (s.feed) {
        state.feed = s.feed;
        state.clockSkew = Date.now() - (s.feed.serverTimeMs || Date.now());
      }
    }
    render();
    restartPolling();
    if (state.connected) send({ type: "OPRIX_REFRESH" }); // freshen in the background
  }
  init();

  // ---- styles ----
  const CSS = `
  :host { all: initial; }
  .panel {
    --bg:#ffffff; --surface:#f8fafc; --card:#ffffff; --line:#e6eaf0; --line2:#eef1f5;
    --text:#0f172a; --muted:#64748b; --faint:#94a3b8; --brand:#059669; --brand2:#047857;
    --danger:#dc2626; --shadow:0 6px 24px rgba(15,23,42,.16);
    --check-bg:#ffffff; --check-border:#cbd5e1;
    position: fixed; z-index: 2147483640;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--text); font-size: 13px; line-height: 1.4;
    box-sizing: border-box;
  }
  .panel *, .panel *::before, .panel *::after { box-sizing: border-box; }
  .panel[data-theme="dark"] {
    --bg:#0b1220; --surface:#0e1729; --card:#111c33; --line:#1e293b; --line2:#172033;
    --text:#e6edf6; --muted:#9aa8bd; --faint:#6b7a90; --brand:#10b981; --brand2:#34d399;
    --danger:#f87171; --shadow:0 6px 26px rgba(0,0,0,.5);
    --check-bg:#1c2942; --check-border:#5d7295;
  }
  .panel { background: var(--bg); display:flex; flex-direction:column; box-shadow: var(--shadow); }

  /* FULL mode — edge-to-edge docked panel */
  .panel[data-mode="full"] { border:1px solid var(--line); }
  .panel[data-mode="full"][data-dock="right"]  { top:0; right:0; height:100dvh; width:380px; border-width:0 0 0 1px; }
  .panel[data-mode="full"][data-dock="left"]   { top:0; left:0;  height:100dvh; width:380px; border-width:0 1px 0 0; }
  .panel[data-mode="full"][data-dock="top"]    { top:0; left:0; right:0; width:100vw; max-height:60vh; border-width:0 0 1px 0; }
  .panel[data-mode="full"][data-dock="bottom"] { bottom:0; left:0; right:0; width:100vw; max-height:60vh; border-width:1px 0 0 0; }

  /* COMPACT mode — small floating card sized to content (capped + scrolls) */
  .panel[data-mode="compact"] { width:344px; max-height:min(560px, calc(100dvh - 32px));
    border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .panel[data-mode="compact"][data-dock="left"]   { top:16px; left:16px; }
  .panel[data-mode="compact"][data-dock="right"]  { top:16px; right:16px; }
  .panel[data-mode="compact"][data-dock="top"]    { top:16px; left:50%; transform:translateX(-50%); }
  .panel[data-mode="compact"][data-dock="bottom"] { bottom:16px; left:50%; transform:translateX(-50%); }

  .header { display:flex; align-items:center; gap:8px; padding:10px 12px;
    border-bottom:1px solid var(--line); background:var(--surface); flex:0 0 auto; }
  .title { display:flex; align-items:center; gap:6px; font-weight:700; letter-spacing:.2px; }
  .logo { color: var(--brand); display:inline-flex; }
  .dot { width:8px; height:8px; border-radius:9999px; background:var(--faint); }
  .dot.on { background: var(--brand); }
  .spacer { flex:1; }
  .hbtns { display:flex; gap:2px; }
  .ibtn, .tbtn, .chev { display:inline-flex; align-items:center; justify-content:center;
    border:0; background:transparent; color:var(--muted); cursor:pointer; border-radius:8px; }
  .ibtn { width:28px; height:28px; }
  .ibtn:hover, .chev:hover { background:var(--line2); color:var(--text); }
  .ibtn.spin svg { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .body { overflow:auto; flex:1 1 auto; padding:10px; }
  .panel.horizontal .body { display:flex; }
  .list { display:flex; flex-direction:column; gap:8px; }
  .panel.horizontal .list { flex-direction:row; gap:8px; }
  .panel.horizontal .card { width:300px; flex:0 0 auto; }

  .card { border:1px solid var(--line); background:var(--card); border-radius:12px; overflow:hidden; }
  .card.running { border-color: color-mix(in srgb, var(--brand) 45%, var(--line)); }
  .card-head { display:flex; align-items:center; gap:8px; padding:9px 10px; position:relative; }
  .accent { position:absolute; left:0; top:0; bottom:0; width:3px; }
  .name-col { min-width:0; flex:1; padding-left:4px; }
  .task-name { display:block; width:100%; text-align:left; border:0; background:transparent;
    color:var(--text); font-weight:600; font-size:13px; cursor:pointer; padding:0;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .task-name:hover { color:var(--brand); }
  .task-meta { color:var(--faint); font-size:11px; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; display:flex; align-items:center; gap:5px; }
  .task-meta .sep { opacity:.6; }
  .st-badge { flex:0 0 auto; font-size:9px; font-weight:800; text-transform:uppercase;
    letter-spacing:.4px; padding:1px 5px; border-radius:4px; }
  .st-TODO { color:#94a3b8; background:rgba(148,163,184,.16); }
  .st-IN_PROGRESS { color:#38bdf8; background:rgba(56,189,248,.16); }
  .st-REDO { color:#fbbf24; background:rgba(251,191,36,.18); }
  .right { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
  .time { font-variant-numeric: tabular-nums; font-weight:600; font-size:12px; color:var(--muted);
    min-width:42px; text-align:right; }
  .time.ticking { color:var(--brand); }
  .controls { display:flex; gap:5px; }
  .tbtn { width:30px; height:30px; border-radius:9px; border:1px solid var(--line);
    background:var(--surface); color:var(--text); }
  .tbtn svg { width:17px; height:17px; }
  .tbtn:hover { background:var(--brand); border-color:var(--brand); color:#fff; }
  .tbtn.busy { opacity:.5; }
  .chev { width:30px; height:30px; border-radius:9px; border:1px solid var(--line);
    background:var(--surface); color:var(--text);
    transition: transform .15s ease, background .12s ease, border-color .12s ease; }
  .chev svg { width:18px; height:18px; }
  .chev.open { transform: rotate(180deg); }

  .card-body { padding:4px 12px 12px; border-top:1px solid var(--line2); }
  .section-label { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700;
    text-transform:uppercase; letter-spacing:.4px; color:var(--faint); margin:10px 0 6px; }
  .section-label .count { font-weight:600; color:var(--muted); text-transform:none; letter-spacing:0; }
  .checklist { display:flex; flex-direction:column; gap:5px; }
  .check-row { display:flex; align-items:flex-start; gap:8px; }
  .check { flex:0 0 auto; width:18px; height:18px; margin-top:1px; border-radius:6px;
    border:2px solid var(--check-border); background:var(--check-bg); color:#fff; cursor:pointer;
    display:inline-flex; align-items:center; justify-content:center;
    transition:border-color .12s, background .12s; }
  .check.checked { background:var(--brand); border-color:var(--brand); }
  .check:not(.checked):hover { border-color:var(--brand); }
  .check:disabled { cursor:default; opacity:.6; }
  .check-text { font-size:12.5px; color:var(--text); }
  .check-text.struck { text-decoration:line-through; color:var(--faint); }
  .kb { display:flex; flex-direction:column; gap:4px; }
  .kb-item { display:flex; align-items:center; gap:7px; width:100%; text-align:left; border:0;
    background:var(--surface); border-radius:8px; padding:7px 9px; cursor:pointer; color:var(--text); }
  .kb-item:hover { background:var(--line2); }
  .kb-ic { color:var(--brand); display:inline-flex; flex:0 0 auto; }
  .kb-title { flex:1; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .kb-ext { color:var(--faint); display:inline-flex; flex:0 0 auto; }
  .tag { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px;
    color:var(--brand); background: color-mix(in srgb, var(--brand) 14%, transparent);
    padding:1px 5px; border-radius:5px; flex:0 0 auto; }

  .workflow { margin-top:12px; }
  .wf-input { width:100%; box-sizing:border-box; border:1px solid var(--line2); background:var(--surface);
    color:var(--text); border-radius:9px; padding:9px 11px; font:inherit; font-size:12.5px; }
  .wf-input::placeholder { color:var(--faint); }
  .wf-input:focus { outline:none; border-color:var(--brand); background:var(--bg); }
  .wf-submit { margin-top:8px; width:100%; border:0; border-radius:9px; background:var(--brand);
    color:#fff; font-weight:600; padding:9px 12px; cursor:pointer; font:inherit; }
  .wf-submit:hover { background:var(--brand2); }
  .wf-submit:disabled { opacity:.7; cursor:default; }
  .wf-err { color:var(--danger); font-size:11.5px; margin-top:6px; }

  .empty, .empty-sm { color:var(--muted); font-size:12.5px; text-align:center; padding:24px 16px; }
  .empty-sm { padding:8px 0; text-align:left; }
  .banner { padding:8px 10px; border-radius:8px; font-size:12px; margin-bottom:8px; }
  .banner.err { background: color-mix(in srgb, var(--danger) 12%, transparent); color:var(--danger); }

  .connect { padding:22px 16px; text-align:center; display:flex; flex-direction:column; gap:12px; align-items:center; }
  .connect-msg { color:var(--muted); font-size:13px; }
  .btn { font:inherit; border:0; border-radius:10px; padding:9px 16px; cursor:pointer; font-weight:600; }
  .btn.primary { background:var(--brand); color:#fff; }
  .btn.primary:hover { background:var(--brand2); }
  .btn:disabled { opacity:.7; cursor:default; }
  .connect-err { color:var(--danger); font-size:12px; }

  /* collapsed pill */
  .panel.collapsed { width:max-content !important; height:auto !important; max-height:none !important;
    background:transparent; border:0; box-shadow:none; inset:auto; transform:none !important; border-radius:0; }
  .panel.collapsed[data-dock="right"]  { top:84px; right:14px; }
  .panel.collapsed[data-dock="left"]   { top:84px; left:14px; }
  .panel.collapsed[data-dock="top"]    { top:14px; right:14px; left:auto; }
  .panel.collapsed[data-dock="bottom"] { bottom:14px; right:14px; left:auto; }
  .pill { display:inline-flex; align-items:center; gap:8px; border:0;
    background:linear-gradient(135deg,#10b981 0%,#0d9488 100%); color:#fff; cursor:grab;
    border-radius:9999px; padding:9px 16px; font-weight:700; font-size:13px;
    box-shadow:none;
    transition:filter .15s ease; touch-action:none; user-select:none;
    white-space:nowrap; }
  .pill:hover { filter:brightness(1.06); }
  .pill.grabbing { cursor:grabbing; filter:brightness(.98); }
  .pill-ic { display:inline-flex; align-items:center; justify-content:center; color:#fff; flex:0 0 auto; }
  .pill-ic svg { width:18px; height:18px; }
  .pill .pill-time { color:#fff; font-variant-numeric:tabular-nums; min-width:auto; text-align:left; }
  .pill-label { color:#fff; }
  .pill-badge { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px;
    padding:0 6px; background:rgba(255,255,255,.25); color:#fff; border-radius:9999px;
    font-size:11px; font-weight:800; }
  `;
})();
