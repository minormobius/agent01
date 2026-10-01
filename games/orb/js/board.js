/* Orb — the leaderboard: fastest PURE clears, per size.

   Storage is scores.mino.mobi (workers/scores): one global board per game
   slug, identity from the shared auth worker, so a player is their Bluesky
   handle. It ranks higher-is-better, so a time goes in negated (−ms).

   Why not com.minomobi.lab.score records on each player's PDS? Those have no
   index: a page can only rank the handles it is told to look up, so there is
   no global "fastest" without building an indexer. scores.mino.mobi already
   is one.

   Only a pure clear (zero guesses, per solve.js certainties) is offered for
   posting. The board takes the client's word for that — the worker verifies
   identity, not play. `meta` carries seed + first cell, which pins the exact
   board, so a replay verifier could be added later without a format change.

   Signing in leaves the page, so a result waiting to be posted is parked in
   localStorage and posted on return. Module script: needs ../lib/auth.js,
   which deploy-games.yml vendors from packages/oauth-client/ at deploy time. */
import { AuthClient } from "../../lib/auth.js";

const O = window.ORB;
const API = "https://scores.mino.mobi";
const PENDING = "orb-pending-post";
const slug = (size) => "orb-pure-" + size;
const SIZE_NAME = { s: "small", m: "medium", l: "large" };
const $ = (id) => document.getElementById(id);

const auth = new AuthClient();
let ready = auth.init().catch(() => {});
let view = { size: "m", period: "all" };

function clock(ms) {
  const t = ms / 1000, m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + s.toFixed(1).padStart(4, "0");
}
const canPost = () => auth.isLoggedIn() && !!auth.getToken();

async function post(r) {
  const res = await fetch(API + "/api/scores/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + auth.getToken() },
    body: JSON.stringify({
      game: slug(r.size), score: -r.ms,
      meta: "v1 seed=" + r.seed + " first=" + r.first + " guesses=0",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "HTTP " + res.status);
  return body;
}

/* Best time per player — the worker returns every run, and one fast player
   should not fill the board. */
async function top(size, period) {
  const res = await fetch(API + "/api/scores/top?game=" + slug(size) + "&period=" + period + "&limit=100");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const body = await res.json(), seen = new Set(), out = [];
  for (const row of body.scores || []) {
    if (seen.has(row.did)) continue;
    seen.add(row.did); out.push(row);
    if (out.length === 10) break;
  }
  return out;
}

function status(msg) { $("board-status").textContent = msg || ""; }

function renderAccount() {
  const u = auth.getUser();
  $("board-who").textContent = canPost() ? "signed in as @" + u.handle : "";
  $("board-signin").hidden = canPost();
  if (u && !$("board-handle").value) $("board-handle").value = u.handle;
  $("board-signout").hidden = !auth.isLoggedIn();
}

async function render(highlight) {
  for (const b of document.querySelectorAll("[data-board-size]")) b.classList.toggle("on", b.dataset.boardSize === view.size);
  for (const b of document.querySelectorAll("[data-board-period]")) b.classList.toggle("on", b.dataset.boardPeriod === view.period);
  const list = $("board-list");
  list.innerHTML = "<li class='dim'>loading…</li>";
  try {
    const rows = await top(view.size, view.period);
    const me = auth.getUser();
    list.innerHTML = rows.length ? "" : "<li class='dim'>no pure clears yet — be the first</li>";
    rows.forEach((r, k) => {
      const li = document.createElement("li");
      if ((me && r.did === me.did) || (highlight && r.did === highlight)) li.className = "me";
      const seed = /seed=(\S+)/.exec(r.meta || "");
      li.innerHTML = "<span class='rk'>" + (k + 1) + "</span><span class='h'></span><span class='t'>" + clock(-r.score) + "</span>";
      li.querySelector(".h").textContent = "@" + r.handle;
      if (seed) li.title = "seed " + seed[1];
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = "<li class='dim'>board unreachable (" + e.message + ")</li>";
  }
}

function open(size) {
  view.size = size || view.size;
  $("start").hidden = true;
  $("board").hidden = false;
  renderAccount();
  render();
}

/* Called by main.js on a pure clear. Posts now if signed in; otherwise parks
   it and opens the board with the sign-in row showing. */
async function offer(r) {
  await ready;
  if (canPost()) {
    try {
      const res = await post(r);
      status("posted " + clock(r.ms) + " — #" + res.rank + " of all pure " + SIZE_NAME[r.size] + " runs");
      open(r.size);
      return;
    } catch (e) { status("couldn't post: " + e.message); }
  } else {
    try { localStorage.setItem(PENDING, JSON.stringify(r)); } catch (e) { /* private mode: sign-in will lose it */ }
    status("sign in with Bluesky to post " + clock(r.ms) + " — it'll be waiting when you get back");
  }
  open(r.size);
}

async function signIn() {
  const h = $("board-handle").value.trim().replace(/^@/, "");
  if (!h) { status("your Bluesky handle, e.g. alice.bsky.social"); return; }
  status("off to Bluesky…");
  try { await auth.login(h, { scope: "atproto", returnTo: location.href }); }
  catch (e) { status(e.message); }
}

/* Back from sign-in with a parked result: post it. */
async function resume() {
  await ready;
  renderAccount();
  let r = null;
  try { r = JSON.parse(localStorage.getItem(PENDING) || "null"); } catch (e) { /* ignore */ }
  if (!r || !canPost()) return;
  try { localStorage.removeItem(PENDING); } catch (e) { /* ignore */ }
  if (Date.now() - (r.at || 0) > 3600e3) return; // stale: don't post an hour-old run silently
  try {
    const res = await post(r);
    status("posted " + clock(r.ms) + " — #" + res.rank + " of all pure " + SIZE_NAME[r.size] + " runs");
  } catch (e) { status("couldn't post: " + e.message); }
  open(r.size);
}

for (const b of document.querySelectorAll("[data-board-size]")) b.onclick = () => { view.size = b.dataset.boardSize; render(); };
for (const b of document.querySelectorAll("[data-board-period]")) b.onclick = () => { view.period = b.dataset.boardPeriod; render(); };
$("board-go").onclick = signIn;
$("board-handle").onkeydown = (e) => { if (e.key === "Enter") signIn(); };
$("board-signout").onclick = async (e) => { e.preventDefault(); await auth.logout(); renderAccount(); status("signed out"); };
$("board-close").onclick = () => { $("board").hidden = true; };

O.board = { open, offer };
resume();
