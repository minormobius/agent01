// menace.js — LIVING MENACE for the roamed overworld. The fauna stop being scenery: a BEE SWARM
// wakes when you stray inside its aggro radius and comes for you as a boids flock (cohesion ·
// separation · alignment · pursuit), leashed to its home flowers — outrun the leash and it drifts
// home and settles. A SPIDER doesn't chase at all: it strikes the moment you step on it (the
// leaf-litter ambush). The host decides what an engagement means (the overlay stings stamina and
// resolves the drive-off); this module only simulates and reports.
//
// Determinism: boid spawn + jitter draw from a seeded stream per fauna id (the ship's house rng),
// so the same walk produces the same chase — and the kernel stays node-testable. The sim holds NO
// world state of its own beyond live flocks; defeated fauna (roam.gathered 'foe:' keys) and pruned
// chunks drop their swarms automatically.
//
// Pure, DOM-free, node-tested (test/menace.selftest.mjs).

// tuning (exported so hosts and tests share one truth)
export const AGGRO_R = 240;    // player inside this of the hive → the swarm wakes
export const LEASH_R = 460;    // player beyond this of the hive → the swarm gives up and heads home
export const CONTACT_R = 24;   // flock centroid inside this of the player → engagement
export const SETTLE_R = 16;    // a homing flock inside this of the hive → settles (sim forgets it)
export const BOIDS = 14;       // bees per flock
export const MAXV = 165;       // px/s — a touch faster than the player walks, so it CAN catch you

// a bee swarm is fight-flagged swarm fauna; a spider is fight-flagged NON-swarm fauna (the poly
// predators — overworld.js sets fight = swarm || plan 'poly'; birds/fish never fight).
export const isBeeSwarm = (f) => !!(f && f.fight && f.swarm);
export const isSpider = (f) => !!(f && f.fight && !f.swarm);

// the house rng (xmur3-lite + mulberry32) — seeded per fauna id.
function rngFor(id) {
  let h = 2166136261; const s = String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createMenace() { return { swarms: new Map() }; }

function spawnFlock(f) {
  const rng = rngFor('menace:' + f.id), boids = [];
  for (let i = 0; i < BOIDS; i++) {
    const a = rng() * Math.PI * 2, r = 4 + rng() * 12;
    boids.push({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, vx: (rng() - 0.5) * 40, vy: (rng() - 0.5) * 40 });
  }
  return { faunaId: f.id, home: { x: f.x, y: f.y }, boids, rng, aggro: true, cx: f.x, cy: f.y };
}

// one classic boids step toward `target`. Weights tuned for "angry cloud", not "starling ballet".
function stepFlock(s, target, dt) {
  const B = s.boids, n = B.length;
  let mx = 0, my = 0, mvx = 0, mvy = 0;
  for (const b of B) { mx += b.x; my += b.y; mvx += b.vx; mvy += b.vy; }
  mx /= n; my /= n; mvx /= n; mvy /= n;
  for (const b of B) {
    let ax = (mx - b.x) * 1.6 + (mvx - b.vx) * 0.9;   // cohesion + alignment
    let ay = (my - b.y) * 1.6 + (mvy - b.vy) * 0.9;
    for (const o of B) {                               // separation (close-range push)
      if (o === b) continue;
      const dx = b.x - o.x, dy = b.y - o.y, d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < 144) { ax += (dx / d2) * 260; ay += (dy / d2) * 260; }
    }
    const tx = target.x - b.x, ty = target.y - b.y, td = Math.hypot(tx, ty) || 1;
    ax += (tx / td) * 340; ay += (ty / td) * 340;      // pursuit
    ax += (s.rng() - 0.5) * 160; ay += (s.rng() - 0.5) * 160;   // the angry jitter
    b.vx += ax * dt; b.vy += ay * dt;
    const v = Math.hypot(b.vx, b.vy);
    if (v > MAXV) { b.vx = (b.vx / v) * MAXV; b.vy = (b.vy / v) * MAXV; }
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  s.cx = mx; s.cy = my;
}

// advance every flock one frame. Returns { engage, swarms }:
//   engage — the fauna whose flock has CAUGHT the player this frame (null otherwise; host cools down),
//   swarms — the live flocks, for the renderer ([{ faunaId, boids, aggro, cx, cy }]).
export function stepMenace(sim, roam, dt, opts = {}) {
  dt = Math.min(0.06, Math.max(0.001, dt || 0.016));
  const aggroR = opts.aggroR ?? AGGRO_R, leashR = opts.leashR ?? LEASH_R;
  const contactR = opts.contactR ?? CONTACT_R;
  const p = roam.player;
  let engage = null;
  const live = new Set();
  for (const c of roam.chunks.values()) for (const f of c.fauna) {
    if (!isBeeSwarm(f) || roam.gathered.has('foe:' + f.id)) continue;
    live.add(f.id);
    let s = sim.swarms.get(f.id);
    const dHome = Math.hypot(p.x - f.x, p.y - f.y);
    if (!s) {
      if (dHome >= aggroR) continue;      // asleep on its flowers
      s = spawnFlock(f); sim.swarms.set(f.id, s);
    }
    s.home.x = f.x; s.home.y = f.y;       // fauna objects are rebuilt on chunk regen — re-pin home
    s.aggro = dHome < leashR;
    stepFlock(s, s.aggro ? p : s.home, dt);
    if (s.aggro && Math.hypot(s.cx - p.x, s.cy - p.y) < contactR) engage = engage || f;
    else if (!s.aggro && Math.hypot(s.cx - s.home.x, s.cy - s.home.y) < SETTLE_R) sim.swarms.delete(f.id);   // home again → settle
  }
  for (const id of [...sim.swarms.keys()]) if (!live.has(id)) sim.swarms.delete(id);   // defeated / chunk pruned
  return { engage, swarms: [...sim.swarms.values()] };
}

// the step-on trigger: the nearest un-defeated SPIDER within `reach` of the player, or null. The
// host fires the ambush the moment this returns something — no prompt, no F.
export function spiderUnderfoot(roam, reach = 20) {
  const p = roam.player; let best = null, bd = reach * reach;
  for (const c of roam.chunks.values()) for (const f of c.fauna) {
    if (!isSpider(f) || roam.gathered.has('foe:' + f.id)) continue;
    const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

export default { createMenace, stepMenace, spiderUnderfoot, isBeeSwarm, isSpider, AGGRO_R, LEASH_R, CONTACT_R, SETTLE_R, BOIDS, MAXV };
