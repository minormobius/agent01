// craft.selftest.mjs — the headless craft engine's contract.
//
//   node mega/jev/test/craft.selftest.mjs
//
// What it pins, in order of how badly a regression would hurt:
//   1. the tilings ARE foam's — tile for tile against foam/dungeon.mjs itself
//   2. the stream is complete: a Replay fed only the stream reconstructs the
//      world, every entity, the inventory, health and hunger exactly
//   3. determinism: same world + same policy → byte-identical stream
//   4. world signatures per shape (moving one is a CRAFT_VERSION bump)
//   5. the rules refuse what they should, and a refusal costs nothing
//   6. the baseline climbs wood → iron pickaxe, headless, on three tilings
// Offline, no key, a few seconds.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHAPES, buildTiling, rawTiles } from '../craft/tiling.mjs';
import { generateWorld, worldSignature, B, H, CRAFT_VERSION } from '../craft/world.mjs';
import { Sim, Replay } from '../craft/sim.mjs';
import { play, runMacro } from '../craft/runner.mjs';
import { renderAscii } from '../craft/ascii.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
const failures = [];
const ok = (c, l) => { c ? passed++ : failures.push(l); };

// ---------------------------------------------------------------- 1 ---------
// foam's own discretizeRoom, on a fake one-face room: a flat square floor.
// The half-width is off-lattice on purpose — a boundary landing exactly on
// tile centres would test the two point-in-polygon rules, not the tilings.
const { discretizeRoom } = await import(join(here, '..', '..', '..', 'foam', 'dungeon.mjs'));
const R = 12.37;
const room = { faces: [{ verts: [[-R, 0, -R], [R, 0, -R], [R, 0, R], [-R, 0, R]], n: [0, 1, 0], centroid: [0, 0, 0], area: 4 * R * R }] };
const keyOf = (t) => t.x.toFixed(6) + ',' + t.z.toFixed(6);
for (const s of SHAPES) {
  const foam = discretizeRoom(room, { faces: [0] }, s, 1).map(keyOf).sort();
  const ours = rawTiles(s, -R, R, -R, R, 1, (x, z) => x > -R && x < R && z > -R && z < R).map(keyOf).sort();
  ok(foam.length > 400 && foam.length === ours.length && foam.every((k, i) => k === ours[i]),
    `${s}: tile centres match foam/dungeon.mjs (foam ${foam.length}, ours ${ours.length})`);
}

for (const s of SHAPES) {
  const T = buildTiling(s, 18);
  let sym = true, len = true, pos = true, interior = 0, isolated = 0;
  T.cols.forEach((c, i) => {
    if (c.nb.length !== c.poly.length) len = false;
    if (!(c.area > 0)) pos = false;
    c.nb.forEach((j) => { if (j >= 0 && !T.cols[j].nb.includes(i)) sym = false; });
    if (c.adj.length === c.poly.length) interior++;
    if (!c.adj.length) isolated++;
  });
  ok(sym, `${s}: adjacency is symmetric`);
  ok(len, `${s}: one neighbour slot per polygon edge`);
  ok(pos, `${s}: every tile has positive (CCW) area`);
  ok(interior / T.cols.length > 0.85, `${s}: ${(100 * interior / T.cols.length).toFixed(0)}% of tiles are fully surrounded (edges welded)`);
  ok(isolated === 0, `${s}: no isolated tiles`);
}

// ---------------------------------------------------------------- 4 ---------
const PINS = { grid: '0ea3ac67', hex: '23a0117f', penrose: '1776e001', ammann: '2fabf36c', seven: '566bd68b',
  rhombille: '379c19ef', snub: 'c86df81e', kagome: '61096417', rhombitri: '469ac0a6', truncsq: '0f97e7f9' };
ok(CRAFT_VERSION === 1, 'CRAFT_VERSION is 1 — re-pin below only together with a bump');
for (const s of SHAPES) {
  const w = generateWorld({ seed: 1, shape: s });
  ok(worldSignature(w) === PINS[s], `${s}: world signature pinned (got ${worldSignature(w)})`);
  ok(w.blocks[w.spawn * H + w.height[w.spawn]] === B.grass, `${s}: spawn stands on grass`);
  ok(w.trees.length > 10, `${s}: trees grow (${w.trees.length})`);
  const counts = {};
  for (const b of w.blocks) counts[b] = (counts[b] || 0) + 1;
  ok(counts[B.coal_ore] > 20 && counts[B.iron_ore] > 5, `${s}: ore generated (coal ${counts[B.coal_ore]}, iron ${counts[B.iron_ore]})`);
}

