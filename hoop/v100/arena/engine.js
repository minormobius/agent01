// engine.js — the turn-based COMBAT engine, v2 (the rind sandbox fork).
//
// Forked from hoop/v098/arena/engine.js to deepen it without touching the live deploy surface. The
// matured kernel is meant to be VENDORED BACK into hoop/v098/arena/ once the balance harness is happy
// (the wayfind.js discipline: re-sync, don't fork forever). What's new over the v1 arena engine:
//
//   • FACTION STYLES   — continuant / drift / rindwalker (factions.js) each grant a kit of signature
//                        verbs, a cost discount, and an always-on PASSIVE the resolver reads.
//   • EXPANDED VERBS   — brace (guard + counter), flit (disengage-move), feint/rivet (control),
//                        gore (bleed-for-power), adrenal (HP→Flux), siphon (Flux drain), scavenge.
//   • STATUS EFFECTS   — bleed · stun · mark · slow, ticked each turn, resisted by nerve/will.
//   • FLANKING         — a strike lands harder when an ally is also within melee of the target.
//   • CONTINUUM BOARD  — positions are continuous Euclidean points (not grid cells); movement is a free
//                        step anywhere within a disk; range/AoE are radii; units have a body radius and
//                        can't overlap. The discrete-grid `cheb`/`reachable` layer was replaced by
//                        `dist`/`moveToward`/`canReach`. Skill numbers are unchanged — they're now
//                        center-to-center distances in world units (a unit is ~1 unit across).
//
// Pure + seeded: a battle is fully determined by (player, foes, seed), so it is reproducible and
// node-testable, and the balance harness can run thousands headlessly. Zero-dep beyond stats/factions.

import { deriveCombat } from '../stats.js';
import { FACTIONS, discountedCost } from './factions.js';

// ── CONTINUUM GEOMETRY ────────────────────────────────────────────────────────────────────────
export const UNIT_R = 0.5;               // body radius; two units can't be closer than 2·UNIT_R
const REACH_PAD = 0.25;                   // range forgiveness so "touching" reliably counts as in-range
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const inRange = (a, b, r) => dist(a, b) <= (r || 1) + REACH_PAD;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── SKILLS ────────────────────────────────────────────────────────────────────────────────────
// `strike` is the free universal melee. The rest are flux-fuelled; factions.js says who gets which
// (kit) and at what discount. `kind` is the verb family the resolver switches on. `range`/`radius` are
// now Euclidean center distances in world units (≈1 unit per body). Costs are BEFORE the faction
// discount (discountedCost applies it).
export const SKILLS = {
  // universal
  strike:    { label: 'Strike',    cost: 0, kind: 'attack', mult: 1.0, range: 1, glyph: '⚔', gloss: 'a plain blow with what you hold' },
  brace:     { label: 'Brace',     cost: 3, kind: 'brace',  def: 3, turns: 1, glyph: '⛨', gloss: 'set your guard — soak the next blow and answer it' },
  mend:      { label: 'Mend',      cost: 6, kind: 'heal',   amount: 0.22, glyph: '✚', gloss: 'route the core into the meat — close your wounds' },
  overclock: { label: 'Overclock', cost: 5, kind: 'attack', mult: 1.7, range: 1, glyph: '⚙', gloss: 'burn Flux to drive the frame past spec — a heavy strike' },
  harden:    { label: 'Harden',    cost: 4, kind: 'buff',   def: 4, turns: 2, glyph: '⛨', gloss: 'set your will into the plating — +Def for two rounds' },

  // continuant — attrition & control
  bulwark:   { label: 'Bulwark',   cost: 6, kind: 'buff',   def: 6, turns: 2, counter: true, glyph: '🛡', gloss: 'become a redoubt — heavy +Def and strike back when hit' },
  rivet:     { label: 'Rivet',     cost: 5, kind: 'control', status: 'slow', turns: 2, range: 1, glyph: '⚓', gloss: 'pin a foe to the deck — they crawl next turn' },

  // drift — tempo & trickery
  flit:      { label: 'Flit',      cost: 3, kind: 'reposition', extra: 4, glyph: '➶', gloss: 'a second move — slip free without drawing a counter' },
  feint:     { label: 'Feint',     cost: 4, kind: 'debuff', status: 'mark', turns: 2, amt: 0.25, range: 1, glyph: '✧', gloss: 'open their guard — they take more, and read you worse' },
  siphon:    { label: 'Siphon',    cost: 4, kind: 'siphon', amount: 5, range: 1, glyph: '⟆', gloss: 'tap their core — drain Flux into your own' },

  // rindwalker — risk & resilience
  gore:      { label: 'Gore',      cost: 0, kind: 'attack', mult: 1.6, range: 1, selfHp: 0.10, status: 'bleed', sturns: 3, glyph: '✸', gloss: 'a savage blow that costs you blood and opens theirs' },
  adrenal:   { label: 'Adrenal',   cost: 0, kind: 'convert', selfHp: 0.12, gainFlux: 10, glyph: '☍', gloss: 'spend life to charge the ghost — HP into Flux' },
  scavenge:  { label: 'Scavenge',  cost: 4, kind: 'heal',   amount: 0.30, glyph: '♻', gloss: 'salvage what the hull gives — a deep self-repair' },

  // ── MULTI-AGENT & RANGE verbs — magic scales off apow (anima), so these read as an anima/Drift identity ──
  lance:       { label: 'Lance',       cost: 5, kind: 'attack', magic: true, mult: 1.3, range: 5, glyph: '➳', gloss: 'a bolt of focused anima — strike a foe from well beyond melee' },
  blast:       { label: 'Blast',       cost: 8, kind: 'blast',  magic: true, mult: 1.0, range: 4, radius: 1, glyph: '✺', gloss: 'detonate anima over an area — every foe by the mark is hit' },
  agglomerate: { label: 'Agglomerate', cost: 6, kind: 'agglomerate', range: 4, radius: 2, pull: 2, glyph: '◍', gloss: 'a gravity knot — drag nearby units toward the mark (set up a Blast)' },
  summon:      { label: 'Summon',      cost: 7, kind: 'summon', glyph: '❂', gloss: 'call a maintenance drone to fight beside you' },
  revive:      { label: 'Revive',      cost: 9, kind: 'revive', amount: 0.4, range: 1, glyph: '☩', gloss: 'restart a fallen ally at partial integrity' },
  assist:      { label: 'Assist',      cost: 5, kind: 'assist', range: 2, glyph: '⇄', gloss: 'hand an ally the initiative — they act again this round' },
};
// the temporary unit Summon brings in (faction-less; AI-driven on its owner's team).
export const DRONE = { hp: 12, atk: 6, def: 2, speed: 1, accuracy: 0.85, crit: 0.02, fluxPool: 0, apow: 0, power: 6 };
export const UNIVERSAL = ['strike', 'brace', 'mend', 'overclock', 'harden'];

