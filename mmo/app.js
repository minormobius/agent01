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
  presenceEl.innerHTML = state.ws && state.wsAuthed
    ? `<span class="live">●</span> ${state.presenceCount} live`
    : "disconnected";
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
  $("handle-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); startOAuth(); }
  });
  // Tap outside the card to dismiss.
  $("signin-prompt").addEventListener("click", (e) => {
    if (e.target.id === "signin-prompt") showSigninPrompt(false);
  });

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
    refreshStatus();
    const ws = new WebSocket(wsUrlFor(state.session));
    state.ws = ws;
    ws.addEventListener("open", () => {
      state.wsAuthed = true;
      refreshStatus();
      ws.send(JSON.stringify({ type: "hello" }));
    });
    ws.addEventListener("message", (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      onWsMessage(m);
    });
    ws.addEventListener("close", () => {
      state.wsAuthed = false;
      refreshStatus();
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      state.wsAuthed = false;
      refreshStatus();
    });
  }
  function disconnectWS() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    if (state.ws) try { state.ws.close(); } catch {}
    state.ws = null;
    state.wsAuthed = false;
    refreshStatus();
  }
  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.session) connectWS();
    }, 2500);
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

  // Local strokes paint optimistically on the bitmap; on pointerup we
  // send the full point list to the server. When the server broadcasts
  // it back to us, we re-apply (idempotent — same pixels). Other clients
  // only see the stroke when the server broadcasts it.
  function beginLocalStroke(bx, by) {
    state.localStroke = {
      tool:  state.tool,
      color: state.color,
      size:  state.size,
      points: [bx, by],
      lastBx: bx, lastBy: by,
    };
    // Draw the first dot locally.
    applyStrokeToBitmap(state.tool, state.color, state.size, [bx, by]);
    render();
  }
  function extendLocalStroke(bx, by) {
    const s = state.localStroke;
    // Don't push every single sub-pixel move; throttle to >= 2px.
    if (Math.abs(bx - s.lastBx) < 1 && Math.abs(by - s.lastBy) < 1) return;
    s.points.push(bx, by);
    bctx.strokeStyle = (s.tool === "eraser") ? "#ffffff" : s.color;
    bctx.lineWidth = s.size;
    bctx.lineCap = "round"; bctx.lineJoin = "round";
    bctx.beginPath();
    bctx.moveTo(s.lastBx, s.lastBy);
    bctx.lineTo(bx, by);
    bctx.stroke();
    s.lastBx = bx; s.lastBy = by;
    render();
  }
  function cancelLocalStroke() {
    state.localStroke = null;
    // Bitmap already shows the partial stroke. We'd need to revert by
    // replaying from a snapshot to fully undo. For now: leave the pixels,
    // since the second-finger pinch is the common case and pixels won't
    // be sent to the server.
  }
  function commitLocalStroke() {
    const s = state.localStroke;
    state.localStroke = null;
    if (!s || s.points.length < 2) return;
    // Cap to server's max points; if longer, sub-sample.
    const MAX = 580;
    let pts = s.points;
    if (pts.length / 2 > MAX) {
      const step = Math.ceil((pts.length / 2) / MAX);
      const out = [];
      for (let i = 0; i < pts.length; i += step * 2) {
        out.push(pts[i], pts[i + 1]);
      }
      if (out[out.length - 2] !== pts[pts.length - 2] || out[out.length - 1] !== pts[pts.length - 1]) {
        out.push(pts[pts.length - 2], pts[pts.length - 1]);
      }
      pts = out;
    }
    sendStroke(s.tool, s.color, s.size, pts);
  }

  function sendStroke(tool, color, size, points) {
    if (!state.ws || state.ws.readyState !== 1) {
      showToast("not connected — try again");
      return;
    }
    try {
      state.ws.send(JSON.stringify({ type: "stroke", tool, color, size, points }));
    } catch (e) {
      showToast("send failed");
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
      apContribs.innerHTML = "";
      for (const c of (data.contributors || []).slice(0, 20)) {
        const li = document.createElement("li");
        const link = `https://bsky.app/profile/${c.author_did}`;
        li.innerHTML =
          `<a href="${link}" target="_blank" rel="noopener">@${escapeHtml(c.author_handle)}</a>` +
          `<span class="count">${c.n}</span>`;
        apContribs.appendChild(li);
      }
      if (!apContribs.children.length) {
        apContribs.innerHTML = `<li class="count">no strokes yet</li>`;
      }
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

  // ---- resize observer ----------------------------------------------

  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  window.addEventListener("resize", () => resize());
  window.addEventListener("orientationchange", () => setTimeout(resize, 100));

  // ---- boot ----------------------------------------------------------

  function boot() {
    resize();
    fitView();
    setTool("brush");
    setColor("#000000");
    setSize(6);

    const fragSession = readSessionFragment();
    state.session = fragSession || readStoredSession();
    refreshAuthUI();

    if (state.session) {
      connectWS();
    } else {
      // Show some context while signed out: replay the public log so
      // visitors see the current canvas state, just can't paint.
      replayStrokes(0);
      showSigninPrompt(true);
    }
  }

  boot();
})();
