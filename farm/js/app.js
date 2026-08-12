// app.js — THE ORCHESTRATOR. Wires the pure kernels (state/mine/achievements/social) to the DOM and
// the sync layer (store). All game RULES live in the kernels; this file is tabs, toasts and clicks.
//
// Modes: FARMER (default — your farm; local tier signed out, PDS-synced signed in) and VISITOR
// (?u=<handle|did> — anyone's farm, read-only, entirely keyless public reads; signed-in visitors get
// tend buttons and the gift box).

import {
  newFarm, plantSeed, growthOf, harvestPlant, sellProduce, pullSeeds, claimGift, giveSeed,
  applyBrew, usePreparation, cropById, sellPrice, DAY_MS, PREP_METAL, PULL_COST, fromPlotRecord,
  touchStreak, recordShare, SHARE_COINS,
  plantableTile, tileAt, buildingAt, terraform, moveBuilding, TERRA_COST, BUILDING_KINDS,
  packList, unlockPack, setActiveBiome, FIELD_T, inWorld,
  waterPlant, isWatered, isInfested, irrigated, fertilizePlant, treatPest, buySupply,
  TECHS, techChecks, research, hasTech, placeSprinkler, SUPPLY_COST, SPRINKLER_COST,
  sellPriceOrganic, ORGANIC_PREMIUM, WATER_MS,
  parcelOf, ownsParcel, buyableParcels, buyParcel, parcelTerrain,
} from './state.js';
import * as Mine from './mine.js';
import { ACHIEVEMENTS, byId as achById, evaluate as evalAch, markEarned, shareText } from './achievements.js';
import * as Social from './social.js';
import { FarmStore } from './store.js';
import { corrForCrop } from './render.js';
import { createIso } from './iso.js';
import { prepare, reagentEffect, PREPARATIONS } from '../vendor/alchemy.js';
import { biomeById, progress, TIER_FOIL } from '../vendor/gacha.js';
import { PLANETS as PKEYS } from '../vendor/planets.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();

