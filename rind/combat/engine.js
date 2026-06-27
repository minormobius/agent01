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
//   • FLANKING         — a strike lands harder when an ally is also adjacent to the target.
//
// Pure + seeded: a battle is fully determined by (player, foes, seed), so it is reproducible and
// node-testable, and the balance harness can run thousands headlessly. Zero-dep beyond stats/factions.

import { deriveCombat } from './stats.js';
import { FACTIONS, discountedCost } from './factions.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── SKILLS ────────────────────────────────────────────────────────────────────────────────────
// `strike` is the free universal melee. The rest are flux-fuelled; factions.js says who gets which
// (kit) and at what discount. `kind` is the verb family the resolver switches on. `range` is Chebyshev
// reach (default 1 = melee/adjacent). Costs are BEFORE the faction discount (discountedCost applies it).
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
};
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
  const fac = FACTIONS[unit.faction];
  const kit = fac ? fac.kit : [];
  const seen = new Set(), out = [];
  for (const k of [...UNIVERSAL, ...kit]) if (SKILLS[k] && !seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}
// a unit's actual flux cost for a skill (faction discount applied). Pure.
export const costOf = (unit, skillId) => discountedCost(unit.faction, skillId, SKILLS[skillId]?.cost || 0);

export function makeUnit({ id, name, team, faction, character, combat, x, y, sprite, glyph, accent }) {
  const cm = combat || deriveCombat(character || { attrs: {}, power: 10 });
  const fac = FACTIONS[faction];
  return {
    id, name, team, faction: fac ? faction : null, character, sprite,
    glyph: glyph || (fac ? fac.glyph : (team === 'player' ? '☻' : '☗')),
    accent: accent || (fac ? fac.accent : (team === 'player' ? '#f4bf62' : '#cf3b3b')),
    maxhp: cm.hp, hp: cm.hp, atk: cm.atk, def: cm.def, speed: cm.speed, accuracy: cm.accuracy, crit: cm.crit,
    maxflux: cm.fluxPool, flux: cm.fluxPool, x, y, alive: true,
    moved: false, acted: false, movedThisTurn: false,
    buff: { def: 0, turns: 0, counter: false }, status: {},
  };
}

export function createBattle({ player, foes = [], seed = 1, W = 9, H = 9, maxTurns = 100 }) {
  const units = [];
  units.push(makeUnit({ ...player, team: 'player', x: player.x ?? (W >> 1), y: player.y ?? (H - 1) }));
  const n = foes.length;
  foes.forEach((f, i) => units.push(makeUnit({ ...f, team: 'foe', x: f.x ?? Math.round((i + 1) * W / (n + 1)), y: f.y ?? 0 })));
  const order = units.slice().sort((a, b) => (b.speed - a.speed) || (a.team === 'player' ? -1 : 1)).map((u) => u.id);
  const state = { W, H, units, order, idx: 0, turn: 1, maxTurns, log: [], phase: 'choose', winner: null, timedOut: false, rng: mulberry32(seed >>> 0 || 1) };
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
export const occupied = (s, x, y, except) => s.units.some((u) => u.alive && u !== except && u.x === x && u.y === y);
const inBounds = (s, x, y) => x >= 0 && y >= 0 && x < s.W && y < s.H;

// move range: base from speed, +faction moveBonus (Drift), −to 1 while slowed.
export function moveRange(u) {
  if (u.status.slow?.turns > 0) return 1;
  const fac = FACTIONS[u.faction];
  const bonus = fac?.passive?.moveBonus || 0;
  return clamp(Math.round(1 + u.speed) + bonus, 2, 5);
}

function log(s, msg, kind) { s.log.push({ t: s.turn, msg, kind: kind || 'info' }); if (s.log.length > 80) s.log.shift(); }

// reachable tiles within a range (BFS, 8-dir, blocked by units). `R` overrides moveRange (for flit).
export function reachable(s, u, R = moveRange(u)) {
  const out = [], seen = new Set([u.x + ',' + u.y]), q = [{ x: u.x, y: u.y, d: 0 }];
  while (q.length) {
    const c = q.shift();
    if (c.d >= R) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue; const nx = c.x + dx, ny = c.y + dy, k = nx + ',' + ny;
      if (!inBounds(s, nx, ny) || seen.has(k) || occupied(s, nx, ny, u)) continue;
      seen.add(k); out.push({ x: nx, y: ny }); q.push({ x: nx, y: ny, d: c.d + 1 });
    }
  }
  return out;
}
export function targetsInRange(s, u, range) { return enemiesOf(s, u).filter((e) => cheb(u, e) <= range); }
export function attackable(s, u) { return targetsInRange(s, u, 1); }

// is `u` flanking `tgt`? — true when an ally of u is also adjacent to tgt (target is pincered).
export function isFlanking(s, u, tgt) { return alliesOf(s, u).some((a) => cheb(a, tgt) <= 1); }

