"use strict";

// ====================================================================
// minomobi mmopaint — PDS-records edition
//
// Architecture:
//   - Each completed stroke is one ATProto record on a service PDS,
//     collection com.minomobi.mmopaint.stroke. The record carries the
//     contributor's DID + handle, the tool/color/size, the points array,
//     and an ISO timestamp.
//   - Submission: POST /api/mmo/strokes on the worker, which writes the
//     record using the service account's stored credentials.
//   - Live updates: each browser opens its own WebSocket to Jetstream,
//     filtered to wantedCollections=com.minomobi.mmopaint.stroke and
//     wantedDids=<service-did>. Every commit event in is applied to the
//     local bitmap.
//   - Initial state: GET /api/mmo/strokes (proxies listRecords) returns
//     the most recent N records; we replay them oldest-first.
//   - The latest record's rkey (a TID) is shown in the status bar.
// ====================================================================

const API_BASE   = "https://poll.mino.mobi/api";
const DRAW_API   = `${API_BASE}/draw`;
const MMO_API    = `${API_BASE}/mmo`;
const SESSION_KEY = "minoDrawSession";  // shared with /draw so login persists

const CANVAS_ID  = "global";
const PALETTE = [
  "#000000","#7f7f7f","#bfbfbf","#ffffff",
  "#8b0000","#ff0000","#ff7f00","#ffd400",
  "#ffff00","#00a800","#00ff00","#00ffff",
  "#0000ff","#5500aa","#aa00aa","#ff00aa",
  "#7f3f00","#c08040","#ffc0a0","#80ff80",
];

const $ = id => document.getElementById(id);

// ---- DOM ----------------------------------------------------------

const view        = $("view");
const stage       = $("stage");
const presenceEl  = $("presence");
const statusEl    = $("status-strip");
const auditMini   = $("audit-mini");
const auditPanel  = $("audit-panel");
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
const handleChip  = $("handle-chip");
const signinPrompt= $("signin-prompt");
const handleInput = $("handle-input");
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
  tool:  "brush",
  color: "#000000",
  size:  6,
  view:  { zoom: 1, panX: 0, panY: 0 },

  // Local in-flight stroke (pen down through pen up).
  localStroke: null,

  // Multi-touch.
  pointers: new Map(),
  gesture:  null,

  // Display geometry.
  W: 0, H: 0, dprView: 1,

  // Jetstream connection.
  js: null,                  // WebSocket
  jsState: "idle",
  jsReconnectTimer: null,
  jsReady: false,            // false until initial replay is done
  jsBuffer: [],              // events held while !jsReady so we don't miss the
                             // seam between replay and live

  // Service info from /api/mmo/info.
  serviceDid:        null,
  serviceHandle:     null,
  jetstreamUrl:      null,
  canvasUri:         null,    // strongRef target for stroke records
  constellationBase: null,
  linkSource:        null,

  // Tracked record stats (the "rev").
  latestRkey:   null,        // TID rkey of most recent stroke we've applied
  strokeCount:  0,
  contributors: new Map(),   // did -> { handle, count }

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

// ---- canvas / render --------------------------------------------

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
  const rev = state.latestRkey ? state.latestRkey.slice(0, 12) : "—";
  statusEl.textContent = `${CANVAS_W}×${CANVAS_H} · ${z}% · ${state.tool} · rev ${rev}`;
  auditMini.textContent = `${state.strokeCount.toLocaleString()} strokes · ${rev}`;
  let liveLabel;
  if (state.jsState === "open") liveLabel = `<span class="live">●</span> live`;
  else if (state.jsState === "connecting") liveLabel = "connecting…";
  else liveLabel = "disconnected · tap to retry";
  presenceEl.innerHTML = liveLabel;
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
  if (points.length === 2) {
    // Single dot.
    bctx.fillStyle = (tool === "eraser") ? "#ffffff" : color;
    bctx.beginPath();
    bctx.arc(points[0], points[1], Math.max(0.5, size / 2), 0, Math.PI * 2);
    bctx.fill();
  } else {
    bctx.beginPath();
    bctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
      bctx.lineTo(points[i], points[i + 1]);
    }
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;",
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ---- session helpers --------------------------------------------

