"use strict";

// The player surface. Pure hot path: walk the map, crystallize features (each
// becomes a fixed, persistent thing for THIS player), and rest to let the agent
// judge revelation/narrative. No LLM is called from here — the worker only reads
// and writes Postgres. Served same-origin from the local API, so relative fetches
// work without CORS.

const $ = (id) => document.getElementById(id);
let PLAYER = initPlayer();            // id is bound to this tab via the URL
let MAP = null;                       // {terrain, spawn, features}
let FEAT_BY_POS = {};                 // "x,y" -> feature
let pos = { x: 0, y: 0 };
let facing = { dx: 0, dy: 1 };        // last move direction; drives Enter-interact
let known = {};                       // feature_key -> placement (crystallized)
let lastChecked = new Date(0).toISOString();
let busy = false;

function newPlayerId() {
  return "p_" + Math.random().toString(36).slice(2, 8);
}

// Player identity lives in the URL (?player=...), so each tab is one player and a
// second player is just a second tab. The set of ids we've used is remembered in
// localStorage for the quick-switch chips + autocomplete.
function initPlayer() {
  const fromUrl = new URLSearchParams(location.search).get("player");
  const id = fromUrl || newPlayerId();
  if (!fromUrl) setUrlPlayer(id);
  rememberPlayer(id);
  return id;
}

function setUrlPlayer(id) {
  const u = new URL(location.href);
  u.searchParams.set("player", id);
  history.replaceState(null, "", u);
}

function knownPlayers() {
  try { return JSON.parse(localStorage.getItem("players") || "[]"); } catch { return []; }
}
function rememberPlayer(id) {
  const all = knownPlayers().filter((p) => p !== id);
  all.unshift(id);
  localStorage.setItem("players", JSON.stringify(all.slice(0, 12)));
}

function switchPlayer(id) {
  id = (id || "").trim();
  if (!id || id === PLAYER) return;
  PLAYER = id;
  setUrlPlayer(id);
  rememberPlayer(id);
  lastChecked = new Date(0).toISOString();
  boot().catch((e) => logEl(esc(e.message), "sys"));
}

function renderPlayers() {
  $("player-input").value = PLAYER;
  const ids = knownPlayers();
  $("known-players").innerHTML = ids.map((p) => `<option value="${esc(p)}">`).join("");
  $("known-chips").innerHTML = ids
    .map((p) => `<span class="chip${p === PLAYER ? " active" : ""}" data-id="${esc(p)}">${esc(p)}</span>`)
    .join("");
  $("known-chips").querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => switchPlayer(c.dataset.id))
  );
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}
const post = (path, body) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const esc = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ── log ──────────────────────────────────────────────────────────────────────

// Each player's console is persisted (per-id, capped) so switching players — or
// reloading the tab — brings their own scrollback back instead of a blank log.
const LOG_KEY = (p) => "log_" + p;
const LOG_MAX = 150;

function renderLine(html, cls) {
  const div = document.createElement("div");
  div.className = "line" + (cls ? " " + cls : "");
  div.innerHTML = html;
  const log = $("log");
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function persistLine(html, cls) {
  try {
    const arr = JSON.parse(localStorage.getItem(LOG_KEY(PLAYER)) || "[]");
    arr.push([html, cls || ""]);
    localStorage.setItem(LOG_KEY(PLAYER), JSON.stringify(arr.slice(-LOG_MAX)));
  } catch { /* quota / disabled — log still shows, just not persisted */ }
}

function logEl(html, cls) {
  renderLine(html, cls);
  persistLine(html, cls);
}

function restoreLog() {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(LOG_KEY(PLAYER)) || "[]"); } catch { arr = []; }
  for (const [html, cls] of arr) renderLine(html, cls);  // render only — already persisted
  return arr.length;
}

// ── map rendering ─────────────────────────────────────────────────────────────

const WALK = new Set([".", "+"]);

function terrainAt(x, y) {
  const row = MAP.terrain[y];
  return row && x >= 0 && x < row.length ? row[x] : "#";
}
function featAt(x, y) {
  return FEAT_BY_POS[`${x},${y}`] || null;
}
function isWalkable(x, y) {
  if (!WALK.has(terrainAt(x, y))) return false;
  const f = featAt(x, y);
  return !f || !!f.door; // solid features block; doors are walkable
}

