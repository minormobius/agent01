"use strict";

// ====================================================================
// minomobi mmopaint — shared canvas, Bluesky-verified identities.
//
// Architecture: each stroke is a JSON message over a WebSocket to a
// per-canvas Durable Object in the poll worker. The DO assigns a seq
// number and a hash linking to the previous stroke, then broadcasts to
// every connected painter. On join we GET /strokes?since=0 and replay
// the whole log to reconstruct the canvas.
// ====================================================================

// ---- config -------------------------------------------------------

const API_BASE       = "https://poll.mino.mobi/api";
const DRAW_API       = `${API_BASE}/draw`;        // OAuth flow lives under /api/draw
const MMO_API        = `${API_BASE}/mmo`;
const CANVAS_ID      = "global";
const SESSION_KEY    = "minoDrawSession";          // same key /draw uses, so login persists

const PALETTE = [
  "#000000","#7f7f7f","#bfbfbf","#ffffff",
  "#8b0000","#ff0000","#ff7f00","#ffd400",
  "#ffff00","#00a800","#00ff00","#00ffff",
  "#0000ff","#5500aa","#aa00aa","#ff00aa",
  "#7f3f00","#c08040","#ffc0a0","#80ff80",
];

const $ = id => document.getElementById(id);

// ---- DOM refs -----------------------------------------------------

const view        = $("view");
const stage       = $("stage");
const presenceEl  = $("presence");
const statusEl    = $("status-strip");
const auditMini   = $("audit-mini");
const auditBtn    = $("audit-btn");
const auditPanel  = $("audit-panel");
const auditClose  = $("audit-close");
const apCanvas    = $("ap-canvas");
const apSeq       = $("ap-seq");
const apHash      = $("ap-hash");
const apPds       = $("ap-pds");
const apContribs  = $("ap-contribs");
const colorsEl    = $("colors");
const customColor = $("custom-color");
const currentColor= $("current-color");
const sizeSlider  = $("size-slider");
const sizeReadout = $("size-readout");
const toolGroup   = $("tool-group");
const signinBtn   = $("signin-btn");
const handleChip  = $("handle-chip");
const signinPrompt= $("signin-prompt");
const handleInput = $("handle-input");
const loginGo     = $("login-go");
const loginErr    = $("login-err");
const toast       = $("toast");

const ctx = view.getContext("2d");

// ---- state --------------------------------------------------------

let CANVAS_W = 1024;
let CANVAS_H = 1024;

const bitmap = document.createElement("canvas");
bitmap.width = CANVAS_W; bitmap.height = CANVAS_H;
const bctx = bitmap.getContext("2d");
bctx.fillStyle = "#ffffff";
bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

const state = {
  tool: "brush",
  color: "#000000",
  size: 6,

  view: { zoom: 1, panX: 0, panY: 0 },

  // Local in-flight stroke (not yet acked by server).
  localStroke: null,   // { tool, color, size, points: [x,y,...], lastBx, lastBy }

  // Multi-touch / pinch.
  pointers: new Map(),
  gesture: null,

  // Canvas display geometry.
  W: 0, H: 0, dprView: 1,

  // WebSocket.
  ws: null,
  wsAuthed: false,
  reconnectTimer: null,
  pendingStrokes: [],  // queued during disconnect (best-effort drop on resume)

  // Sync.
  headSeq: 0,
  headHash: null,
  presenceCount: 0,
  presenceHandles: [],

  // Auth.
  session: null,
};

// ---- coord transforms --------------------------------------------

function viewToBitmap(vx, vy) {
  return {
    x: (vx - state.view.panX) / state.view.zoom,
    y: (vy - state.view.panY) / state.view.zoom,
  };
}
function fitView() {
  const z = Math.min(state.W / CANVAS_W, state.H / CANVAS_H) * 0.92;
  state.view.zoom = z;
  state.view.panX = (state.W - CANVAS_W * z) / 2;
  state.view.panY = (state.H - CANVAS_H * z) / 2;
}
function clampZoom(z) { return Math.max(0.05, Math.min(32, z)); }

// ---- resize / render ---------------------------------------------

