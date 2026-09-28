// eval/craft-machines.mjs — does each build work, on every tiling, and what
// does it buy? Headless, no model calls, deterministic.
//
//   node mega/jev/eval/craft-machines.mjs [--seeds 3,5] [--out mega/jev/lab/craft-machines.json]
//
// For each tiling and seed, from a fresh world with the materials handed over
// (the question is the layout and the mechanism, not the gathering):
//   pen        built? two cows put inside still inside 1200 ticks later?
//   cane farm  laid out? cane in its chests after a day with nobody there
//   smelter    built? 12 ore loaded: ingots out, and the ticks it ran unattended
//   railway    a line ~40 tiles out on a medium world: build ticks, ride vs walk
// Every number is from the sim; the materials' mining time is NOT counted.

import { Sim } from '../craft/sim.mjs';
import { runMacro, Driver } from '../craft/runner.mjs';
import { goTo } from '../craft/macros.mjs';
import { inPen, caneFarmHolds, smelterState } from '../craft/builds.mjs';
import { SHAPES } from '../craft/tiling.mjs';
import { B } from '../craft/world.mjs';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const seeds = arg('seeds', '3,5').split(',').map(Number), out = arg('out', null);
const give = (s, bag) => { for (const [k, n] of Object.entries(bag)) s.give(k, n); };
const fresh = (shape, seed, size) => { const s = new Sim({ seed, shape, ...(size ? { size } : {}) }); s.home = [s.player.c, s.player.y]; s.seen.fill(1); return s; };
const away = (s) => { const a = [...s.ballCols(s.player.c, 30)].find(([c, d]) => d > 20 && s.canStand(c, s.surface(c))); if (a) s.moveEnt(s.player, a[0], s.surface(a[0])); };
const walk = (s, goal) => {
  const d = new Driver(s, { policy: () => null }), t0 = s.tick;
  d.gen = goTo(s, goal, 60000); d.cur = { name: 'walk', tick: s.tick }; d.last = d.gen.next();
  for (;;) { const r = d.step(); if (r && r.ended) return { ok: r.ended.ok, ticks: s.tick - t0 }; }
};