// The tile the player is currently "facing" (for Enter-to-interact).
function facedFeature() {
  return featAt(pos.x + facing.dx, pos.y + facing.dy);
}

function renderMap() {
  const faced = facedFeature();
  const out = [];
  for (let y = 0; y < MAP.terrain.length; y++) {
    const row = MAP.terrain[y];
    for (let x = 0; x < row.length; x++) {
      let ch = row[x];
      let cls = ch === "#" ? "wall" : ch === "+" ? "door" : "floor";
      const f = featAt(x, y);
      if (f) {
        ch = f.glyph;
        cls = f.door ? "door" : known[f.key] ? "known" : "feat";
        if (faced && f.key === faced.key) cls = "focus";
      }
      if (x === pos.x && y === pos.y) {
        ch = "@";
        cls = "player";
      }
      out.push(`<span class="${cls}">${esc(ch)}</span>`);
    }
    out.push("\n");
  }
  $("map").innerHTML = out.join("");
}

function renderLegend() {
  $("legend").innerHTML = [
    "<b>@</b> you",
    "<b>S/s</b> shelf",
    "<b>T</b> table",
    "<b>=</b> console",
    "<b>N</b> figure",
    "<b>c</b> creature",
    "<b>?</b> hatch",
    "<b>+</b> door",
  ].join("");
}

// ── state + pool ──────────────────────────────────────────────────────────────

async function refreshState() {
  const s = await api(`/api/state?player_id=${PLAYER}`);
  $("t-rev").textContent = s.revelation_tier;
  $("t-nar").textContent = s.narrative_tier;
  $("t-pow").textContent = s.power_tier;
  $("t-xp").textContent = s.xp;
  $("t-known").textContent = Object.keys(known).length;
}

async function refreshPool() {
  const pool = await api(`/api/pool?player_id=${PLAYER}`);
  const parts = Object.entries(pool).map(
    ([t, n]) => `<span class="${n < 5 ? "low" : "k"}">${esc(t)}:${n}</span>`
  );
  $("pool").innerHTML = "unseen pool at your tier — " + (parts.join("  ") || "—");
}

async function refreshPlacements() {
  const places = await api(`/api/placements?player_id=${PLAYER}`);
  known = {};
  for (const p of places) known[p.feature_key] = p;
  renderMap();
}

// ── interaction (crystallization) ─────────────────────────────────────────────

function describe(r) {
  const it = r.item || {};
  const label = esc(r.label || r.feature_key);
  if (r.status === "withheld") {
    logEl(`${label} holds something back. You're not yet ready to know what it is.`, "withheld");
    return;
  }
  const kind = `<span class="kind">[${esc(it.type)} · r${it.revelation_tier}]</span>`;
  const name = `<span class="name">${esc(it.name || "—")}</span>`;
  if (r.status === "recalled") {
    const tail = r.retired
      ? `<span class="withheld">(no longer here — only your memory of it remains)</span>`
      : `<span class="kind">(the same as before · ×${r.interaction_count})</span>`;
    logEl(
      `<span class="item">${label}: ${name} ${kind} — ${esc(it.description)} ${tail}</span>`,
      r.retired ? "withheld" : "familiar"
    );
    return;
  }
  // crystallized — the moment a pool item becomes THIS player's permanent thing.
  logEl(
    `<span class="item">${label} resolves into ${name} ${kind} — ${esc(it.description)}</span>`,
    "item"
  );
  if (r.leveled) {
    logEl(`▲ you feel sturdier — power tier ${r.leveled.to}. (+${r.xp_gain} xp)`, "levelup");
  }
}

async function interactFeature(feature) {
  if (!feature || busy) return;
  busy = true;
  try {
    const r = await post("/api/interact", {
      player_id: PLAYER,
      feature_key: feature.key,
      context: feature.label,
    });
    describe(r);
    await refreshPlacements();
    await refreshState();
    await refreshPool();
    // Touching an NPC opens a conversation (the look already crystallized them).
    if (r.item && r.item.type === "npc" && r.status !== "withheld") {
      await openDialogue(r.item.content_item_id, r.item.name);
    }
  } catch (e) {
    logEl(esc(e.message), "sys");
  } finally {
    busy = false;
  }
}