function resize() {
  const r = stage.getBoundingClientRect();
  state.dprView = window.devicePixelRatio || 1;
  state.W = r.width;
  state.H = r.height;
  view.width  = Math.max(1, Math.floor(r.width  * state.dprView));
  view.height = Math.max(1, Math.floor(r.height * state.dprView));
  ctx.setTransform(state.dprView, 0, 0, state.dprView, 0, 0);
  render();
}

function render() {
  ctx.save();
  ctx.clearRect(0, 0, state.W, state.H);
  ctx.imageSmoothingEnabled = state.view.zoom < 1.5;
  const dw = CANVAS_W * state.view.zoom;
  const dh = CANVAS_H * state.view.zoom;
  ctx.drawImage(bitmap, state.view.panX, state.view.panY, dw, dh);

  // Frame.
  ctx.strokeStyle = getCss("--canvas-edge", "#999");
  ctx.lineWidth = 1;
  ctx.strokeRect(
    Math.round(state.view.panX) + 0.5,
    Math.round(state.view.panY) + 0.5,
    Math.round(dw), Math.round(dh)
  );
  ctx.restore();

  refreshStatus();
}

function refreshStatus() {
  const z = Math.round(state.view.zoom * 100);
  const seqStr = state.headSeq.toLocaleString();
  const hashShort = (state.headHash || "—").slice(0, 12);
  statusEl.textContent = `${CANVAS_W}×${CANVAS_H} · ${z}% · seq ${seqStr} · ${state.tool}`;
  auditMini.textContent = `seq ${seqStr} · ${hashShort}`;
  if (state.ws && state.wsAuthed) {
    presenceEl.innerHTML = `<span class="live">●</span> ${state.presenceCount} live`;
    presenceEl.title = "connected";
  } else if (state.wsState === "connecting") {
    presenceEl.textContent = "connecting…";
    presenceEl.title = "WebSocket handshake in progress";
  } else if (state.wsCloseInfo) {
    const c = state.wsCloseInfo;
    presenceEl.textContent = `disconnected · ${c.code}${c.reason ? " " + c.reason : ""} · tap to retry`;
    presenceEl.title = "tap to reconnect";
  } else {
    presenceEl.textContent = state.session ? "disconnected · tap to retry" : "signed out";
    presenceEl.title = state.session ? "tap to reconnect" : "";
  }
}

function getCss(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ---- drawing primitives ------------------------------------------

function applyStrokeToBitmap(tool, color, size, points) {
  if (!points || points.length < 2) return;
  bctx.lineCap  = "round";
  bctx.lineJoin = "round";
  bctx.strokeStyle = (tool === "eraser") ? "#ffffff" : color;
  bctx.lineWidth = size;
  bctx.beginPath();
  bctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    bctx.lineTo(points[i], points[i + 1]);
  }
  if (points.length === 2) {
    // Single-tap: draw a dot.
    bctx.fillStyle = (tool === "eraser") ? "#ffffff" : color;
    bctx.beginPath();
    bctx.arc(points[0], points[1], Math.max(0.5, size / 2), 0, Math.PI * 2);
    bctx.fill();
  } else {
    bctx.stroke();
  }
}

// ---- color/tool/size ---------------------------------------------

function setColor(hex) {
  state.color = hex.toLowerCase();
  customColor.value = hex;
  currentColor.style.background = hex;
  colorsEl.querySelectorAll(".swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.color === state.color);
  });
}
function setTool(t) {
  state.tool = t;
  toolGroup.querySelectorAll("button").forEach(b => {
    b.classList.toggle("active", b.dataset.tool === t);
  });
  refreshStatus();
}
function setSize(n) {
  state.size = Math.max(1, Math.min(60, Math.floor(n)));
  sizeSlider.value = state.size;
  sizeReadout.textContent = state.size;
}

function showToast(msg, ms) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), ms || 1800);
}

// Expose for the boot/network half.
window._mmo = {
  state, bitmap, bctx, view, ctx, stage,
  CANVAS_ID, MMO_API, DRAW_API, SESSION_KEY, PALETTE,
  viewToBitmap, fitView, clampZoom,
  resize, render, refreshStatus,
  applyStrokeToBitmap,
  setColor, setTool, setSize, showToast,
};