const METAL_GLYPH = { gold: '☉', silver: '☽', quicksilver: '☿', copper: '♀', iron: '♂', tin: '♃', lead: '♄' };
const fmtMs = (ms) => {
  if (ms <= 0) return 'ripe';
  const m = Math.ceil(ms / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h < 24 ? h + 'h ' + (m % 60) + 'm' : Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
};

// ── boot ──────────────────────────────────────────────────────────────────────────────────────────
const store = new FarmStore();
let ark = null;
let farm = null;            // my farm (mutable head; every mutation goes through commit())
let tends = {};             // plantId → distinct-friend tend count (from the public scan)
let friendData = null;      // scanFriends result
let profiles = new Map();
let plantingCrop = null;    // seed selected for planting
let benchPick = [];         // cropIds queued at the bench
let isoMain = null;         // the field view (created in boot)
let craftTool = null;       // craft mode: 'till'|'pond'|'path'|'clear'|'meadow'|'move' (null = play)
let movingBuilding = null;  // building id currently in hand (craft 'move')

const CRAFT_TOOLS = [
  { key: 'till',    emoji: '🪏', label: 'till',    hint: 'meadow (or an old road) → tilled soil' },
  { key: 'pond',    emoji: '💧', label: 'pond',    hint: 'dig water — plants beside it grow 10% faster' },
  { key: 'path',    emoji: '🧱', label: 'path',    hint: 'lay a walkway' },
  { key: 'clear',   emoji: '🪨', label: 'clear',   hint: 'roll a boulder away' },
  { key: 'flatten', emoji: '⛰️', label: 'flatten', hint: 'level a hill — the terrain the cheap parcels came with' },
  { key: 'meadow',  emoji: '🌿', label: 'meadow',  hint: 'give a tile back to the grass' },
  { key: 'sprinkler', emoji: '🌀', label: 'sprinkler', hint: 'place a sprinkler (40◈ + 1 tin) — tap one to pull it up', tech: 'sprinklers' },
  { key: 'move',    emoji: '✋', label: 'move',    hint: 'tap a building, then tap where it goes' },
];
let pendingBuy = null;   // { key, at } — a FOR-SALE parcel tapped once, awaiting its confirming tap

async function boot() {
  ark = await (await fetch('./vendor/ark.json')).json();
  const u = new URLSearchParams(location.search).get('u');
  await store.init();
  store.addEventListener('auth', () => { renderHeader(); });
  store.addEventListener('syncerror', () => toast('⚠ sync hiccup — will retry', 'warn'));

  if (u) { await bootVisitor(u); return; }

  // FARMER: prefer the PDS copy, else local, else a fresh field. Signing in promotes the local farm
  // if the PDS has none (a wanderer's work is not thrown away).
  const local = store.loadLocal();
  const remote = await store.loadRemote();
  const did = store.user ? store.user.did : 'wanderer';
  if (remote && (!local || (remote.updatedAt || 0) >= (local.updatedAt || 0))) farm = remote;
  else if (local) farm = local;
  else farm = newFarm(did, ark, now());
  if (store.user && !remote && local) store.save(farm, now(), { immediate: true });   // promotion

  isoMain = createIso($('#bed'), { onTap: onFieldTap });

  // the daily streak: first visit of the day settles dew, consecutive days compound (capped)
  const st = touchStreak(farm, now());
  if (st.ok) {
    commit(st.farm);
    if (st.plants > 0) toast('☀️ day ' + st.streak + ' streak — ' + st.dewMin + ' min of dew on every plant', st.streak > 1 ? 'ach' : 'ok', 8000);
    else if (st.streak > 1) toast('☀️ day ' + st.streak + ' streak', 'ok');
  }

  renderHeader(); renderAll();
  setInterval(() => { if ($('#tab-farm').classList.contains('on')) redrawBed(); }, 20_000);
  if (store.user) refreshFriends();   // background: tends boost + gifts at the gate
}

const TERRAIN_BLURB = {
  hills: 'hilly — ridges to flatten (60◈ a tile) before the plough goes in',
  lake: 'lakeland — half of it water, but every shore tile waters its neighbours',
  road: 'an old road runs through it — till it over, or keep the lane',
  boulders: 'a boulder field — clearing stones is 40◈ apiece',
  fertile: 'fertile flats — barely a stone on it. A find.',
};

function onFieldTap({ bx, by, tx, ty, plantIdx, building }) {
  // land on the market: first tap quotes the deed (terrain included), second tap signs it
  const [ppx, ppy] = parcelOf(tx, ty);
  if (inWorld(tx, ty) && !ownsParcel(farm, ppx, ppy)) {
    const offer = buyableParcels(farm).find((b) => b.px === ppx && b.py === ppy);
    if (!offer) { toast('that land is not adjacent to yours — the estate grows outward', 'warn'); return; }
    const key = ppx + ',' + ppy;
    if (pendingBuy && pendingBuy.key === key && now() - pendingBuy.at < 6000) {
      pendingBuy = null;
      const r = buyParcel(farm, ppx, ppy, now());
      if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
      commit(r.farm);
      toast('📜 deed signed — <b>' + esc(r.terrain) + '</b> land, ' + r.price + '◈. Craft mode shapes it.', 'ach', 9000);
      redrawBed();
    } else {
      pendingBuy = { key, at: now() };
      const terr = parcelTerrain(farm.seed, ppx, ppy);
      toast('🪧 ' + offer.price + '◈ — ' + esc(TERRAIN_BLURB[terr.archetype] || terr.archetype) +
        (farm.coins >= offer.price ? ' <b>tap again to buy</b>' : ' <i>(you have ' + farm.coins + '◈)</i>'), 'ok', 6000);
    }
    return;
  }
  pendingBuy = null;
  // craft mode: the tap is a tool stroke
  if (craftTool === 'move') {
    if (!movingBuilding) {
      if (!building) { toast('tap a building to pick it up', 'warn'); return; }
      movingBuilding = building.id;
      toast('✋ ' + BUILDING_KINDS[building.kind].name + ' in hand — tap where it goes', 'ok');
      redrawBed(); return;
    }
    const r = moveBuilding(farm, movingBuilding, tx, ty, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    movingBuilding = null;
    commit(r.farm); redrawBed();
    return;
  }
  if (craftTool === 'sprinkler') {
    const r = placeSprinkler(farm, tx, ty, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast(r.removed ? '🌀 sprinkler pulled up (+' + Math.floor(SPRINKLER_COST.coins / 2) + '◈)' : '🌀 sprinkler set — its ring stays watered', 'ok');
    redrawBed();
    return;
  }
  if (craftTool) {
    const r = terraform(farm, tx, ty, craftTool, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm); redrawBed();
    return;
  }
  // play mode: buildings are the rooms — tap one to step inside
  if (building) { openPanel(BUILDING_KINDS[building.kind].panel); return; }
  if (plantIdx >= 0) {
    // ripe → harvest; thirsty → WATER (the task); otherwise say how it's doing
    const p = farm.bed.plants[plantIdx];
    const c = cropById(ark, p.seedId);
    const g = growthOf(farm, p, c, now(), tends[p.id] || 0);
    if (g.ready) { tryHarvest(p.id); return; }
    const r = waterPlant(farm, p.id, now());
    if (r.ok) { commit(r.farm); toast('💧 watered — holds 6h', 'ok'); redrawBed(); return; }
    toast(esc(c ? c.common : p.seedId) + ': ' + Math.round(g.stage * 100) + '% · ' + fmtMs(g.msLeft) +
      (irrigated(farm, p) ? ' · 🌊 irrigated' : ' · 💧 damp'), 'ok');
    return;
  }
  if (!plantingCrop) return;
  const r = plantSeed(farm, bx, by, plantingCrop, ark, now());
  if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
  commit(r.farm);
  if (r.spd > 1) toast('⚡ fresh-broken ground — this one grows 4×', 'ok');
  if (!farm.seeds[plantingCrop]) plantingCrop = null;
  redrawBed();
}

// what the hover preview asks: does the current tool land on (tx,ty)?
function toolCheckAt(tx, ty) {
  if (craftTool === 'move') return movingBuilding ? moveBuilding(farm, movingBuilding, tx, ty, 0).ok : !!buildingAt(farm, tx, ty);
  if (craftTool === 'sprinkler') return placeSprinkler(farm, tx, ty, 0).ok;
  if (craftTool) return terraform(farm, tx, ty, craftTool, 0).ok;
  if (plantingCrop) return plantableTile(farm, (tx + 0.5) / FIELD_T, (ty + 0.5) / FIELD_T);
  return false;
}

function commit(next, { immediate = false } = {}) {
  farm = next;
  store.save(farm, now(), { immediate });
  checkAchievements();
  renderHeader();
}

// ── achievements ──────────────────────────────────────────────────────────────────────────────────
function checkAchievements() {
  const fresh = evalAch(farm, ark);
  if (!fresh.length) return;
  farm = markEarned(farm, fresh.map((a) => a.id), now());
  store.save(farm, now());
  for (const a of fresh) {
    if (store.user) store.writeAchievement(a, now()).catch(() => {});
    toast(a.emoji + ' <b>' + esc(a.name) + '</b> — ' + esc(a.desc) +
      ' <button class="share" data-ach="' + a.id + '">post to bsky</button>', 'ach', 12000);
  }
  renderDeeds();
}

async function shareAch(id) {
  const a = achById(id);
  if (!a) return;
  if (!store.user) { toast('sign in to post', 'warn'); return; }
  try {
    const res = await store.sharePost(shareText(a, store.user.handle));
    if (res) {
      toast('posted → <a href="' + esc(res.url) + '" target="_blank" rel="noopener">view on bsky</a>', 'ok', 9000);
      const pay = recordShare(farm, id, now());   // play-and-post-to-progress: first share of a deed pays
      if (pay.ok) { commit(pay.farm); toast('◈ +' + SHARE_COINS + ' — the town heard about it', 'ach'); }
    }
  } catch (e) { toast('⚠ ' + esc(e.message), 'warn'); }
}

// ── header / auth ─────────────────────────────────────────────────────────────────────────────────
function renderHeader() {
  $('#coins').textContent = farm ? farm.coins : '—';
  $('#biome').textContent = farm && ark ? ((biomeById(ark, farm.biomeId) || {}).name || '') : '';
  const auth = $('#auth');
  if (store.user) {
    auth.innerHTML = '<span class="me">@' + esc(store.user.handle) + '</span> <button id="logout">out</button>';
    $('#logout').onclick = () => store.logout().then(() => location.reload());
  } else {
    auth.innerHTML = '<input id="handle" placeholder="you.bsky.social" size="16" data-bsky-typeahead /><button id="login">sign in</button>';
    $('#login').onclick = () => { const h = $('#handle').value.trim(); if (h) store.login(h).catch((e) => toast('⚠ ' + esc(e.message), 'warn')); };
    $('#handle').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('.bsky-ta-drop.open')) $('#login').click(); });
    if (window.bskyTypeahead) window.bskyTypeahead.attach($('#handle'));
  }
}