// ── STATUS EFFECTS ──────────────────────────────────────────────────────────────────────────────
// bleed: HP loss per turn. stun: skip your action. mark: take +amt damage. slow: move range → 1.
export const STATUS = {
  bleed: { glyph: '🩸', gloss: 'losing blood each turn' },
  stun:  { glyph: '✷',  gloss: 'reeling — no action this turn' },
  mark:  { glyph: '◎',  gloss: 'guard opened — takes extra damage' },
  slow:  { glyph: '🐌', gloss: 'pinned — can barely move' },
};

// the skills a unit can actually use = universal base + its faction's kit (deduped, stable order).
export function skillsFor(unit) {
  if (unit.kit) return unit.kit.filter((k) => SKILLS[k]);   // explicit kit (summons) — exactly these, no universal base
  const fac = FACTIONS[unit.faction];
  const kit = fac ? fac.kit : [];
  const seen = new Set(), out = [];
  for (const k of [...UNIVERSAL, ...kit]) if (SKILLS[k] && !seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}
// a unit's actual flux cost for a skill (faction discount applied). Pure.
export const costOf = (unit, skillId) => discountedCost(unit.faction, skillId, SKILLS[skillId]?.cost || 0);

export function makeUnit({ id, name, team, faction, character, combat, x, y, sprite, glyph, accent, summoned = false, ai = null, kit = null, mods = null }) {
  const cm0 = combat || deriveCombat(character || { attrs: {}, power: 10 });
  const st = (mods && mods.stat) || {};      // tech-tree stat deltas (tree.js buildLoadout)
  const cm = { hp: cm0.hp + (st.hp || 0), atk: cm0.atk + (st.atk || 0), def: cm0.def + (st.def || 0), speed: +(cm0.speed + (st.speed || 0)).toFixed(2), accuracy: cm0.accuracy, crit: cm0.crit, fluxPool: cm0.fluxPool + (st.flux || 0), apow: (cm0.apow ?? cm0.atk) + (st.apow || 0), power: cm0.power };
  const fac = FACTIONS[faction];
  return {
    id, name, team, faction: fac ? faction : null, character, sprite, summoned,
    ai, kit, mods,   // per-unit overrides: AI archetype + skill kit (summons) + tech-tree mods (passive deltas read via passiveOf)
    glyph: glyph || (fac ? fac.glyph : (team === 'player' ? '☻' : '☗')),
    accent: accent || (fac ? fac.accent : (team === 'player' ? '#f4bf62' : '#cf3b3b')),
    maxhp: cm.hp, hp: cm.hp, atk: cm.atk, def: cm.def, speed: cm.speed, accuracy: cm.accuracy, crit: cm.crit,
    apow: cm.apow, maxflux: cm.fluxPool, flux: cm.fluxPool, x, y, alive: true,
    moved: false, acted: false, movedThisTurn: false,
    buff: { def: 0, turns: 0, counter: false }, status: {}, extraTurn: false,
  };
}
// a unit's effective faction-passive value for `key` = faction base + tech-tree delta (mods.passive).
function passiveOf(u, key) { return (FACTIONS[u.faction]?.passive?.[key] || 0) + ((u.mods && u.mods.passive && u.mods.passive[key]) || 0); }

// player + optional `allies` (rest of the player party) vs `foes`. Any team size on either side —
// the win check is "a team has no living units", so summon/revive grow/shrink the party mid-battle.
// `det: true` puts the battle in DETERMINISTIC mode — no RNG: every attack lands and deals its
// EXPECTED value (base × P(hit) × (1+P(crit))), variance = 1. This is what the solvability oracle
// (solver.js) searches; normal play leaves det false and keeps the seeded rolls.
export function createBattle({ player, allies = [], foes = [], seed = 1, W = 16, H = 16, maxTurns = 100, det = false, terrain = [] }) {
  const units = [];
  const pcs = [player, ...allies];
  const np = pcs.length;
  pcs.forEach((p, i) => units.push(makeUnit({ ...p, team: 'player', x: p.x ?? (i + 1) * W / (np + 1), y: p.y ?? (H - 1.5) })));
  const n = foes.length;
  foes.forEach((f, i) => units.push(makeUnit({ ...f, team: 'foe', x: f.x ?? (i + 1) * W / (n + 1), y: f.y ?? 1.5 })));
  const order = units.slice().sort((a, b) => (b.speed - a.speed) || (a.team === 'player' ? -1 : 1)).map((u) => u.id);
  const state = { W, H, units, order, idx: 0, turn: 1, maxTurns, nextId: 1, det, terrain, log: [], phase: 'choose', winner: null, timedOut: false, rng: mulberry32(seed >>> 0 || 1) };
  beginTurn(state);
  return state;
}

// total HP fraction held by a team (used to break a timeout).
const teamHpFrac = (s, team) => { let hp = 0, mx = 0; for (const u of s.units) if (u.team === team) { hp += Math.max(0, u.hp); mx += u.maxhp; } return mx ? hp / mx : 0; };

export const unitById = (s, id) => s.units.find((u) => u.id === id);
export const active = (s) => unitById(s, s.order[s.idx]);
export const living = (s) => s.units.filter((u) => u.alive);
export const enemiesOf = (s, u) => s.units.filter((x) => x.alive && x.team !== u.team);
export const alliesOf = (s, u) => s.units.filter((x) => x.alive && x.team === u.team && x !== u);
const inBounds = (s, x, y) => x >= UNIT_R && y >= UNIT_R && x <= s.W - UNIT_R && y <= s.H - UNIT_R;
// would a body centred at (x,y) overlap any other living unit's body?
export const collides = (s, x, y, except) => s.units.some((u) => u.alive && u !== except && dist(u, { x, y }) < 2 * UNIT_R - 1e-6);

// ── TERRAIN — walls (block movement + line-of-sight) and hazards (area effects each turn). ────────
// A feature is a circle: { kind:'wall'|'hazard', x, y, r, effect? }. effect ∈ burn|mire|emp.
const inWall = (s, x, y, pad = UNIT_R) => (s.terrain || []).some((t) => t.kind === 'wall' && dist(t, { x, y }) < t.r + pad);
// distance from point C to segment AB < r  (does the shot graze the circle?)
function segHitsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx - cx, ay + t * dy - cy) < r;
}
// clear line of sight from a to b? — blocked iff a wall sits across the segment.
export function hasLoS(s, a, b) {
  for (const t of (s.terrain || [])) if (t.kind === 'wall' && segHitsCircle(a.x, a.y, b.x, b.y, t.x, t.y, t.r)) return false;
  return true;
}
const hazardsAt = (s, x, y) => (s.terrain || []).filter((t) => t.kind === 'hazard' && dist(t, { x, y }) <= t.r);
// ranged/area verbs need a clear shot; melee + ally-support don't.
const needsLoS = (sk) => (sk.magic || sk.kind === 'agglomerate') && (sk.range || 1) > 1.5;
export function canTarget(s, u, tgt, sk) { return inRange(u, tgt, sk.range || 1) && (!needsLoS(sk) || hasLoS(s, u, tgt)); }