const rows = [];
for (const shape of SHAPES) for (const seed of seeds) {
  const row = { shape, seed };
  // the pen
  {
    const s = fresh(shape, seed);
    give(s, { planks: 80, stone_axe: 1 });
    const r = runMacro(s, 'build_pen');
    row.pen = r.ok;
    if (r.ok) {
      const pen = s.team.pen;
      const cows = pen.interior.slice(1, 3).map((c) => s.spawnEnt('cow', c, pen.lvl[c], { hp: 10 }));
      away(s);
      for (let k = 0; k < 1200; k++) s.step();
      row.pen_tiles = pen.interior.length; row.pen_fences = pen.fences.length;
      row.pen_holds = cows.filter((e) => inPen(s, e)).length;
    } else row.pen_why = r.why;
  }
  // the cane farm
  {
    const s = fresh(shape, seed);
    give(s, { planks: 80, iron_ingot: 30, cobblestone: 40, stone_pickaxe: 1, stone_shovel: 1, stone_axe: 1, redstone: 20, quartz: 6, sugar_cane: 4, water_bucket: 1 });
    const r = runMacro(s, 'build_cane_farm', { units: 2 });
    row.cane_farm = r.ok;
    if (r.ok) {
      row.cane_units = s.team.caneFarm.units.length;
      row.cane_wire = s.team.caneFarm.units.reduce((n, u) => n + u.route.length, 0);
      away(s);
      const p0 = s.stats.pushes || 0;
      for (let k = 0; k < 4800 * 2; k++) s.step();
      row.cane_per_day = caneFarmHolds(s) / 2;
      row.piston_pushes_per_day = ((s.stats.pushes || 0) - p0) / 2;
    } else row.cane_why = r.why;
  }
  // the smelter
  {
    const s = fresh(shape, seed);
    give(s, { planks: 80, iron_ingot: 20, cobblestone: 20, stone_pickaxe: 1, stone_shovel: 1, stone_axe: 1, iron_ore: 12, coal: 10 });
    const r = runMacro(s, 'build_smelter');
    row.smelter = r.ok;
    if (r.ok) {
      runMacro(s, 'use_smelter');
      away(s);
      let t = 0;
      while (t < 400 && (smelterState(s).done.iron_ingot || 0) < 12) { s.step(); t++; }
      row.smelter_ingots = smelterState(s).done.iron_ingot || 0;
      row.smelter_ticks_unattended = t;
      row.hand_smelting_ticks = 12 * 10;
    } else row.smelter_why = r.why;
  }
  // the railway (medium world, ~40 tiles out)
  if (seed === seeds[0]) {
    const s = fresh(shape, seed, 'm');
    give(s, { rail: 200, powered_rail: 20, redstone_torch: 20, minecart: 1, stone_pickaxe: 3, stone_shovel: 1, cobblestone: 30 });
    const cands = [...s.ballCols(s.player.c, 60)].filter(([c, d]) => d >= 36 && d <= 44 && s.canStand(c, s.surface(c)) && s.get(c, s.surface(c) - 1) === B.grass);
    if (cands.length) {
      const t0 = s.tick, r = runMacro(s, 'build_rail', { to: [cands[0][0], s.surface(cands[0][0])] });
      row.rail = r.ok;
      if (r.ok) {
        const L = s.team.lines[0];
        row.rail_tiles = L.length; row.rail_build_ticks = s.tick - t0;
        runMacro(s, 'ride_rail', { toward: 'far' });
        let t = s.tick; const h = runMacro(s, 'ride_rail', { toward: 'home' }); row.ride_home = s.tick - t;
        t = s.tick; const o = runMacro(s, 'ride_rail', { toward: 'far' }); row.ride_out = s.tick - t;
        row.rides_ok = h.ok && o.ok;
        const w = fresh(shape, seed, 'm'); give(w, { stone_pickaxe: 3, stone_shovel: 1, cobblestone: 30 });
        w.moveEnt(w.player, L.from[0], L.from[1]);
        row.walk_out = walk(w, (c, y) => c === L.to[0] && Math.abs(y - L.to[1]) <= 1).ticks;
        row.walk_home = walk(w, (c, y) => c === L.from[0] && Math.abs(y - L.from[1]) <= 1).ticks;
        row.saved_per_round_trip = row.walk_out + row.walk_home - row.ride_out - row.ride_home;
        row.break_even_round_trips = row.saved_per_round_trip > 0 ? +(row.rail_build_ticks / row.saved_per_round_trip).toFixed(1) : null;
      } else row.rail_why = r.why;
    }
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}
const n = (f) => rows.filter(f).length;
const mean = (k) => { const v = rows.map((r) => r[k]).filter((x) => typeof x === 'number'); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null; };
const summary = {
  worlds: rows.length,
  pen_built: n((r) => r.pen), pen_holds_both: n((r) => r.pen_holds === 2),
  cane_farm_built: n((r) => r.cane_farm), cane_per_day_mean: mean('cane_per_day'), piston_pushes_per_day_mean: mean('piston_pushes_per_day'),
  smelter_built: n((r) => r.smelter), smelter_all_12: n((r) => r.smelter_ingots === 12), smelter_ticks_mean: mean('smelter_ticks_unattended'),
  rail_built: n((r) => r.rail), rides_ok: n((r) => r.rides_ok), saved_per_round_trip_mean: mean('saved_per_round_trip'), break_even_mean: mean('break_even_round_trips'),
};
console.log(JSON.stringify(summary));
if (out) writeFileSync(out, JSON.stringify({ ran: new Date().toISOString(), seeds, summary, rows }, null, 1));