// ---------------------------------------------------------------- 5 ---------
{
  const sim = new Sim({ seed: 3, shape: 'penrose' });
  const p = sim.player, t0 = sim.tick;
  const far = sim.cols.findIndex((c, i) => i !== p.c && !sim.cols[p.c].adj.includes(i) && Math.hypot(c.x - sim.cols[p.c].x, c.z - sim.cols[p.c].z) > 5);
  const refusals = [
    [{ op: 'move', to: far }, 'not a neighbour'],
    [{ op: 'mine', c: far, y: 5 }, 'out of reach'],
    [{ op: 'mine', c: p.c, y: p.y - 1 }, null],     // dirt/grass underfoot is fine by hand — checked separately
    [{ op: 'craft', item: 'wooden_pickaxe' }, 'crafting_table'],
    [{ op: 'craft', item: 'diamond' }, 'no recipe'],
    [{ op: 'place', c: sim.cols[p.c].adj[0], y: p.y, item: 'stick' }, 'does not place'],
    [{ op: 'eat', item: 'apple' }, 'no apple'],
    [{ op: 'attack', id: 999 }, 'no such target'],
  ];
  for (const [a, why] of refusals) {
    if (!why) continue;
    const before = sim.tick, r = sim.act(a);
    ok(!r.ok && r.why.includes(why) && sim.tick === before, `refused, free: ${a.op} → "${r.why}"`);
  }
  // stone needs a pick: find stone in reach by digging down to it
  const stone = runMacro(sim, 'mine_stone', { n: 1 });
  ok(!stone.ok && /pickaxe/.test(stone.why), `mine_stone without a pick fails cleanly: "${stone.why}"`);
  const iron = runMacro(sim, 'craft', { item: 'iron_pickaxe' });
  ok(!iron.ok && iron.why, `crafting an iron pickaxe from nothing fails cleanly: "${iron.why}"`);
  ok(sim.tick - t0 < 50, 'failed macros spend almost no time');
}

// ---------------------------------------------------------- 2, 3, 6 ---------
for (const [shape, seed] of [['penrose', 3], ['hex', 2], ['truncsq', 2]]) {
  const run = () => {
    const sim = new Sim({ shape, seed });
    const r = play(sim, undefined, { maxTicks: 4800 * 2 });
    return { sim, r, lines: sim.drain() };
  };
  const a = run(), b = run();
  ok(a.lines.length > 50 && a.lines.join('\n') === b.lines.join('\n'), `${shape}/${seed}: identical stream twice (${a.lines.length} lines)`);
  ok('iron_pickaxe' in a.r.milestones, `${shape}/${seed}: baseline reaches the iron pickaxe (tick ${a.r.milestones.iron_pickaxe})`);
  const order = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe'].map((m) => a.r.milestones[m]);
  ok(order[0] <= order[1] && order[1] <= order[2], `${shape}/${seed}: the ladder is climbed in order`);

  // the stream's own grammar
  const head = JSON.parse(a.lines[0]);
  ok(head.t === 'craft' && head.shape === shape && head.seed === seed && head.sig, `${shape}/${seed}: header names the world`);
  let mono = true, kinds = true, last = -1;
  const KINDS = new Set(['b', 'p', '+', '-', 'hp', 'food', 'inv', 'do', 'hit', 'die', 'note']);
  for (const l of a.lines.slice(1)) {
    const L = JSON.parse(l);
    if (!(L.k >= last) || !Array.isArray(L.e) || !L.e.length) mono = false;
    last = L.k;
    for (const ev of L.e) if (!KINDS.has(ev[0])) kinds = false;
  }
  ok(mono, `${shape}/${seed}: ticks never go backwards, no empty lines`);
  ok(kinds, `${shape}/${seed}: every event is a known kind`);

  // replay from the stream alone
  const rp = new Replay(a.lines[0]);
  for (const l of a.lines.slice(1)) rp.apply(l);
  let same = rp.b.length === a.sim.b.length;
  for (let i = 0; same && i < rp.b.length; i++) if (rp.b[i] !== a.sim.b[i]) same = false;
  ok(same, `${shape}/${seed}: replayed blocks equal the simulation's`);
  let ents = rp.ents.size === a.sim.ents.size;
  for (const e of a.sim.ents.values()) { const q = rp.ents.get(e.id); if (!q || q.c !== e.c || q.y !== e.y || q.kind !== e.kind) ents = false; }
  ok(ents, `${shape}/${seed}: replayed entities equal the simulation's (${rp.ents.size})`);
  ok(JSON.stringify(rp.inv) === JSON.stringify(a.sim.inv) && rp.hp === a.sim.player.hp && rp.food === a.sim.player.food,
    `${shape}/${seed}: replayed inventory, health and hunger match`);
  ok(rp.notes.some((n) => n.kind === 'macro') && rp.notes.some((n) => n.kind === 'macro_end'), `${shape}/${seed}: macro boundaries are in the stream`);
}

// ------------------------------------------------------ pathing safety ------
{
  const sim = new Sim({ seed: 5, shape: 'seven' });
  sim.give('stone_pickaxe', 1);
  let planned = 0, unsafe = 0;
  for (const goalY of [14, 11, 8]) {
    const path = sim.digPath(sim.player, (c, y) => y <= goalY, 60000);   // deep goals settle many cheap surface states first
    if (!path) continue;
    planned++;
    for (const st of path) for (const [c, y] of st.mine) if (sim.bordersWater(c, y)) unsafe++;
  }
  ok(planned === 3, 'digPath finds a way down to three depths');
  ok(unsafe === 0, 'digPath never plans to open a block that touches water');
}

// ---------------------------------------------------------------- text ------
{
  const sim = new Sim({ seed: 3, shape: 'kagome' });
  const txt = renderAscii(sim, { w: 60, h: 20 });
  ok(txt.split('\n').length === 20 && txt.includes('@'), 'the text view draws the player');
  ok(!/\n {60}\n/.test(txt), 'no blank sample rows (samples are off the tile lattice)');
}

console.log(`craft selftest: ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log('  ✗ ' + f); process.exit(1); }