// a legal stand point near (x,y)? (in bounds + no overlap + not inside a wall)
const standable = (s, x, y, except) => inBounds(s, x, y) && !collides(s, x, y, except) && !inWall(s, x, y);

// ── deterministic terrain scatter — N walls + M hazards, keeping the spawn bands clear. ──
export function scatterTerrain(seed, { W = 16, H = 16, walls = 3, hazards = 2 } = {}) {
  const r = mulberry32((seed >>> 0) || 1), out = [];
  const place = (kind, rad, effect) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = 2 + r() * (W - 4), y = 3 + r() * (H - 6);       // keep off the top/bottom spawn bands
      if (out.every((o) => dist(o, { x, y }) > o.r + rad + 1)) { out.push({ kind, x, y, r: rad, ...(effect ? { effect } : {}) }); return; }
    }
  };
  const HZ = ['burn', 'mire', 'emp'];
  for (let i = 0; i < walls; i++) place('wall', 1 + r() * 1.2);
  for (let i = 0; i < hazards; i++) place('hazard', 1.2 + r() * 1.0, HZ[Math.floor(r() * HZ.length)]);
  return out;
}

// move range (a radius now): base from speed, +faction moveBonus (Drift), shrunk to 1 while slowed.
export function moveRange(u) {
  if (u.status.slow?.turns > 0) return 1;
  return clamp(Math.round(1 + u.speed) + passiveOf(u, 'moveBonus'), 2, 6);
}

// can `u` legally stand at (x,y) this move? (within radius R, in bounds, no overlap)
export function canReach(s, u, x, y, R = moveRange(u)) { return dist(u, { x, y }) <= R + 1e-6 && standable(s, x, y, u); }