// ── gear: inventory + equipment + derived stats ───────────────────────────────

async function refreshGear() {
  let g;
  try { g = await api(`/api/inventory?player_id=${PLAYER}`); } catch { return; }
  const s = g.stats || {};
  $("gear-stats").innerHTML =
    `<span class="hp">HP ${s.hp_current ?? "—"}/${s.hp_max ?? "—"}</span> · ` +
    `<span class="atk">atk ${s.atk ?? "—"}</span> · <span class="def">def ${s.def ?? "—"}</span>`;

  const slots = Object.entries(g.equipment || {});
  $("gear-equip").innerHTML = slots.length
    ? slots.map(([slot, v]) => `<span class="slot">${esc(slot)}: <b>${esc(v.name)}</b></span>`).join("")
    : `<span class="slot dim">nothing equipped</span>`;

  const inv = $("gear-inv");
  if (!(g.items || []).length) {
    inv.innerHTML = `<li class="empty">your hands are empty — press <b>t</b> at a shelf to take.</li>`;
    return;
  }
  inv.innerHTML = "";
  for (const it of g.items) {
    const li = document.createElement("li");
    const mech = it.mechanics || null;
    const st = mech && mech.stats ? mech.stats : null;
    const statStr = st
      ? Object.entries(st).map(([k, v]) => `${k}+${v}`).join(" ")
      : "";
    li.innerHTML =
      `<span class="inv-name${it.equipped_slot ? " equipped" : ""}">${esc(it.name)}</span>` +
      (statStr ? `<span class="inv-stats">${esc(statStr)}</span>` : "");
    if (mech && mech.slot) {
      const btn = document.createElement("button");
      if (it.equipped_slot) {
        btn.textContent = "unequip";
        btn.addEventListener("click", () => unequipSlot(it.equipped_slot));
      } else {
        btn.textContent = `equip (${esc(mech.slot)})`;
        btn.addEventListener("click", () => equipItem(it.id));
      }
      li.appendChild(btn);
    }
    const drop = document.createElement("button");
    drop.className = "ghost";
    drop.textContent = "drop";
    drop.addEventListener("click", () => dropItem(it.id, it.name));
    li.appendChild(drop);
    inv.appendChild(li);
  }
}

async function equipItem(invId) {
  const r = await post("/api/equip", { player_id: PLAYER, inventory_id: invId });
  if (r.error) logEl(esc(r.error), "withheld");
  else logEl(`you ready the ${esc(r.name)} (${esc(r.slot)}).`, "item");
  await refreshGear();
}

async function unequipSlot(slot) {
  await post("/api/unequip", { player_id: PLAYER, slot });
  logEl(`you stow what filled your ${esc(slot)}.`, "familiar");
  await refreshGear();
}

async function dropItem(invId, name) {
  await post("/api/item/drop", { player_id: PLAYER, inventory_id: invId });
  logEl(`you set down the ${esc(name)}.`, "familiar");
  await refreshGear();
}

async function takeFeature(feature) {
  if (!feature || busy) return;
  busy = true;
  try {
    const r = await post(`/api/item/${encodeURIComponent(feature.key)}/take`, { player_id: PLAYER });
    const label = esc(feature.label || feature.key);
    if (r.status === "taken") logEl(`you take the ${esc(r.name)} from ${label}.`, "item");
    else if (r.status === "already_taken") logEl(`you've already taken what ${label} held.`, "familiar");
    else if (r.status === "not_takeable") logEl(`${esc(r.name || label)} isn't something you can carry.`, "withheld");
    else logEl(`${label} yields nothing to take.`, "withheld");
    await refreshGear();
    await refreshPlacements();
    await refreshState();
    await refreshPool();
  } catch (e) {
    logEl(esc(e.message), "sys");
  } finally {
    busy = false;
  }
}

// ── facts: flags + reputation the gate reads ───────────────────────────────────