// ── panels: the stations' rooms, opened by tapping their building on the map ────────────────────
function openPanel(name) {
  $$('.pane').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + name));
  if (name === 'desk') renderDesk();
  if (name === 'mine') { commit(Mine.enterMine(farm, now()).farm); renderMine(); }
  if (name === 'bench') renderBench();
  if (name === 'friends') renderFriends();
  if (name === 'deeds') renderDeeds();
  if (name === 'mill') renderMill();
}
function closePanel() { $$('.pane').forEach((p) => p.classList.remove('on')); redrawBed(); }

// ── craft toolbar ─────────────────────────────────────────────────────────────────────────────────
function renderCraftBar() {
  const bar = $('#craftbar');
  const on = craftTool != null;
  bar.innerHTML = '<button id="craft" class="' + (on ? 'on' : '') + '">🔨 craft</button>' +
    (on ? CRAFT_TOOLS.map((t) => {
      const locked = t.tech && !hasTech(farm, t.tech);
      const cost = TERRA_COST[t.key] ? TERRA_COST[t.key] + '◈' : t.key === 'sprinkler' ? SPRINKLER_COST.coins + '◈+' + SPRINKLER_COST.tin + '♃' : '';
      return '<button class="tool ' + (craftTool === t.key ? 'on' : '') + (locked ? ' locked' : '') + '" data-tool="' + t.key + '" ' + (locked ? 'disabled title="research at the waterworks"' : 'title="' + esc(t.hint) + '"') + '>' +
        (locked ? '🔒 ' : t.emoji + ' ') + t.label + (cost ? ' <i>' + cost + '</i>' : '') + '</button>';
    }).join('') : '');
  $('#craft').onclick = () => {
    craftTool = on ? null : 'till';
    movingBuilding = null; plantingCrop = null;
    $('#bedhint').textContent = craftTool
      ? 'craft mode — pick a tool, tap tiles. Till the meadow to grow the farm; dig ponds beside rows for faster growth.'
      : 'tap a building to open it · drag to look around · pick a seed then tap the soil';
    renderCraftBar(); renderSeedBag(); redrawBed();
  };
  $$('#craftbar .tool').forEach((b) => b.onclick = () => {
    craftTool = b.dataset.tool; movingBuilding = null;
    const t = CRAFT_TOOLS.find((x) => x.key === craftTool);
    $('#bedhint').textContent = t.emoji + ' ' + t.hint;
    renderCraftBar(); redrawBed();
  });
}

function renderAll() { renderCraftBar(); redrawBed(); renderSeedBag(); renderPantry(); renderDeeds(); }

// ── the field ─────────────────────────────────────────────────────────────────────────────────────
function redrawBed() {
  if (isoMain) isoMain.update({
    farm, ark, now: now(), tends, plantingCrop,
    tool: craftTool || (plantingCrop ? 'plant' : null),
    toolCheck: toolCheckAt,
    movingBuilding,
    sprinklerReach: hasTech(farm, 'windpump') ? 2 : 1,
  });
  renderSeedBag(); renderPantry(); renderPlantInfo();
}

function renderSeedBag() {
  const el = $('#seedbag');
  const entries = Object.entries(farm.seeds);
  el.innerHTML = entries.length
    ? entries.map(([id, n]) => {
      const c = cropById(ark, id);
      return '<button class="chip seed ' + (plantingCrop === id ? 'on' : '') + '" data-seed="' + esc(id) + '" title="' + esc(c ? c.sciName : '') + '">' +
        '🌱 ' + esc(c ? c.common : id) + ' ×' + n + ' <i>' + (c ? c.growthDays * 30 + 'm' : '') + '</i></button>';
    }).join('')
    : '<span class="dim">seed bag empty — pull at the trade desk, or ask a friend</span>';
  $$('#seedbag .seed').forEach((b) => b.onclick = () => {
    plantingCrop = plantingCrop === b.dataset.seed ? null : b.dataset.seed;
    if (plantingCrop) { craftTool = null; movingBuilding = null; renderCraftBar(); }   // a seed in hand leaves craft mode
    renderSeedBag();
    $('#bedhint').textContent = plantingCrop
      ? 'tap a tilled tile to plant ' + (cropById(ark, plantingCrop) || {}).common + ' — green means it fits'
      : 'tap a building to open it · drag to look around · pick a seed then tap the soil · tap a ripe plant ✓ to harvest';
    if (isoMain) redrawBed();
  });
}