// step `u` toward (tx,ty), travelling at most R and stopping `stopAt` short. Tries the straight line
// first, then deflected headings (local obstacle avoidance) so units round walls instead of stalling;
// returns whichever reachable point gets CLOSEST to the goal. No RNG → deterministic.
export function moveToward(s, u, tx, ty, R = moveRange(u), stopAt = 0) {
  const d = dist(u, { x: tx, y: ty }); if (d < 1e-6) return { x: u.x, y: u.y };
  const baseAng = Math.atan2(ty - u.y, tx - u.x), travel = Math.min(R, Math.max(0, d - stopAt));
  let best = { x: u.x, y: u.y }, bestD = d;
  for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3]) {        // straight, then deflect around obstacles
    const a = baseAng + off;
    for (let t = travel; t > 0.2; t -= 0.25) {
      const x = u.x + Math.cos(a) * t, y = u.y + Math.sin(a) * t;
      if (standable(s, x, y, u)) { const dd = dist({ x, y }, { x: tx, y: ty }); if (dd < bestD - 1e-6) { bestD = dd; best = { x, y }; } break; }
    }
  }
  return best;
}
// step `u` directly away from (fx,fy), up to R; backs off on collision/bounds.
export function moveAway(s, u, fx, fy, R = moveRange(u)) {
  const d = dist(u, { x: fx, y: fy }) || 1, ux = (u.x - fx) / d, uy = (u.y - fy) / d;
  for (let t = R; t > 0; t -= 0.25) { const x = u.x + ux * t, y = u.y + uy * t; if (standable(s, x, y, u)) return { x, y }; }
  return { x: u.x, y: u.y };
}
// an open point just outside `u`'s body, for Summon placement (sampled ring), or null.
function freeNear(s, u) {
  const r = 2 * UNIT_R + 0.2;
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, x = u.x + Math.cos(a) * r, y = u.y + Math.sin(a) * r; if (standable(s, x, y, u)) return { x, y }; }
  return null;
}

function log(s, msg, kind) { s.log.push({ t: s.turn, msg, kind: kind || 'info' }); if (s.log.length > 80) s.log.shift(); }

export function targetsInRange(s, u, range) { return enemiesOf(s, u).filter((e) => inRange(u, e, range)); }
export function attackable(s, u) { return targetsInRange(s, u, 1); }

// is `u` flanking `tgt`? — true when an ally of u is also within melee of tgt (target is pincered).
export function isFlanking(s, u, tgt) { return alliesOf(s, u).some((a) => inRange(a, tgt, 1)); }

// the legal action surface for the active unit (what the UI offers).
export function legal(s) {
  const u = active(s); if (!u || s.winner) return { move: { range: 0 }, skills: {} };
  const stunned = u.status.stun?.turns > 0;
  const skills = {};
  for (const id of skillsFor(u)) {
    if (u.acted || stunned) { skills[id] = { usable: false, targets: [] }; continue; }
    const sk = SKILLS[id], cost = costOf(u, id);
    if (cost > u.flux) { skills[id] = { usable: false, reason: 'flux', targets: [] }; continue; }
    let targets = [];
    if (sk.kind === 'attack' || sk.kind === 'control' || sk.kind === 'debuff' || sk.kind === 'siphon' || sk.kind === 'blast' || sk.kind === 'agglomerate') {
      targets = enemiesOf(s, u).filter((e) => canTarget(s, u, e, sk)).map((e) => e.id);   // in range + (if ranged) clear LoS
      skills[id] = { usable: targets.length > 0, targets };
    } else if (sk.kind === 'revive') {
      targets = s.units.filter((x) => !x.alive && x.team === u.team && inRange(u, x, sk.range || 1)).map((x) => x.id);  // downed allies
      skills[id] = { usable: targets.length > 0, targets };
    } else if (sk.kind === 'assist') {
      targets = alliesOf(s, u).filter((a) => inRange(u, a, sk.range || 1)).map((a) => a.id);  // living allies
      skills[id] = { usable: targets.length > 0, targets };
    } else if (sk.kind === 'summon') {
      skills[id] = { usable: freeNear(s, u) != null, targets: [] };   // needs an open spot nearby
    } else { skills[id] = { usable: true, targets: [] }; }     // self skills (heal/buff/brace/convert/reposition)
  }
  return { unit: u, move: { range: (u.moved || stunned) ? 0 : moveRange(u) }, skills };
}

// faction berserk multiplier for outgoing damage (Rindwalker: more damage the more hurt it is).
function berserkMult(u) {
  const m = passiveOf(u, 'berserkMax');
  if (!m) return 1;
  const missing = 1 - u.hp / Math.max(1, u.maxhp);
  return 1 + m * missing;
}
function effectiveDef(u) {
  let d = u.def + (u.buff.turns > 0 ? u.buff.def : 0);
  if (!u.movedThisTurn) d += passiveOf(u, 'bracedDefBonus');   // holds station → harder
  return d;
}

function applyStatus(tgt, kind, turns, amt) {
  const cur = tgt.status[kind];
  tgt.status[kind] = { turns: Math.max(turns, cur?.turns || 0), amt: amt ?? cur?.amt };
}

