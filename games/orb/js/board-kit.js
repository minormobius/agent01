/* A leaderboard any game on games.mino.mobi can mount: Orb's, made portable.

   Scores are com.minomobi.lab.score records in each player's OWN repo, read
   back live by ./corpus.js (relay + PDS backfill, then Jetstream), so nobody
   hosts the board. Writing needs the one narrow permission
   repo:com.minomobi.lab.score through the shared auth worker; a result
   waiting on sign-in is parked in localStorage and posted on return.

   mountBoard(config) builds its own overlay (DOM and styles) and returns
   { open(sel), offer(result) }.
     config.site      the record's site, e.g. "oneside"
     config.title     the overlay's heading; config.blurb its subheading
     config.groups    tab rows: [{ key, options: [[value, label], …] }] (may be [])
     config.gameId    sel → the record's game id (sel: { [group key]: value })
     config.accept    value → true for this game's records
     config.higher    true when a higher value is better (a score, not a time)
     config.format    (value, sel) → its text on the board
     config.record    result → the record's extra fields (value, unit, detail …)
     config.records   optional: result → several records, each with its own
                      game (one run, more than one board: Tessera posts its
                      score and its longest snake); replaces config.record
   A result is { sel, value, at, … } (whatever config.record reads).

   The sign-in field suggests handles as you type (handleTypeahead, below). */
import { AuthClient } from "../../lib/auth.js";
import { Corpus, COLLECTION } from "./corpus.js";

const SCOPE = "repo:" + COLLECTION;

/* Handle suggestions under a sign-in field: the repo's shared typeahead
   (packages/oauth-client/typeahead.js, vendored into lib/ by the deploy like
   auth.js), asked of the public appview, which is CORS-open. Loaded lazily,
   so a page whose lib/ lacks it just keeps a plain field. Returns busy():
   true while a suggestion is highlighted, so the field's own Enter (sign in)
   waits for the pick. The wrapper takes over the field's place in its row. */
export function handleTypeahead(input) {
  let list = null;
  const cs = getComputedStyle(input), flex = cs.flex, grow = parseFloat(cs.flexGrow) > 0, width = /px$/.test(cs.width) ? cs.width : "";
  import("../../lib/typeahead.js").then((m) => {
    list = m.attachHandleTypeahead(input, { gateway: "https://public.api.bsky.app" });
    const w = input.parentElement; if (!w) return;
    w.style.colorScheme = "dark";
    if (list) Object.assign(list.style, { right: "auto", minWidth: "100%", width: "max-content", maxWidth: "min(340px, 86vw)" }); // a narrow field still shows whole handles
    // the wrapper stands where the field stood: its flex if it had one (keeping the field's own minimum width), else its width
    if (grow) { w.style.flex = flex; w.style.minWidth = "auto"; } else if (width) w.style.width = width;
  }).catch(() => { /* no typeahead: a plain field */ });
  return () => !!list && !list.hidden && !!list.querySelector("li.on");
}
const PERIOD_MS = { all: 0, week: 7 * 86400e3, today: 86400e3 };
const CSS = `
.lbk { position: fixed; inset: 0; z-index: 60; background: rgba(5,6,12,0.95); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 22px 16px; overflow-y: auto; font-family: ui-monospace, Menlo, Consolas, monospace; color: #e6e6ee; text-align: center; }
.lbk[hidden] { display: none; }
.lbk > :first-child { margin-top: auto; } .lbk > :last-child { margin-bottom: auto; }
.lbk h1 { margin: 0; font-size: 34px; letter-spacing: 0.08em; }
.lbk h2 { margin: 0; font-size: 11px; color: #8a8aa8; letter-spacing: 0.16em; font-weight: 600; }
.lbk .tabs { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.lbk .tabs button, .lbk .ghost { flex: none; background: transparent; color: #c8c8da; border: 1px solid #2a2a44; border-radius: 9px; padding: 6px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.lbk .tabs button.on { border-color: #5ee8c1; color: #e6fff8; }
.lbk ol { list-style: none; margin: 4px 0; padding: 0; width: min(420px, 100%); }
.lbk li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-bottom: 1px solid #16162a; font-size: 14px; }
.lbk li.dim { color: #8a8aa8; justify-content: center; }
.lbk li.me { background: rgba(94,232,193,0.08); }
.lbk .rk { width: 22px; color: #8a8aa8; text-align: right; }
.lbk .h { flex: 1; display: flex; align-items: center; gap: 8px; color: #e6e6ee; text-decoration: none; min-width: 0; }
.lbk .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lbk .av { width: 24px; height: 24px; border-radius: 50%; background: #22223a; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; overflow: hidden; flex: none; }
.lbk .av img { width: 100%; height: 100%; object-fit: cover; }
.lbk .t { font-weight: 700; }
.lbk .live { font-size: 12px; color: #8a8aa8; margin: 0; min-height: 15px; }
.lbk .st { font-size: 12px; color: #ffc857; margin: 0; min-height: 15px; max-width: 420px; }
.lbk .si { display: flex; gap: 6px; }
.lbk .si[hidden] { display: none; }
.lbk input { background: #0c0c18; color: #e6e6ee; border: 1px solid #2a2a44; border-radius: 9px; padding: 8px 10px; font: inherit; font-size: 13px; width: 200px; }
.lbk .go { background: #5ee8c1; color: #062018; border: 0; border-radius: 9px; padding: 8px 14px; font: inherit; font-weight: 700; cursor: pointer; }
.lbk .who { font-size: 12px; color: #8a8aa8; margin: 0; }
.lbk .who a { color: #9fb0ff; }`;

