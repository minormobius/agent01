// arena/engine.js — the turn-based COMBAT engine. Pure + seeded (so a battle is reproducible and
// node-testable); the page is just a renderer + tap-input over this state. Combatants are built from
// the FLESH·CHASSIS·ANIMA stat spine (deriveCombat) plus an equipped weapon/armour. A turn = an
// optional MOVE + an optional ACTION (strike or a technomagic skill drawn from stats.js CONVERSIONS),
// then end. Basic now; baroque later. 8-direction board, Chebyshev distance — keeps the tap-to-walk feel.

import { deriveCombat, CONVERSIONS } from '../stats.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── SKILLS — basic moves. `strike` is the free melee attack; the rest are flux-fuelled technomagic
// (named from the CONVERSIONS): overclock = a power strike, mend = self-repair, harden = a guard buff.
export const SKILLS = {
  strike:    { label: 'Strike',    cost: 0, kind: 'attack', mult: 1.0, glyph: '⚔', gloss: 'a plain blow with what you hold' },
  overclock: { label: 'Overclock', cost: 5, kind: 'attack', mult: 1.7, glyph: '⚙', gloss: 'burn Flux to drive the frame past spec — a heavy strike' },
  mend:      { label: 'Mend',      cost: 6, kind: 'heal',   amount: 0.22, glyph: '✚', gloss: 'route the core into the meat — close your wounds' },
  harden:    { label: 'Harden',    cost: 4, kind: 'buff',   def: 4, turns: 1, glyph: '⛨', gloss: 'set your will into the plating — +Def for a round' },
};
export const SKILL_ORDER = ['strike', 'overclock', 'mend', 'harden'];

export function makeUnit({ id, name, team, character, combat, x, y, sprite, glyph, accent }) {
  const cm = combat || deriveCombat(character || { attrs: {}, power: 10 });
  return {
    id, name, team, character, sprite, glyph: glyph || (team === 'player' ? '☻' : '☗'), accent: accent || (team === 'player' ? '#f4bf62' : '#cf3b3b'),
    maxhp: cm.hp, hp: cm.hp, atk: cm.atk, def: cm.def, speed: cm.speed, accuracy: cm.accuracy, crit: cm.crit,
    maxflux: cm.fluxPool, flux: cm.fluxPool, x, y, alive: true,
    moved: false, acted: false, buff: { def: 0, turns: 0 },
  };
}

export function createBattle({ player, foes = [], seed = 1, W = 9, H = 9 }) {
  const units = [];
  units.push(makeUnit({ ...player, team: 'player', x: player.x ?? (W >> 1), y: player.y ?? (H - 1) }));
  const n = foes.length;
  foes.forEach((f, i) => units.push(makeUnit({ ...f, team: 'foe', x: f.x ?? Math.round((i + 1) * W / (n + 1)), y: f.y ?? 0 })));
  // initiative: fastest first, player wins ties
  const order = units.slice().sort((a, b) => (b.speed - a.speed) || (a.team === 'player' ? -1 : 1)).map((u) => u.id);
  const state = { W, H, units, order, idx: 0, turn: 1, log: [], phase: 'choose', winner: null, rng: mulberry32(seed >>> 0 || 1) };
  beginTurn(state);
  return state;
}

export const unitById = (s, id) => s.units.find((u) => u.id === id);
export const active = (s) => unitById(s, s.order[s.idx]);
export const living = (s) => s.units.filter((u) => u.alive);
export const enemiesOf = (s, u) => s.units.filter((x) => x.alive && x.team !== u.team);
export const occupied = (s, x, y, except) => s.units.some((u) => u.alive && u !== except && u.x === x && u.y === y);
const inBounds = (s, x, y) => x >= 0 && y >= 0 && x < s.W && y < s.H;
export const moveRange = (u) => clamp(Math.round(1 + u.speed), 2, 4);

function log(s, msg, kind) { s.log.push({ t: s.turn, msg, kind: kind || 'info' }); if (s.log.length > 60) s.log.shift(); }