// the legal action surface for the active unit (what the UI offers).
export function legal(s) {
  const u = active(s); if (!u || s.winner) return { move: [], skills: [] };
  const stunned = u.status.stun?.turns > 0;
  const skills = {};
  for (const id of skillsFor(u)) {
    if (u.acted || stunned) { skills[id] = { usable: false, targets: [] }; continue; }
    const sk = SKILLS[id], cost = costOf(u, id);
    if (cost > u.flux) { skills[id] = { usable: false, reason: 'flux', targets: [] }; continue; }
    let targets = [];
    if (sk.kind === 'attack' || sk.kind === 'control' || sk.kind === 'debuff' || sk.kind === 'siphon') {
      targets = targetsInRange(s, u, sk.range || 1).map((e) => e.id);
      skills[id] = { usable: targets.length > 0, targets };
    } else { skills[id] = { usable: true, targets: [] }; }     // self skills (heal/buff/brace/convert/reposition)
  }
  return { unit: u, move: (u.moved || stunned) ? [] : reachable(s, u), skills };
}

// faction berserk multiplier for outgoing damage (Rindwalker: more damage the more hurt it is).
function berserkMult(u) {
  const m = FACTIONS[u.faction]?.passive?.berserkMax;
  if (!m) return 1;
  const missing = 1 - u.hp / Math.max(1, u.maxhp);
  return 1 + m * missing;
}
function effectiveDef(u) {
  const fac = FACTIONS[u.faction];
  let d = u.def + (u.buff.turns > 0 ? u.buff.def : 0);
  if (fac?.passive?.bracedDefBonus && !u.movedThisTurn) d += fac.passive.bracedDefBonus;   // holds station → harder
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
  let critChance = atk.crit + ((FACTIONS[atk.faction]?.passive?.hitAndRunCrit && atk.movedThisTurn) ? FACTIONS[atk.faction].passive.hitAndRunCrit : 0);
  const flank = !isCounter && isFlanking(s, atk, tgt);
  const acc = atk.accuracy + (flank ? 0.1 : 0);
  const hit = s.rng() < acc;
  if (!hit) { log(s, `${atk.name} ${sk.label} — misses ${tgt.name}`, 'miss'); return { hit: false, target: tgt.id }; }
  const crit = s.rng() < critChance;
  const variance = 0.8 + s.rng() * 0.4;
  let power = atk.atk * (sk.mult || 1) * berserkMult(atk);
  if (flank) power *= 1.25;                                          // pincered: the flank bonus
  const markBonus = tgt.status.mark?.turns > 0 ? (1 + (tgt.status.mark.amt || 0.25)) : 1;
  let dmg = Math.max(1, Math.round((power - effectiveDef(tgt) * 0.5) * variance * markBonus * (crit ? 2 : 1)));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  if (sk.status) applyStatus(tgt, sk.status, sk.sturns || 2, sk.amt);
  log(s, `${atk.name} ${sk.label}${crit ? ' (crit!)' : ''}${flank ? ' (flank)' : ''} → ${tgt.name} −${dmg}`, crit ? 'crit' : 'hit');
  if (tgt.hp <= 0) { tgt.alive = false; log(s, `${tgt.name} falls.`, 'down'); return { hit: true, crit, dmg, target: tgt.id, flank }; }
  // COUNTER: a braced (or Bulwark) defender adjacent to its attacker answers a non-counter blow.
  if (!isCounter && tgt.buff.counter && tgt.buff.turns > 0 && cheb(atk, tgt) <= 1 && atk.alive) {
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
    if (!reachable(s, u, R).some((t) => t.x === action.x && t.y === action.y)) return { type: 'illegal' };
    const from = { x: u.x, y: u.y }; u.x = action.x; u.y = action.y; u.movedThisTurn = true;
    if (!isFlit) u.moved = true;
    return { type: 'move', unit: u.id, from, to: { x: u.x, y: u.y } };
  }

  if (action.type === 'skill') {
    const sk = SKILLS[action.skillId]; if (!sk || u.acted) return { type: 'illegal' };
    const cost = costOf(u, action.skillId); if (cost > u.flux) return { type: 'illegal', reason: 'flux' };

    if (sk.kind === 'attack') {
      const tgt = unitById(s, action.targetId);
      if (!tgt || !tgt.alive || cheb(u, tgt) > (sk.range || 1)) return { type: 'illegal' };
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
      if (!tgt || !tgt.alive || cheb(u, tgt) > (sk.range || 1)) return { type: 'illegal' };
      applyStatus(tgt, sk.status, sk.turns || 2, sk.amt);
      log(s, `${u.name} ${sk.label} → ${tgt.name} (${sk.status})`, 'info');
      return { type: sk.kind, unit: u.id, target: tgt.id, status: sk.status };
    }
    if (sk.kind === 'siphon') {
      const tgt = unitById(s, action.targetId);
      if (!tgt || !tgt.alive || cheb(u, tgt) > (sk.range || 1)) return { type: 'illegal' };
      const drained = Math.min(sk.amount, tgt.flux); tgt.flux -= drained; u.flux = Math.min(u.maxflux, u.flux + drained);
      log(s, `${u.name} ${sk.label} → ${tgt.name} −${drained} Flux`, 'info');
      return { type: 'siphon', unit: u.id, target: tgt.id, drained };
    }
  }
  if (action.type === 'end') return endTurn(s);
  return { type: 'noop' };
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
  const fac = FACTIONS[u.faction];
  if (fac?.passive?.fluxRegen) u.flux = Math.min(u.maxflux, u.flux + fac.passive.fluxRegen);
  if (fac?.passive?.regenPerTurn && u.hp > 0) u.hp = Math.min(u.maxhp, u.hp + Math.round(u.maxhp * fac.passive.regenPerTurn));
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
  const arche = FACTIONS[u.faction]?.ai || 'aggro';
  const foes = enemiesOf(s, u).slice().sort((a, b) => cheb(u, a) - cheb(u, b));
  const target = foes[0];
  if (!target) return [{ type: 'end' }];
  const seq = [];
  const hurt = u.hp / u.maxhp;
  const canUse = (id) => skillsFor(u).includes(id) && costOf(u, id) <= u.flux;
  const stepToward = (tx, ty, R) => { const tiles = reachable(s, u, R); let best = null, bd = cheb(u, { x: tx, y: ty }); for (const t of tiles) { const d = Math.max(Math.abs(t.x - tx), Math.abs(t.y - ty)); if (d < bd) { bd = d; best = t; } } return best; };

  if (arche === 'turtle') {
    // hold near where you are; brace; mend when hurt; only strike what's already adjacent.
    if (hurt < 0.5 && canUse('mend')) seq.push({ type: 'skill', skillId: 'mend' });
    else if (cheb(u, target) > 1) { const b = stepToward(target.x, target.y, moveRange(u)); if (b) seq.push({ type: 'move', x: b.x, y: b.y }); }
    if (!seq.some((a) => a.type === 'skill')) {
      if (cheb(u, target) <= 1) seq.push({ type: '__attack_adjacent', targetId: target.id });
      else if (canUse('bulwark')) seq.push({ type: 'skill', skillId: 'bulwark' });
      else seq.push({ type: 'skill', skillId: 'brace' });
    }
  } else if (arche === 'kite') {
    // dart in, strike (banking the hit-and-run crit), then flit back out of reach. NB: a unit gets ONE
    // action/turn — feint would eat it and leave no strike, so the kite leads with the strike and uses
    // flit (which reopens only the MOVE slot, not the action) to slip away after.
    if (cheb(u, target) > 1) { const b = stepToward(target.x, target.y, moveRange(u)); if (b) seq.push({ type: 'move', x: b.x, y: b.y }); }
    seq.push({ type: '__attack_adjacent', targetId: target.id });
    if (canUse('flit')) seq.push({ type: '__flit_away', fromId: target.id });
  } else { // aggro (rindwalker / default)
    if (cheb(u, target) > 1) { const b = stepToward(target.x, target.y, moveRange(u)); if (b) seq.push({ type: 'move', x: b.x, y: b.y }); }
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
    if (u && tgt && tgt.alive && cheb(u, tgt) <= 1 && !u.acted) {
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
    if (u && tgt && tgt.alive && cheb(u, tgt) <= 1 && !u.acted && costOf(u, 'feint') <= u.flux) return act(s, { type: 'skill', skillId: 'feint', targetId: tgt.id });
    return { type: 'noop' };
  }
  if (step.type === '__flit_away') {
    // flit is a REPOSITION, not an action — it's legal AFTER the strike (it reopens only the move slot),
    // so do NOT gate it on u.acted, only on flux.
    if (!u || costOf(u, 'flit') > u.flux) return { type: 'noop' };
    const tgt = unitById(s, step.fromId);
    act(s, { type: 'skill', skillId: 'flit' });
    // move to the reachable tile (flit range) farthest from the target
    const tiles = reachable(s, u, SKILLS.flit.extra); let best = null, bd = -1;
    for (const t of tiles) { const d = tgt ? cheb(t, tgt) : 0; if (d > bd) { bd = d; best = t; } }
    if (best) return act(s, { type: 'flit-move', x: best.x, y: best.y });
    return { type: 'noop' };
  }
  return act(s, step);
}

// run a full turn for the active unit headlessly (used by the balance harness + as a UI convenience).
// aiPlan already terminates in {type:'end'}, so the loop ends the turn itself — no trailing endTurn
// (a second endTurn would skip the next unit if it were also AI-driven).
export function runAiTurn(s) { for (const step of aiPlan(s)) { if (s.winner) break; aiStep(s, step); } }

export default {
  createBattle, legal, act, endTurn, aiPlan, aiStep, runAiTurn,
  active, unitById, reachable, attackable, targetsInRange, isFlanking,
  skillsFor, costOf, moveRange, SKILLS, UNIVERSAL, STATUS, makeUnit,
};