async function refreshFacts() {
  let facts;
  try { facts = await api(`/api/facts?player_id=${PLAYER}`); } catch { return; }
  const entries = Object.entries(facts || {});
  const body = $("facts-body");
  if (!entries.length) {
    body.innerHTML = `<span class="empty">nothing yet — what you do here writes itself in.</span>`;
    return;
  }
  body.innerHTML = entries
    .map(([k, v]) => {
      const isRep = k.startsWith("rep.");
      const cls = isRep ? "rep" : "flag";
      const label = isRep ? `${esc(k.slice(4))} ${esc(v)}` : `${esc(k)}${v === true ? "" : " = " + esc(v)}`;
      return `<span class="fact ${cls}">${label}</span>`;
    })
    .join("");
}

// ── dialogue (talking to NPCs) ─────────────────────────────────────────────────

let DLG = null; // {npcId, name} while a conversation is open

async function openDialogue(npcId, name) {
  DLG = { npcId, name };
  try {
    renderDialogue(await api(`/api/npc/${npcId}/talk?player_id=${PLAYER}`));
  } catch (e) {
    logEl(esc(e.message), "sys");
    closeDialogue();
  }
}

function renderDialogue(d) {
  if (d.error) { logEl(esc(d.error), "withheld"); return closeDialogue(); }
  $("dlg-name").textContent = d.npc || DLG.name || "someone";
  $("dlg-standing").textContent =
    d.standing != null ? `standing ${d.standing >= 0 ? "+" : ""}${d.standing}` : "";
  $("dlg-says").textContent = d.says || "…";
  const choices = $("dlg-choices");
  choices.innerHTML = "";
  if (!(d.choices || []).length) {
    choices.innerHTML = `<span class="none">${d.no_tree ? "they have nothing to say." : "nothing more to say — leave."}</span>`;
  } else {
    for (const c of d.choices) {
      const btn = document.createElement("button");
      btn.textContent = c.text;
      btn.addEventListener("click", () => chooseDialogue(c.id));
      choices.appendChild(btn);
    }
  }
  $("dialogue").hidden = false;
}

async function chooseDialogue(choiceId) {
  if (!DLG) return;
  let r;
  try {
    r = await post(`/api/npc/${DLG.npcId}/choose`, { player_id: PLAYER, choice_id: choiceId });
  } catch (e) {
    return logEl(esc(e.message), "sys");
  }
  if (r.chose) logEl(`“${esc(r.chose)}”`, "rest");
  for (const item of r.gave_items || []) logEl(`they hand you something.`, "item");
  // A choice can write facts/standing/items — refresh the surfaces that read them.
  await refreshFacts();
  await refreshGear();
  if (r.ended) {
    if (r.says) $("dlg-says").textContent = r.says;
    closeDialogue();
    logEl(`the conversation ends.`, "familiar");
  } else {
    renderDialogue(r);
  }
}

function closeDialogue() {
  DLG = null;
  $("dialogue").hidden = true;
  $("map").focus();
}

// ── movement ──────────────────────────────────────────────────────────────────

const DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};

function move(dx, dy) {
  facing = { dx, dy };
  const nx = pos.x + dx, ny = pos.y + dy;
  const f = featAt(nx, ny);
  if (f && !f.door) {
    interactFeature(f); // bump into a solid thing == interact, don't step on it
    renderMap();
    return;
  }
  if (isWalkable(nx, ny)) {
    pos = { x: nx, y: ny };
    // Doors crystallize on first pass-through.
    if (f && f.door && !known[f.key]) interactFeature(f);
  }
  renderMap();
}

function onKey(e) {
  if (e.target.tagName === "INPUT") return; // don't hijack the rest box
  if (e.key === "Escape" && DLG) {
    e.preventDefault();
    closeDialogue();
  } else if (e.key in DIRS) {
    e.preventDefault();
    move(DIRS[e.key][0], DIRS[e.key][1]);
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    interactFeature(facedFeature());
  } else if (e.key === "t" || e.key === "T") {
    e.preventDefault();
    takeFeature(facedFeature());
  } else if (e.key === "r" || e.key === "R") {
    e.preventDefault();
    longRest();
  }
}

// ── rest / async paths ────────────────────────────────────────────────────────

async function attempt() {
  const text = $("rest").value.trim();
  if (!text) return;
  const res = await post("/api/input", { player_id: PLAYER, text, context: "" });
  $("rest").value = "";
  logEl(`⏃ you turn it over: "${esc(text)}" — the world will answer (${res.job_id.slice(0, 8)}).`, "rest");
}

