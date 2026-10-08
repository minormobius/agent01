#!/usr/bin/env node
// morph.selftest.mjs — the whole descent holds together: the ground (packages/morph/ground.js), the
// settlement field grown on it (../field.js), and morph's plan read off the field.
//
//   node polis/test/morph.selftest.mjs
import { Ground } from '../../packages/morph/ground.js';
import { generate, standing, envelope, PRESENT } from '../../packages/morph/morph.js';
import * as G from '../../packages/morph/geom.js';
import { growCity } from '../field.js';
import { transport, eraAt, linesAt, MODES } from '../../packages/morph/mobility.js';

let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };
const A = (P) => Math.abs(G.area(P));

const seed = 3, g = Ground(seed);
let t0 = performance.now();
const F = growCity(`${seed}:polis`, { sampler: g.sampler(), riverPath: g.riverPathKm(), wallsAt: 60, popSeries: envelope(240), agentCap: 6000 });
const tf = performance.now() - t0; t0 = performance.now();
const c = generate({ seed, field: F, ground: g });
const tm = performance.now() - t0;
ok(c.blocks.length > 1000 && c.buildings.length > 5000, `a town grows on the ground: ${c.districts.length} districts, ${c.blocks.length} blocks, ${c.stats.buildings} buildings standing (field ${(tf / 1000).toFixed(1)} s, plan ${(tm / 1000).toFixed(1)} s)`);

// the field read the ground: its town is founded on dry land, its river follows the ground's channel
const nuc = F.sites[F.nucleus], river = F.sites.filter((s) => !s.dead && s.river);
const riverOnChannel = river.filter((s) => g.riverDistAt(s.x * 1000, s.y * 1000) < 200).length;
ok(g.heightAt(nuc.x * 1000, nuc.y * 1000) > 0 && river.length > 10 && riverOnChannel === river.length, `the field reads the ground: founded on dry land ${g.heightAt(nuc.x * 1000, nuc.y * 1000).toFixed(1)} m up; all ${river.length} of its river cells lie on the ground's channel`);

// every era's plan, the walled town at the core
const kinds = new Set(c.districts.map((d) => d.kind)), core = c.districts.find((d) => d.isCore);
ok(core && ['organic', 'grid', 'suburb', 'modern'].every((k) => kinds.has(k)), `the eras read off the field: ${[...kinds].join(', ')}; the core laid out c. ${core && core.year}`);
const ring = c.streets.filter((s) => s.rank === 'ring').length;
ok(ring > 20, `the walled town's edge is a ring: ${ring} street edges`);

// nothing is built in the water: lots stand clear of the river's channel and above the sea
let wetLots = 0, lotPts = 0;
for (const b of c.blocks) for (const p of b.lot) { lotPts++; if (g.water(p[0], p[1])) wetLots++; }
ok(wetLots <= lotPts * 0.002, `no lot in the water: ${wetLots} of ${lotPts} lot corners wet (the channel's bends within a block)`);
const quays = c.streets.filter((s) => s.rank === 'quay');
ok(quays.length > 30, `the river is fronted by quays: ${quays.length} quay edges`);

// bridges: each deck spans the channel, and opens when the field built it
const decks = c.bridges.filter((br) => g.water((br.a[0] + br.b[0]) / 2, (br.a[1] + br.b[1]) / 2) === 'river' || g.riverDistAt((br.a[0] + br.b[0]) / 2, (br.a[1] + br.b[1]) / 2) < g.river.width);
const fieldYears = F.bridges.map((b) => c.yearOf(b.at));
ok(c.bridges.length >= 2 && decks.length === c.bridges.length && c.bridges.every((br) => br.year >= Math.min(...fieldYears)), `${c.bridges.length} bridge decks span the channel, none before the field's first bridge (${Math.min(...fieldYears)})`);

// a planned grid is a grid: its streets run along its two axes
let along = 0, total = 0;
for (const st of c.streets) {
  const d = c.districts[c.blocks[st.block].district];
  if (d.kind !== 'grid' || !['street', 'avenue'].includes(st.rank)) continue;
  const L = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1]), a = Math.atan2(st.b[1] - st.a[1], st.b[0] - st.a[0]) - d.angle;
  const off = Math.abs(((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)), dev = Math.min(off, Math.PI / 2 - off);
  total += L; if (dev < 0.01) along += L;
}
ok(total > 5000 && along / total > 0.8, `the grids are grids: ${(100 * along / total).toFixed(0)}% of ${(total / 1000).toFixed(1)} km of their streets run along their two axes`);

// a grid erases the field paths and keeps the old roads
const erased = c.roads.filter((r) => r.erased != null).length, kept = c.roads.filter((r) => r.erased == null && (r.tier === 0 || r.tier === 3)).length;
ok(erased > 50 && kept > 20, `path dependency: ${kept} old-road and main-road segments run on through every plan; ${erased} field paths erased by the plans laid over them`);

// every block is dated by its own cell, never before the field built it
let early = 0;
const builtYear = (b) => { const s = F.sites[b.site]; return s.builtAt >= 0 ? c.yearOf(s.builtAt) : -Infinity; };
for (const b of c.blocks) if (b.site >= 0 && b.year < builtYear(b)) early++;
ok(early === 0, 'every block is laid out in (or after) the year the field first built its cell');

// buildings stand on the ground: levelled at the mean of the surface under them
let off = 0;
for (const b of c.buildings) { const hs = [...b.footprint, G.centroid(b.footprint)].map((p) => g.heightAt(p[0], p[1])); if (b.base < Math.min(...hs) - 1e-6 || b.base > Math.max(...hs) + 1e-6) off++; }
const steep = c.buildings.filter((b) => b.fall > 3).length;
ok(off === 0, `every building is levelled within the ground under it (${steep} stand on a fall of more than 3 m)`);

// histories hold on the field's plan too
let crowded = 0;
for (const y of [1400, 1700, 1850, 1950, PRESENT]) { const seen = new Set(); for (const bd of standing(c, y).buildings) for (const id of bd.strips) { if (seen.has(id)) crowded++; seen.add(id); } }
ok(crowded === 0, 'no strip ever holds two standing buildings at once');

// transport on the grown town: the railway comes up the valley on dry land, the lines run, the people move
t0 = performance.now();
const T = transport(c);
const tt = performance.now() - t0, R = T.rail;
const wetRail = R ? R.path.filter(([x, y]) => g.water(x, y) || g.heightAt(x, y) < 0).length : -1;
ok(R && wetRail === 0 && !g.water(R.station[0], R.station[1]), `the railway (${R && R.year}) runs on dry land up the valley to its terminus; ${R ? R.cleared : 0} buildings cleared for it (${(tt / 1000).toFixed(1)} s for the whole transport history)`);
const now = eraAt(c, PRESENT), modes = Object.entries(now.modes).filter(([, v]) => v > 0.01).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ');
const kinds2 = new Set(T.lines.map((L) => L.mode));
ok(kinds2.has('tram') && (kinds2.has('bus') || kinds2.has('lightrail')) && now.residents > 20000 && now.modes.car > 0.2, `${T.lines.length} lines over the history (${[...kinds2].map((k) => MODES[k].label).join(', ')}); now ${Math.round(now.residents)} people, ${modes}`);
ok(tt < 6000, `the transport history is quick enough for the toy's worker (${(tt / 1000).toFixed(1)} s)`);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