function resolveAttack(s, atk, tgt, skillId, isCounter = false) {
  const sk = SKILLS[skillId] || SKILLS.strike;
  const cost = costOf(atk, skillId);
  if (cost) atk.flux = Math.max(0, atk.flux - cost);
  if (sk.selfHp) { const c = Math.max(1, Math.round(atk.maxhp * sk.selfHp)); atk.hp = Math.max(1, atk.hp - c); }  // gore costs blood (never self-kill)
  // crit: base + Drift hit-and-run bonus when it struck the same turn it moved
  let critChance = atk.crit + (atk.movedThisTurn ? passiveOf(atk, 'hitAndRunCrit') : 0);
  const flank = !isCounter && !sk.magic && inRange(atk, tgt, 1) && isFlanking(s, atk, tgt);   // melee-only pincer
  const acc = Math.min(1, atk.accuracy + (flank ? 0.1 : 0));
  let hit, crit, variance;
  if (s.det) { hit = true; crit = false; variance = 1; }            // deterministic: always lands, mean roll
  else { hit = s.rng() < acc; if (!hit) { log(s, `${atk.name} ${sk.label} — misses ${tgt.name}`, 'miss'); return { hit: false, target: tgt.id }; } crit = s.rng() < critChance; variance = 0.8 + s.rng() * 0.4; }
  let power = (sk.magic ? atk.apow : atk.atk) * (sk.mult || 1) * berserkMult(atk);   // magic scales off apow (anima)
  if (flank) power *= 1.25;                                          // pincered: the flank bonus
  const markBonus = tgt.status.mark?.turns > 0 ? (1 + (tgt.status.mark.amt || 0.25)) : 1;
  let dmg = Math.max(1, Math.round((power - effectiveDef(tgt) * 0.5) * variance * markBonus * (crit ? 2 : 1)));
  if (s.det) dmg = Math.max(1, Math.round(dmg * acc * (1 + critChance)));   // fold P(hit)+E(crit) into expected damage
  tgt.hp = Math.max(0, tgt.hp - dmg);
  if (sk.status) applyStatus(tgt, sk.status, sk.sturns || 2, sk.amt);
  log(s, `${atk.name} ${sk.label}${crit ? ' (crit!)' : ''}${flank ? ' (flank)' : ''} → ${tgt.name} −${dmg}`, crit ? 'crit' : 'hit');
  if (tgt.hp <= 0) { tgt.alive = false; log(s, `${tgt.name} falls.`, 'down'); return { hit: true, crit, dmg, target: tgt.id, flank }; }
  // COUNTER: a braced (or Bulwark) defender adjacent to its attacker answers a non-counter blow.
  if (!isCounter && tgt.buff.counter && tgt.buff.turns > 0 && inRange(atk, tgt, 1) && atk.alive) {
    log(s, `${tgt.name} counters!`, 'info');
    resolveAttack(s, tgt, atk, 'strike', true);
  }
  return { hit: true, crit, dmg, target: tgt.id, flank };
}