function renderPantry() {
  const el = $('#pantry');
  const org = Object.entries(farm.pantry);
  const conv = Object.entries(farm.pantryC || {});
  el.innerHTML = (org.length || conv.length)
    ? org.map(([id, n]) => {
      const c = cropById(ark, id) || { common: id, seedCost: 10 };
      return '<span class="chip organic">🌿 ' + esc(c.common) + ' ×' + n +
        ' <button class="mini" data-sell="' + esc(id) + '" data-grade="organic">sell @' + sellPriceOrganic(c) + '◈</button></span>';
    }).join('') + conv.map(([id, n]) => {
      const c = cropById(ark, id) || { common: id, seedCost: 10 };
      return '<span class="chip conv">🧪 ' + esc(c.common) + ' ×' + n +
        ' <button class="mini" data-sell="' + esc(id) + '" data-grade="conv">sell @' + sellPrice(c) + '◈</button></span>';
    }).join('')
    : '<span class="dim">pantry empty</span>';
  $$('#pantry [data-sell]').forEach((b) => b.onclick = () => {
    const grade = b.dataset.grade;
    const pool = grade === 'conv' ? farm.pantryC : farm.pantry;
    const r = sellProduce(farm, b.dataset.sell, pool[b.dataset.sell], ark, now(), grade);
    if (r.ok) { commit(r.farm); toast('+' + r.coins + '◈' + (r.organic ? ' 🌿 organic premium' : '') + (r.warded ? ' (warded)' : ''), 'ok'); renderPantry(); }
  });
}