// ====================================================================
// Part 2: input, WebSocket, OAuth, audit, boot.
// ====================================================================

(function() {
  const M = window._mmo;
  const {
    state, bitmap, bctx, view, stage,
    CANVAS_ID, MMO_API, DRAW_API, SESSION_KEY,
    viewToBitmap, fitView, clampZoom,
    resize, render, refreshStatus,
    applyStrokeToBitmap,
    setColor, setTool, setSize, showToast,
    PALETTE,
  } = M;

  const $ = id => document.getElementById(id);

  // ---- session helpers ---------------------------------------------

  function readSessionFragment() {
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const sid = params.get("session");
    if (!sid) return null;
    const sess = {
      sessionId: sid,
      did:    params.get("did") || "",
      handle: params.get("handle") || "",
      ts: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    history.replaceState(null, "", location.pathname + location.search);
    return sess;
  }
  function readStoredSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s.sessionId) return null;
      return s;
    } catch { return null; }
  }
  function clearStoredSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function refreshAuthUI() {
    const s = state.session;
    if (s && s.handle) {
      $("handle-chip").hidden = false;
      $("handle-chip").innerHTML =
        `@${escapeHtml(s.handle)} <a class="signout" href="#" id="signout-link">sign out</a>`;
      $("signin-btn").hidden = true;
      const so = $("signout-link");
      if (so) {
        so.addEventListener("click", (e) => {
          e.preventDefault();
          clearStoredSession();
          state.session = null;
          disconnectWS();
          refreshAuthUI();
          showSigninPrompt(false);
        });
      }
      showSigninPrompt(false);
    } else {
      $("handle-chip").hidden = true;
      $("handle-chip").innerHTML = "";
      $("signin-btn").hidden = false;
    }
  }
  function showSigninPrompt(show) {
    $("signin-prompt").hidden = !show;
    if (show) setTimeout(() => $("handle-input").focus(), 30);
  }

  // ---- OAuth start (reuses /api/draw/oauth/start, scope=atproto) ----

  async function startOAuth() {
    const handle = $("handle-input").value.trim().replace(/^@/, "");
    if (!handle) { $("login-err").textContent = "enter your handle"; return; }
    $("login-err").textContent = "";
    $("login-go").disabled = true;
    try {
      const res = await fetch(`${DRAW_API}/oauth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle,
          // Return to /mmo so the session hash is delivered to this page.
          returnTo: location.origin + location.pathname,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authUrl) {
        $("login-err").textContent = data.error || `sign-in failed (${res.status})`;
        $("login-go").disabled = false;
        return;
      }
      location.href = data.authUrl;
    } catch (e) {
      $("login-err").textContent = "network error — could not reach poll.mino.mobi";
      $("login-go").disabled = false;
    }
  }

  $("signin-btn").addEventListener("click", () => showSigninPrompt(true));
  $("login-go").addEventListener("click", startOAuth);
  // Tap outside the card to dismiss.
  $("signin-prompt").addEventListener("click", (e) => {
    if (e.target.id === "signin-prompt") showSigninPrompt(false);
  });

  // ---- handle typeahead (public Bluesky searchActorsTypeahead) ------

  let taItems = [];
  let taActive = -1;
  let taAbort  = null;
  let taTimer  = null;

  const handleInput = $("handle-input");
  const typeaheadEl = $("typeahead");

  function showTypeahead(items) {
    taItems  = items;
    taActive = -1;
    if (!items.length) { hideTypeahead(); return; }
    typeaheadEl.innerHTML = items.map((a, i) => {
      const avatar = a.avatar ? `style="background-image:url('${escapeAttr(a.avatar)}')"` : "";
      const name   = a.displayName ? `<span class="ta-name">${escapeHtml(a.displayName)}</span>` : "";
      return `<div class="ta-item" data-i="${i}" data-handle="${escapeAttr(a.handle)}" role="option">` +
               `<div class="ta-avatar" ${avatar}></div>` +
               `<span class="ta-handle">@${escapeHtml(a.handle)}</span>${name}` +
             `</div>`;
    }).join("");
    typeaheadEl.classList.add("show");
    typeaheadEl.querySelectorAll(".ta-item").forEach(it => {
      // Use mousedown (fires before blur) so clicking doesn't dismiss the dropdown.
      it.addEventListener("mousedown", (e) => {
        e.preventDefault();
        handleInput.value = it.dataset.handle;
        hideTypeahead();
        handleInput.focus();
      });
    });
  }
  function hideTypeahead() {
    typeaheadEl.classList.remove("show");
    typeaheadEl.innerHTML = "";
    taItems = [];
    taActive = -1;
  }
  function setActiveTa(i) {
    taActive = i;
    typeaheadEl.querySelectorAll(".ta-item").forEach((el, idx) => {
      el.classList.toggle("active", idx === i);
    });
  }

  async function runTypeahead(term) {
    if (taAbort) try { taAbort.abort(); } catch {}
    if (!term || term.length < 1) { hideTypeahead(); return; }
    taAbort = new AbortController();
    const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead");
    url.searchParams.set("q", term);
    url.searchParams.set("limit", "8");
    try {
      const r = await fetch(url.toString(), { signal: taAbort.signal });
      if (!r.ok) { hideTypeahead(); return; }
      const data = await r.json();
      showTypeahead(data.actors || []);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      hideTypeahead();
    }
  }

  handleInput.addEventListener("input", () => {
    const term = handleInput.value.trim().replace(/^@/, "");
    if (taTimer) clearTimeout(taTimer);
    taTimer = setTimeout(() => runTypeahead(term), 180);
  });
  handleInput.addEventListener("focus", () => {
    const term = handleInput.value.trim().replace(/^@/, "");
    if (term) runTypeahead(term);
  });
  handleInput.addEventListener("blur", () => {
    // Delay so a mousedown on an item can fire.
    setTimeout(hideTypeahead, 150);
  });
  handleInput.addEventListener("keydown", (e) => {
    const open = typeaheadEl.classList.contains("show");
    if (open && taItems.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveTa((taActive + 1) % taItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveTa((taActive - 1 + taItems.length) % taItems.length);
        return;
      }
      if (e.key === "Enter" && taActive >= 0) {
        e.preventDefault();
        handleInput.value = taItems[taActive].handle;
        hideTypeahead();
        return;
      }
      if (e.key === "Escape") {
        hideTypeahead();
        return;
      }
    }
    if (e.key === "Enter") { e.preventDefault(); startOAuth(); }
  });

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;",
    }[c]));
  }

  // ---- WebSocket -----------------------------------------------------

  function wsUrlFor(session) {
    const u = new URL(`${MMO_API}/canvases/${encodeURIComponent(CANVAS_ID)}/ws`);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.searchParams.set("session", session.sessionId);
    return u.toString();
  }

  function connectWS() {
    if (!state.session) return;
    if (state.ws) try { state.ws.close(); } catch {}
    state.wsAuthed = false;
    state.wsCloseInfo = null;
    state.wsState = "connecting";
    refreshStatus();
    let ws;
    try { ws = new WebSocket(wsUrlFor(state.session)); }
    catch (e) {
      state.wsState = "error";
      state.wsCloseInfo = { code: 0, reason: "constructor: " + (e?.message || "?") };
      refreshStatus();
      scheduleReconnect();
      runDiagnostic();
      return;
    }
    state.ws = ws;
    ws.addEventListener("open", () => {
      state.wsAuthed = true;
      state.wsState = "open";
      state.wsCloseInfo = null;
      refreshStatus();
      ws.send(JSON.stringify({ type: "hello" }));
      // Drain any strokes queued while disconnected.
      const q = state.pendingStrokes; state.pendingStrokes = [];
      for (const s of q) {
        try { ws.send(JSON.stringify(s)); } catch {}
      }
    });
    ws.addEventListener("message", (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      onWsMessage(m);
    });
    ws.addEventListener("close", (ev) => {
      state.wsAuthed = false;
      state.wsState = "closed";
      state.wsCloseInfo = { code: ev.code, reason: ev.reason || "" };
      refreshStatus();
      scheduleReconnect();
      // Only run the diagnostic if this wasn't a clean intentional close.
      if (ev.code !== 1000 && !state._diagRan) {
        state._diagRan = true;
        runDiagnostic();
      }
    });
    ws.addEventListener("error", () => {
      state.wsAuthed = false;
      state.wsState = "error";
      refreshStatus();
    });
  }
  function disconnectWS() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    if (state.ws) try { state.ws.close(1000); } catch {}
    state.ws = null;
    state.wsAuthed = false;
    state.wsState = "closed";
    refreshStatus();
  }
  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.session) connectWS();
    }, 2500);
  }

  // Reach the worker over plain HTTP to figure out what's actually wrong
  // with the WebSocket connect: route missing? canvas missing? session
  // invalid? Surface a useful toast instead of a silent "not connected".
  async function runDiagnostic() {
    try {
      const audit = await fetch(`${MMO_API}/canvases/${encodeURIComponent(CANVAS_ID)}/audit`);
      if (audit.status === 404) {
        showToast("canvas '" + CANVAS_ID + "' not found — migration may not have run", 4000);
        return;
      }
      if (!audit.ok) {
        showToast(`worker returned ${audit.status} on /audit`, 4000);
        return;
      }
      // Worker + canvas OK. Try /me to check session validity.
      const me = await fetch(`${DRAW_API}/me`, {
        headers: { "Authorization": `Bearer ${state.session.sessionId}` },
      });
      if (me.ok) {
        const data = await me.json();
        if (!data.did) {
          showToast("session expired — sign in again", 4000);
          clearStoredSession();
          state.session = null;
          refreshAuthUI();
          disconnectWS();
          return;
        }
        showToast("worker ok, session ok — WS upgrade is rejecting; check console", 4000);
      }
    } catch (e) {
      showToast("can't reach poll.mino.mobi — deploy may still be running", 4000);
    }
  }

  function onWsMessage(m) {
    switch (m.type) {
      case "welcome":
        if (m.width  && m.width  !== bitmap.width)  resizeBitmap(m.width,  m.height);
        // Replay strokes since seq=0 to reconstruct the canvas.
        replayStrokes(0);
        return;
      case "stroke":
        applyServerStroke(m);
        return;
      case "presence":
        state.presenceCount   = m.connected | 0;
        state.presenceHandles = m.handles || [];
        refreshStatus();
        return;
      case "error":
        showToast(`server: ${m.code}`);
        return;
    }
  }

  function resizeBitmap(w, h) {
    const newBmp = document.createElement("canvas");
    newBmp.width = w; newBmp.height = h;
    const nctx = newBmp.getContext("2d");
    nctx.fillStyle = "#ffffff"; nctx.fillRect(0, 0, w, h);
    bitmap.width = w; bitmap.height = h;
    bctx.fillStyle = "#ffffff"; bctx.fillRect(0, 0, w, h);
    fitView();
    render();
  }

  function applyServerStroke(m) {
    applyStrokeToBitmap(m.tool, m.color, m.size, m.points);
    if (typeof m.seq === "number" && m.seq > state.headSeq) {
      state.headSeq  = m.seq;
      state.headHash = m.hash;
    }
    render();
  }

  // ---- replay (REST) -----------------------------------------------

  async function replayStrokes(since) {
    let cursor = since | 0;
    while (true) {
      const u = new URL(`${MMO_API}/canvases/${encodeURIComponent(CANVAS_ID)}/strokes`);
      u.searchParams.set("since",  String(cursor));
      u.searchParams.set("limit", "1000");
      try {
        const res = await fetch(u.toString());
        if (!res.ok) break;
        const data = await res.json();
        const strokes = data.strokes || [];
        if (!strokes.length) break;
        for (const s of strokes) {
          applyStrokeToBitmap(s.tool, s.color, s.size, s.points);
          if (s.seq > state.headSeq) {
            state.headSeq  = s.seq;
            state.headHash = s.hash;
          }
          cursor = s.seq;
        }
        render();
        if (strokes.length < 1000) break;
      } catch {
        break;
      }
    }
    refreshStatus();
  }

  // ---- pointer / pinch ---------------------------------------------

  function localPoint(e) {
    const r = view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function ptDist(a, b)   { return Math.hypot(a.x - b.x, a.y - b.y); }

  function onPointerDown(e) {
    if (e.target !== view) return;
    e.preventDefault();
    try { view.setPointerCapture(e.pointerId); } catch {}
    const pt = localPoint(e);
    state.pointers.set(e.pointerId, pt);

    if (state.pointers.size === 1) {
      if (!state.session) { showSigninPrompt(true); return; }
      const b = viewToBitmap(pt.x, pt.y);
      beginLocalStroke(Math.round(b.x), Math.round(b.y));
    } else if (state.pointers.size === 2) {
      // Cancel the in-progress local stroke.
      cancelLocalStroke();
      const pts = [...state.pointers.values()];
      const mid0View = midpoint(pts[0], pts[1]);
      state.gesture = {
        d0: Math.max(1, ptDist(pts[0], pts[1])),
        mid0View,
        mid0Bitmap: viewToBitmap(mid0View.x, mid0View.y),
        zoom0: state.view.zoom,
      };
    }
  }

  function onPointerMove(e) {
    if (!state.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const pt = localPoint(e);
    state.pointers.set(e.pointerId, pt);

    if (state.pointers.size === 1 && state.localStroke) {
      const b = viewToBitmap(pt.x, pt.y);
      extendLocalStroke(Math.round(b.x), Math.round(b.y));
    } else if (state.pointers.size === 2 && state.gesture) {
      const pts = [...state.pointers.values()];
      const d1 = Math.max(1, ptDist(pts[0], pts[1]));
      const mid1View = midpoint(pts[0], pts[1]);
      const newZoom = clampZoom(state.gesture.zoom0 * (d1 / state.gesture.d0));
      state.view.zoom = newZoom;
      state.view.panX = mid1View.x - state.gesture.mid0Bitmap.x * newZoom;
      state.view.panY = mid1View.y - state.gesture.mid0Bitmap.y * newZoom;
      render();
    }
  }

  function onPointerUp(e) {
    if (!state.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const wasDrawing = !!state.localStroke;
    const wasPinching = !!state.gesture;
    state.pointers.delete(e.pointerId);
    if (state.pointers.size === 0) {
      if (wasDrawing) commitLocalStroke();
      state.gesture = null;
    } else if (state.pointers.size === 1 && wasPinching) {
      state.gesture = null;
    }
  }

  view.addEventListener("pointerdown",   onPointerDown);
  view.addEventListener("pointermove",   onPointerMove);
  view.addEventListener("pointerup",     onPointerUp);
  view.addEventListener("pointercancel", onPointerUp);
  view.addEventListener("contextmenu", e => e.preventDefault());

  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const pt = localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newZoom = clampZoom(state.view.zoom * factor);
    const b = viewToBitmap(pt.x, pt.y);
    state.view.zoom = newZoom;
    state.view.panX = pt.x - b.x * newZoom;
    state.view.panY = pt.y - b.y * newZoom;
    render();
  }, { passive: false });

  // ---- local stroke --------------------------------------------------

  // Auto-submit: there is no explicit submit button. Strokes are
  // streamed live as you drag — every ~200ms we flush the accumulated
  // segment as its own atomic stroke chunk (its own seq + hash). Other
  // clients see your drawing appear in real time instead of jumping in
  // at pointer-up. Chunk N's last point seeds chunk N+1, so the visual
  // line stays continuous when remote clients replay.
  const FLUSH_INTERVAL_MS = 200;
  const FLUSH_MIN_POINTS  = 3;  // need at least 3 pts in pending before flushing
  const HARD_FLUSH_POINTS = 540; // hard cap before forcing a flush

  function beginLocalStroke(bx, by) {
    state.localStroke = {
      tool:   state.tool,
      color:  state.color,
      size:   state.size,
      pending: [bx, by],    // points to send in next chunk; the last 2 carry over
      sentChunks: 0,
      lastFlushMs: 0,
      lastBx: bx, lastBy: by,
    };
    applyStrokeToBitmap(state.tool, state.color, state.size, [bx, by]);
    render();
  }

  function extendLocalStroke(bx, by) {
    const s = state.localStroke;
    if (!s) return;
    if (Math.abs(bx - s.lastBx) < 1 && Math.abs(by - s.lastBy) < 1) return;
    s.pending.push(bx, by);

    // Local incremental draw — single segment between last and new.
    bctx.strokeStyle = (s.tool === "eraser") ? "#ffffff" : s.color;
    bctx.lineWidth = s.size;
    bctx.lineCap = "round"; bctx.lineJoin = "round";
    bctx.beginPath();
    bctx.moveTo(s.lastBx, s.lastBy);
    bctx.lineTo(bx, by);
    bctx.stroke();
    s.lastBx = bx; s.lastBy = by;
    render();

    maybeFlushChunk();
  }

  function maybeFlushChunk() {
    const s = state.localStroke;
    if (!s) return;
    const now = Date.now();
    const havePts = s.pending.length / 2;
    if (havePts >= HARD_FLUSH_POINTS) { flushChunk(); return; }
    if (now - s.lastFlushMs < FLUSH_INTERVAL_MS) return;
    if (havePts < FLUSH_MIN_POINTS) return;
    flushChunk();
  }

  function flushChunk() {
    const s = state.localStroke;
    if (!s || s.pending.length < 2) return;
    const chunk = s.pending.slice();
    sendStroke(s.tool, s.color, s.size, chunk);
    // Carry over the last point so the next chunk visually starts there.
    s.pending = chunk.slice(-2);
    s.sentChunks++;
    s.lastFlushMs = Date.now();
  }

  function cancelLocalStroke() {
    // Two-finger pinch interrupted us. Drop any unsent points. The
    // already-flushed chunks are committed and can't be retracted.
    state.localStroke = null;
  }

  function commitLocalStroke() {
    const s = state.localStroke;
    state.localStroke = null;
    if (!s) return;
    if (s.sentChunks === 0) {
      // Single tap / very short stroke — send whatever we have.
      if (s.pending.length >= 2) sendStroke(s.tool, s.color, s.size, s.pending);
    } else if (s.pending.length > 2) {
      // Drag end with new points beyond the carried-over last point.
      sendStroke(s.tool, s.color, s.size, s.pending);
    }
  }

  function sendStroke(tool, color, size, points) {
    const payload = { type: "stroke", tool, color, size, points };
    if (state.ws && state.ws.readyState === 1) {
      try { state.ws.send(JSON.stringify(payload)); return; }
      catch (e) { /* fall through to queue */ }
    }
    // Not connected — queue so we don't drop the work the user just did.
    // Cap the queue so a long disconnect doesn't balloon memory; oldest first.
    state.pendingStrokes.push(payload);
    if (state.pendingStrokes.length > 50) state.pendingStrokes.shift();
    if (state.wsState !== "connecting") {
      showToast("not connected — queued, retrying connection");
      if (!state.reconnectTimer) connectWS();
    }
  }

  // ---- color palette + tool buttons ---------------------------------

  const colorsEl = $("colors");
  const picker = colorsEl.querySelector(".color-picker-wrap");
  for (const c of PALETTE) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.color = c.toLowerCase();
    b.style.background = c;
    b.title = c;
    b.addEventListener("click", () => setColor(c));
    colorsEl.insertBefore(b, picker);
  }
  $("custom-color").addEventListener("input", (e) => setColor(e.target.value));
  $("tool-group").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tool]");
    if (b) setTool(b.dataset.tool);
  });
  $("size-slider").addEventListener("input", () => setSize(parseInt($("size-slider").value, 10) || 1));

  // ---- audit panel --------------------------------------------------

  // Resolve a batch of DIDs to current Bluesky profiles. The
  // author_handle stored at submit time can drift if the user later
  // changes their handle — and in some sessions it's even just the
  // DID string. The public API is unauthed and accepts up to 25 actors.
  const profileCache = new Map();   // did -> { handle, displayName, avatar }

  async function resolveProfilesByDid(dids) {
    const need = [...new Set(dids.filter(d => d && d.startsWith("did:") && !profileCache.has(d)))];
    if (!need.length) return;
    for (let i = 0; i < need.length; i += 25) {
      const chunk = need.slice(i, i + 25);
      const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles");
      chunk.forEach(d => url.searchParams.append("actors", d));
      try {
        const r = await fetch(url.toString());
        if (!r.ok) continue;
        const data = await r.json();
        for (const p of data.profiles || []) {
          if (p.did) profileCache.set(p.did, p);
        }
      } catch { /* ignore */ }
    }
  }

  async function openAudit() {
    auditPanel.classList.add("open");
    apCanvas.textContent = CANVAS_ID;
    apSeq.textContent  = state.headSeq.toLocaleString();
    apHash.textContent = state.headHash || "—";
    apContribs.innerHTML = `<li class="count">loading…</li>`;
    try {
      const res = await fetch(`${MMO_API}/canvases/${encodeURIComponent(CANVAS_ID)}/audit`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      apSeq.textContent  = (data.head_seq || 0).toLocaleString();
      apHash.textContent = data.head_hash || "—";
      apPds.textContent  = data.published_to_pds ? data.record_uri : "not published yet";

      const contributors = (data.contributors || []).slice(0, 20);
      // Render once with the stored handles, then upgrade once profiles resolve.
      apContribs.innerHTML = "";
      for (const c of contributors) {
        const li = document.createElement("li");
        li.dataset.did = c.author_did || "";
        const link = `https://bsky.app/profile/${c.author_did}`;
        const initialHandle = (c.author_handle && !c.author_handle.startsWith("did:"))
          ? c.author_handle : "…";
        li.innerHTML =
          `<a href="${link}" target="_blank" rel="noopener">@${escapeHtml(initialHandle)}</a>` +
          `<span class="count">${c.n}</span>`;
        apContribs.appendChild(li);
      }
      if (!contributors.length) {
        apContribs.innerHTML = `<li class="count">no strokes yet</li>`;
        return;
      }
      // Resolve and patch in current handles.
      await resolveProfilesByDid(contributors.map(c => c.author_did));
      apContribs.querySelectorAll("li").forEach(li => {
        const did = li.dataset.did;
        const prof = profileCache.get(did);
        if (!prof) return;
        const a = li.querySelector("a");
        if (a && prof.handle) a.textContent = "@" + prof.handle;
      });
    } catch (e) {
      apContribs.innerHTML = `<li class="count">audit fetch failed</li>`;
    }
  }
  $("audit-btn").addEventListener("click", openAudit);
  $("audit-mini").addEventListener("click", openAudit);
  $("audit-close").addEventListener("click", () => auditPanel.classList.remove("open"));

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;",
    }[c]));
  }

  // ---- manual reconnect via presence chip ---------------------------

  $("presence").style.cursor = "pointer";
  $("presence").addEventListener("click", () => {
    if (!state.session) { showSigninPrompt(true); return; }
    if (state.ws && state.wsAuthed) return;
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
    state._diagRan = false;
    connectWS();
  });

  // ---- resize observer ----------------------------------------------

  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  window.addEventListener("resize", () => resize());
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));

  // ---- boot ----------------------------------------------------------

  async function boot() {
    resize();
    fitView();
    setTool("brush");
    setColor("#000000");
    setSize(6);

    const fragSession = readSessionFragment();
    state.session = fragSession || readStoredSession();
    refreshAuthUI();

    // Healthcheck the worker before we attempt to connect so we can
    // surface a clean error if the deploy hasn't picked up /api/mmo yet.
    try {
      const r = await fetch(`${MMO_API}/canvases/${encodeURIComponent(CANVAS_ID)}`);
      if (r.status === 404) {
        showToast("canvas not provisioned — migration may still be running", 5000);
      } else if (!r.ok) {
        showToast(`worker returned ${r.status} on canvas lookup`, 4000);
      }
    } catch (e) {
      showToast("can't reach poll.mino.mobi — deploy may still be running", 4000);
    }

    // Always replay the public log so visitors see the current state.
    replayStrokes(0);

    if (state.session) {
      connectWS();
    } else {
      showSigninPrompt(true);
    }
  }

  boot();
})();
