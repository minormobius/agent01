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
  ANIMALS, GOOD_EMOJI, animalCap, buyAnimal, feedAnimal, petAnimal, collectAnimal, sellGood,
  animalFed, animalProducing, animalById, forage, grantWildseed,
  FORGE_REQ, ALLOYS, CHARM_DEFS, CHARM_COST, CHARM_SPD, CHARM_SELL, buildForge, smeltAlloy,
  smeltReady, collectSmelt, sellAlloy, forgeCharm, setCharm, activeCharm, cropPlanet, allCrops,
  modOn, setMod, clearPlant, WATER_RANGE, THIRSTY, waterSourceWithin,
} from './state.js';
import * as Mine from './mine.js';
import { ACHIEVEMENTS, byId as achById, evaluate as evalAch, markEarned, shareText } from './achievements.js';
import * as Social from './social.js';
import { FarmStore } from './store.js';
import { corrForCrop } from './render.js';
import { createIso } from './iso.js';
import { SKINS, skinById, skinUnlocked, currentSkin, setSkin } from './themes.js';
import { prepare, reagentEffect, PREPARATIONS } from '../vendor/alchemy.js';
import { biomeById, progress, TIER_FOIL } from '../vendor/gacha.js';
import { PLANETS as PKEYS } from '../vendor/planets.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => Date.now();

const METAL_GLYPH = { gold: '☉', silver: '☽', quicksilver: '☿', copper: '♀', iron: '♂', tin: '♃', lead: '♄' };

let theme = null;   // resolved skin object for the farm on screen
function applySkin(f) {
  theme = currentSkin(f);
  for (const [k, v] of Object.entries(theme.css || {})) document.documentElement.style.setProperty(k, v);
  const btn = $('#skinbtn');
  if (btn) btn.textContent = theme.emoji;
}
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
  { key: 'forge',   emoji: '⚒️', label: 'forge',   hint: 'raise the forge (120◈ + 2 iron + 2 copper) — the place to smelt what the mine gives',
    when: (f) => !f.forge, gate: (f) => (f.mine.depth | 0) >= FORGE_REQ.depth, gateHint: 'reach depth ' + FORGE_REQ.depth + ' in the mine — a smith should know where metal sleeps' },
  { key: 'move',    emoji: '✋', label: 'move',    hint: 'tap a building, then tap where it goes' },
];
let pendingBuy = null;   // { key, at } — a FOR-SALE parcel tapped once, awaiting its confirming tap