function renderPlantInfo() {
  const el = $('#plants');
  if (!farm.bed.plants.length) { el.innerHTML = '<span class="dim">nothing in the ground yet</span>'; return; }
  const dry = [];
  el.innerHTML = farm.bed.plants.map((p) => {
    const c = cropById(ark, p.seedId);
    const g = growthOf(farm, p, c, now(), tends[p.id] || 0);
    const tendN = tends[p.id] || 0;
    const bug = isInfested(farm, p, now());
    const irr = irrigated(farm, p);
    if (!g.ready && !g.watered) dry.push(p.id);
    return '<span class="chip ' + (g.ready ? 'ripe' : '') + (p.syn ? ' conv' : '') + '" data-plant="' + esc(p.id) + '">' +
      esc(c ? c.common : p.seedId) + ' — ' + (g.ready ? '✓ ripe' : Math.round(g.stage * 100) + '% · ' + fmtMs(g.msLeft)) +
      (irr ? ' 🌊' : g.watered ? ' 💧' : ' <b class="warn">🏜 dry</b>') +
      (bug ? ' 🐛' : '') + (p.syn ? ' 🧪' : '') + (tendN ? ' 🤝×' + tendN : '') + (p.spd > 1 ? ' ⚡' : '') +
      (!g.ready && !g.watered && !irr ? ' <button class="mini" data-water="' + esc(p.id) + '">💧 water</button>' : '') +
      (bug ? ' <button class="mini" data-spray="' + esc(p.id) + '">🧴 spray</button><button class="mini" data-remedy="' + esc(p.id) + '">⚗️ remedy</button>' : '') +
      (!g.ready && (p.fertN | 0) < 2 && (farm.supplies.fert | 0) > 0 ? ' <button class="mini" data-fert="' + esc(p.id) + '">🧪 fert</button>' : '') +
      '</span>';
  }).join('') +
  (dry.length > 1 ? ' <button class="mini" id="waterall">💧 water all (' + dry.length + ' thirsty)</button>' : '');
  $$('#plants [data-plant]').forEach((s) => s.onclick = (e) => { if (e.target.closest('button')) return; tryHarvest(s.dataset.plant); });
  $$('#plants [data-water]').forEach((b) => b.onclick = () => {
    const r = waterPlant(farm, b.dataset.water, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm); redrawBed();
  });
  const wa = $('#waterall');
  if (wa) wa.onclick = () => {
    let f = farm, n = 0;
    for (const id of dry) { const r = waterPlant(f, id, now()); if (r.ok) { f = r.farm; n++; } }
    if (n) { commit(f); toast('💧 watered ' + n + ' plants — one can at a time, mind', 'ok'); redrawBed(); }
  };
  $$('#plants [data-fert]').forEach((b) => b.onclick = () => {
    const r = fertilizePlant(farm, b.dataset.fert, ark, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('🧪 fed — +25% growth banked. <b>This plant is conventional now</b>: plain price, no bench.', 'warn', 8000);
    redrawBed();
  });
  $$('#plants [data-spray]').forEach((b) => b.onclick = () => {
    const r = treatPest(farm, b.dataset.spray, 'spray', now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('🧴 sprayed — long immunity, <b>but the plant is conventional now</b>', 'warn', 7000);
    redrawBed();
  });
  $$('#plants [data-remedy]').forEach((b) => b.onclick = () => {
    const r = treatPest(farm, b.dataset.remedy, 'remedy', now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('⚗️ caustic remedy — the beetles flee, the plant stays 🌿 organic', 'ok');
    redrawBed();
  });
}

function tryHarvest(plantId) {
  const r = harvestPlant(farm, plantId, ark, now(), tends);
  if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
  commit(r.farm);
  const c = cropById(ark, r.cropId);
  toast('🧺 ' + r.yield + '× ' + esc(c.common) + (r.organic ? ' 🌿' : ' 🧪') + ' + ' + r.seeds + ' seed' +
    (r.bitten ? ' — <b class="warn">the beetles took their share</b>' : ''), r.bitten ? 'warn' : 'ok');
  redrawBed();
}

// ── MILL panel (the waterworks: irrigation overview + the tech tree) ─────────────────────────────
function renderMill() {
  let watered = 0, dryN = 0, irrN = 0;
  for (const p of farm.bed.plants) {
    const c = cropById(ark, p.seedId);
    const g = growthOf(farm, p, c, now(), tends[p.id] || 0);
    if (g.ready) continue;
    if (irrigated(farm, p)) irrN++;
    else if (g.watered) watered++;
    else dryN++;
  }
  $('#millstats').innerHTML =
    '<span class="chip">🌊 irrigated ×' + irrN + '</span> <span class="chip">💧 hand-watered ×' + watered + '</span> ' +
    '<span class="chip ' + (dryN ? 'warn' : '') + '">🏜 dry ×' + dryN + '</span> <span class="chip">🌀 sprinklers ×' + (farm.fixtures || []).length + '</span>' +
    '<div class="dim">a watered plant grows full speed for 6h, a dry one at half. Hand-watering is free — and does not scale. That is what this building is for.</div>';
  $('#techs').innerHTML = TECHS.map((t) => {
    if (hasTech(farm, t.id)) {
      return '<div class="pack" style="--foil:#59c7cf"><b style="color:#59c7cf">' + t.emoji + ' ' + esc(t.name) + '</b> <span class="dim">' + esc(t.desc) + '</span> <span class="dim">✓ built</span></div>';
    }
    const checks = techChecks(farm, t);
    const can = checks.every((c) => c.met);
    return '<div class="pack locked next"><b>' + t.emoji + ' ' + esc(t.name) + '</b> <span class="dim">' + esc(t.desc) + '</span>' +
      '<div class="reqs">' + checks.map((c) => '<span class="' + (c.met ? 'met' : 'unmet') + '">' + (c.met ? '✓ ' : '✗ ') + esc(c.label) + '</span>').join(' · ') + '</div>' +
      (can ? '<button class="mini" data-research="' + t.id + '">research — ' + t.cost.coins + '◈</button>' : '') + '</div>';
  }).join('');
  $$('#techs [data-research]').forEach((b) => b.onclick = () => {
    const r = research(farm, b.dataset.research, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast(r.tech.emoji + ' <b>' + esc(r.tech.name) + '</b> — ' + esc(r.tech.desc), 'ach', 9000);
    renderMill(); renderCraftBar();
  });
}

// ── DESK panel (gacha + the ecosystem-pack ladder) ────────────────────────────────────────────────
function renderDesk() {
  const packs = packList(farm, ark);
  const active = packs.find((p) => p.active) || packs[0];
  const cost = farm.pulls === 0 ? 'free' : PULL_COST + '◈';

  // the pack shelf: every biome in unlock order — unlocked ones switchable, the next one shows its
  // requirement row with live ✓/✗, later ones wait their turn. Never a mystery.
  $('#packs').innerHTML = packs.map((p) => {
    const b = p.biome;
    const prog = progress(b, farm.owned);
    if (p.unlocked) {
      return '<div class="pack ' + (p.active ? 'active' : '') + '" style="--foil:' + esc(b.foil) + '">' +
        '<b style="color:' + esc(b.foil) + '">' + esc(b.name) + '</b>' +
        '<span class="dim">' + prog.have + '/' + prog.total + (prog.complete ? ' 🌍' : '') + '</span>' +
        (p.active ? '<span class="dim">— dealing</span>' : '<button class="mini" data-pool="' + esc(p.id) + '">deal from here</button>') +
        '</div>';
    }
    if (p.isNext) {
      return '<div class="pack locked next" style="--foil:' + esc(b.foil) + '">' +
        '<b>🔒 ' + esc(b.name) + '</b> <span class="dim">' + esc(b.blurb) + '</span>' +
        '<div class="reqs">' + p.checks.map((c) => '<span class="' + (c.met ? 'met' : 'unmet') + '">' + (c.met ? '✓ ' : '✗ ') + esc(c.label) + '</span>').join(' · ') + '</div>' +
        (p.canUnlock ? '<button class="mini" data-unlock="' + esc(p.id) + '">unlock — ' + p.req.coins + '◈</button>' : '') +
        '</div>';
    }
    return '<div class="pack locked far"><b>🔒 ' + esc(b.name) + '</b> <span class="dim">unlocks after the pack above</span></div>';
  }).join('');
  $$('#packs [data-pool]').forEach((el) => el.onclick = () => {
    const r = setActiveBiome(farm, el.dataset.pool, now());
    if (r.ok) { commit(r.farm); renderDesk(); }
  });
  $$('#packs [data-unlock]').forEach((el) => el.onclick = () => {
    const r = unlockPack(farm, el.dataset.unlock, ark, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('🗺️ <b>' + esc(r.biome.name) + '</b> unlocked — the desk now deals its crops', 'ach', 9000);
    renderDesk();
  });

  const biome = active.biome;
  const prog = progress(biome, farm.owned);
  $('#desk').innerHTML =
    '<div class="biomecard" style="border-color:' + esc(biome.foil) + '">' +
    '<h3 style="color:' + esc(biome.foil) + '">' + esc(biome.name) + '</h3>' +
    '<p class="dim">' + esc(biome.blurb) + (active.id === farm.biomeId ? ' · your home biome (drawn from your DID — a friend\'s desk deals a different pool, which is what makes seed gifts worth sending)' : '') + '</p>' +
    '<p>collection: <b>' + prog.have + '/' + prog.total + '</b>' + (prog.complete ? ' 🌍 CLOSED' : '') + '</p>' +
    '<button id="pull" class="big">🎴 pull seeds — ' + cost + '</button>' +
    '<div class="row"><h3>supplies</h3>' +
    '<button class="mini" data-supply="fert">🧪 fertilizer — ' + SUPPLY_COST.fert + '◈ (have ' + (farm.supplies.fert | 0) + ')</button> ' +
    '<button class="mini" data-supply="pest">🧴 pesticide — ' + SUPPLY_COST.pest + '◈ (have ' + (farm.supplies.pest | 0) + ')</button>' +
    '<div class="dim">cheap and instant — and one squirt marks the plant 🧪 conventional for life: plain price at market (organic sells ×' + ORGANIC_PREMIUM + '), and the bench refuses it. The organic road: water by hand, treat pests with a caustic brew.</div></div></div>' +
    '<div class="cropgrid">' + biome.crops.map((c) => {
      const owned = farm.owned.includes(c.id);
      return '<div class="crop ' + (owned ? 'owned' : 'unknown') + '" style="--foil:' + esc(TIER_FOIL[c.rarity] || '#888') + '" title="' + esc(c.sciName) + '">' +
        (c.thumb ? '<img loading="lazy" src="' + esc(c.thumb) + '" alt="" />' : '') +
        '<div class="cname">' + (owned ? esc(c.common) : '???') + '</div>' +
        '<div class="crare">' + esc(c.rarity) + (owned ? ' · ' + c.growthDays * 30 + 'm · yield ' + c.yield : '') + '</div></div>';
    }).join('') + '</div>';
  $('#pull').onclick = () => {
    const r = pullSeeds(farm, ark, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('🎴 ' + (r.isNew ? '<b>NEW</b> ' : '') + esc(r.crop.common) + ' ×' + r.seeds + ' seeds' +
      (r.progress.complete ? ' — 🌍 biome closed!' : ''), r.isNew ? 'ach' : 'ok');
    renderDesk(); renderSeedBag();
  };
  $$('#desk [data-supply]').forEach((b) => b.onclick = () => {
    const r = buySupply(farm, b.dataset.supply, 1, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    renderDesk();
  });
}

// ── MINE tab ──────────────────────────────────────────────────────────────────────────────────────
function renderMine() {
  const m = farm.mine;
  const tiles = Mine.levelFor(farm.seed, m.runDepth);
  $('#minestats').innerHTML =
    'depth <b>' + m.runDepth + '</b> (best ' + m.depth + ') · picks <b>' + m.picks + '</b>' +
    (m.bombs ? ' · <button id="bomb" class="mini">🧨 bomb ×' + m.bombs + ' (+' + Mine.BOMB_PICKS + ' picks)</button>' : '') +
    ' <span class="dim">picks refill every 8h · rock costs 2</span>';
  $('#minegrid').style.gridTemplateColumns = 'repeat(' + Mine.LEVEL_W + ',1fr)';
  $('#minegrid').innerHTML = tiles.map((t, i) => {
    const dug = m.dug[m.runDepth + ':' + i];
    let face = t.cover === 'rock' ? '🪨' : '▒';
    if (dug) face = { empty: '·', coin: '◈' + t.amount, gem: '💎', shard: '✧', ladder: '🪜', ore: (METAL_GLYPH[t.metal] || '⛏') }[t.kind] || '·';
    return '<button class="mtile ' + (dug ? 'dug k-' + t.kind : t.cover) + '" data-i="' + i + '" ' + (dug ? 'disabled' : '') +
      ' title="' + (dug && t.kind === 'ore' ? esc(t.metal) : '') + '">' + face + '</button>';
  }).join('');
  $$('#minegrid .mtile:not([disabled])').forEach((b) => b.onclick = () => {
    const r = Mine.dig(farm, +b.dataset.i, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    const f = r.found;
    if (f.kind === 'ore') toast((METAL_GLYPH[f.metal] || '⛏') + ' ' + f.amount + '× ' + esc(f.metal), 'ok');
    else if (f.kind === 'coin') toast('◈ +' + f.amount, 'ok');
    else if (f.kind === 'gem') toast('💎 a gem — +' + f.amount + '◈', 'ach');
    else if (f.kind === 'shard') toast('✧ a quintessence shard', 'ach');
    else if (f.kind === 'ladder') toast('🪜 down…', 'ok');
    renderMine();
  });
  const bomb = $('#bomb');
  if (bomb) bomb.onclick = () => { const r = Mine.useBomb(farm, now()); if (r.ok) { commit(r.farm); renderMine(); } };
  $('#metals').innerHTML = Mine.METALS.map((mt) =>
    '<span class="chip metal">' + METAL_GLYPH[mt] + ' ' + esc(mt) + ' ×' + (farm.metals[mt] | 0) + '</span>').join('') +
    ' <span class="chip">✧ shards ×' + (farm.shards | 0) + '</span>';
}

// ── BENCH tab (alchemy) ───────────────────────────────────────────────────────────────────────────
function renderBench() {
  // pantry as reagents: live herbs carry their correspondence, staples are food only
  const entries = Object.entries(farm.pantry);
  $('#reagents').innerHTML = entries.length ? entries.map(([id, n]) => {
    const c = cropById(ark, id) || { common: id };
    const corr = corrForCrop(c);
    const eff = corr ? reagentEffect(c.sciName || c.common) : null;
    const picked = benchPick.filter((x) => x === id).length;
    return '<button class="chip reagent ' + (corr ? 'live' : 'dead') + (picked ? ' on' : '') + '" data-r="' + esc(id) + '">' +
      (eff && eff.glyph ? eff.glyph + ' ' : '') + esc(c.common) + ' ×' + (n - picked) +
      (corr ? ' <i>' + esc(corr.planet || '') + (corr.qualities ? ' · ' + esc(corr.qualities) : '') + '</i>' : ' <i>not alchemical</i>') +
      (picked ? ' [' + picked + ' in]' : '') + '</button>';
  }).join('') : '<span class="dim">harvest something first — the bench brews what the bed grows</span>';
  $$('#reagents .reagent').forEach((b) => b.onclick = () => {
    const id = b.dataset.r;
    const inPick = benchPick.filter((x) => x === id).length;
    const have = farm.pantry[id] | 0;
    if (inPick < have && benchPick.length < 4) benchPick.push(id);
    else benchPick = benchPick.filter((x) => x !== id);
    renderBench();
  });

  const names = benchPick.map((id) => (cropById(ark, id) || {}).sciName || (cropById(ark, id) || {}).common || id);
  const vesselEl = $('#vessel');
  const prepKey = vesselEl.value || 'draught';
  const preview = benchPick.length ? prepare(names, prepKey) : null;
  vesselEl.innerHTML = Object.entries(PREPARATIONS).map(([k, p]) => {
    const metal = PREP_METAL[k];
    return '<option value="' + k + '" ' + (k === prepKey ? 'selected' : '') + '>' + p.vessel +
      (metal ? ' (1 ' + metal + ' ' + METAL_GLYPH[metal] + ')' : '') + '</option>';
  }).join('');
  $('#brewpreview').innerHTML = !benchPick.length ? '<span class="dim">queue 1–4 reagents…</span>'
    : preview.ok
      ? 'coherence <b>' + preview.coherence + '</b> → grade <b class="g' + preview.grade + '">' + preview.grade + '</b> · ' + esc(preview.label) +
        ' <span class="dim">' + esc(preview.glyphs) + ' potency ' + preview.potency + '</span>' +
        ((farm.shards | 0) ? ' <label><input type="checkbox" id="useshard" /> ✧ steady (+0.15)</label>' : '')
      : '<span class="warn">' + esc(preview.reason) + '</span>';
  $('#brew').onclick = () => {
    if (!benchPick.length) return;
    const useShard = !!($('#useshard') && $('#useshard').checked);
    const prepped = prepare(names, $('#vessel').value || 'draught');
    const r = applyBrew(farm, prepped, benchPick, $('#vessel').value || 'draught', useShard, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    benchPick = [];
    toast('⚗️ ' + esc(r.item.vessel) + ' — grade <b>' + r.item.grade + '</b> ' + esc(r.item.label), r.item.grade === 'S' || r.item.grade === 'A' ? 'ach' : 'ok');
    renderBench();
  };

  $('#preps').innerHTML = farm.preparations.length ? farm.preparations.slice().reverse().map((p) =>
    '<span class="chip prep g' + p.grade + '">' + esc(p.vessel) + ' <b>' + p.grade + '</b> <i>' + esc((p.reagents || []).join(', ')) + '</i>' +
    ' <button class="mini" data-use="' + esc(p.id) + '">use</button></span>').join('')
    : '<span class="dim">no preparations yet</span>';
  $$('#preps [data-use]').forEach((b) => b.onclick = () => {
    const r = usePreparation(farm, b.dataset.use, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('✨ ' + esc(r.effect), 'ok');
    renderBench(); redrawBed();
  });
}

// ── FRIENDS tab ───────────────────────────────────────────────────────────────────────────────────
async function refreshFriends() {
  if (!store.user) return;
  try {
    friendData = await Social.scanFriends(store.user.did, 60);
    tends = Social.tendCounts(store.user.did, farm.bed.plants, friendData.tendsByFriend);
    profiles = await Social.getProfiles(friendData.farmers.map((f) => f.did));
    const gifts = Social.unclaimedGifts(store.user.did, farm.claimedGifts, friendData.giftsByFriend);
    if (gifts.length) renderGiftGate(gifts);
    renderPlantInfo();
  } catch (e) { /* the wire is best-effort */ }
}

function renderGiftGate(gifts) {
  $('#giftgate').innerHTML = '<h3>🎁 at the gate</h3>' + gifts.map((g) => {
    const p = profiles.get(g.from);
    const what = g.item.kind === 'seed' ? ((cropById(ark, g.item.id) || {}).common || g.item.id) + ' seed ×' + (g.item.qty || 1) : '◈ ' + g.item.qty;
    return '<div class="giftrow">@' + esc(p ? p.handle : g.from.slice(0, 16)) + ' sent ' + esc(what) +
      (g.note ? ' — “' + esc(g.note) + '”' : '') + ' <button class="mini" data-claim="' + esc(g.uri) + '">claim</button></div>';
  }).join('');
  $$('#giftgate [data-claim]').forEach((b) => b.onclick = () => {
    const g = gifts.find((x) => x.uri === b.dataset.claim);
    const r = claimGift(farm, g.uri, g.item, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm, { immediate: true });
    toast('🎁 claimed', 'ok');
    b.closest('.giftrow').remove();
    renderSeedBag();
  });
}

async function renderFriends() {
  const el = $('#friendlist');
  if (!store.user) { el.innerHTML = '<span class="dim">sign in to see whose fields are growing</span>'; return; }
  el.innerHTML = '<span class="dim">walking the follow graph…</span>';
  if (!friendData) await refreshFriends();
  if (!friendData || !friendData.farmers.length) {
    el.innerHTML = '<span class="dim">nobody you follow farms yet — send them ' + location.origin + ' and be the first to gift a seed</span>';
    return;
  }
  el.innerHTML = friendData.farmers.map((f) => {
    const p = profiles.get(f.did);
    const v = f.plot && f.plot.value && f.plot.value.farm;
    return '<div class="friend">' +
      (p && p.avatar ? '<img class="ava" src="' + esc(p.avatar) + '" alt="" />' : '') +
      '<b>@' + esc(p ? p.handle : f.did.slice(0, 18)) + '</b> ' +
      (v ? '<span class="dim">' + v.bed.plants.length + ' growing · ' + (v.stats ? v.stats.harvests : 0) + ' harvests</span>' : '') +
      ' <button class="mini" data-visit="' + esc(f.did) + '">visit</button>' +
      ' <button class="mini" data-gift="' + esc(f.did) + '">gift seed</button></div>';
  }).join('');
  $$('#friendlist [data-visit]').forEach((b) => b.onclick = () => visitFarm(b.dataset.visit));
  $$('#friendlist [data-gift]').forEach((b) => b.onclick = () => giftDialog(b.dataset.gift));
}

function giftDialog(did) {
  const p = profiles.get(did);
  const seeds = Object.entries(farm.seeds);
  if (!seeds.length) { toast('your seed bag is empty', 'warn'); return; }
  const box = $('#giftbox');
  box.innerHTML = '<h3>🎁 to @' + esc(p ? p.handle : did.slice(0, 16)) + '</h3>' +
    seeds.map(([id, n]) => '<button class="chip" data-send="' + esc(id) + '">' + esc((cropById(ark, id) || {}).common || id) + ' ×' + n + '</button>').join('') +
    ' <button class="mini" id="giftcancel">cancel</button>';
  $('#giftcancel').onclick = () => { box.innerHTML = ''; };
  $$('#giftbox [data-send]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.send;
    const r = giveSeed(farm, id, 1, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    try {
      await store.writeGift(did, { kind: 'seed', id, qty: 1 }, '', now());
      commit(r.farm, { immediate: true });
      toast('🎁 sent — it waits at their gate', 'ok');
    } catch (e) { toast('⚠ gift failed to write: ' + esc(e.message), 'warn'); }
    box.innerHTML = '';
    renderSeedBag();
  });
}

// visiting a friend (inline panel) — read-only bed + tend buttons
async function visitFarm(did) {
  const p = profiles.get(did);
  const box = $('#visitbox');
  box.innerHTML = '<span class="dim">walking over…</span>';
  const rec = await Social.getRecordFrom(did, Social.PLOT_COLLECTION, 'self');
  const theirFarm = rec && rec.value ? fromPlotRecord(rec.value) : null;   // migrates v1 records on the fly
  if (!theirFarm) { box.innerHTML = '<span class="dim">their field is fallow</span>'; return; }
  const myTends = store.user ? await Social.listRecordsFrom(store.user.did, Social.TEND_COLLECTION, 100) : [];
  const usedToday = Social.tendsToday(myTends, did, now());
  const left = Math.max(0, Social.TENDS_PER_FRIEND_PER_DAY - usedToday);
  box.innerHTML = '<h3>@' + esc(p ? p.handle : did.slice(0, 16)) + '’s farm ' +
    '<button class="mini" id="visitclose">close</button></h3>' +
    '<canvas id="visitbed" class="bedcanvas"></canvas>' +
    '<div class="dim">💧 tends left for them today: ' + left + ' — each distinct friend’s tend grows a plant 10% faster</div>' +
    '<div id="visitplants"></div>';
  $('#visitclose').onclick = () => { box.innerHTML = ''; };
  const visitIso = createIso($('#visitbed'), {});   // read-only: no onTap wired
  visitIso.update({ farm: theirFarm, ark, now: now(), tends: {}, readOnly: true });
  $('#visitplants').innerHTML = theirFarm.bed.plants.map((pl) => {
    const c = cropById(ark, pl.seedId);
    const g = growthOf(theirFarm, pl, c, now());
    return '<span class="chip">' + esc(c ? c.common : pl.seedId) + ' ' + (g.ready ? '✓' : Math.round(g.stage * 100) + '%') +
      (store.user && left > 0 && !g.ready ? ' <button class="mini" data-tend="' + esc(pl.id) + '">💧 tend</button>' : '') + '</span>';
  }).join('') || '<span class="dim">nothing planted</span>';
  $$('#visitplants [data-tend]').forEach((b) => b.onclick = async () => {
    try {
      await store.writeTend(did, b.dataset.tend, now());
      const next = JSON.parse(JSON.stringify(farm));
      next.stats.tendsGiven++; next.updatedAt = now();
      commit(next, { immediate: true });
      b.textContent = '💧 done'; b.disabled = true;
      toast('💧 tended — their plant grows faster now', 'ok');
    } catch (e) { toast('⚠ ' + esc(e.message), 'warn'); }
  });
}

// ── DEEDS tab ─────────────────────────────────────────────────────────────────────────────────────
function renderDeeds() {
  const el = $('#deedlist');
  if (!el) return;
  el.innerHTML = ACHIEVEMENTS.map((a) => {
    const at = farm.achievements[a.id];
    return '<div class="deed ' + (at ? 'earned' : 'locked') + '">' + a.emoji + ' <b>' + esc(a.name) + '</b> — ' + esc(a.desc) +
      (at ? ' <span class="dim">' + esc(at.slice(0, 10)) + '</span> <button class="share mini" data-ach="' + a.id + '">post</button>' : '') + '</div>';
  }).join('');
}

// share buttons live in toasts + deeds — one delegated handler
document.addEventListener('click', (e) => {
  const b = e.target.closest('.share');
  if (b && b.dataset.ach) shareAch(b.dataset.ach);
});

// ── VISITOR mode (?u=) ────────────────────────────────────────────────────────────────────────────
async function bootVisitor(u) {
  $('#app').classList.add('visitor');
  $('#craftbar').style.display = 'none';
  $$('.pane').forEach((p) => p.classList.remove('on'));
  try {
    const did = await Social.resolveHandle(u);
    const [rec, achRecs, prof] = await Promise.all([
      Social.getRecordFrom(did, Social.PLOT_COLLECTION, 'self'),
      Social.listRecordsFrom(did, Social.ACH_COLLECTION, 50),
      Social.getProfiles([did]),
    ]);
    const theirFarm = rec && rec.value ? fromPlotRecord(rec.value) : null;   // migrates v1 records on the fly
    const p = prof.get(did);
    $('#bedhint').innerHTML = theirFarm
      ? 'the farm of <b>@' + esc(p ? p.handle : u) + '</b> — live from their own PDS · <a href="./">start your own</a>'
      : '@' + esc(u) + ' has no farm yet — <a href="./">start yours</a>';
    if (!theirFarm) return;
    farm = theirFarm;   // read-only: no commit path runs in visitor mode
    const viewerIso = createIso($('#bed'), {});
    const paint = () => viewerIso.update({ farm: theirFarm, ark, now: now(), tends: {}, readOnly: true });
    paint();
    $('#plants').innerHTML = theirFarm.bed.plants.map((pl) => {
      const c = cropById(ark, pl.seedId);
      const g = growthOf(theirFarm, pl, c, now());
      return '<span class="chip">' + esc(c ? c.common : pl.seedId) + ' ' + (g.ready ? '✓ ripe' : Math.round(g.stage * 100) + '%') + '</span>';
    }).join('');
    $('#seedrow').style.display = 'none';
    if (achRecs.length) {
      $('#pantryrow').innerHTML = '<h3>deeds</h3>' + achRecs.map((r) => {
        const v = r.value || {};
        return '<span class="chip">' + esc(v.emoji || '🏅') + ' ' + esc(v.name || v.achievementId) + '</span>';
      }).join('');
    } else $('#pantryrow').innerHTML = '';
    setInterval(paint, 30_000);
  } catch (e) {
    $('#bedhint').textContent = 'could not find @' + u + ' — ' + e.message;
  }
}

// ── toasts ────────────────────────────────────────────────────────────────────────────────────────
function toast(html, kind = 'ok', ms = 5000) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = html;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 400); }, ms);
}

// ── wire the chrome ──────────────────────────────────────────────────────────────────────────────
document.addEventListener('click', (e) => { if (e.target.closest('.closepane')) closePanel(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
window.harvestople = { openPanel, closePanel, state: () => farm };   // console/smoke-test handle — the map is still the front door
$('#vessel')?.addEventListener('change', () => renderBench());
boot().catch((e) => { console.error(e); toast('⚠ boot failed: ' + esc(e.message), 'warn', 20000); });