export function mountBoard(config) {
  const auth = new AuthClient(), ready = auth.init().catch(() => {});
  const corpus = new Corpus(config.accept), PENDING = config.site + "-pending-post";
  const groups = config.groups || [], sel = {};
  groups.forEach((g) => { sel[g.key] = g.options[0][0]; });
  let period = "all", started = false, posted = null;

  if (!document.getElementById("lbk-css")) { const st = document.createElement("style"); st.id = "lbk-css"; st.textContent = CSS; document.head.appendChild(st); }
  const el = document.createElement("div"); el.className = "lbk"; el.hidden = true;
  el.innerHTML = `<h2>${config.blurb || "read live off ATProto"}</h2><h1>${config.title || "BEST"}</h1><p class="live"></p>` +
    groups.map((g) => `<div class="tabs" data-g="${g.key}">` + g.options.map((o) => `<button type="button" data-v="${o[0]}">${o[1]}</button>`).join("") + `</div>`).join("") +
    `<div class="tabs" data-p>` + [["all", "all time"], ["week", "week"], ["today", "today"]].map((o) => `<button type="button" data-v="${o[0]}">${o[1]}</button>`).join("") + `</div>` +
    `<ol></ol><p class="st"></p><div class="si"><input type="text" placeholder="you.bsky.social" autocomplete="username" autocapitalize="off" spellcheck="false" aria-label="Bluesky handle" /><button class="go" type="button">SIGN IN</button></div>` +
    `<p class="who"><span></span> <a href="#" hidden>sign out</a></p><button class="ghost close" type="button">CLOSE</button>`;
  document.body.appendChild(el);
  const $ = (q) => el.querySelector(q), list = $("ol");
  const status = (m) => { $(".st").textContent = m || ""; };
  const canPost = () => auth.isLoggedIn() && auth.hasScope(SCOPE);

  function render() {
    groups.forEach((g) => el.querySelectorAll(`[data-g="${g.key}"] button`).forEach((b) => b.classList.toggle("on", b.dataset.v === String(sel[g.key]))));
    el.querySelectorAll("[data-p] button").forEach((b) => b.classList.toggle("on", b.dataset.v === period));
    const n = Array.from(corpus.records.values()).length;
    $(".live").textContent = corpus.state === "backfill" ? "reading every repo on the network…" : corpus.state === "live" ? "live · " + n + " score" + (n === 1 ? "" : "s") + " in the corpus" : corpus.state === "offline" ? "reconnecting…" : "";
    const u = auth.getUser(), me = u && u.did, signed = auth.isLoggedIn();
    $(".who span").textContent = signed ? "signed in as @" + u.handle : ""; $(".who a").hidden = !signed; $(".si").hidden = signed;
    if (u && !$("input").value) $("input").value = u.handle;
    const since = PERIOD_MS[period] ? Date.now() - PERIOD_MS[period] : 0, rows = corpus.top(config.gameId(sel), since, 10, !!config.higher);
    list.innerHTML = "";
    if (!rows.length) { list.innerHTML = corpus.state === "backfill" ? "<li class='dim'>loading…</li>" : "<li class='dim'>nothing yet. Be the first</li>"; return; }
    rows.forEach((r, k) => {
      const li = document.createElement("li");
      if ((me && r.did === me) || r.uri === posted) li.className = "me";
      li.innerHTML = "<span class='rk'>" + (k + 1) + "</span><a class='h' target='_blank' rel='noopener'><span class='av'></span><span class='nm'></span></a><span class='t'></span>";
      li.querySelector(".t").textContent = config.format(r.value, sel);
      const a = li.querySelector(".h"), av = li.querySelector(".av");
      a.href = "https://bsky.app/profile/" + r.did; if (r.name) a.title = r.name;
      li.querySelector(".nm").textContent = r.handle ? "@" + r.handle : "resolving " + r.did.slice(8, 16) + "…";
      if (r.avatar) { const img = document.createElement("img"); img.src = r.avatar; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.onerror = () => img.remove(); av.appendChild(img); }
      else av.textContent = (r.handle || "?").charAt(0).toUpperCase();
      li.title = (r.detail || "") + " · " + r.uri;
      list.appendChild(li);
    });
  }
  let raf = 0;
  corpus.on(() => { if (!raf && !el.hidden) raf = requestAnimationFrame(() => { raf = 0; render(); }); });

  function open(s) {
    Object.assign(sel, s || {});
    el.hidden = false;
    if (!started) { started = true; corpus.start(); }
    render();
  }
  async function post(r) {
    const extra = config.records ? config.records(r) : [Object.assign({ game: config.gameId(r.sel) }, config.record(r))], me = auth.getUser();
    for (const x of extra) {
      const record = Object.assign({ $type: COLLECTION, site: config.site, createdAt: new Date(r.at || Date.now()).toISOString() }, x);
      const res = await auth.pds.createRecord(COLLECTION, record);
      corpus.upsert(res.uri, me.did, record, me.handle);
      if (record.game === config.gameId(r.sel)) posted = res.uri;
    }
  }
  const park = (r) => { try { localStorage.setItem(PENDING, JSON.stringify(r)); } catch (e) { /* private mode */ } };
  async function offer(r) {
    await ready; open(r.sel);
    if (canPost()) { try { await post(r); status("posted " + config.format(r.value, r.sel) + " to your repo"); } catch (e) { status("couldn't post: " + e.message); } }
    else if (auth.isLoggedIn()) { park(r); status("posting needs one more permission (write score records). Taking you to Bluesky…"); setTimeout(() => auth.ensureScope([SCOPE]).catch((e) => status(e.message)), 1200); }
    else { park(r); status("sign in with Bluesky to post " + config.format(r.value, r.sel) + ". It'll be waiting when you get back"); }
    render();
  }
  async function signIn() {
    const h = $("input").value.trim().replace(/^@/, "");
    if (!h) { status("your Bluesky handle, e.g. alice.bsky.social"); return; }
    status("off to Bluesky…");
    try { await auth.login(h, { scope: "atproto " + SCOPE, returnTo: location.href }); } catch (e) { status(e.message); }
  }
  async function resume() {
    await ready;
    let r = null; try { r = JSON.parse(localStorage.getItem(PENDING) || "null"); } catch (e) { /* ignore */ }
    if (!r || !canPost()) return;
    try { localStorage.removeItem(PENDING); } catch (e) { /* ignore */ }
    if (Date.now() - (r.at || 0) > 3600e3) return; // stale: don't post an hour-old run silently
    open(r.sel);
    try { await post(r); status("posted " + config.format(r.value, r.sel) + " to your repo"); } catch (e) { status("couldn't post: " + e.message); }
    render();
  }
  groups.forEach((g) => el.querySelectorAll(`[data-g="${g.key}"] button`).forEach((b) => { b.onclick = () => { sel[g.key] = b.dataset.v; render(); }; }));
  el.querySelectorAll("[data-p] button").forEach((b) => { b.onclick = () => { period = b.dataset.v; render(); }; });
  $(".go").onclick = signIn;
  // keys pressed in the board (typing a handle) never reach the game underneath, whatever keys it listens for
  el.addEventListener("keydown", (e) => e.stopPropagation());
  const picking = handleTypeahead($("input"));
  $("input").onkeydown = (e) => { if (e.key === "Enter" && !picking()) signIn(); };
  $(".who a").onclick = async (e) => { e.preventDefault(); await auth.logout(); render(); status("signed out"); };
  $(".close").onclick = () => { el.hidden = true; };
  resume();
  return { open, offer, corpus };
}