async function boot() {
  // THE TESTING TABLE: the same code serves farm-next.mino.mobi from its own branch, where
  // granted petitions go live immediately. Same save (the covenant keeps the worlds compatible)
  // — but the player should always know which world they're standing in.
  if (location.hostname === 'farm-next.mino.mobi') {
    document.title = 'Harvestople NEXT — the testing table';
    const b = document.createElement('div');
    b.className = 'toast warn'; b.id = 'nextbar';
    b.innerHTML = '<span class="x" title="dismiss">✕</span>⚗️ <b>the testing table</b> — petition experiments live here first. Your real save, new rules; the keepers merge the good ones. <a href="https://farm.mino.mobi/">back to the mainline farm</a>';
    document.addEventListener('DOMContentLoaded', () => $('#toasts') && $('#toasts').appendChild(b));
    if ($('#toasts')) $('#toasts').appendChild(b);
  }
  ark = await (await fetch('./vendor/ark.json')).json();
  const u = new URLSearchParams(location.search).get('u');
  await store.init();
  store.addEventListener('auth', () => { renderHeader(); });
  store.addEventListener('syncerror', () => toast('⚠ sync hiccup — retrying with backoff', 'warn'));
  // a save written by a NEWER world (a graduated testing-table feature this deploy hasn't caught
  // up to): play continues locally, nothing is overwritten, and a refresh usually resolves it.
  store.addEventListener('newerworld', () => toast('🔭 your save comes from a newer Harvestople — playing locally, nothing will be overwritten. Refresh in a bit.', 'warn', 12000));
  // an SSO session consented on another mino.mobi site authenticates fine but can't WRITE farm
  // records — one clear banner with the fix, instead of a failed-save toast storm.
  store.addEventListener('scopeneeded', () => showGrantBanner('this signed-in session can’t save the farm yet'));

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

  applySkin(farm);
  isoMain = createIso($('#bed'), { onTap: onFieldTap });

  // BIG FARM: not the browser's F11 — the FIELD grows to fill the viewing window and everything
  // else steps aside. Same button toggles back.
  const fs = $('#fsbtn');
  if (fs) fs.onclick = () => {
    const on = document.body.classList.toggle('bigfarm');
    fs.textContent = on ? '✕' : '⛶';
    fs.title = on ? 'back to the homestead view' : 'big farm — the field takes the whole window';
    window.dispatchEvent(new Event('resize'));   // the iso canvas re-measures itself
    redrawBed();
  };
  // collapsible trackers remember how you left them
  $$('details[data-fold]').forEach((d) => {
    const k = 'harvestople-fold-' + d.dataset.fold;
    if (localStorage.getItem(k) === 'shut') d.open = false;
    d.addEventListener('toggle', () => localStorage.setItem(k, d.open ? 'open' : 'shut'));
  });
  // some auth sessions arrive with the DID where the handle belongs — resolve it once so the
  // header (and every "by @you" surface) reads like a name, not a key
  if (store.user && (!store.user.handle || String(store.user.handle).startsWith('did:'))) {
    try {
      const profs = await Social.getProfiles([store.user.did]);
      const p = profs && profs.get && profs.get(store.user.did);
      if (p && p.handle) { store.user.handle = p.handle; renderHeader(); }
    } catch (e) { /* the DID still works; the name can wait */ }
  }

  // catch the missing-grant case BEFORE the first write fails: SSO'd in, but no farm scopes
  if (store.user && !store.hasFarmScope()) showGrantBanner('you’re signed in via another mino.mobi site');

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

function onFieldTap(tap) {
  const { bx, by, tx, ty, plantIdx, building, animal, sparkle } = tap;
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
  // a sparkle is always the first prize — the whole point of the hunt
  if (sparkle && !craftTool) {
    const spot = sparkle;
    const r = forage(farm, spot.i, now());
    if (r.ok) {
      let f2 = r.farm, msg;
      if (r.prize.kind === 'coins') { msg = '+' + r.prize.qty + '◈'; isoMain.burst(spot.tx / FIELD_T + 0.04, spot.ty / FIELD_T + 0.04, '+' + r.prize.qty + '◈'); }
      else if (r.prize.kind === 'shard') { msg = '✧ a quintessence shard!'; isoMain.burst(spot.tx / FIELD_T, spot.ty / FIELD_T, '✧', '#e0d08f'); }
      else {
        const g = grantWildseed(f2, ark, now());
        f2 = g.farm;
        msg = g.crop ? '🌱 wildseed: ' + esc(g.crop.common) : '🌱 a wildseed';
        isoMain.burst(spot.tx / FIELD_T, spot.ty / FIELD_T, '🌱', '#93e6a4');
      }
      commit(f2);
      toast('✨ ' + msg, 'ok', 3500);
      redrawBed();
    }
    return;
  }
  // animals: collect if ready, else pet, else feed hint — one tap does the right thing
  if (animal && !craftTool) {
    const a = animal;
    const def = ANIMALS[a.kind];
    const c = collectAnimal(farm, a.id, now());
    if (c.ok) {
      commit(c.farm);
      isoMain.burst(bx, by, def.goodEmoji + (c.petted ? '×2' : ''), '#f7c66a');
      toast(def.emoji + ' ' + def.goodEmoji + ' ×' + c.qty + (c.organic ? ' 🌿' : ' 🧪') + (c.petted ? ' — the pets paid off' : ''), 'ok');
      redrawBed(); return;
    }
    const p = petAnimal(farm, a.id, now());
    if (p.ok) {
      commit(p.farm);
      isoMain.burst(bx, by, '💕', '#e89ac8');
      toast(def.emoji + ' happy ' + def.name + ' — next collect is doubled', 'ok');
      redrawBed(); return;
    }
    toast(def.emoji + ' ' + esc(c.reason) + ' — the barn 🐄 manages the herd', 'ok');
    return;
  }
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
  if (craftTool === 'forge') {
    const r = buildForge(farm, tx, ty, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('⚒️ the forge stands — tap it to smelt', 'ach', 7000);
    craftTool = null; renderCraftBar();
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
    // dead → clear; ripe → harvest; thirsty → WATER (the task); otherwise say how it's doing
    const p = farm.bed.plants[plantIdx];
    const c = cropById(ark, p.seedId);
    const g = growthOf(farm, p, c, now(), tends[p.id] || 0);
    if (g.dead) {
      const r = clearPlant(farm, p.id, now());
      if (r.ok) { commit(r.farm); toast('🥀 withered past saving — cleared. Water within 48h next time, or plant nearer a pond', 'warn', 8000); redrawBed(); }
      return;
    }
    if (g.ready) { tryHarvest(p.id); return; }
    const r = waterPlant(farm, p.id, now());
    if (r.ok) {
      commit(r.farm);
      toast(g.farWater ? '💧 watered — far from any pond, this one lives on the can (48h a visit)' : '💧 watered — holds 6h', g.farWater ? 'warn' : 'ok');
      redrawBed(); return;
    }
    toast(esc(c ? c.common : p.seedId) + ': ' + Math.round(g.stage * 100) + '% · ' + (isFinite(g.msLeft) ? fmtMs(g.msLeft) : 'waiting on water') +
      (irrigated(farm, p) ? ' · 🌊 irrigated' : g.farWater ? ' · 🏜 beyond the ponds' : ' · 💧 damp'), 'ok');
    return;
  }
  if (!plantingCrop) return;
  // SNAP TO THE TILE CENTER: the hover preview judges tiles, so planting must land where the
  // preview looked — free-floating tap coords made green tiles refuse (tap near an edge, too
  // close to a neighbour) and red tiles accept. One tile, one plant, no lies.
  const r = plantSeed(farm, (tx + 0.5) / FIELD_T, (ty + 0.5) / FIELD_T, plantingCrop, ark, now());
  if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
  commit(r.farm);
  if (r.farWater) toast('🏜 far from water — it only grows when watered, and 48h dry kills it. A pond or sprinkler nearby fixes that for good', 'warn', 8000);
  if (r.charmed) toast('🪬 sown under ' + esc(activeCharm(farm) || '') + ' — this one grows ×' + CHARM_SPD + (r.spd > CHARM_SPD ? ' on top of fresh ground' : ''), 'ok');
  else if (r.spd > 1) toast('⚡ fresh-broken ground — this one grows 4×', 'ok');
  if (!farm.seeds[plantingCrop]) plantingCrop = null;
  redrawBed();
}

// what the hover preview asks: does the current tool land on (tx,ty)?
function toolCheckAt(tx, ty) {
  if (craftTool === 'move') return movingBuilding ? moveBuilding(farm, movingBuilding, tx, ty, 0).ok : !!buildingAt(farm, tx, ty);
  if (craftTool === 'sprinkler') return placeSprinkler(farm, tx, ty, 0).ok;
  if (craftTool === 'forge') return buildForge(farm, tx, ty, 0).ok;
  if (craftTool) return terraform(farm, tx, ty, craftTool, 0).ok;
  if (plantingCrop) return plantCheckAt(tx, ty);
  return false;
}

// the ONE planting predicate — the hover tile, the global overlay and the tap all ask this, and
// the tap plants at the same tile center it judges, so the answer can never lie
function plantCheckAt(tx, ty) {
  if (!plantingCrop) return false;
  if (!plantableTile(farm, (tx + 0.5) / FIELD_T, (ty + 0.5) / FIELD_T)) return false;
  const c = cropById(ark, plantingCrop);
  if (c && THIRSTY[c.id] != null && !waterSourceWithin(farm, tx, ty, THIRSTY[c.id])) return false;
  return true;
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
  const sb = $('#skinbtn');
  if (sb && !sb.dataset.wired) { sb.dataset.wired = '1'; sb.onclick = () => openPanel('skins'); }
  if (sb && theme) sb.textContent = theme.emoji;
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
  if (name === 'forge') renderForge();
  if (name === 'hall') renderHall();
  if (name === 'skins') renderSkins();
  if (name === 'barn') renderBarn();
}
function closePanel() { $$('.pane').forEach((p) => p.classList.remove('on')); redrawBed(); }

// ── craft toolbar ─────────────────────────────────────────────────────────────────────────────────
function renderCraftBar() {
  const bar = $('#craftbar');
  const on = craftTool != null;
  bar.innerHTML = '<button id="craft" class="' + (on ? 'on' : '') + '">🔨 craft</button>' +
    (on ? CRAFT_TOOLS.filter((t) => !t.when || t.when(farm)).map((t) => {
      const locked = (t.tech && !hasTech(farm, t.tech)) || (t.gate && !t.gate(farm));
      const lockWhy = t.tech ? 'research at the waterworks' : (t.gateHint || '');
      const cost = TERRA_COST[t.key] ? TERRA_COST[t.key] + '◈' : t.key === 'sprinkler' ? SPRINKLER_COST.coins + '◈+' + SPRINKLER_COST.tin + '♃' : t.key === 'forge' ? FORGE_REQ.coins + '◈+♂♀' : '';
      return '<button class="tool ' + (craftTool === t.key ? 'on' : '') + (locked ? ' locked' : '') + '" data-tool="' + t.key + '" ' + (locked ? 'disabled title="' + esc(lockWhy) + '"' : 'title="' + esc(t.hint) + '"') + '>' +
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
    theme,
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
    if (r.ok) { commit(r.farm); toast('+' + r.coins + '◈' + (r.organic ? ' 🌿 organic premium' : '') + (r.warded ? ' (warded)' : '') + (r.favoured ? ' 🪬' : '') + (r.saturated ? ' · the village has had its fill of this today' : ''), r.saturated ? 'warn' : 'ok'); renderPantry(); }
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
  const p0 = farm.bed.plants.find((p) => p.id === plantId);
  const r = harvestPlant(farm, plantId, ark, now(), tends);
  if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
  commit(r.farm);
  if (p0 && isoMain) isoMain.burst(p0.x, p0.y, '+' + r.yield + ' 🧺', '#93e6a4');
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

// ── SKINS panel — the wardrobe. Your skin is saved in the plot record: visitors see it. ─────────
function renderSkins() {
  $('#skinlist').innerHTML = SKINS.map((sk) => {
    const un = skinUnlocked(farm, sk.id);
    const active = (farm.skin || 'verdant') === sk.id && un;
    const sw = ['meadow', 'soil', 'path', 'pond'].map((k) =>
      '<i class="sw" style="background:rgb(' + sk.ground[k].base.join(',') + ')"></i>').join('');
    return '<div class="pack ' + (active ? 'active' : un ? '' : 'locked next') + '">' +
      '<b>' + sk.emoji + ' ' + esc(sk.name) + '</b> <span class="sws">' + sw + '</span> <span class="dim">' + esc(sk.desc) + '</span>' +
      (un
        ? (active ? '<span class="dim">— wearing it</span>' : '<button class="mini" data-skin="' + sk.id + '">wear</button>')
        : '<div class="reqs"><span class="unmet">✗ ' + esc(sk.unlock.label) + '</span></div>') +
      '</div>';
  }).join('');
  $$('#skinlist [data-skin]').forEach((b) => b.onclick = () => {
    const r = setSkin(farm, b.dataset.skin, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm, { immediate: true });
    applySkin(farm);
    toast(r.skin.emoji + ' <b>' + esc(r.skin.name) + '</b> — the farm wears it now, and so does your public page', 'ach', 7000);
    renderSkins(); redrawBed();
  });
}

// ── BARN panel (the herd) ─────────────────────────────────────────────────────────────────────────
function renderBarn() {
  const cap = animalCap(farm);
  $('#barnstats').innerHTML = '<span class="chip">herd ' + (farm.animals || []).length + '/' + cap + '</span>' +
    ' <span class="dim">each parcel carries two animals — buy land, grow the herd. Goods inherit the FEED: organic-fed animals give 🌿 goods (×1.75 at market).</span>';
  $('#stable').innerHTML = Object.entries(ANIMALS).map(([k, d]) => {
    // the goods gate stays VISIBLE while locked — a shelf you can see is a goal, not a mystery
    const gLeft = d.needsGoods ? Math.max(0, d.needsGoods - (farm.stats.goodsCollected | 0)) : 0;
    return '<button class="chip' + (gLeft ? ' locked' : '') + '" data-buy-animal="' + k + '">' + (gLeft ? '🔒 ' : '') + d.emoji + ' ' + d.name + ' — ' + d.cost + '◈' +
      ' <i>' + d.goodEmoji + ' every ' + Math.round(d.everyMs / 3600000) + 'h' +
      (d.feedUnits ? ' · eats ' + d.feedUnits + ' produce/day' : ' · feeds itself among ≥' + d.needsPlants + ' plants') +
      (d.needsPond ? ' · needs a pond' : '') +
      (gLeft ? ' · trusts a barn of ' + d.needsGoods + ' goods (' + gLeft + ' to go)' : '') + '</i></button>';
  }).join('');
  $$('#stable [data-buy-animal]').forEach((b) => b.onclick = () => {
    const r = buyAnimal(farm, b.dataset.buyAnimal, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast(r.def.emoji + ' a ' + r.def.name + ' joins the farm — find it wandering the fields', 'ach', 7000);
    renderBarn(); redrawBed();
  });
  $('#herd').innerHTML = (farm.animals || []).length ? farm.animals.map((a) => {
    const d = ANIMALS[a.kind];
    const fed = animalFed(a, now());
    const ready = animalProducing(farm, a, now()) && now() - (a.lastCollect || a.at) >= d.everyMs;
    return '<div class="giftrow">' + d.emoji + ' <b>' + d.name + '</b> ' +
      (ready ? d.goodEmoji + ' ready — tap it on the map' : fed || !d.feedUnits ? '<span class="dim">grazing (' + (a.feedGrade === 'conv' ? '🧪 fed' : '🌿 fed') + ')</span>' : '<b class="warn">hungry</b>') +
      (!fed && d.feedUnits ? Object.keys(farm.pantry).slice(0, 3).map((id) =>
        ' <button class="mini" data-feed="' + a.id + '" data-crop="' + esc(id) + '">feed ' + esc((cropById(ark, id) || {}).common || id) + ' 🌿</button>').join('') +
        Object.keys(farm.pantryC || {}).slice(0, 2).map((id) =>
        ' <button class="mini" data-feed="' + a.id + '" data-crop="' + esc(id) + '">feed ' + esc((cropById(ark, id) || {}).common || id) + ' 🧪</button>').join('') : '') +
      '</div>';
  }).join('') : '<span class="dim">no animals yet — the stable above sells them</span>';
  $$('#herd [data-feed]').forEach((b) => b.onclick = () => {
    const r = feedAnimal(farm, b.dataset.feed, b.dataset.crop, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast('🍽️ fed' + (r.organic ? ' 🌿 — its goods stay organic' : ' 🧪 — its goods go conventional'), r.organic ? 'ok' : 'warn');
    renderBarn();
  });
  const goods = Object.entries(farm.goods || {}), goodsC = Object.entries(farm.goodsC || {});
  $('#goods').innerHTML = (goods.length || goodsC.length)
    ? goods.map(([k, n]) => {
      const d = Object.values(ANIMALS).find((x) => x.good === k);
      return '<span class="chip organic">' + GOOD_EMOJI[k] + ' ' + k + ' ×' + n +
        ' <button class="mini" data-sellgood="' + k + '" data-grade="organic">sell @' + Math.round(d.price * ORGANIC_PREMIUM) + '◈</button></span>';
    }).join('') + goodsC.map(([k, n]) => {
      const d = Object.values(ANIMALS).find((x) => x.good === k);
      return '<span class="chip conv">' + GOOD_EMOJI[k] + ' ' + k + ' ×' + n +
        ' <button class="mini" data-sellgood="' + k + '" data-grade="conv">sell @' + d.price + '◈</button></span>';
    }).join('')
    : '<span class="dim">no goods yet — fed animals drop them on their timers</span>';
  $$('#goods [data-sellgood]').forEach((b) => b.onclick = () => {
    const grade = b.dataset.grade;
    const pool = grade === 'conv' ? farm.goodsC : farm.goods;
    const r = sellGood(farm, b.dataset.sellgood, pool[b.dataset.sellgood], now(), grade);
    if (r.ok) { commit(r.farm); toast('+' + r.coins + '◈' + (r.organic ? ' 🌿' : ''), 'ok'); renderBarn(); }
  });
}

// ── FORGE panel (the metals vertical: crucible → rack → the Chaldean week) ───────────────────────
function renderForge() {
  if (!farm.forge) return;   // the pane only opens from the building, which only exists once built
  const t = now();
  $('#forgemetals').innerHTML = Object.entries(METAL_GLYPH).map(([m, g]) =>
    '<span class="chip">' + g + ' ' + m + ' ×' + (farm.metals[m] | 0) + '</span>').join(' ');

  // the crucible
  const q = farm.forge.queue;
  const crucible = !q
    ? '<span class="dim">the crucible stands cold — pour something</span>'
    : smeltReady(farm, t)
      ? '<button class="chip" id="collectpour">' + ALLOYS[q.alloy].emoji + ' ' + ALLOYS[q.alloy].name + ' has cooled — collect</button>'
      : '<span class="chip">' + ALLOYS[q.alloy].emoji + ' ' + ALLOYS[q.alloy].name + ' cooling · ' + fmtMs(q.at + ALLOYS[q.alloy].ms - t) + '</span>';
  $('#forgesmelt').innerHTML = crucible + '<div>' + Object.entries(ALLOYS).map(([k, d]) => {
    const short = Object.entries(d.needs).some(([m, n]) => (farm.metals[m] | 0) < n);
    return '<button class="chip' + (short ? ' locked' : '') + '" data-pour="' + k + '">' + d.emoji + ' ' + d.name +
      ' <i>' + Object.entries(d.needs).map(([m, n]) => n + METAL_GLYPH[m]).join('+') + ' · ' + Math.round(d.ms / 3600000) + 'h · sells ' + d.sell + '◈</i></button>';
  }).join('') + '</div>';
  const collectBtn = $('#collectpour');
  if (collectBtn) collectBtn.onclick = () => {
    const r = collectSmelt(farm, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm); toast(ALLOYS[r.alloy].emoji + ' ' + ALLOYS[r.alloy].name + ' in the rack', 'ok'); renderForge();
  };
  $$('#forgesmelt [data-pour]').forEach((b) => b.onclick = () => {
    const r = smeltAlloy(farm, b.dataset.pour, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm);
    toast((r.collected ? ALLOYS[r.collected].emoji + ' ' + ALLOYS[r.collected].name + ' banked · ' : '') + '🫕 pouring ' + ALLOYS[b.dataset.pour].name, 'ok');
    renderForge();
  });

  // the rack
  const rack = Object.entries(farm.forge.alloys || {});
  $('#forgerack').innerHTML = rack.length ? rack.map(([k, n]) =>
    '<span class="chip">' + ALLOYS[k].emoji + ' ' + ALLOYS[k].name + ' ×' + n +
    ' <button class="mini" data-sellalloy="' + k + '">sell @' + ALLOYS[k].sell + '◈</button></span>').join(' ')
    : '<span class="dim">nothing cooled yet</span>';
  $$('#forgerack [data-sellalloy]').forEach((b) => b.onclick = () => {
    const r = sellAlloy(farm, b.dataset.sellalloy, 1, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm); toast('+' + r.coins + '◈', 'ok'); renderForge();
  });

  // the seven charms — where the correspondences become visible: each planet lists the crops of
  // YOURS it rules, so the depth layer teaches itself to whoever reads the anvil.
  const worn = activeCharm(farm);
  $('#forgecharms').innerHTML = Object.entries(CHARM_DEFS).map(([p, d]) => {
    const mine = allCrops(ark).filter((c) => farm.owned.includes(c.id) && cropPlanet(c) === p).map((c) => c.common);
    const rules = mine.length ? 'rules your ' + esc(mine.slice(0, 3).join(', ')) + (mine.length > 3 ? ' +' + (mine.length - 3) : '') : 'rules none of your crops yet';
    const owned = !!farm.forge.charms[p];
    const act = owned
      ? (worn === p ? '<button class="mini on" data-wear="">worn — take off</button>' : '<button class="mini" data-wear="' + p + '">wear</button>')
      : '<button class="mini" data-strike="' + p + '">strike · ' + CHARM_COST.coins + '◈ + ' + CHARM_COST.metal + METAL_GLYPH[d.metal] + ' + ' + CHARM_COST.alloy + ' ' + esc(d.alloy) + '</button>';
    return '<div class="giftrow">' + d.glyph + ' <b>' + p + '</b> <span class="dim">' + rules + '</span> ' + act + '</div>';
  }).join('') +
    '<div class="hint">sown under its sign, a crop grows ×' + CHARM_SPD + ' from that planting; while the charm is worn its produce sells ×' + CHARM_SELL + '. One charm at a time — the week turns.</div>';
  $$('#forgecharms [data-strike]').forEach((b) => b.onclick = () => {
    const r = forgeCharm(farm, b.dataset.strike, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm); toast('🪬 the ' + b.dataset.strike + ' charm hangs by the anvil', 'ach', 6000); renderForge();
  });
  $$('#forgecharms [data-wear]').forEach((b) => b.onclick = () => {
    const r = setCharm(farm, b.dataset.wear || null, now());
    if (!r.ok) { toast(esc(r.reason), 'warn'); return; }
    commit(r.farm); toast(b.dataset.wear ? '🪬 wearing ' + b.dataset.wear : 'charm off', 'ok'); renderForge(); redrawBed();
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

// ── TOWN HALL: the petition box, the experiments board, the ledger ───────────────────────────────
const ON_TABLE = location.hostname === 'farm-next.mino.mobi';
async function renderHall() {
  wirePetitionBox();   // FIRST — the submit button must never wait on a network fetch
  renderMyPetitions();
  const el = $('#townledger');
  if (el && !el.dataset.loaded) {
    el.dataset.loaded = '1';
    try {
      const led = await (await fetch('./council/ledger.json')).json();
      el.innerHTML = (led.entries || []).map((e) =>
        '<div class="giftrow"><span class="dim">' + esc(e.date) + '</span> ' + esc(e.change) +
        ' <span class="dim">— petitioned by ' + esc(e.by) + '</span></div>').join('') ||
        '<span class="dim">no petitions granted yet — be the first name on the board</span>';
    } catch (e) { el.innerHTML = '<span class="dim">the ledger is on its way to town</span>'; }
  }
  // the experiments board: what lives on the testing table right now, and whose wish it was.
  // Mainline reads the TABLE's registry (CORS via _headers), so your quick link is right here;
  // on the table itself the registry is local and each experiment gets a shelve/restore toggle.
  const mb = $('#modsboard');
  if (mb && !mb.dataset.loaded) {
    mb.dataset.loaded = '1';
    try {
      const src = ON_TABLE ? './mods/registry.json' : 'https://farm-next.mino.mobi/mods/registry.json';
      const reg = await (await fetch(src)).json();
      const mine = (store.user && store.user.handle) || null;
      const mods = (reg.mods || []).slice().sort((a, b) => (b.by === mine) - (a.by === mine));
      mb.innerHTML = mods.length ? mods.map((m) => {
        const yours = m.by === mine;
        const on = modOn(farm, m.id);
        return '<div class="giftrow">' + (yours ? '⭐ ' : '') + '<b>' + esc(m.title) + '</b> ' +
          '<span class="dim">— by @' + esc(m.by) + (m.since ? ' · ' + esc(m.since) : '') + '</span> ' +
          (ON_TABLE
            ? '<button class="mini" data-modtoggle="' + esc(m.id) + '">' + (on ? 'shelve' : 'restore') + '</button>'
            : '<a class="mini" href="https://farm-next.mino.mobi/">play it →</a>') +
          '</div>';
      }).join('') : '<span class="dim">the table is bare — wish something onto it below</span>';
      $$('#modsboard [data-modtoggle]').forEach((b) => b.onclick = () => {
        const r = setMod(farm, b.dataset.modtoggle, !modOn(farm, b.dataset.modtoggle), now());
        if (r.ok) { commit(r.farm); mb.dataset.loaded = ''; renderHall(); }
      });
    } catch (e) { mb.innerHTML = '<span class="dim">could not reach the testing table just now</span>'; }
  }
}

// YOUR PETITIONS — read straight from YOUR OWN repo (keyless public XRPC), every visit, no
// cache: filing is a record write, so this is the proof-of-receipt the town hall owed you.
// Status is derived from public artifacts: the mods registry (granted → live on the table),
// the town ledger, else "awaiting the council".
async function renderMyPetitions() {
  const el = $('#mypetitions');
  if (!el) return;
  if (!store.user) { el.innerHTML = '<span class="dim">sign in — your petitions are records in your own repo, and they show here with their status</span>'; return; }
  el.innerHTML = '<span class="dim">reading your repo…</span>';
  try {
    const [recs, reg, led] = await Promise.all([
      Social.listRecordsFrom(store.user.did, Social.PETITION_COLLECTION, 25),
      fetch('https://farm-next.mino.mobi/mods/registry.json').then((r) => r.json()).catch(() => ({ mods: [] })),
      fetch('./council/ledger.json').then((r) => r.json()).catch(() => ({ entries: [] })),
    ]);
    if (!recs.length) { el.innerHTML = '<span class="dim">none yet — the box above is waiting</span>'; return; }
    el.innerHTML = recs.map((r) => {
      const text = (r.value && r.value.text) || '';
      const at = ((r.value && r.value.createdAt) || '').slice(0, 10);
      const granted = (reg.mods || []).find((m) => m.petition === r.uri)
        || (led.entries || []).find((e) => e.petition === r.uri);
      const status = granted
        ? '<b style="color:var(--green,#8fd07a)">⚗️ granted — live on <a href="https://farm-next.mino.mobi/">the testing table</a></b>'
        : '<span class="dim">⏳ filed — awaiting the council (it sweeps every 15 minutes when awake; grants land on the table and reply to your post)</span>';
      return '<div class="giftrow">🪧 “' + esc(text.slice(0, 90)) + (text.length > 90 ? '…' : '') + '” <span class="dim">' + esc(at) + '</span><br>' + status + '</div>';
    }).join('');
  } catch (e) { el.innerHTML = '<span class="dim">could not read your repo just now — the records are safe, try reopening the hall</span>'; }
}

function wirePetitionBox() {
  const send = $('#petitionsend');
  if (!send || send.dataset.wired) return;
  send.dataset.wired = '1';
  send.onclick = async () => {
    const text = ($('#petitiontext').value || '').trim();
    if (text.length < 8) { toast('a petition needs a few more words', 'warn'); return; }
    if (!store.user) { toast('sign in to petition — wishes are signed records in your own repo', 'warn'); return; }
    try {
      const r = await store.writePetition(text, null, now());
      if (!r) return;   // scope escalation redirected
      $('#petitiontext').value = '';
      // the COURIER POST is how the sweep discovers petitions (public search on the tag) and
      // where the council replies with your testing-table link — the record is the truth, the
      // post is the flare. Best effort: a petition without its flare still exists, it just
      // waits for a slower road.
      try {
        await store.sharePost('🪧 petitioned the Harvestople town council: “' + text.slice(0, 170) + '” #harvestople\n\nfarm.mino.mobi');
        $('#petitionnote').textContent = 'filed + posted. The council builds or declines within the hour and replies to your post — grants come with a live testing link.';
      } catch (e) {
        $('#petitionnote').textContent = 'filed — but the courier post failed, and that post is how the council finds petitions and replies. Try again later from the deeds sign.';
      }
      toast('🪧 petition filed with the council', 'ach', 6000);
    } catch (e) { toast('the courier stumbled — try again', 'warn'); }
  };
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
    applySkin(theirFarm);   // their page, their look
    const viewerIso = createIso($('#bed'), {});
    const paint = () => viewerIso.update({ farm: theirFarm, ark, now: now(), tends: {}, readOnly: true, theme });
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

// the grant banner: one persistent, actionable line — tapping it re-consents for the farm's full
// scope (a redirect) and the pending save flushes on return.
function showGrantBanner(why) {
  if ($('#grantbar')) return;   // once is enough
  const t = document.createElement('div');
  t.className = 'toast warn'; t.id = 'grantbar';
  t.innerHTML = '<span class="x" title="dismiss">✕</span>🔐 ' + esc(why) + ' — <button id="grantgo" class="mini">grant farm permissions</button>' +
    ' <span class="dim">(one consent screen, then straight back here)</span>';
  $('#toasts').appendChild(t);
  $('#grantgo').onclick = () => store.grantScope().catch((e) => toast('⚠ ' + esc(e.message), 'warn'));
}

// ── toasts ────────────────────────────────────────────────────────────────────────────────────────
// BANISHABLE, always: every toast dismisses on tap, and the stack caps at 4 so a burst of
// notices never buries the pane buttons underneath (persistent banners with ids don't count).
function toast(html, kind = 'ok', ms = 5000) {
  const box = $('#toasts');
  const live = [...box.children].filter((el) => !el.id);
  while (live.length >= 4) live.shift().remove();
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = html;
  t.addEventListener('click', (e) => { if (e.target.closest('a, button, select, input')) return; t.remove(); });
  box.appendChild(t);
  setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 400); }, ms);
}

// ── wire the chrome ──────────────────────────────────────────────────────────────────────────────
document.addEventListener('click', (e) => { if (e.target.closest('.closepane')) closePanel(); });
// the ✕ on persistent banners (nextbar, grantbar) — every popup must be banishable
document.addEventListener('click', (e) => { const x = e.target.closest('.toast .x'); if (x) x.closest('.toast').remove(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
window.harvestople = { openPanel, closePanel, state: () => farm, cam: () => isoMain && isoMain.cam() };   // console/smoke-test handle — the map is still the front door
$('#vessel')?.addEventListener('change', () => renderBench());
boot().catch((e) => { console.error(e); toast('⚠ boot failed: ' + esc(e.message), 'warn', 20000); });