async function longRest() {
  const res = await post("/api/longrest", { player_id: PLAYER });
  logEl(`⏾ you take a long rest. your sense of things is being weighed… (${res.job_id.slice(0, 8)})`, "rest");
}

async function spreadRumor() {
  const text = $("rumor").value.trim();
  if (!text) return;
  const res = await post("/api/rumor", { player_id: PLAYER, content: text });
  $("rumor").value = "";
  logEl(`☍ you pass it along: "${esc(text)}" — it joins the station's drift (${res.job_id.slice(0, 8)}).`, "rumor");
}

async function pollNotifications() {
  let notes;
  try {
    notes = await api(`/api/notifications?player_id=${PLAYER}&since=${encodeURIComponent(lastChecked)}`);
  } catch {
    return;
  }
  let changed = false;
  let worldShifted = false;
  for (const n of notes) {
    const p = n.payload || {};
    if (n.type === "evaluate_progress_resolved") {
      logEl(`✷ ${esc(p.narration || "you rest.")}`, "note");
      for (const a of p.advanced || [])
        logEl(`▲ ${esc(a.axis)} tier deepened to ${a.to}.`, "tier");
      changed = changed || (p.advanced || []).length > 0;
    } else if (n.type === "entity_changed") {
      // The world changed while you were away — something you'd crystallized shifted.
      logEl(
        `✦ <span class="reveal-name">${esc(p.entity || "Something you know")}</span> ` +
          `has changed since you last met — ${esc(p.summary || "")}`,
        "reveal"
      );
      const body = p.kind === "retire" ? "It is gone." : (p.added || p.after || "");
      if (body) logEl(`↳ ${esc(body)}`, "reveal-body");
      worldShifted = true;
    } else {
      const r = p.resolution || p;
      logEl(`✷ ${esc(r.response || JSON.stringify(r))}`, "note");
    }
  }
  if (notes.length) {
    lastChecked = new Date().toISOString();
    // A revelation/narrative bump can unlock previously-withheld features + pool.
    if (changed) { await refreshState(); await refreshPool(); }
    // A shifted entity means our known-cache description is stale — refresh it.
    if (worldShifted) await refreshPlacements();
  }
}

// ── boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  $("log").innerHTML = "";
  if (!MAP) {
    MAP = await api("/api/map");
    FEAT_BY_POS = {};
    for (const f of MAP.features) FEAT_BY_POS[`${f.x},${f.y}`] = f;
  }
  pos = { x: MAP.spawn.x, y: MAP.spawn.y };
  facing = { dx: 0, dy: 1 };
  known = {};
  closeDialogue();            // a player-switch must not leak the prior conversation
  renderLegend();
  renderPlayers();
  await refreshPlacements();  // also renders the map
  await refreshState();
  await refreshPool();
  await refreshGear();
  await refreshFacts();
  if (restoreLog()) {
    renderLine(`── resumed as ${esc(PLAYER)} ──`, "sys");  // visual marker, not persisted
  } else {
    logEl(`ASHVEIL STATION terminal online — playing as ${esc(PLAYER)}.`, "sys");
    logEl("you woke in the med bay. your clothes are Keeper grey. walk, and touch what you find.", "sys");
  }
  $("map").focus();
}

document.addEventListener("keydown", onKey);
$("map").addEventListener("click", () => $("map").focus());
$("submit-rest").addEventListener("click", () => attempt().catch((e) => logEl(esc(e.message), "sys")));
$("rest").addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
$("longrest").addEventListener("click", () => longRest().catch((e) => logEl(esc(e.message), "sys")));
$("spread").addEventListener("click", () => spreadRumor().catch((e) => logEl(esc(e.message), "sys")));
$("rumor").addEventListener("keydown", (e) => { if (e.key === "Enter") spreadRumor(); });
$("switch").addEventListener("click", () => switchPlayer($("player-input").value));
$("player-input").addEventListener("keydown", (e) => { if (e.key === "Enter") switchPlayer($("player-input").value); });
$("newgame").addEventListener("click", () => switchPlayer(newPlayerId()));
$("dlg-close").addEventListener("click", closeDialogue);

setInterval(pollNotifications, 3000);
boot().catch((e) => logEl(esc(e.message), "sys"));
