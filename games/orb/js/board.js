/* Orb — the leaderboard: fastest PURE clears per size, read live off ATProto.

   A score is a com.minomobi.lab.score record in the player's OWN repo:
     { site: "orb", game: "pure-<s|m|l>", value: ms, unit: "ms",
       higherIsBetter: false, detail: "seed=… first=… guesses=0", createdAt }
   Nobody hosts the board. js/corpus.js rebuilds it in every browser: a
   backfill from the relay and each player's PDS, then Jetstream for live
   updates. A score posted anywhere shows up on every open board within a
   second or so; delete the record and it leaves.

   Writing needs one narrow permission, repo:com.minomobi.lab.score, through
   the shared auth worker. Sign-in (or the permission upgrade) leaves the
   page, so a winning time waiting to be posted is parked in localStorage
   and posted on return.

   The board trusts the record. A player can write any number into their
   own repo, which is the nature of user-owned data. `detail` carries seed +
   first cell, which pin the exact board, so a replay check can come later.

   Module script: needs ../../lib/auth.js, which deploy-games.yml vendors from
   packages/oauth-client/ at deploy time. */
import { AuthClient } from "../../lib/auth.js";
import { Corpus, COLLECTION, accept } from "./corpus.js";

const O = window.ORB;
const SCOPE = "repo:" + COLLECTION;
const PENDING = "orb-pending-post";
const PERIOD_MS = { all: 0, week: 7 * 86400e3, today: 86400e3 };
const $ = (id) => document.getElementById(id);

const auth = new AuthClient();
const ready = auth.init().catch(() => {});
const corpus = new Corpus(accept);
let started = false, view = { size: "m", period: "all" }, posted = null;

function clock(ms) {
  const t = ms / 1000, m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + s.toFixed(1).padStart(4, "0");
}
const canPost = () => auth.isLoggedIn() && auth.hasScope(SCOPE);

async function post(r) {
  const record = {
    $type: COLLECTION, site: "orb", game: "pure-" + r.size, value: Math.round(r.ms), unit: "ms",
    higherIsBetter: false, detail: "seed=" + r.seed + " first=" + r.first + " guesses=0",
    createdAt: new Date(r.at || Date.now()).toISOString(),
  };
  const res = await auth.pds.createRecord(COLLECTION, record);
  const me = auth.getUser();
  corpus.upsert(res.uri, me.did, record, me.handle); // don't wait for Jetstream to echo it
  posted = res.uri;
  return record;
}

function status(msg) { $("board-status").textContent = msg || ""; }

function renderLive() {
  const el = $("board-live"), n = corpus.records.size;
  el.className = "live is-" + corpus.state;
  el.textContent = corpus.state === "backfill" ? "reading every repo on the network…"
    : corpus.state === "live" ? "live · " + n + " pure clear" + (n === 1 ? "" : "s") + " in the corpus"
    : corpus.state === "offline" ? "reconnecting to Jetstream…" : "";
}

function renderAccount() {
  const u = auth.getUser();
  const signedIn = auth.isLoggedIn();
  $("board-who").textContent = signedIn ? "signed in as @" + u.handle : "";
  $("board-signout").hidden = !signedIn;
  $("board-signin").hidden = signedIn;
  if (u && !$("board-handle").value) $("board-handle").value = u.handle;
}

function render() {
  for (const b of document.querySelectorAll("[data-board-size]")) b.classList.toggle("on", b.dataset.boardSize === view.size);
  for (const b of document.querySelectorAll("[data-board-period]")) b.classList.toggle("on", b.dataset.boardPeriod === view.period);
  renderLive();
  const list = $("board-list"), me = auth.getUser();
  const since = PERIOD_MS[view.period] ? Date.now() - PERIOD_MS[view.period] : 0;
  const rows = corpus.top("pure-" + view.size, since, 10);
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = corpus.state === "backfill" ? "<li class='dim'>loading…</li>" : "<li class='dim'>no pure clears yet. Be the first</li>";
    return;
  }
  rows.forEach((r, k) => {
    const li = document.createElement("li");
    if ((me && r.did === me.did) || r.uri === posted) li.className = "me";
    li.innerHTML = "<span class='rk'>" + (k + 1) + "</span><a class='h' target='_blank' rel='noopener'></a><span class='t'>" + clock(r.value) + "</span>";
    const a = li.querySelector(".h");
    a.textContent = r.handle.startsWith("did:") ? r.handle.slice(0, 18) + "…" : "@" + r.handle;
    a.href = "https://bsky.app/profile/" + r.did;
    li.title = (r.detail || "") + " · " + r.uri;
    list.appendChild(li);
  });
}

let frame = 0;
corpus.on(() => { if (!frame && !$("board").hidden) frame = requestAnimationFrame(() => { frame = 0; render(); }); });

function open(size) {
  view.size = size || view.size;
  $("start").hidden = true;
  $("board").hidden = false;
  if (!started) { started = true; corpus.start(); }
  renderAccount();
  render();
}

function park(r) { try { localStorage.setItem(PENDING, JSON.stringify(r)); } catch (e) { /* private mode */ } }

/* Called by main.js on a pure clear. */
async function offer(r) {
  await ready;
  open(r.size);
  if (canPost()) {
    try { await post(r); status("posted " + clock(r.ms) + " to your repo"); }
    catch (e) { status("couldn't post: " + e.message); }
  } else if (auth.isLoggedIn()) {
    // signed in on some *.mino.mobi site, but without this collection
    park(r);
    status("posting needs one more permission (write score records). Taking you to Bluesky…");
    setTimeout(() => auth.ensureScope([SCOPE]).catch((e) => status(e.message)), 1200);
  } else {
    park(r);
    status("sign in with Bluesky to post " + clock(r.ms) + ". It'll be waiting when you get back");
  }
  render();
}

async function signIn() {
  const h = $("board-handle").value.trim().replace(/^@/, "");
  if (!h) { status("your Bluesky handle, e.g. alice.bsky.social"); return; }
  status("off to Bluesky…");
  try { await auth.login(h, { scope: "atproto " + SCOPE, returnTo: location.href }); }
  catch (e) { status(e.message); }
}

/* Back from sign-in with a parked result: post it. */
async function resume() {
  await ready;
  let r = null;
  try { r = JSON.parse(localStorage.getItem(PENDING) || "null"); } catch (e) { /* ignore */ }
  if (!r || !canPost()) return;
  try { localStorage.removeItem(PENDING); } catch (e) { /* ignore */ }
  if (Date.now() - (r.at || 0) > 3600e3) return; // stale: don't post an hour-old run silently
  open(r.size);
  try { await post(r); status("posted " + clock(r.ms) + " to your repo"); }
  catch (e) { status("couldn't post: " + e.message); }
  render();
}

for (const b of document.querySelectorAll("[data-board-size]")) b.onclick = () => { view.size = b.dataset.boardSize; render(); };
for (const b of document.querySelectorAll("[data-board-period]")) b.onclick = () => { view.period = b.dataset.boardPeriod; render(); };
$("board-go").onclick = signIn;
$("board-handle").onkeydown = (e) => { if (e.key === "Enter") signIn(); };
$("board-signout").onclick = async (e) => { e.preventDefault(); await auth.logout(); renderAccount(); render(); status("signed out"); };
$("board-close").onclick = () => { $("board").hidden = true; };

O.board = { open, offer };
resume();