// apply one action for the active unit. Returns an event for the UI to animate.
export function act(s, action) {
  const u = active(s); if (!u || s.winner) return { type: 'noop' };
  if (u.status.stun?.turns > 0 && action.type !== 'end') return { type: 'illegal', reason: 'stunned' };

  if (action.type === 'move' || action.type === 'flit-move') {
    const isFlit = action.type === 'flit-move';
    if (!isFlit && u.moved) return { type: 'illegal' };
    const R = isFlit ? SKILLS.flit.extra : moveRange(u);
    if (!canReach(s, u, action.x, action.y, R)) return { type: 'illegal' };
    const from = { x: u.x, y: u.y }; u.x = action.x; u.y = action.y; u.movedThisTurn = true;
    if (!isFlit) u.moved = true;
    return { type: 'move', unit: u.id, from, to: { x: u.x, y: u.y } };
  }

  if (action.type === 'skill') {
    const sk = SKILLS[action.skillId]; if (!sk || u.acted) return { type: 'illegal' };
    const cost = costOf(u, action.skillId); if (cost > u.flux) return { type: 'illegal', reason: 'flux' };

    // pre-validate targeted skills up front so an illegal target never burns the turn (consume is below).
    const TARGETED = ['attack', 'control', 'debuff', 'siphon', 'blast', 'agglomerate', 'revive', 'assist'];
    if (TARGETED.includes(sk.kind)) {
      const t = unitById(s, action.targetId);
      if (!t || !inRange(u, t, sk.range || 1)) return { type: 'illegal' };
      if (needsLoS(sk) && !hasLoS(s, u, t)) return { type: 'illegal', reason: 'los' };   // a wall blocks the shot
      if (sk.kind === 'revive') { if (t.alive || t.team !== u.team) return { type: 'illegal' }; }
      else if (sk.kind === 'assist') { if (!t.alive || t.team !== u.team || t === u) return { type: 'illegal' }; }
      else { if (!t.alive || t.team === u.team) return { type: 'illegal' }; }   // offensive: a living enemy
    }
    if (sk.kind === 'summon' && !freeNear(s, u)) return { type: 'illegal' };

    if (sk.kind === 'attack') {
      const tgt = unitById(s, action.targetId);
      if (!tgt || !tgt.alive || !inRange(u, tgt, sk.range || 1)) return { type: 'illegal' };
      u.acted = true; const r = resolveAttack(s, u, tgt, action.skillId); checkEnd(s);
      return { type: 'attack', unit: u.id, skill: action.skillId, ...r };
    }
    if (sk.kind === 'reposition') {              // flit: spend flux, then this turn you may move again
      u.flux -= cost; u.moved = false;           // free up the move slot; flit-move uses the extra range
      log(s, `${u.name} ${sk.label}`, 'info');
      return { type: 'reposition', unit: u.id, extra: sk.extra };
    }
    u.acted = true; u.flux -= cost;
    if (sk.kind === 'heal') { const heal = Math.round(u.maxhp * sk.amount); u.hp = Math.min(u.maxhp, u.hp + heal); log(s, `${u.name} ${sk.label} +${heal}`, 'heal'); return { type: 'heal', unit: u.id, amount: heal }; }
    if (sk.kind === 'buff')  { u.buff = { def: sk.def, turns: sk.turns + 1, counter: !!sk.counter }; log(s, `${u.name} ${sk.label} +${sk.def} Def`, 'buff'); return { type: 'buff', unit: u.id }; }
    if (sk.kind === 'brace') { u.buff = { def: sk.def, turns: sk.turns + 1, counter: true }; log(s, `${u.name} braces`, 'buff'); return { type: 'brace', unit: u.id }; }
    if (sk.kind === 'convert') { const gain = sk.gainFlux; const c = Math.max(1, Math.round(u.maxhp * sk.selfHp)); u.hp = Math.max(1, u.hp - c); u.flux = Math.min(u.maxflux, u.flux + gain); log(s, `${u.name} ${sk.label}: −${c} HP → +${gain} Flux`, 'info'); return { type: 'convert', unit: u.id, hp: c, flux: gain }; }
    if (sk.kind === 'control' || sk.kind === 'debuff') {
      const tgt = unitById(s, action.targetId);
      if (!tgt || !tgt.alive || !inRange(u, tgt, sk.range || 1)) return { type: 'illegal' };
      applyStatus(tgt, sk.status, sk.turns || 2, sk.amt);
      log(s, `${u.name} ${sk.label} → ${tgt.name} (${sk.status})`, 'info');
      return { type: sk.kind, unit: u.id, target: tgt.id, status: sk.status };
    }
    if (sk.kind === 'siphon') {
      const tgt = unitById(s, action.targetId);
      const drained = Math.min(sk.amount, tgt.flux); tgt.flux -= drained; u.flux = Math.min(u.maxflux, u.flux + drained);
      log(s, `${u.name} ${sk.label} → ${tgt.name} −${drained} Flux`, 'info');
      return { type: 'siphon', unit: u.id, target: tgt.id, drained };
    }
    // ── multi-agent & range verbs ──
    if (sk.kind === 'blast') {                 // area magic: every enemy within radius of the marked foe
      const ctr = unitById(s, action.targetId);
      const hits = enemiesOf(s, u).filter((e) => inRange(e, ctr, sk.radius || 1));
      const results = hits.map((e) => dealMagic(s, u, e, sk.mult || 1, sk.label));
      log(s, `${u.name} ${sk.label} — ${results.filter((r) => r.hit).length}/${hits.length} caught`, 'info');
      checkEnd(s);
      return { type: 'blast', unit: u.id, center: { x: ctr.x, y: ctr.y }, results };
    }
    if (sk.kind === 'agglomerate') {           // gravity knot: drag nearby units toward the marked point
      const ctr = unitById(s, action.targetId), moved = [];
      for (const o of s.units) {
        if (!o.alive || o === u || dist(o, ctr) < 1e-6) continue;
        if (dist(o, ctr) > (sk.radius || 2)) continue;
        const p = moveToward(s, o, ctr.x, ctr.y, sk.pull || 1, 2 * UNIT_R);   // pulled in, stops at body contact
        if (p.x !== o.x || p.y !== o.y) { o.x = p.x; o.y = p.y; moved.push(o.id); }
      }
      log(s, `${u.name} ${sk.label} — drags ${moved.length} toward the knot`, 'info');
      return { type: 'agglomerate', unit: u.id, center: { x: ctr.x, y: ctr.y }, moved };
    }
    if (sk.kind === 'summon') {                 // bring a faction-appropriate construct onto the board
      const spec = FACTIONS[u.faction]?.summon || { name: 'Drone', glyph: '◆', ai: 'aggro', kit: ['strike'], combat: { ...DRONE } };
      const spot = freeNear(s, u) || { x: u.x, y: u.y }, id = `${u.id}~d${s.nextId++}`;
      const drone = makeUnit({ id, name: `${u.name}'s ${spec.name}`, team: u.team, combat: { ...spec.combat }, x: spot.x, y: spot.y, glyph: spec.glyph, accent: u.accent, summoned: true, ai: spec.ai, kit: spec.kit });
      s.units.push(drone); s.order.push(id);   // acts when the round wraps to its new slot
      log(s, `${u.name} summons a ${spec.name}`, 'info');
      return { type: 'summon', unit: u.id, droneId: id };
    }
    if (sk.kind === 'revive') {                 // restart a downed ally at partial integrity
      const t = unitById(s, action.targetId);
      t.alive = true; t.hp = Math.max(1, Math.round(t.maxhp * sk.amount)); t.status = {}; t.buff = { def: 0, turns: 0, counter: false };
      log(s, `${u.name} ${sk.label}s ${t.name} (+${t.hp})`, 'heal');
      return { type: 'revive', unit: u.id, target: t.id };
    }
    if (sk.kind === 'assist') {                 // hand an ally an extra activation this round
      const t = unitById(s, action.targetId);
      s.order.splice(s.idx + 1, 0, t.id); t.extraTurn = true;
      log(s, `${u.name} ${sk.label}s ${t.name} — extra turn`, 'info');
      return { type: 'assist', unit: u.id, target: t.id };
    }
  }
  if (action.type === 'end') return endTurn(s);
  return { type: 'noop' };
}

// per-target magic damage for AoE (Blast) — no flux deduction (the caster paid once) and no counter.
function dealMagic(s, atk, tgt, mult, label = 'Blast') {
  let crit, variance;
  if (s.det) { crit = false; variance = 1; }
  else { if (s.rng() >= atk.accuracy) { log(s, `${atk.name} ${label} — misses ${tgt.name}`, 'miss'); return { hit: false, target: tgt.id }; } crit = s.rng() < atk.crit; variance = 0.8 + s.rng() * 0.4; }
  const power = atk.apow * mult * berserkMult(atk);
  const markBonus = tgt.status.mark?.turns > 0 ? (1 + (tgt.status.mark.amt || 0.25)) : 1;
  let dmg = Math.max(1, Math.round((power - effectiveDef(tgt) * 0.5) * variance * markBonus * (crit ? 2 : 1)));
  if (s.det) dmg = Math.max(1, Math.round(dmg * Math.min(1, atk.accuracy) * (1 + atk.crit)));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  log(s, `${atk.name} ${label}${crit ? ' (crit!)' : ''} → ${tgt.name} −${dmg}`, crit ? 'crit' : 'hit');
  if (tgt.hp <= 0) { tgt.alive = false; log(s, `${tgt.name} falls.`, 'down'); }
  return { hit: true, crit, dmg, target: tgt.id };
}