// reachable tiles within moveRange (BFS, 8-dir, blocked by units)
export function reachable(s, u) {
  const out = [], seen = new Set([u.x + ',' + u.y]), q = [{ x: u.x, y: u.y, d: 0 }], R = moveRange(u);
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
export function attackable(s, u) { return enemiesOf(s, u).filter((e) => cheb(u, e) <= 1); }

// the legal action surface for the active unit (what the UI offers)
export function legal(s) {
  const u = active(s); if (!u || s.winner) return { move: [], targets: [], skills: [] };
  return {
    unit: u,
    move: u.moved ? [] : reachable(s, u),
    targets: u.acted ? [] : attackable(s, u).map((e) => e.id),
    skills: u.acted ? [] : SKILL_ORDER.filter((k) => SKILLS[k].cost <= u.flux),
  };
}

function resolveAttack(s, atk, tgt, skillId) {
  const sk = SKILLS[skillId] || SKILLS.strike;
  if (sk.cost) atk.flux = Math.max(0, atk.flux - sk.cost);
  const power = (atk.atk + (atk.buff.def && 0)) * sk.mult;
  const def = tgt.def + (tgt.buff.turns > 0 ? tgt.buff.def : 0);
  const hit = s.rng() < atk.accuracy;
  if (!hit) { log(s, `${atk.name} ${sk.label} — misses ${tgt.name}`, 'miss'); return { hit: false, target: tgt.id }; }
  const crit = s.rng() < atk.crit;
  const variance = 0.8 + s.rng() * 0.4;
  let dmg = Math.max(1, Math.round((power - def * 0.5) * variance * (crit ? 2 : 1)));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  log(s, `${atk.name} ${sk.label}${crit ? ' (crit!)' : ''} → ${tgt.name} −${dmg}`, crit ? 'crit' : 'hit');
  if (tgt.hp <= 0) { tgt.alive = false; log(s, `${tgt.name} falls.`, 'down'); }
  return { hit: true, crit, dmg, target: tgt.id };
}

// apply one action for the active unit. action: {type:'move',x,y} | {type:'attack',targetId,skill?} |
// {type:'skill',skillId,targetId?} | {type:'end'}. Returns an event for the UI to animate.
export function act(s, action) {
  const u = active(s); if (!u || s.winner) return { type: 'noop' };
  if (action.type === 'move') {
    if (u.moved) return { type: 'illegal' };
    if (!reachable(s, u).some((t) => t.x === action.x && t.y === action.y)) return { type: 'illegal' };
    const from = { x: u.x, y: u.y }; u.x = action.x; u.y = action.y; u.moved = true;
    return { type: 'move', unit: u.id, from, to: { x: u.x, y: u.y } };
  }
  if (action.type === 'attack' || (action.type === 'skill' && SKILLS[action.skillId].kind === 'attack')) {
    if (u.acted) return { type: 'illegal' };
    const skillId = action.skillId || 'strike', tgt = unitById(s, action.targetId);
    if (!tgt || !tgt.alive || cheb(u, tgt) > 1 || SKILLS[skillId].cost > u.flux) return { type: 'illegal' };
    u.acted = true; const r = resolveAttack(s, u, tgt, skillId); checkEnd(s);
    return { type: 'attack', unit: u.id, skill: skillId, ...r };
  }
  if (action.type === 'skill') {
    const sk = SKILLS[action.skillId]; if (u.acted || !sk || sk.cost > u.flux) return { type: 'illegal' };
    u.acted = true; u.flux -= sk.cost;
    if (sk.kind === 'heal') { const heal = Math.round(u.maxhp * sk.amount); u.hp = Math.min(u.maxhp, u.hp + heal); log(s, `${u.name} Mend +${heal}`, 'heal'); return { type: 'heal', unit: u.id, amount: heal }; }
    if (sk.kind === 'buff') { u.buff = { def: sk.def, turns: sk.turns + 1 }; log(s, `${u.name} Harden +${sk.def} Def`, 'buff'); return { type: 'buff', unit: u.id }; }
  }
  if (action.type === 'end') return endTurn(s);
  return { type: 'noop' };
}

function checkEnd(s) {
  const foes = s.units.filter((u) => u.team === 'foe' && u.alive), pcs = s.units.filter((u) => u.team === 'player' && u.alive);
  if (!foes.length) { s.winner = 'player'; s.phase = 'won'; log(s, 'The arena is yours.', 'win'); }
  else if (!pcs.length) { s.winner = 'foe'; s.phase = 'lost'; log(s, 'You fall in the arena.', 'lose'); }
}

function beginTurn(s) {
  const u = active(s);
  if (!u) return;
  u.moved = false; u.acted = false;
  if (u.buff.turns > 0) u.buff.turns--;
  s.phase = u.team === 'player' ? 'choose' : 'enemy';
}
export function endTurn(s) {
  if (s.winner) return { type: 'over', winner: s.winner };
  let guard = 0;
  do { s.idx++; if (s.idx >= s.order.length) { s.idx = 0; s.turn++; } } while (!active(s).alive && guard++ < s.order.length * 2);
  beginTurn(s);
  return { type: 'turn', active: s.order[s.idx], phase: s.phase };
}

// ── ENEMY AI — basic: close on the nearest foe, then strike (overclock if it can afford a kill-ish). ─
// Returns the sequence of actions the UI should apply (so it can animate each), ending in 'end'.
export function aiPlan(s) {
  const u = active(s); const seq = [];
  if (!u || u.team !== 'foe' || s.winner) return [{ type: 'end' }];
  const foes = enemiesOf(s, u).slice().sort((a, b) => cheb(u, a) - cheb(u, b));
  const target = foes[0];
  if (!target) return [{ type: 'end' }];
  // move: step toward target along the reachable tile that minimises distance
  if (cheb(u, target) > 1) {
    const tiles = reachable(s, u);
    let best = null, bd = cheb(u, target);
    for (const t of tiles) { const d = Math.max(Math.abs(t.x - target.x), Math.abs(t.y - target.y)); if (d < bd) { bd = d; best = t; } }
    if (best) seq.push({ type: 'move', x: best.x, y: best.y });
  }
  // attack if (now) adjacent — overclock when flux allows and it threatens a finish
  seq.push({ type: '__attack_if_adjacent', targetId: target.id });
  seq.push({ type: 'end' });
  return seq;
}
// resolve a planned step (handles the deferred 'attack_if_adjacent' which depends on post-move position)
export function aiStep(s, step) {
  if (step.type === '__attack_if_adjacent') {
    const u = active(s), tgt = unitById(s, step.targetId);
    if (u && tgt && tgt.alive && cheb(u, tgt) <= 1 && !u.acted) {
      const useOver = u.flux >= SKILLS.overclock.cost && tgt.hp <= u.atk * 1.6;
      return act(s, { type: 'attack', targetId: tgt.id, skillId: useOver ? 'overclock' : 'strike' });
    }
    return { type: 'noop' };
  }
  return act(s, step);
}

export default { createBattle, legal, act, endTurn, aiPlan, aiStep, active, unitById, reachable, attackable, SKILLS, SKILL_ORDER, moveRange };