function readSessionFragment() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);

  // Surface OAuth errors that the callback bounced back on the fragment.
  const oauthErr = params.get("error");
  if (oauthErr) {
    console.error("[mmo] OAuth callback error:", oauthErr);
    showToast("sign-in failed: " + oauthErr, 8000);
    history.replaceState(null, "", location.pathname + location.search);
    return null;
  }

  const sid = params.get("session");
  if (!sid) return null;
  const sess = {
    sessionId: sid,
    did:       params.get("did") || "",
    handle:    params.get("handle") || "",
    ts:        Date.now(),
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
function clearStoredSession() { localStorage.removeItem(SESSION_KEY); }

function refreshAuthUI() {
  const s = state.session;
  if (s && s.handle) {
    handleChip.hidden = false;
    handleChip.innerHTML =
      `@${escapeHtml(s.handle)} <a class="signout" href="#" id="signout-link">sign out</a>`;
    $("signin-btn").hidden = true;
    const so = $("signout-link");
    if (so) {
      so.addEventListener("click", (e) => {
        e.preventDefault();
        clearStoredSession();
        state.session = null;
        refreshAuthUI();
        showSigninPrompt(false);
      });
    }
    showSigninPrompt(false);
  } else {
    handleChip.hidden = true;
    handleChip.innerHTML = "";
    $("signin-btn").hidden = false;
  }
}
function showSigninPrompt(show) {
  signinPrompt.hidden = !show;
  if (show) setTimeout(() => handleInput.focus(), 30);
}

// ---- OAuth start (reuses /api/draw/oauth/start with scope=atproto) ----

async function startOAuth() {
  const handle = handleInput.value.trim().replace(/^@/, "");
  if (!handle) { $("login-err").textContent = "enter your handle"; return; }
  $("login-err").textContent = "";
  $("login-go").disabled = true;
  try {
    // /api/mmo/oauth/start requests `atproto transition:generic` — we
    // need write access to the contributor's own PDS. (The /draw flow
    // stays identity-only by hitting /api/draw/oauth/start.)
    const res = await fetch(`${MMO_API}/oauth/start`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
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
signinPrompt.addEventListener("click", (e) => {
  if (e.target.id === "signin-prompt") showSigninPrompt(false);
});

// ---- Bluesky handle typeahead ------------------------------------

let taItems = [];
let taActive = -1;
let taAbort  = null;
let taTimer  = null;
const typeaheadEl = $("typeahead");

function showTypeahead(items) {
  taItems = items; taActive = -1;
  if (!items.length) { hideTypeahead(); return; }
  typeaheadEl.innerHTML = items.map((a, i) => {
    const avatar = a.avatar ? `style="background-image:url('${escapeAttr(a.avatar)}')"` : "";
    const name   = a.displayName ? `<span class="ta-name">${escapeHtml(a.displayName)}</span>` : "";
    return `<div class="ta-item" data-i="${i}" data-handle="${escapeAttr(a.handle)}">` +
             `<div class="ta-avatar" ${avatar}></div>` +
             `<span class="ta-handle">@${escapeHtml(a.handle)}</span>${name}` +
           `</div>`;
  }).join("");
  typeaheadEl.classList.add("show");
  typeaheadEl.querySelectorAll(".ta-item").forEach(it => {
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
  taItems = []; taActive = -1;
}
function setActiveTa(i) {
  taActive = i;
  typeaheadEl.querySelectorAll(".ta-item").forEach((el, idx) => {
    el.classList.toggle("active", idx === i);
  });
}
async function runTypeahead(term) {
  if (taAbort) try { taAbort.abort(); } catch {}
  if (!term) { hideTypeahead(); return; }
  taAbort = new AbortController();
  const u = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead");
  u.searchParams.set("q", term); u.searchParams.set("limit", "8");
  try {
    const r = await fetch(u.toString(), { signal: taAbort.signal });
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
handleInput.addEventListener("blur", () => setTimeout(hideTypeahead, 150));
handleInput.addEventListener("keydown", (e) => {
  if (typeaheadEl.classList.contains("show") && taItems.length) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveTa((taActive + 1) % taItems.length); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveTa((taActive - 1 + taItems.length) % taItems.length); return; }
    if (e.key === "Enter" && taActive >= 0) {
      e.preventDefault();
      handleInput.value = taItems[taActive].handle;
      hideTypeahead();
      return;
    }
    if (e.key === "Escape") { hideTypeahead(); return; }
  }
  if (e.key === "Enter") { e.preventDefault(); startOAuth(); }
});

// ---- /info + initial replay --------------------------------------

async function fetchInfo() {
  try {
    const r = await fetch(`${MMO_API}/info`);
    if (!r.ok) {
      console.warn("[mmo] /info returned", r.status);
      showToast(`worker /info returned ${r.status} — deploy may be stale`, 4000);
      return null;
    }
    const data = await r.json();
    console.log("[mmo] /info:", data);
    state.serviceDid        = data.service_did        || null;
    state.serviceHandle     = data.service_handle     || null;
    state.jetstreamUrl      = data.jetstream_url      || null;
    state.canvasUri         = data.canvas_uri         || null;
    state.constellationBase = data.constellation_base || null;
    state.linkSource        = data.link_source        || null;
    if (typeof data.width  === "number") CANVAS_W = data.width;
    if (typeof data.height === "number") CANVAS_H = data.height;
    if (data.has_service === false) {
      showToast("service PDS credentials missing — writes will fail", 5000);
    }
    return data;
  } catch (e) {
    console.error("[mmo] /info fetch failed:", e);
    showToast("couldn't reach worker — deploy may still be running", 4000);
    return null;
  }
}

// Two separate dedup sets so a remote stroke that crosses our in-progress
// stroke doesn't permanently desync our view from canonical:
//
//   countedRkeys  — stats (strokeCount, contributors) counted once per rkey.
//   paintedRkeys  — bitmap painted at most once per rkey.
//
// Local-commit path passes opts.skipPaint=true and adds the rkey to
// countedRkeys only, NOT paintedRkeys. That way when Jetstream echoes our
// own stroke back ~1-2s later, applyStrokeToBitmap runs and overpaints any
// intervening strokes that landed on our in-progress pixels during the
// drag. Without this, our view diverges from everyone else's.
const countedRkeys = new Set();
const paintedRkeys = new Set();

function recordOnThisCanvas(record) {
  // New strongRef-shaped: record.canvas = { uri: <anchor> }
  if (record.canvas && typeof record.canvas === "object" && record.canvas.uri) {
    return !state.canvasUri || record.canvas.uri === state.canvasUri;
  }
  // canvas_id short tag (also written today)
  if (record.canvas_id === CANVAS_ID) return true;
  // Legacy: canvas = "global"
  if (record.canvas === CANVAS_ID) return true;
  return false;
}

function applyRecord(rkey, record, opts) {
  if (!record || !recordOnThisCanvas(record)) return;
  if (!record.tool || !record.color || !record.size || !Array.isArray(record.points)) return;

  // Paint: skip if caller already painted locally OR we've already painted
  // this rkey from a previous path.
  const wantPaint = !opts || !opts.skipPaint;
  if (wantPaint && rkey && !paintedRkeys.has(rkey)) {
    paintedRkeys.add(rkey);
    applyStrokeToBitmap(record.tool, record.color, record.size, record.points);
  }

  // Stats: counted at most once per rkey.
  if (rkey && !countedRkeys.has(rkey)) {
    countedRkeys.add(rkey);
    if (!state.latestRkey || rkey > state.latestRkey) state.latestRkey = rkey;
    state.strokeCount++;
    const did    = record.contributor       || (opts && opts.contributor)       || "";
    const handle = record.contributorHandle || (opts && opts.contributorHandle) || "";
    if (did) {
      const cur = state.contributors.get(did) || { handle, count: 0 };
      cur.count++;
      if (handle && !cur.handle) cur.handle = handle;
      state.contributors.set(did, cur);
    }
  }
}

// Resolve a DID to its PDS URL via the public PLC directory. Cached
// in-memory; sufficient for one page load. did:web:* resolves to the
// host portion of the DID itself.
const pdsByDid = new Map();
async function resolvePds(did) {
  if (!did) return null;
  if (pdsByDid.has(did)) return pdsByDid.get(did);
  let pds = null;
  try {
    if (did.startsWith("did:web:")) {
      pds = "https://" + did.slice("did:web:".length);
    } else if (did.startsWith("did:plc:")) {
      const r = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
      if (r.ok) {
        const doc = await r.json();
        const svc = (doc.service || []).find(
          s => s && (s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer")
        );
        pds = svc && svc.serviceEndpoint ? svc.serviceEndpoint : null;
      }
    }
  } catch (e) { /* swallow — caller treats null as skip */ }
  if (pds) pdsByDid.set(did, pds);
  return pds;
}

// Replay via Constellation — the ATProto-wide backlink index. Strokes
// link to a canvas anchor URI via record.canvas.uri; Constellation
// returns every {did, collection, rkey} pointing at that anchor across
// the entire network. For each, we resolve the contributor's PDS and
// fetch the record value.
//
// Idempotent. countedRkeys + paintedRkeys dedup repeat applies, so we
// can safely re-run on tab visibility / bfcache restore / Jetstream
// reconnect to catch up after backgrounded gaps that exceeded the
// 10-minute jetstream cursor backfill.
let replayInProgress = false;
async function replayInitial() {
  if (replayInProgress) {
    console.log("[mmo] replay already in progress — skipping");
    return;
  }
  replayInProgress = true;
  try {
    if (!state.canvasUri || !state.constellationBase || !state.linkSource) {
      console.warn("[mmo] missing canvas/constellation config — skipping replay");
      return;
    }
    const url = new URL(`${state.constellationBase}/xrpc/blue.microcosm.links.getBacklinks`);
    url.searchParams.set("subject", state.canvasUri);
    url.searchParams.set("source",  state.linkSource);
    url.searchParams.set("limit",   "100");

    let data;
    try {
      const r = await fetch(url.toString());
      if (!r.ok) {
        console.warn("[mmo] constellation returned", r.status);
        return;
      }
      data = await r.json();
    } catch (e) {
      console.warn("[mmo] constellation fetch failed:", e);
      return;
    }

    const items = data.records || [];
    console.log(`[mmo] constellation: ${data.total} backlinks (have ${countedRkeys.size} locally)`);
    if (!items.length) return;

    // Oldest first so the canvas reconstructs in chronological order
    // (TID rkeys sort lex).
    items.sort((a, b) => (a.rkey < b.rkey ? -1 : a.rkey > b.rkey ? 1 : 0));

    // Skip records we've already applied — saves N PDS fetches per
    // replay re-run.
    const fresh = items.filter(it => !countedRkeys.has(it.rkey));
    if (!fresh.length) {
      console.log("[mmo] replay caught up — no new records");
      return;
    }

    // Fetch records in parallel with a small concurrency cap.
    const CONCURRENCY = 6;
    let cursor = 0;
    let applied = 0;
    async function worker() {
      while (cursor < fresh.length) {
        const it = fresh[cursor++];
        try {
          const pds = await resolvePds(it.did);
          if (!pds) continue;
          const u = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
          u.searchParams.set("repo",       it.did);
          u.searchParams.set("collection", it.collection);
          u.searchParams.set("rkey",       it.rkey);
          const res = await fetch(u.toString());
          if (!res.ok) continue;
          const got = await res.json();
          applyRecord(it.rkey, got.value || {}, { contributor: it.did });
          applied++;
        } catch (e) { /* per-record failures don't stop the batch */ }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`[mmo] replayed ${applied}/${fresh.length} new records`);
    render();
  } finally {
    replayInProgress = false;
  }
}

// ---- Jetstream live subscription ---------------------------------

function connectJetstream() {
  if (!state.jetstreamUrl) {
    console.warn("[mmo] no jetstream URL configured");
    return;
  }
  if (state.js) try { state.js.close(); } catch {}
  state.jsState = "connecting";
  refreshStatus();
  // Backfill the firehose from a few minutes ago. Constellation has
  // indexing lag (seconds to minutes); Jetstream is near-real-time but
  // doesn't replay without a cursor. Asking for the last 10 minutes
  // catches the seam: anything recent that hasn't landed in Constellation
  // yet still reaches us via the firehose. paintedRkeys dedups paint, countedRkeys dedups stats.
  const backfillUs = (Date.now() - 10 * 60 * 1000) * 1000;
  const url = `${state.jetstreamUrl}&cursor=${backfillUs}`;
  console.log("[mmo] jetstream connecting (with 10m backfill):", url);
  let js;
  try { js = new WebSocket(url); }
  catch (e) {
    console.error("[mmo] jetstream constructor failed:", e);
    state.jsState = "error";
    refreshStatus();
    scheduleJetstreamReconnect();
    return;
  }
  state.js = js;
  js.addEventListener("open", () => {
    console.log("[mmo] jetstream open");
    state.jsState = "open";
    refreshStatus();
  });
  js.addEventListener("message", (ev) => {
    let m;
    try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ""); }
    catch { return; }
    onJetstreamEvent(m);
  });
  js.addEventListener("close", (ev) => {
    console.warn("[mmo] jetstream closed:", ev.code, ev.reason || "");
    state.jsState = "closed";
    refreshStatus();
    scheduleJetstreamReconnect();
  });
  js.addEventListener("error", (ev) => {
    console.warn("[mmo] jetstream error event", ev);
    state.jsState = "error";
    refreshStatus();
  });
}

function scheduleJetstreamReconnect() {
  if (state.jsReconnectTimer) return;
  state.jsReconnectTimer = setTimeout(() => {
    state.jsReconnectTimer = null;
    connectJetstream();
  }, 3000);
}

function onJetstreamEvent(m) {
  // While !jsReady (initial replay in flight), queue events so we don't
  // miss the seam. They'll be drained right after replay completes.
  if (!state.jsReady) {
    state.jsBuffer.push(m);
    return;
  }
  applyJetstreamEvent(m);
}

function applyJetstreamEvent(m) {
  // Jetstream commit envelope:
  //   { did, time_us, kind: "commit", commit: { rev, operation, collection, rkey, record, cid } }
  if (m.kind !== "commit" || !m.commit) return;
  const c = m.commit;
  if (c.collection !== "com.minomobi.mmopaint.stroke") return;
  if (c.operation !== "create") return;
  const rec = c.record;
  const rkey = c.rkey || "";
  // applyRecord dedups paint via paintedRkeys, stats via countedRkeys — safe to re-apply our own writes
  // and to overlap with anything that came through Constellation.
  applyRecord(rkey, {
    ...rec,
    contributor: m.did || rec.contributor || "",
  });
  render();
}

function drainJetstreamBuffer() {
  if (!state.jsBuffer.length) return;
  console.log(`[mmo] draining ${state.jsBuffer.length} buffered jetstream events`);
  const buf = state.jsBuffer;
  state.jsBuffer = [];
  for (const m of buf) applyJetstreamEvent(m);
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
    cancelLocalStroke();
    const pts = [...state.pointers.values()];
    const mid0View = midpoint(pts[0], pts[1]);
    state.gesture = {
      d0:    Math.max(1, ptDist(pts[0], pts[1])),
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
  const wasDrawing  = !!state.localStroke;
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
view.addEventListener("contextmenu",   e => e.preventDefault());

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

// ---- local stroke (one record per pen-down to pen-up) ------------

function beginLocalStroke(bx, by) {
  state.localStroke = {
    tool: state.tool, color: state.color, size: state.size,
    points: [bx, by],
    lastBx: bx, lastBy: by,
  };
  applyStrokeToBitmap(state.tool, state.color, state.size, [bx, by]);
  render();
}

function extendLocalStroke(bx, by) {
  const s = state.localStroke;
  if (!s) return;
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
  // Two-finger pinch interrupted. Pixels already painted locally stay
  // (will be reconciled when the server-side record arrives via Jetstream
  // — or won't, since we never submitted). For pinch-cancel that's fine.
  state.localStroke = null;
}

async function commitLocalStroke() {
  const s = state.localStroke;
  state.localStroke = null;
  if (!s || s.points.length < 2) return;
  // Cap to server's MAX_POINTS (600); subsample if longer.
  const MAX = 580;
  let pts = s.points;
  if (pts.length / 2 > MAX) {
    const step = Math.ceil((pts.length / 2) / MAX);
    const out = [];
    for (let i = 0; i < pts.length; i += step * 2) out.push(pts[i], pts[i + 1]);
    if (out[out.length - 2] !== pts[pts.length - 2] || out[out.length - 1] !== pts[pts.length - 1]) {
      out.push(pts[pts.length - 2], pts[pts.length - 1]);
    }
    pts = out;
  }
  await sendStroke(s.tool, s.color, s.size, pts);
}

async function sendStroke(tool, color, size, points) {
  if (!state.session) {
    showSigninPrompt(true);
    return;
  }
  try {
    const res = await fetch(`${MMO_API}/strokes`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${state.session.sessionId}`,
      },
      body: JSON.stringify({
        canvas: CANVAS_ID,
        tool, color, size, points,
      }),
    });
    if (res.status === 401) {
      clearStoredSession();
      state.session = null;
      refreshAuthUI();
      showSigninPrompt(true);
      showToast("session expired — sign in");
      return;
    }
    if (res.status === 403) {
      // Session exists but lacks write scope. Typically because it was
      // created via /draw (atproto only). Force re-auth through /mmo
      // to grant transition:generic.
      const data = await res.json().catch(() => ({}));
      console.warn("[mmo] write scope missing:", data);
      clearStoredSession();
      state.session = null;
      refreshAuthUI();
      showSigninPrompt(true);
      showToast("need to grant write access — sign in again", 5000);
      return;
    }
    if (res.status === 429) {
      // Cooldown — ignore quietly. The pixels are already on local canvas.
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error
        ? `${data.error}${data.detail ? ' — ' + data.detail : ''}`
        : `submit failed (${res.status})`;
      console.warn("[mmo] POST /strokes failed:", res.status, data);
      showToast(msg, 5000);
      return;
    }
    const data = await res.json();
    console.log("[mmo] stroke written:", data.uri || data.rkey);
    // Fold the just-written stroke into the local stats so the audit
    // chip reflects it immediately, without waiting for Jetstream to
    // echo it back. Dedup keyed on rkey will skip if Jetstream lands
    // before us.
    if (data.rkey) {
      applyRecord(data.rkey, {
        canvas: CANVAS_ID, tool, color, size, points,
        contributor: state.session.did,
        contributorHandle: state.session.handle,
      }, { skipPaint: true });
      render();
    }
  } catch (e) {
    console.error("[mmo] POST /strokes network error:", e);
    showToast("network error — your stroke is local-only");
  }
}

// ---- color palette + tools + slider ------------------------------

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
customColor.addEventListener("input", (e) => setColor(e.target.value));
toolGroup.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tool]");
  if (b) setTool(b.dataset.tool);
});
sizeSlider.addEventListener("input", () => setSize(parseInt(sizeSlider.value, 10) || 1));

// ---- audit panel -------------------------------------------------

const profileCache = new Map();   // did -> profile

async function resolveProfilesByDid(dids) {
  const need = [...new Set(dids.filter(d => d && d.startsWith("did:") && !profileCache.has(d)))];
  if (!need.length) return;
  for (let i = 0; i < need.length; i += 25) {
    const chunk = need.slice(i, i + 25);
    const u = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles");
    chunk.forEach(d => u.searchParams.append("actors", d));
    try {
      const r = await fetch(u.toString());
      if (!r.ok) continue;
      const data = await r.json();
      for (const p of data.profiles || []) {
        if (p.did) profileCache.set(p.did, p);
      }
    } catch {}
  }
}

async function openAudit() {
  auditPanel.classList.add("open");
  apCanvas.textContent = CANVAS_ID;
  apSeq.textContent  = state.strokeCount.toLocaleString();
  apHash.textContent = state.latestRkey || "—";
  // Records now live on each contributor's own PDS. Surface our own
  // collection URI if signed in.
  if (state.session && state.session.did) {
    apPds.innerHTML = `your strokes: <code>at://${escapeHtml(state.session.did)}/com.minomobi.mmopaint.stroke</code>`;
  } else {
    apPds.textContent = "sign in to write strokes to your own PDS";
  }

  // Top contributors from in-memory tally.
  const list = [...state.contributors.entries()]
    .map(([did, v]) => ({ did, handle: v.handle, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  apContribs.innerHTML = "";
  if (!list.length) {
    apContribs.innerHTML = `<li class="count">no strokes yet</li>`;
    return;
  }
  for (const c of list) {
    const li = document.createElement("li");
    li.dataset.did = c.did;
    const link = `https://bsky.app/profile/${c.did}`;
    const initialHandle = (c.handle && !c.handle.startsWith("did:")) ? c.handle : "…";
    li.innerHTML =
      `<a href="${link}" target="_blank" rel="noopener">@${escapeHtml(initialHandle)}</a>` +
      `<span class="count">${c.count}</span>`;
    apContribs.appendChild(li);
  }
  await resolveProfilesByDid(list.map(c => c.did));
  apContribs.querySelectorAll("li").forEach(li => {
    const prof = profileCache.get(li.dataset.did);
    if (prof && prof.handle) {
      const a = li.querySelector("a");
      if (a) a.textContent = "@" + prof.handle;
    }
  });
}
$("audit-btn").addEventListener("click", openAudit);
$("audit-mini").addEventListener("click", openAudit);
$("audit-close").addEventListener("click", () => auditPanel.classList.remove("open"));

// ---- presence chip = manual reconnect ----------------------------

presenceEl.style.cursor = "pointer";
presenceEl.addEventListener("click", () => {
  if (state.jsState === "open") return;
  if (state.jsReconnectTimer) {
    clearTimeout(state.jsReconnectTimer);
    state.jsReconnectTimer = null;
  }
  connectJetstream();
});

// ---- resize observer ---------------------------------------------

const ro = new ResizeObserver(() => resize());
ro.observe(stage);
window.addEventListener("resize", () => resize());
window.addEventListener("orientationchange", () => setTimeout(resize, 100));

// ---- catch-up on tab visibility / bfcache ------------------------

// When the tab comes back from background, the Jetstream WebSocket may
// have died and any strokes that landed during the suspend are lost
// (the 10-min cursor backfill covers short gaps but not a phone-locked-
// for-an-hour gap). Also covers bfcache restores via the pageshow event.
// replayInitial is idempotent — already-applied rkeys are skipped.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  console.log("[mmo] tab visible — re-syncing");
  replayInitial();
  // If Jetstream is dead, kick a reconnect too.
  if (state.jsState !== "open" && state.jsState !== "connecting") {
    if (state.jsReconnectTimer) { clearTimeout(state.jsReconnectTimer); state.jsReconnectTimer = null; }
    connectJetstream();
  }
});
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;   // not from bfcache; the regular boot path covered us
  console.log("[mmo] restored from bfcache — re-syncing");
  replayInitial();
  if (state.jsState !== "open" && state.jsState !== "connecting") {
    connectJetstream();
  }
});

// ---- boot --------------------------------------------------------

async function boot() {
  resize();
  fitView();
  setTool("brush");
  setColor("#000000");
  setSize(6);

  state.session = readSessionFragment() || readStoredSession();
  refreshAuthUI();

  // Step 1: fetch config — need canvas_uri + jetstream URL.
  const info = await fetchInfo();
  if (info && (bitmap.width !== CANVAS_W || bitmap.height !== CANVAS_H)) {
    bitmap.width = CANVAS_W; bitmap.height = CANVAS_H;
    bctx.fillStyle = "#ffffff"; bctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    fitView();
  }

  // Step 2: connect Jetstream FIRST. Events arrive into a buffer while
  // jsReady=false (set during initial replay). This closes the seam
  // between "Constellation snapshot" and "live feed begins" — any
  // stroke landing in that window stays applied via the buffer drain.
  state.jsReady = false;
  state.jsBuffer = [];
  if (state.jetstreamUrl) connectJetstream();

  // Step 3: replay backlog via Constellation. Constellation lags the
  // firehose by some seconds, so very recent writes may be missing
  // from this set; the 10-minute cursor backfill on the Jetstream
  // connection (which is now buffering) catches them. paintedRkeys+countedRkeys
  // dedups any overlap.
  await replayInitial();

  // Step 4: flip the ready flag and drain anything Jetstream buffered
  // during steps 2-3. From here on, events apply live.
  state.jsReady = true;
  drainJetstreamBuffer();

  if (!state.session) showSigninPrompt(true);
}

boot();