function checkEnd(s) {
  const foes = s.units.filter((u) => u.team === 'foe' && u.alive), pcs = s.units.filter((u) => u.team === 'player' && u.alive);
  if (!foes.length) { s.winner = 'player'; s.phase = 'won'; log(s, 'The arena is yours.', 'win'); }
  else if (!pcs.length) { s.winner = 'foe'; s.phase = 'lost'; log(s, 'You fall in the arena.', 'lose'); }
}

// start-of-turn upkeep: faction regen, status ticks (bleed damage), then decrement durations.
function beginTurn(s) {
  const u = active(s);
  if (!u) return;
  u.moved = false; u.acted = false; u.movedThisTurn = false;
  if (u.buff.turns > 0) u.buff.turns--;
  const fr = passiveOf(u, 'fluxRegen'); if (fr) u.flux = Math.min(u.maxflux, u.flux + fr);
  const rp = passiveOf(u, 'regenPerTurn'); if (rp && u.hp > 0) u.hp = Math.min(u.maxhp, u.hp + Math.round(u.maxhp * rp));
  // hazard fields: standing in one at turn start bites — burn (HP), mire (slow), emp (flux drain).
  for (const hz of hazardsAt(s, u.x, u.y)) {
    if (hz.effect === 'burn') { const b = Math.max(1, Math.round(u.maxhp * 0.07)); u.hp = Math.max(0, u.hp - b); log(s, `${u.name} sears in the field −${b}`, 'hit'); if (u.hp <= 0) { u.alive = false; log(s, `${u.name} falls.`, 'down'); checkEnd(s); } }
    else if (hz.effect === 'mire') { applyStatus(u, 'slow', 1); log(s, `${u.name} is mired`, 'info'); }
    else if (hz.effect === 'emp') { const d = Math.min(4, u.flux); if (d) { u.flux -= d; log(s, `${u.name} bleeds ${d} Flux to the field`, 'info'); } }
  }
  if (u.status.bleed?.turns > 0) {
    const b = Math.max(1, Math.round(u.maxhp * 0.05)); u.hp = Math.max(0, u.hp - b);
    log(s, `${u.name} bleeds −${b}`, 'hit');
    if (u.hp <= 0) { u.alive = false; log(s, `${u.name} bleeds out.`, 'down'); checkEnd(s); }
  }
  for (const k of Object.keys(u.status)) { if (u.status[k].turns > 0) u.status[k].turns--; if (u.status[k].turns <= 0) delete u.status[k]; }
  s.phase = s.winner ? s.phase : (u.team === 'player' ? 'choose' : 'enemy');
}
// a battle that runs past maxTurns is resolved by held HP fraction (a draw if within 2%). Keeps the
// invariant "every battle terminates" — and the balance harness reads a high timeout/draw rate as a
// real signal that a matchup is a war of attrition neither side can close.
function resolveTimeout(s) {
  const p = teamHpFrac(s, 'player'), f = teamHpFrac(s, 'foe');
  s.timedOut = true;
  s.winner = Math.abs(p - f) < 0.02 ? 'draw' : (p > f ? 'player' : 'foe');
  s.phase = s.winner === 'player' ? 'won' : s.winner === 'foe' ? 'lost' : 'draw';
  log(s, s.winner === 'draw' ? 'Time. Neither side breaks.' : `Time. ${s.winner === 'player' ? 'You hold' : 'The foe holds'} the field.`, 'info');
}
export function endTurn(s) {
  if (s.winner) return { type: 'over', winner: s.winner };
  let guard = 0;
  do { s.idx++; if (s.idx >= s.order.length) { s.idx = 0; s.turn++; } } while (!active(s).alive && guard++ < s.order.length * 2);
  if (s.turn > s.maxTurns) { resolveTimeout(s); return { type: 'over', winner: s.winner, timedOut: true }; }
  beginTurn(s);
  return { type: 'turn', active: s.order[s.idx], phase: s.phase };
}

