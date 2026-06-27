// bees/arena/swarm-combat.js — the SWARM-as-combatant layer for the turn-based arena.
//
// This is the additive extension that would be upstreamed into mega/v092/arena/engine.js. The arena
// is turn-based 9×9 Chebyshev; a continuous boids cloud can't take turns, so the swarm is modelled as
// ONE unit with two new ideas the base engine lacks:
//   1. an AREA pulse (hits every enemy within `radius`, not a single adjacent target), and
//   2. mass = hp: the cloud's sting scales with how much of it is left, so chipping it weakens it.
// The bees you draw are still cosmetic (count ∝ hp/maxhp); only this unit's hp/position decide damage.
//
// It also gives the PLAYER an AoE counter — Ember — that is super-effective vs swarms, so fire is the
// answer to being mobbed (the reason to add a player AoE in the first place). Everything is seeded
// through the engine's own s.rng, so a scripted fight is reproducible and node-testable like the rest.

import { enemiesOf, reachable, act } from '../../v092/arena/engine.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// tunables — exported so a demo/encounter can dial difficulty without forking the math.
export const SWARM_TUNE = { atk: 7, def: 2, speed: 0.8, accuracy: 1, radius: 2, minStingFrac: 0.45 };
export const EMBER = { label: 'Ember', cost: 6, radius: 2, mult: 1.4, vsSwarm: 2.4, glyph: '✺',
  gloss: 'a wide burning arc — scatters and scorches a swarm (×2.4 vs swarms)' };

// Build the swarm unit. hp = mass. Squishy (low def, no flux) and slow (acts late), but it hits a whole
// area each turn. Shape matches engine.makeUnit so reachable()/act()/endTurn() treat it as any unit.
export function makeSwarmUnit({ id = 'swarm', seed = 'hive:0', x, y, mass = 130 } = {}) {
  const t = SWARM_TUNE;
  return {
    id, name: 'the swarm', team: 'foe', swarm: true, radius: t.radius,
    glyph: '❋', accent: '#d8b25a', sprite: { seed },
    maxhp: mass, hp: mass, atk: t.atk, def: t.def, speed: t.speed,
    accuracy: t.accuracy, crit: 0, maxflux: 0, flux: 0,
    x, y, alive: true, moved: false, acted: false, buff: { def: 0, turns: 0 },
  };
}

// Insert a swarm into an existing battle and re-sort initiative (player wins ties), keeping the
// currently-active unit active. Returns the swarm unit.
export function addSwarm(s, swarmU) {
  const cur = s.order[s.idx];
  s.units.push(swarmU);
  s.order = s.units.slice().sort((a, b) => (b.speed - a.speed) || (a.team === 'player' ? -1 : 1)).map((u) => u.id);
  s.idx = Math.max(0, s.order.indexOf(cur));
  return swarmU;
}

// shared area-damage core. mitigation mirrors engine.resolveAttack (def negates 50%), variance seeded.
function areaHit(s, power, tgt) {
  const variance = 0.8 + s.rng() * 0.4;
  const dmg = Math.max(1, Math.round((power - tgt.def * 0.5) * variance));
  tgt.hp = Math.max(0, tgt.hp - dmg);
  const dead = tgt.hp <= 0; if (dead) tgt.alive = false;
  return { id: tgt.id, dmg, dead };
}

// THE SWARM PULSE — every living enemy within `radius` gets stung; the sting fades as the cloud thins.
export function swarmPulse(s, swarmU) {
  const massFrac = swarmU.hp / swarmU.maxhp;
  const power = swarmU.atk * (SWARM_TUNE.minStingFrac + massFrac);  // 0.45..1.45 × atk
  const hits = [];
  for (const e of s.units) if (e.alive && e.team !== swarmU.team && cheb(swarmU, e) <= swarmU.radius) {
    hits.push(areaHit(s, power, e));
  }
  return hits;
}

// THE EMBER — player AoE; super-effective vs swarms. Returns the hits (for the renderer to flash).
export function emberHits(s, u) {
  const hits = [];
  for (const e of s.units) if (e.alive && e.team !== u.team && cheb(u, e) <= EMBER.radius) {
    const power = u.atk * EMBER.mult * (e.swarm ? EMBER.vsSwarm : 1);
    hits.push(areaHit(s, power, e));
  }
  return hits;
}

// win/lose check (mirrors engine.checkEnd, which isn't exported).
export function resolveEnd(s) {
  const foes = s.units.filter((u) => u.team === 'foe' && u.alive);
  const pcs = s.units.filter((u) => u.team === 'player' && u.alive);
  if (!foes.length) { s.winner = 'player'; s.phase = 'won'; }
  else if (!pcs.length) { s.winner = 'foe'; s.phase = 'lost'; }
}

// THE SWARM'S TURN — close toward the nearest enemy (reusing engine.reachable), then pulse the area.
// Returns a list of events so a UI can animate move → pulse in sequence.
export function swarmTurn(s, swarmU) {
  const events = [];
  const foes = enemiesOf(s, swarmU).slice().sort((a, b) => cheb(swarmU, a) - cheb(swarmU, b));
  const target = foes[0];
  // drift toward the target's pulse range (radius), not strictly adjacent — it wants you inside the cloud
  if (target && cheb(swarmU, target) > swarmU.radius) {
    const tiles = reachable(s, swarmU);
    let best = null, bd = cheb(swarmU, target);
    for (const t of tiles) { const d = Math.max(Math.abs(t.x - target.x), Math.abs(t.y - target.y)); if (d < bd) { bd = d; best = t; } }
    if (best) { act(s, { type: 'move', x: best.x, y: best.y }); events.push({ type: 'move', to: best }); }
  }
  const hits = swarmPulse(s, swarmU);
  swarmU.acted = true;
  resolveEnd(s);
  events.push({ type: 'pulse', center: { x: swarmU.x, y: swarmU.y }, radius: swarmU.radius, hits });
  return events;
}