// ── ENEMY AI — faction-flavoured archetypes (factions.js `ai`). Returns a sequence of actions ──────
// the caller applies one at a time (so a UI can animate each), ending in 'end'.
export function aiPlan(s) {
  // plans for WHOEVER is active (either team) so the balance harness can drive AI-vs-AI; a UI simply
  // only calls this on the enemy's turn. `target`/`foes` are enemiesOf(active), so it works both ways.
  const u = active(s); if (!u || s.winner) return [{ type: 'end' }];
  if (u.status.stun?.turns > 0) return [{ type: 'end' }];
  const arche = u.ai || FACTIONS[u.faction]?.ai || 'aggro';
  const foes = enemiesOf(s, u).slice().sort((a, b) => dist(u, a) - dist(u, b));
  const target = foes[0];
  if (!target) return [{ type: 'end' }];
  const seq = [];
  const hurt = u.hp / u.maxhp;
  const canUse = (id) => skillsFor(u).includes(id) && costOf(u, id) <= u.flux;
  // step toward the target, stopping `stopAt` short (so the unit lands inside attack range, not on top).
  const closeTo = (stopAt) => { const p = moveToward(s, u, target.x, target.y, moveRange(u), stopAt); if (p.x !== u.x || p.y !== u.y) seq.push({ type: 'move', x: p.x, y: p.y }); };

  if (arche === 'turtle') {
    // hold near where you are; mend when hurt; only strike what's already in reach.
    if (hurt < 0.5 && canUse('mend')) seq.push({ type: 'skill', skillId: 'mend' });
    else if (!inRange(u, target, 1)) closeTo(2 * UNIT_R);
    if (!seq.some((a) => a.type === 'skill')) {
      if (inRange(u, target, 1)) seq.push({ type: '__attack_adjacent', targetId: target.id });
      else if (canUse('bulwark')) seq.push({ type: 'skill', skillId: 'bulwark' });
      else seq.push({ type: 'skill', skillId: 'brace' });
    }
  } else if (arche === 'kite') {
    // the ranged kite: close only to LANCE range, lance from afar, then flit back out of reach. This is
    // Drift's real win condition vs melee aggro — it never enters the strike zone. (Falls back to a melee
    // dart-and-flit if it can't afford a lance.) NB: a unit gets ONE action/turn; flit reopens only the
    // MOVE slot, so lance-then-flit is legal.
    if (canUse('lance')) {
      if (!inRange(u, target, SKILLS.lance.range)) closeTo(SKILLS.lance.range - REACH_PAD);
      seq.push({ type: '__lance', targetId: target.id });
    } else {
      if (!inRange(u, target, 1)) closeTo(2 * UNIT_R);
      seq.push({ type: '__attack_adjacent', targetId: target.id });
    }
    if (canUse('flit')) seq.push({ type: '__flit_away', fromId: target.id });
  } else { // aggro (rindwalker / default)
    if (!inRange(u, target, 1)) closeTo(2 * UNIT_R);
    if (hurt < 0.35 && canUse('scavenge')) seq.push({ type: 'skill', skillId: 'scavenge' });
    else seq.push({ type: '__attack_adjacent', targetId: target.id });
  }
  seq.push({ type: 'end' });
  return seq;
}

// resolve a planned step (handles deferred steps that depend on post-move position).
export function aiStep(s, step) {
  const u = active(s);
  if (step.type === '__attack_adjacent') {
    const tgt = unitById(s, step.targetId);
    if (u && tgt && tgt.alive && inRange(u, tgt, 1) && !u.acted) {
      // pick the best affordable attack: gore (rindwalker) > overclock burst > strike, gated on flux/kit.
      // Drift gets overclock cheap, so a kite that can afford it leads with the burst instead of a poke.
      let id = 'strike';
      if (skillsFor(u).includes('gore')) id = 'gore';
      else if (skillsFor(u).includes('overclock') && costOf(u, 'overclock') <= u.flux) id = 'overclock';
      return act(s, { type: 'skill', skillId: id, targetId: tgt.id });
    }
    return { type: 'noop' };
  }
  if (step.type === '__feint_adjacent') {
    const tgt = unitById(s, step.targetId);
    if (u && tgt && tgt.alive && inRange(u, tgt, 1) && !u.acted && costOf(u, 'feint') <= u.flux) return act(s, { type: 'skill', skillId: 'feint', targetId: tgt.id });
    return { type: 'noop' };
  }
  if (step.type === '__lance') {
    const tgt = unitById(s, step.targetId);
    if (u && tgt && tgt.alive && !u.acted && inRange(u, tgt, SKILLS.lance.range) && hasLoS(s, u, tgt) && costOf(u, 'lance') <= u.flux) return act(s, { type: 'skill', skillId: 'lance', targetId: tgt.id });
    if (u && tgt && tgt.alive && !u.acted && inRange(u, tgt, 1)) return act(s, { type: 'skill', skillId: 'strike', targetId: tgt.id });  // fallback (melee ignores LoS)
    return { type: 'noop' };
  }
  if (step.type === '__flit_away') {
    // flit is a REPOSITION, not an action — it's legal AFTER the strike (it reopens only the move slot),
    // so do NOT gate it on u.acted, only on flux.
    if (!u || costOf(u, 'flit') > u.flux) return { type: 'noop' };
    const tgt = unitById(s, step.fromId);
    act(s, { type: 'skill', skillId: 'flit' });
    if (tgt) { const p = moveAway(s, u, tgt.x, tgt.y, SKILLS.flit.extra); if (p.x !== u.x || p.y !== u.y) return act(s, { type: 'flit-move', x: p.x, y: p.y }); }
    return { type: 'noop' };
  }
  return act(s, step);
}

// run a full turn for the active unit headlessly (used by the balance harness + as a UI convenience).
// aiPlan already terminates in {type:'end'}, so the loop ends the turn itself — no trailing endTurn
// (a second endTurn would skip the next unit if it were also AI-driven).
export function runAiTurn(s) { const evs = []; for (const step of aiPlan(s)) { if (s.winner) break; evs.push(aiStep(s, step)); } return evs; }   // returns the resolved events (for a UI's FX); callers may ignore it

export default {
  createBattle, legal, act, endTurn, aiPlan, aiStep, runAiTurn,
  active, unitById, attackable, targetsInRange, isFlanking,
  dist, inRange, collides, canReach, moveToward, moveAway, UNIT_R,
  hasLoS, canTarget, scatterTerrain,
  skillsFor, costOf, moveRange, SKILLS, UNIVERSAL, STATUS, makeUnit,
};
